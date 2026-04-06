const Booking = require('../models/Booking');
const Field = require('../models/Field');
const Payment = require('../models/Payment');
const Refund = require('../models/Refund');
const WalletAccount = require('../models/WalletAccount');
const LedgerEntry = require('../models/LedgerEntry');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { buildSlotsForDate, isPeakTime } = require('../utils/slots');
const { makeBookingReference } = require('../utils/ids');

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

async function createBooking(userId, { field_id, slot_id, date, payment_method }) {
  const user = await User.findById(userId).lean();
  if (!user) return { ok: false, status: 401 };

  const field = await Field.findById(field_id).lean();
  if (!field) return { ok: false, status: 404 };
  if (field.status !== 'active') return { ok: false, status: 404 };

  const existingBookings = await Booking.find({ field_id, date, status: { $ne: 'cancelled' } }).lean();
  const slotsResult = buildSlotsForDate({ ...field, id: field._id.toString() }, existingBookings, date);
  if (!slotsResult) return { ok: false, status: 400, errors: { date: 'invalid' } };
  const slot = slotsResult.slots.find((s) => s.id === slot_id);
  if (!slot) return { ok: false, status: 400, errors: { slot_id: 'invalid' } };
  if (slot.status !== 'available') return { ok: false, status: 409, message: 'Slot not available' };

  const startMinutes = Number(slot.start_time.slice(0, 2)) * 60 + Number(slot.start_time.slice(3, 5));
  const total_price = isPeakTime(startMinutes) ? field.peak_price_per_hour : field.price_per_hour;

  const booking = await Booking.create({
    reference: makeBookingReference(),
    status: 'pending_payment',
    payment_status: 'unpaid',
    user_id: userId,
    owner_id: field.owner_id || null,
    field_id: field._id.toString(),
    date,
    start_time: slot.start_time,
    end_time: slot.end_time,
    total_price,
    payment_method,
    price: { subtotal: total_price, fees: 0, discount: 0, total: total_price, currency: 'EGP' },
    cancel: { cancelled_at: null, cancelled_by: null, policy: null, refund_amount: 0 },
    attended_at: null
  });

  await Notification.create({
    user_id: userId,
    type: 'booking_created',
    title: 'تم إنشاء الحجز',
    body: `تم إنشاء حجزك بنجاح (${booking.reference})`,
    data: { booking_id: booking.id, field_id: booking.field_id },
    read_at: null
  });

  return { ok: true, booking, field };
}

async function listMyBookings(userId, { status, page, limit }) {
  const all = await Booking.find({ user_id: userId }).sort({ created_at: -1 }).lean();
  const todayStr = new Date().toISOString().slice(0, 10);
  let items = all;
  if (status === 'upcoming') items = all.filter((b) => b.status !== 'cancelled' && b.date >= todayStr);
  if (status === 'past') items = all.filter((b) => b.status !== 'cancelled' && b.date < todayStr);
  if (status === 'cancelled') items = all.filter((b) => b.status === 'cancelled');

  const total = items.length;
  const slice = items.slice((page - 1) * limit, page * limit);
  const fieldIds = Array.from(new Set(slice.map((b) => b.field_id)));
  const fields: any[] = await Field.find({ _id: { $in: fieldIds } }).select({ name: 1, cover_image_url: 1, city: 1, area: 1 }).lean();
  const fieldMap = new Map<string, any>(fields.map((f) => [f._id.toString(), f]));

  const data = slice.map((b) => {
    const f = fieldMap.get(b.field_id) || null;
    return {
      id: b._id.toString(),
      reference: b.reference,
      status: b.status,
      payment_status: b.payment_status || null,
      date: b.date,
      start_time: b.start_time,
      end_time: b.end_time,
      total_price: b.total_price,
      field: f ? { id: f._id.toString(), name: f.name, cover_image_url: f.cover_image_url, city: f.city, area: f.area } : null
    };
  });

  return { data, meta: { page, limit, total } };
}

async function getMyBookingById(userId, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, user_id: userId }).lean();
  if (!booking) return null;
  const field = await Field.findById(booking.field_id).lean();
  return {
    id: booking._id.toString(),
    reference: booking.reference,
    status: booking.status,
    payment_status: booking.payment_status || null,
    date: booking.date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    total_price: booking.total_price,
    payment_method: booking.payment_method,
    created_at: booking.created_at,
    cancel: booking.cancel || null,
    attended_at: booking.attended_at || null,
    review_id: booking.review_id || null,
    field: field
      ? {
          id: field._id.toString(),
          name: field.name,
          address: field.address,
          phone: field.phone,
          city: field.city,
          area: field.area,
          cover_image_url: field.cover_image_url
        }
      : null
  };
}

async function cancelMyBooking(userId, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, user_id: userId });
  if (!booking) return { ok: false, status: 404 };
  if (booking.status === 'cancelled') return { ok: true };

  const field = await Field.findById(booking.field_id).lean();
  const ownerId = booking.owner_id || field?.owner_id || null;

  const startUtc = parseBookingStartUtc(booking.date, booking.start_time);
  const hoursDiff = startUtc ? (startUtc.getTime() - Date.now()) / (60 * 60 * 1000) : 0;
  const policy = hoursDiff >= 24 ? 'gt_24h' : 'lt_24h';
  const refundAmount = booking.payment_status === 'paid' && policy === 'gt_24h' ? Number(booking.total_price || 0) : 0;

  booking.status = 'cancelled';
  booking.cancel = {
    cancelled_at: new Date(),
    cancelled_by: userId,
    policy,
    refund_amount: refundAmount
  };

  if (refundAmount > 0) {
    booking.payment_status = 'refunded';
    const payment = await Payment.findOne({ booking_id: booking.id, status: 'paid' }).sort({ created_at: -1 }).lean();
    if (payment) {
      await Refund.create({
        booking_id: booking.id,
        payment_id: payment._id.toString(),
        status: 'requested',
        amount: refundAmount,
        reason: 'booking_cancelled',
        requested_by: userId,
        requested_at: new Date(),
        completed_at: null,
        provider_refund_id: null
      });
    }

    if (ownerId) {
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
        meta: { reason: 'booking_cancelled', policy }
      });
      wallet.available_balance = Number(wallet.available_balance || 0) - refundAmount;
      await wallet.save();
    }
  }

  await booking.save();

  await Notification.create({
    user_id: userId,
    type: 'booking_cancelled',
    title: 'تم إلغاء الحجز',
    body: `تم إلغاء حجزك (${booking.reference})`,
    data: { booking_id: booking.id, refund_amount: refundAmount, policy },
    read_at: null
  });

  if (ownerId) {
    await Notification.create({
      user_id: ownerId,
      type: 'booking_cancelled',
      title: 'تم إلغاء حجز',
      body: `تم إلغاء حجز (${booking.reference})`,
      data: { booking_id: booking.id, refund_amount: refundAmount, policy },
      read_at: null
    });
  }

  return { ok: true, refund_amount: refundAmount, policy };
}

async function submitReview(userId, bookingId, { rating, comment }) {
  const booking = await Booking.findOne({ _id: bookingId, user_id: userId });
  if (!booking) return { ok: false, status: 404 };
  const exists = await Review.findOne({ booking_id: bookingId, user_id: userId }).lean();
  if (exists) return { ok: false, status: 409, message: 'Review already submitted' };

  const review = await Review.create({
    booking_id: bookingId,
    field_id: booking.field_id,
    user_id: userId,
    rating,
    comment: comment || null
  });
  booking.review_id = review.id;
  if (booking.attended_at && booking.status !== 'cancelled') booking.status = 'completed';
  await booking.save();
  return { ok: true, review };
}

module.exports = { createBooking, listMyBookings, getMyBookingById, cancelMyBooking, submitReview };

export {};
