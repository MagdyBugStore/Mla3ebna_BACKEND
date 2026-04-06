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

async function createField(ownerId, { name, phone, city, address, lat, lng }) {
  const field = await Field.create({
    owner_id: ownerId,
    status: 'draft',
    name,
    phone,
    city,
    area: null,
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

async function updateSpecs(ownerId, fieldId, { sport, surface, size, amenities }) {
  const field = await Field.findOne({ _id: fieldId, owner_id: ownerId });
  if (!field) return null;
  field.sport = sport ?? field.sport;
  field.surface = surface ?? field.surface;
  field.size = size ?? field.size;
  if (Array.isArray(amenities)) field.amenities = amenities;
  await field.save();
  return field;
}

async function updatePricing(ownerId, fieldId, { price_per_hour, peak_price_per_hour }) {
  const field = await Field.findOne({ _id: fieldId, owner_id: ownerId });
  if (!field) return null;
  field.price_per_hour = Number(price_per_hour || 0);
  field.peak_price_per_hour = Number(peak_price_per_hour || 0);
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

async function listOwnerBookings(ownerId, { status, date, page, limit }) {
  const fieldIds = (await Field.find({ owner_id: ownerId }).select({ _id: 1 }).lean()).map((f) => f._id.toString());
  const filter: any = { $or: [{ owner_id: ownerId }, { field_id: { $in: fieldIds } }] };
  if (date) filter.date = date;
  if (status === 'cancelled') filter.status = 'cancelled';

  const all = await Booking.find(filter).sort({ created_at: -1 }).lean();
  const todayStr = new Date().toISOString().slice(0, 10);
  let items = all;
  if (status === 'upcoming') items = all.filter((b) => b.status !== 'cancelled' && b.date >= todayStr);
  if (status === 'past') items = all.filter((b) => b.status !== 'cancelled' && b.date < todayStr);

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
    return {
      id: b._id.toString(),
      reference: b.reference,
      status: b.status,
      payment_status: b.payment_status || null,
      date: b.date,
      start_time: b.start_time,
      end_time: b.end_time,
      total_price: b.total_price,
      field: field ? { id: field._id.toString(), name: field.name } : null,
      player: user ? { id: user._id.toString(), first_name: user.first_name, last_name: user.last_name, phone: user.phone, avatar_url: user.avatar_url } : null
    };
  });

  return { data, meta: { page, limit, total } };
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
  if (booking.status !== 'cancelled') booking.status = 'completed';
  await booking.save();
  return booking;
}

async function cancelBooking(ownerId, bookingId) {
  const fieldIds = (await Field.find({ owner_id: ownerId }).select({ _id: 1 }).lean()).map((f) => f._id.toString());
  const booking = await Booking.findOne({ _id: bookingId, $or: [{ owner_id: ownerId }, { field_id: { $in: fieldIds } }] });
  if (!booking) return false;
  if (booking.status === 'cancelled') return true;

  const startUtc = parseBookingStartUtc(booking.date, booking.start_time);
  const hoursDiff = startUtc ? (startUtc.getTime() - Date.now()) / (60 * 60 * 1000) : 0;
  const policy = hoursDiff >= 24 ? 'gt_24h' : 'lt_24h';
  const refundAmount = booking.payment_status === 'paid' && policy === 'gt_24h' ? Number(booking.total_price || 0) : 0;

  booking.status = 'cancelled';
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
  let fromStr = todayStr;
  if (period === 'week') {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 7);
    fromStr = d.toISOString().slice(0, 10);
  } else if (period === 'month') {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    fromStr = d.toISOString().slice(0, 10);
  }

  const fromDate = new Date(`${fromStr}T00:00:00.000Z`);
  const toDate = new Date(`${todayStr}T23:59:59.999Z`);
  const wallet = await WalletAccount.findOne({ owner_id: ownerId }).lean();
  const hasLedger = wallet ? (await LedgerEntry.countDocuments({ account_id: wallet._id.toString(), occurred_at: { $gte: fromDate, $lte: toDate } })) > 0 : false;

  let total_bookings = 0;
  let total_revenue = 0;
  if (wallet && hasLedger) {
    const credits = await LedgerEntry.find({
      account_id: wallet._id.toString(),
      occurred_at: { $gte: fromDate, $lte: toDate },
      direction: 'credit'
    }).lean();
    const debits = await LedgerEntry.find({
      account_id: wallet._id.toString(),
      occurred_at: { $gte: fromDate, $lte: toDate },
      direction: 'debit'
    }).lean();

    const creditSum = credits.reduce((s, e) => s + Number(e.amount || 0), 0);
    const debitSum = debits.reduce((s, e) => s + Number(e.amount || 0), 0);
    total_revenue = creditSum - debitSum;

    total_bookings = await Booking.countDocuments({
      $or: [{ owner_id: ownerId }, { field_id: { $in: (await Field.find({ owner_id: ownerId }).select({ _id: 1 }).lean()).map((f) => f._id.toString()) } }],
      status: { $ne: 'cancelled' },
      date: { $gte: fromStr, $lte: todayStr }
    });
  } else {
    const fieldIds = (await Field.find({ owner_id: ownerId }).select({ _id: 1 }).lean()).map((f) => f._id.toString());
    const bookings = await Booking.find({
      $or: [{ owner_id: ownerId }, { field_id: { $in: fieldIds } }],
      status: { $ne: 'cancelled' },
      date: { $gte: fromStr, $lte: todayStr }
    }).lean();
    total_bookings = bookings.length;
    total_revenue = bookings.reduce((s, b) => s + Number(b.total_price || 0), 0);
  }

  const fieldIdsForReviews = (await Field.find({ owner_id: ownerId }).select({ _id: 1 }).lean()).map((f) => f._id.toString());
  const reviews = await Review.find({ field_id: { $in: fieldIdsForReviews } }).select({ rating: 1 }).lean();
  const review_count = reviews.length;
  const average_rating = review_count === 0 ? 0 : reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / review_count;

  const occupancy_rate = total_bookings === 0 ? 0 : Math.min(1, total_bookings / (7 * 16));

  return {
    total_bookings,
    total_revenue,
    average_rating,
    review_count,
    occupancy_rate
  };
}

async function getRevenue(ownerId, { from, to, group_by }) {
  const fromStr = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toStr = to || new Date().toISOString().slice(0, 10);
  const fromDate = new Date(`${fromStr}T00:00:00.000Z`);
  const toDate = new Date(`${toStr}T23:59:59.999Z`);
  const wallet = await WalletAccount.findOne({ owner_id: ownerId }).lean();
  const hasLedger = wallet ? (await LedgerEntry.countDocuments({ account_id: wallet._id.toString(), occurred_at: { $gte: fromDate, $lte: toDate } })) > 0 : false;

  const buckets = {};
  if (wallet && hasLedger) {
    const entries = await LedgerEntry.find({
      account_id: wallet._id.toString(),
      occurred_at: { $gte: fromDate, $lte: toDate }
    }).lean();
    for (const e of entries) {
      const iso = new Date(e.occurred_at).toISOString().slice(0, 10);
      const key = group_by === 'week' ? `${iso.slice(0, 4)}-W${Math.ceil(Number(iso.slice(5, 7)) / 3)}` : iso;
      const sign = e.direction === 'debit' ? -1 : 1;
      buckets[key] = (buckets[key] || 0) + sign * Number(e.amount || 0);
    }
  } else {
    const fieldIds = (await Field.find({ owner_id: ownerId }).select({ _id: 1 }).lean()).map((f) => f._id.toString());
    const bookings = await Booking.find({
      $or: [{ owner_id: ownerId }, { field_id: { $in: fieldIds } }],
      status: { $ne: 'cancelled' },
      date: { $gte: fromStr, $lte: toStr }
    }).lean();
    for (const b of bookings) {
      const key = group_by === 'week' ? `${b.date.slice(0, 4)}-W${Math.ceil(Number(b.date.slice(5, 7)) / 3)}` : b.date;
      buckets[key] = (buckets[key] || 0) + Number(b.total_price || 0);
    }
  }

  const data = Object.keys(buckets)
    .sort()
    .map((k) => ({ key: k, revenue: buckets[k] }));

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
      read_at: n.read_at,
      created_at: n.created_at
    })),
    meta: { page, limit, total }
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
