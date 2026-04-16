const Field = require('../models/Field');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Refund = require('../models/Refund');
const WalletAccount = require('../models/WalletAccount');
const LedgerEntry = require('../models/LedgerEntry');
const Payout = require('../models/Payout');
const Notification = require('../models/Notification');
const Review = require('../models/Review');
const User = require('../models/User');
const { makePhotoId } = require('../utils/ids');

function parseBookingStartUtc(dateStr, timeStr) {
  const hh = Number(String(timeStr || '00:00').slice(0, 2));
  const mm = Number(String(timeStr || '00:00').slice(3, 5));
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCHours(hh, mm, 0, 0);
  return d;
}

async function getOrCreateOwnerWallet(ownerId) {
  let wallet = await WalletAccount.findOne({ owner_id: ownerId });
  if (!wallet) wallet = await WalletAccount.create({ owner_id: ownerId, currency: 'EGP', available_balance: 0, pending_balance: 0 });
  return wallet;
}

async function createField(ownerId, { name, phone, city, area, address, lat, lng }) {
  const field = await Field.create({
    owner_id: ownerId,
    status: 'pending',
    name,
    phone,
    city,
    area: area || null,
    address,
    lat,
    lng,
    sport: null,
    surface: null,
    size: null,
    price_per_hour: 0,
    peak_price_per_hour: 0,
    amenities: [],
    is_covered: false,
    cover_image_url: null,
    photos: [],
    schedule: [],
    closures: [],
    pricing_rules: [],
    review: { submitted_at: null, reviewed_at: null, reviewed_by: null, reject_reason: null },
    rating_stats: { avg: 0, count: 0 }
  });
  return field;
}

async function updateField(ownerId, fieldId, patch) {
  const field = await Field.findOne({ _id: fieldId, owner_id: ownerId });
  if (!field) return null;
  const allowed = ['name', 'phone', 'city', 'area', 'address', 'lat', 'lng', 'is_covered', 'cover_image_url'];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) field[key] = patch[key];
  }
  await field.save();
  return field;
}

async function updateSpecs(ownerId, fieldId, { sport, surface, size, is_covered, amenities }) {
  const field = await Field.findOne({ _id: fieldId, owner_id: ownerId });
  if (!field) return null;
  field.sport = sport ?? field.sport;
  field.surface = surface ?? field.surface;
  field.size = size ?? field.size;
  if (is_covered !== undefined) field.is_covered = Boolean(is_covered);
  if (Array.isArray(amenities)) field.amenities = amenities;
  await field.save();
  return field;
}

async function updatePricing(ownerId, fieldId, { price_per_hour, peak_price_per_hour }) {
  const field = await Field.findOne({ _id: fieldId, owner_id: ownerId });
  if (!field) return null;
  field.price_per_hour = Number(price_per_hour || 0);
  await field.save();
  return field;
}

async function updateSchedule(ownerId, fieldId, { days }) {
  const field = await Field.findOne({ _id: fieldId, owner_id: ownerId });
  if (!field) return null;
  field.schedule = days;
  await field.save();
  return field;
}

async function submitForReview(ownerId, fieldId) {
  const field = await Field.findOne({ _id: fieldId, owner_id: ownerId });
  if (!field) return null;
  field.status = 'pending_review';
  field.review = {
    submitted_at: new Date(),
    reviewed_at: null,
    reviewed_by: null,
    reject_reason: null
  };
  await field.save();

  await Notification.create({
    user_id: ownerId,
    type: 'field_submitted',
    title: 'تم إرسال الملعب للمراجعة',
    body: 'جاري مراجعة بيانات الملعب',
    data: { field_id: field.id },
    read_at: null
  });

  return field;
}

async function addPhotos(ownerId, fieldId, files) {
  const field = await Field.findOne({ _id: fieldId, owner_id: ownerId });
  if (!field) return null;
  const added = [];
  for (const f of files) {
    const id = makePhotoId();
    const url = `/uploads/${f.filename}`;
    const photo = { id, url };
    field.photos.push(photo);
    added.push(photo);
  }
  if (!field.cover_image_url && field.photos.length > 0) field.cover_image_url = field.photos[0].url;
  await field.save();
  return added;
}

async function deletePhoto(ownerId, fieldId, photoId) {
  const field = await Field.findOne({ _id: fieldId, owner_id: ownerId });
  if (!field) return null;
  field.photos = (field.photos || []).filter((p) => p.id !== photoId);
  if (field.cover_image_url && field.cover_image_url.includes(photoId)) {
    field.cover_image_url = field.photos[0]?.url || null;
  }
  await field.save();
  return field;
}

async function getOwnerField(ownerId, fieldId) {
  const field = await Field.findOne({ _id: fieldId, owner_id: ownerId }).lean();
  if (!field) return null;
  return field;
}

async function getMyField(ownerId) {
  const field = await Field.findOne({ owner_id: ownerId }).sort({ created_at: -1 }).lean();
  if (!field) return null;
  return field;
}

async function listOwnerBookings(ownerId, { status, date, page, limit }) {
  const fieldIds = (await Field.find({ owner_id: ownerId }).select({ _id: 1 }).lean()).map((f) => f._id.toString());
  const filter: any = { $or: [{ owner_id: ownerId }, { field_id: { $in: fieldIds } }] };
  if (date) filter.date = date;
  if (status === 'cancelled') filter.status = { $in: ['cancelled_by_player', 'cancelled_by_owner'] };

  const all = await Booking.find(filter).sort({ created_at: -1 }).lean();
  const todayStr = new Date().toISOString().slice(0, 10);
  let items = all;
  const isCancelled = (s) => s === 'cancelled_by_player' || s === 'cancelled_by_owner';
  if (status === 'upcoming') items = all.filter((b) => !isCancelled(b.status) && b.date >= todayStr);
  if (status === 'past') items = all.filter((b) => !isCancelled(b.status) && b.date < todayStr);

  const total = items.length;
  const slice = items.slice((page - 1) * limit, page * limit);
  const fieldDocs: any[] = await Field.find({ _id: { $in: Array.from(new Set(slice.map((b) => b.field_id))) } }).select({ name: 1 }).lean();
  const fieldMap = new Map<string, any>(fieldDocs.map((f) => [f._id.toString(), f]));

  const userDocs: any[] = await User.find({ _id: { $in: Array.from(new Set(slice.map((b) => b.user_id))) } })
    .select({ first_name: 1, last_name: 1, phone: 1, avatar_url: 1 })
    .lean();
  const userMap = new Map<string, any>(userDocs.map((u) => [u._id.toString(), u]));

  const data = slice.map((b) => {
    const field = fieldMap.get(b.field_id) || null;
    const user = userMap.get(b.user_id) || null;
    const masked = user?.phone ? `01x-xxxx-${String(b.reference || '').slice(-4).padStart(4, '0')}` : null;
    return {
      id: b._id.toString(),
      reference: b.reference,
      status: b.status,
      payment_status: b.payment_status || null,
      date: b.date,
      start_time: b.start_time,
      end_time: b.end_time,
      price: b.total_price,
      field: field ? { id: field._id.toString(), name: field.name } : null,
      player: user
        ? { id: user._id.toString(), first_name: user.first_name, last_name: user.last_name, avatar_url: user.avatar_url, phone_masked: masked }
        : null
    };
  });

  return { data, meta: { page, total } };
}

async function getOwnerBookingById(ownerId, bookingId) {
  const fieldIds = (await Field.find({ owner_id: ownerId }).select({ _id: 1 }).lean()).map((f) => f._id.toString());
  const booking = await Booking.findOne({ _id: bookingId, $or: [{ owner_id: ownerId }, { field_id: { $in: fieldIds } }] }).lean();
  if (!booking) return null;
  const field = await Field.findById(booking.field_id).lean();
  const user = await User.findById(booking.user_id).lean();
  return {
    id: booking._id.toString(),
    reference: booking.reference,
    status: booking.status,
    payment_status: booking.payment_status || null,
    date: booking.date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    total_price: booking.total_price,
    created_at: booking.created_at,
    attended_at: booking.attended_at,
    cancel: booking.cancel || null,
    review_id: booking.review_id || null,
    field: field ? { id: field._id.toString(), name: field.name } : null,
    player: user ? { id: user._id.toString(), first_name: user.first_name, last_name: user.last_name, phone: user.phone } : null
  };
}

async function confirmAttendance(ownerId, bookingId) {
  const fieldIds = (await Field.find({ owner_id: ownerId }).select({ _id: 1 }).lean()).map((f) => f._id.toString());
  const booking = await Booking.findOne({ _id: bookingId, $or: [{ owner_id: ownerId }, { field_id: { $in: fieldIds } }] });
  if (!booking) return null;
  booking.attended_at = new Date();
  if (booking.status !== 'cancelled_by_player' && booking.status !== 'cancelled_by_owner') booking.status = 'attended';
  await booking.save();
  return booking;
}

async function cancelBooking(ownerId, bookingId) {
  const fieldIds = (await Field.find({ owner_id: ownerId }).select({ _id: 1 }).lean()).map((f) => f._id.toString());
  const booking = await Booking.findOne({ _id: bookingId, $or: [{ owner_id: ownerId }, { field_id: { $in: fieldIds } }] });
  if (!booking) return false;
  if (booking.status === 'cancelled_by_owner' || booking.status === 'cancelled_by_player') return true;

  const startUtc = parseBookingStartUtc(booking.date, booking.start_time);
  const hoursDiff = startUtc ? (startUtc.getTime() - Date.now()) / (60 * 60 * 1000) : 0;
  const policy = hoursDiff >= 24 ? 'gt_24h' : 'lt_24h';
  const refundAmount = booking.payment_status === 'paid' && policy === 'gt_24h' ? Number(booking.total_price || 0) : 0;

  booking.status = 'cancelled_by_owner';
  booking.cancel = {
    cancelled_at: new Date(),
    cancelled_by: ownerId,
    policy,
    refund_amount: refundAmount
  };

  const payment = refundAmount > 0 ? await Payment.findOne({ booking_id: booking.id, status: 'paid' }).sort({ created_at: -1 }).lean() : null;
  if (refundAmount > 0) {
    booking.payment_status = 'refunded';
    if (payment) {
      await Refund.create({
        booking_id: booking.id,
        payment_id: payment._id.toString(),
        status: 'requested',
        amount: refundAmount,
        reason: 'booking_cancelled_by_owner',
        requested_by: ownerId,
        requested_at: new Date(),
        completed_at: null,
        provider_refund_id: null
      });
    }

    const wallet = await getOrCreateOwnerWallet(ownerId);
    await LedgerEntry.create({
      account_id: wallet.id,
      type: 'refund_debit',
      direction: 'debit',
      amount: refundAmount,
      currency: 'EGP',
      booking_id: booking.id,
      payment_id: payment ? payment._id.toString() : null,
      refund_id: null,
      occurred_at: new Date(),
      meta: { reason: 'booking_cancelled_by_owner', policy }
    });
    wallet.available_balance = Number(wallet.available_balance || 0) - refundAmount;
    await wallet.save();
  }

  await booking.save();

  await Notification.create({
    user_id: booking.user_id,
    type: 'booking_cancelled',
    title: 'تم إلغاء الحجز',
    body: `تم إلغاء حجزك (${booking.reference})`,
    data: { booking_id: booking.id, refund_amount: refundAmount, policy },
    read_at: null
  });

  await Notification.create({
    user_id: ownerId,
    type: 'booking_cancelled',
    title: 'تم إلغاء حجز',
    body: `تم إلغاء حجز (${booking.reference})`,
    data: { booking_id: booking.id, refund_amount: refundAmount, policy },
    read_at: null
  });

  return true;
}

async function getWallet(ownerId) {
  const wallet = await getOrCreateOwnerWallet(ownerId);
  return wallet.toJSON();
}

async function listLedger(ownerId, { page, limit, from, to }) {
  const wallet = await getOrCreateOwnerWallet(ownerId);
  const filter: any = { account_id: wallet.id };
  if (from || to) {
    filter.occurred_at = {};
    if (from) filter.occurred_at.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) filter.occurred_at.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  const total = await LedgerEntry.countDocuments(filter);
  const docs = await LedgerEntry.find(filter)
    .sort({ occurred_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return {
    data: docs.map((e) => ({
      id: e._id.toString(),
      type: e.type,
      direction: e.direction,
      amount: e.amount,
      currency: e.currency,
      booking_id: e.booking_id,
      payment_id: e.payment_id,
      refund_id: e.refund_id,
      occurred_at: e.occurred_at,
      meta: e.meta || null
    })),
    meta: { page, limit, total, wallet: { id: wallet.id, currency: wallet.currency, available_balance: wallet.available_balance, pending_balance: wallet.pending_balance } }
  };
}

async function listPayouts(ownerId, { page, limit }) {
  const wallet = await getOrCreateOwnerWallet(ownerId);
  const total = await Payout.countDocuments({ owner_id: ownerId });
  const docs = await Payout.find({ owner_id: ownerId })
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return {
    data: docs.map((p) => ({
      id: p._id.toString(),
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      method: p.method,
      provider_ref: p.provider_ref || null,
      created_at: p.created_at,
      paid_at: p.paid_at || null
    })),
    meta: { page, limit, total, wallet: { id: wallet.id, currency: wallet.currency, available_balance: wallet.available_balance, pending_balance: wallet.pending_balance } }
  };
}

async function requestPayout(ownerId, { amount, method }) {
  const wallet = await getOrCreateOwnerWallet(ownerId);
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, status: 400, errors: { amount: 'invalid' } };
  if (!['bank_transfer', 'wallet', 'cash'].includes(method)) return { ok: false, status: 400, errors: { method: 'invalid' } };
  if (Number(wallet.available_balance || 0) < amt) return { ok: false, status: 409, message: 'Insufficient balance' };

  wallet.available_balance = Number(wallet.available_balance || 0) - amt;
  wallet.pending_balance = Number(wallet.pending_balance || 0) + amt;
  await wallet.save();

  const payout = await Payout.create({
    owner_id: ownerId,
    account_id: wallet.id,
    status: 'requested',
    amount: amt,
    currency: wallet.currency || 'EGP',
    method,
    provider_ref: null,
    paid_at: null
  });

  await LedgerEntry.create({
    account_id: wallet.id,
    type: 'payout',
    direction: 'debit',
    amount: amt,
    currency: wallet.currency || 'EGP',
    booking_id: null,
    payment_id: null,
    refund_id: null,
    occurred_at: new Date(),
    meta: { payout_id: payout.id, status: 'requested' }
  });

  return { ok: true, payout };
}

async function getStats(ownerId, period) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const p = ['today', 'week', 'month'].includes(String(period)) ? String(period) : 'today';
  let days = 1;
  if (p === 'week') days = 7;
  if (p === 'month') days = 30;

  const end = new Date(`${todayStr}T00:00:00.000Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const fromStr = start.toISOString().slice(0, 10);

  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  const prevFromStr = prevStart.toISOString().slice(0, 10);
  const prevToStr = prevEnd.toISOString().slice(0, 10);

  const fieldIds = (await Field.find({ owner_id: ownerId }).select({ _id: 1 }).lean()).map((f) => f._id.toString());
  const filter = {
    $or: [{ owner_id: ownerId }, { field_id: { $in: fieldIds } }],
    status: { $nin: ['cancelled_by_player', 'cancelled_by_owner'] }
  };

  const currentBookings = await Booking.find({ ...filter, date: { $gte: fromStr, $lte: todayStr } }).lean();
  const prevBookings = await Booking.find({ ...filter, date: { $gte: prevFromStr, $lte: prevToStr } }).lean();

  const total_bookings = currentBookings.length;
  const total_revenue = currentBookings.reduce((s, b) => s + Number(b.total_price || 0), 0);

  const prev_total_bookings = prevBookings.length;
  const prev_total_revenue = prevBookings.reduce((s, b) => s + Number(b.total_price || 0), 0);

  const bookings_pct =
    prev_total_bookings === 0 ? (total_bookings === 0 ? 0 : 100) : Math.round(((total_bookings - prev_total_bookings) / prev_total_bookings) * 100);
  const revenue_pct =
    prev_total_revenue === 0 ? (total_revenue === 0 ? 0 : 100) : Math.round(((total_revenue - prev_total_revenue) / prev_total_revenue) * 100);

  const fieldIdsForReviews = (await Field.find({ owner_id: ownerId }).select({ _id: 1 }).lean()).map((f) => f._id.toString());
  const reviews = await Review.find({ field_id: { $in: fieldIdsForReviews } }).select({ rating: 1 }).lean();
  const review_count = reviews.length;
  const average_rating = review_count === 0 ? 0 : reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / review_count;

  const occupancy_rate = total_bookings === 0 ? 0 : Math.min(1, total_bookings / (7 * 16));

  return {
    period: p,
    total_bookings,
    total_revenue,
    average_rating,
    review_count,
    occupancy_rate,
    delta: { bookings_pct, revenue_pct }
  };
}

async function getRevenue(ownerId, { from, to, group_by }) {
  const fromStr = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toStr = to || new Date().toISOString().slice(0, 10);
  const gb = ['day', 'week'].includes(String(group_by)) ? String(group_by) : 'day';

  const fieldIds = (await Field.find({ owner_id: ownerId }).select({ _id: 1 }).lean()).map((f) => f._id.toString());
  const bookings = await Booking.find({
    $or: [{ owner_id: ownerId }, { field_id: { $in: fieldIds } }],
    status: { $nin: ['cancelled_by_player', 'cancelled_by_owner'] },
    date: { $gte: fromStr, $lte: toStr }
  }).lean();

  const buckets: any = {};
  for (const b of bookings) {
    const key = gb === 'week' ? `${b.date.slice(0, 4)}-W${Math.ceil(Number(b.date.slice(5, 7)) / 3)}` : b.date;
    if (!buckets[key]) buckets[key] = { revenue: 0, bookings: 0 };
    buckets[key].revenue += Number(b.total_price || 0);
    buckets[key].bookings += 1;
  }

  const data = Object.keys(buckets)
    .sort()
    .map((k) => ({ date: k, revenue: buckets[k].revenue, bookings: buckets[k].bookings }));

  return { data };
}

async function listOwnerNotifications(ownerId, { page, limit }) {
  const total = await Notification.countDocuments({ user_id: ownerId });
  const data = await Notification.find({ user_id: ownerId })
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return {
    data: data.map((n) => ({
      id: n._id.toString(),
      user_id: n.user_id,
      type: n.type || null,
      title: n.title,
      body: n.body,
      data: n.data || null,
      is_read: Boolean(n.read_at),
      created_at: n.created_at
    })),
    meta: { page, total }
  };
}

async function readAllOwnerNotifications(ownerId) {
  await Notification.updateMany({ user_id: ownerId, read_at: null }, { read_at: new Date() });
  return { success: true };
}

module.exports = {
  createField,
  updateField,
  updateSpecs,
  updatePricing,
  updateSchedule,
  submitForReview,
  addPhotos,
  deletePhoto,
  getOwnerField,
  getMyField,
  listOwnerBookings,
  getOwnerBookingById,
  confirmAttendance,
  cancelBooking,
  getWallet,
  listLedger,
  listPayouts,
  requestPayout,
  getStats,
  getRevenue,
  listOwnerNotifications,
  readAllOwnerNotifications
};

export {};
