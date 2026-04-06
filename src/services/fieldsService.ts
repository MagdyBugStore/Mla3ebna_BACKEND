const Field = require('../models/Field');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const User = require('../models/User');
const { haversineKm } = require('../utils/geo');
const { buildSlotsForDate } = require('../utils/slots');

async function computeFieldRatingMeta(fieldId) {
  const stats = await Review.aggregate([
    { $match: { field_id: fieldId } },
    { $group: { _id: '$field_id', avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  const row = stats[0] || null;
  return { average_rating: row ? Number(row.avg || 0) : 0, review_count: row ? Number(row.count || 0) : 0 };
}

async function listFields({ q, sport, city, area, lat, lng, page, limit, format, currentUserId }) {
  const filter: any = { status: 'active' };
  if (q) filter.name = { $regex: q, $options: 'i' };
  if (sport) filter.sport = sport;
  if (city) filter.city = { $regex: city, $options: 'i' };
  if (area) filter.area = { $regex: area, $options: 'i' };

  const total = await Field.countDocuments(filter);
  const docs = await Field.find(filter)
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  let items = docs;
  if (lat !== null && lng !== null) {
    items = docs
      .map((f) => ({ ...f, distance_km: haversineKm(lat, lng, f.lat, f.lng) }))
      .sort((a, b) => a.distance_km - b.distance_km);
  }

  const favoriteSet = new Set<string>();
  if (currentUserId) {
    const user = await User.findById(currentUserId).select({ favorites: 1 }).lean();
    for (const id of user?.favorites || []) favoriteSet.add(String(id));
  }

  const data = await Promise.all(
    items.map(async (f) => {
  const meta = await computeFieldRatingMeta(f._id.toString());
      return {
        id: f._id.toString(),
        name: f.name,
        city: f.city,
        area: f.area,
        address: f.address,
        lat: f.lat,
        lng: f.lng,
        sport: f.sport,
        surface: f.surface,
        size: f.size,
        price_per_hour: f.price_per_hour,
        peak_price_per_hour: f.peak_price_per_hour,
        amenities: f.amenities || [],
        is_covered: f.is_covered,
        cover_image_url: f.cover_image_url,
        average_rating: meta.average_rating,
        review_count: meta.review_count,
        is_favorite: favoriteSet.has(f._id.toString()),
        distance_km: f.distance_km ?? null
      };
    })
  );

  if (format === 'map') {
    return {
      data: data.map((x) => ({ id: x.id, name: x.name, lat: x.lat, lng: x.lng, price_per_hour: x.price_per_hour, average_rating: x.average_rating })),
      meta: { page, limit, total }
    };
  }

  return { data, meta: { page, limit, total } };
}

async function getFieldById(fieldId, currentUserId, currentRole) {
  const field = await Field.findById(fieldId).lean();
  if (!field) return null;
  if (field.status !== 'active') {
    const canSee = currentRole === 'admin' || (currentUserId && field.owner_id === currentUserId);
    if (!canSee) return null;
  }
  const id = field._id.toString();
  const ratingMeta = await computeFieldRatingMeta(id);
  let is_favorite = false;
  if (currentUserId) {
    const user = await User.findById(currentUserId).select({ favorites: 1 }).lean();
    is_favorite = (user?.favorites || []).includes(id);
  }
  return {
    id,
    name: field.name,
    phone: field.phone,
    city: field.city,
    area: field.area,
    address: field.address,
    lat: field.lat,
    lng: field.lng,
    sport: field.sport,
    surface: field.surface,
    size: field.size,
    price_per_hour: field.price_per_hour,
    peak_price_per_hour: field.peak_price_per_hour,
    amenities: field.amenities || [],
    is_covered: field.is_covered,
    cover_image_url: field.cover_image_url,
    photos: field.photos || [],
    schedule: field.schedule || [],
    average_rating: ratingMeta.average_rating,
    review_count: ratingMeta.review_count,
    is_favorite
  };
}

async function getSlots(fieldId, dateStr) {
  const field = await Field.findById(fieldId).lean();
  if (!field) return { ok: false, reason: 'not_found' };
  if (field.status !== 'active') return { ok: false, reason: 'not_found' };
  const bookings = await Booking.find({ field_id: fieldId, date: dateStr }).lean();
  const result = buildSlotsForDate({ ...field, id: field._id.toString() }, bookings, dateStr);
  if (!result) return { ok: false, reason: 'invalid_date' };
  return { ok: true, data: result };
}

async function listFieldReviews(fieldId, { page, limit }) {
  const total = await Review.countDocuments({ field_id: fieldId });
  const docs = await Review.find({ field_id: fieldId })
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  const userIds = Array.from(new Set(docs.map((r) => r.user_id)));
  const users: any[] = await User.find({ _id: { $in: userIds } }).select({ first_name: 1, last_name: 1, avatar_url: 1 }).lean();
  const userMap = new Map<string, any>(users.map((u) => [u._id.toString(), u]));
  return {
    data: docs.map((r) => {
      const u = userMap.get(r.user_id) || null;
      return {
        id: r._id.toString(),
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        user: u ? { id: u._id.toString(), first_name: u.first_name, last_name: u.last_name, avatar_url: u.avatar_url } : null
      };
    }),
    meta: { page, limit, total }
  };
}

async function listFavorites(userId) {
  const user = await User.findById(userId).select({ favorites: 1 }).lean();
  const favoriteIds = (user?.favorites || []).map((x) => String(x));
  const fields = await Field.find({ _id: { $in: favoriteIds }, status: 'active' }).lean();
  return {
    data: fields.map((f) => ({
      id: f._id.toString(),
      name: f.name,
      city: f.city,
      area: f.area,
      cover_image_url: f.cover_image_url,
      price_per_hour: f.price_per_hour
    }))
  };
}

async function addFavorite(userId, fieldId) {
  const field = await Field.findById(fieldId).lean();
  if (!field) return { ok: false, status: 404 };
  const user = await User.findById(userId);
  if (!user) return { ok: false, status: 401 };
  const exists = (user.favorites || []).includes(fieldId);
  if (!exists) user.favorites.push(fieldId);
  await user.save();
  return { ok: true };
}

async function removeFavorite(userId, fieldId) {
  const field = await Field.findById(fieldId).lean();
  if (!field) return { ok: false, status: 404 };
  const user = await User.findById(userId);
  if (!user) return { ok: false, status: 401 };
  user.favorites = (user.favorites || []).filter((x) => String(x) !== String(fieldId));
  await user.save();
  return { ok: true };
}

module.exports = { listFields, getFieldById, getSlots, listFieldReviews, listFavorites, addFavorite, removeFavorite };

export {};
