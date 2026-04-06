const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const PaymentEvent = require('../models/PaymentEvent');
const Field = require('../models/Field');
const WalletAccount = require('../models/WalletAccount');
const LedgerEntry = require('../models/LedgerEntry');
const Notification = require('../models/Notification');

async function getOrCreateOwnerWallet(ownerId) {
  let wallet = await WalletAccount.findOne({ owner_id: ownerId });
  if (!wallet) wallet = await WalletAccount.create({ owner_id: ownerId, currency: 'EGP', available_balance: 0, pending_balance: 0 });
  return wallet;
}

async function applyLedgerToWallet(wallet, entry) {
  const amount = Number(entry.amount || 0);
  if (!Number.isFinite(amount) || amount === 0) return wallet;
  const sign = entry.direction === 'debit' ? -1 : 1;
  wallet.available_balance = Number(wallet.available_balance || 0) + sign * amount;
  await wallet.save();
  return wallet;
}

async function ensurePaymentEvent({ provider, event_id, type, signature_valid, payload, booking_id, payment_id }) {
  try {
    const doc = await PaymentEvent.create({
      provider,
      event_id,
      type,
      signature_valid: Boolean(signature_valid),
      received_at: new Date(),
      payload: payload || null,
      processed_at: new Date(),
      processing_result: 'ok',
      booking_id: booking_id || null,
      payment_id: payment_id || null
    });
    return { created: true, event: doc };
  } catch (_e) {
    return { created: false, event: null };
  }
}

async function finalizePaidPayment({ payment, booking, provider, event_id, payload }) {
  if (payment.status !== 'paid') {
    payment.status = 'paid';
    payment.transaction_id = event_id || payment.transaction_id || null;
    payment.paid_at = new Date();
    await payment.save();
  }

  if (booking.payment_status !== 'paid') booking.payment_status = 'paid';
  if (booking.status === 'pending_payment') booking.status = 'confirmed';
  await booking.save();

  const field = await Field.findById(booking.field_id).lean();
  const ownerId = booking.owner_id || field?.owner_id || payment.owner_id || null;

  if (provider && event_id) {
    await ensurePaymentEvent({
      provider,
      event_id,
      type: 'payment_paid',
      signature_valid: true,
      payload,
      booking_id: booking.id,
      payment_id: payment.id
    });
  }

  if (ownerId) {
    const wallet = await getOrCreateOwnerWallet(ownerId);
    const entry = await LedgerEntry.create({
      account_id: wallet.id,
      type: 'booking_revenue',
      direction: 'credit',
      amount: Number(booking.total_price || 0),
      currency: wallet.currency || 'EGP',
      booking_id: booking.id,
      payment_id: payment.id,
      refund_id: null,
      occurred_at: new Date(),
      meta: { source: provider || 'unknown' }
    });
    await applyLedgerToWallet(wallet, entry);
  }

  await Notification.create({
    user_id: booking.user_id,
    type: 'booking_confirmed',
    title: 'تم تأكيد الحجز',
    body: `تم تأكيد حجزك بنجاح (${booking.reference})`,
    data: { booking_id: booking.id, payment_id: payment.id },
    read_at: null
  });

  if (ownerId) {
    await Notification.create({
      user_id: ownerId,
      type: 'booking_confirmed',
      title: 'حجز جديد مؤكد',
      body: `تم تأكيد حجز جديد (${booking.reference})`,
      data: { booking_id: booking.id, payment_id: payment.id },
      read_at: null
    });
  }

  return { owner_id: ownerId };
}

async function initiatePayment(userId, { booking_id, method, card_token }) {
  const booking = await Booking.findOne({ _id: booking_id, user_id: userId });
  if (!booking) return { ok: false, status: 404 };
  if (booking.status === 'cancelled') return { ok: false, status: 409 };

  const field = await Field.findById(booking.field_id).lean();
  const ownerId = booking.owner_id || field?.owner_id || null;
  if (!booking.owner_id && ownerId) booking.owner_id = ownerId;

  booking.payment_status = 'pending';
  if (booking.status !== 'pending_payment') booking.status = 'pending_payment';
  await booking.save();

  const payment = await Payment.create({
    booking_id,
    user_id: userId,
    owner_id: ownerId,
    field_id: booking.field_id,
    provider: null,
    method,
    card_token: card_token || null,
    status: 'initiated',
    amount: Number(booking.total_price || 0),
    currency: 'EGP',
    provider_refs: null,
    transaction_id: null,
    initiated_at: new Date(),
    paid_at: null,
    failed_at: null
  });
  return { ok: true, payment };
}

async function verifyPayment(userId, { payment_id, transaction_id }) {
  const payment = await Payment.findOne({ _id: payment_id, user_id: userId });
  if (!payment) return { ok: false, status: 404 };
  if (payment.status === 'paid') return { ok: true, payment };

  const booking = await Booking.findById(payment.booking_id);
  if (!booking) return { ok: false, status: 404 };

  const provider = payment.provider || 'manual';
  const eventId = String(transaction_id);
  await finalizePaidPayment({
    payment,
    booking,
    provider,
    event_id: eventId,
    payload: { payment_id: payment.id, transaction_id: eventId }
  });
  return { ok: true, payment, booking };
}

async function paymobWebhook({ event_id, payment_id, transaction_id, status, payload }) {
  const provider = 'paymob';
  const eventId = String(event_id || transaction_id || payment_id || '');
  if (!eventId) return { ok: false, status: 400 };

  const created = await ensurePaymentEvent({
    provider,
    event_id: eventId,
    type: 'paymob_webhook',
    signature_valid: true,
    payload: payload || null,
    booking_id: null,
    payment_id: payment_id || null
  });
  if (!created.created) return { ok: true, ignored: true };

  const payment = payment_id ? await Payment.findById(payment_id) : null;
  if (!payment) return { ok: false, status: 404 };
  const booking = await Booking.findById(payment.booking_id);
  if (!booking) return { ok: false, status: 404 };

  const s = String(status || '').toLowerCase();
  if (['paid', 'success', 'successful'].includes(s)) {
    payment.provider = 'paymob';
    await finalizePaidPayment({
      payment,
      booking,
      provider: 'paymob',
      event_id: transaction_id ? String(transaction_id) : eventId,
      payload: payload || { event_id: eventId }
    });
    return { ok: true };
  }

  payment.provider = 'paymob';
  payment.status = 'failed';
  payment.transaction_id = transaction_id ? String(transaction_id) : payment.transaction_id;
  payment.failed_at = new Date();
  await payment.save();
  booking.payment_status = 'failed';
  await booking.save();
  await Notification.create({
    user_id: booking.user_id,
    type: 'payment_failed',
    title: 'فشل الدفع',
    body: `فشل الدفع لحجز (${booking.reference})`,
    data: { booking_id: booking.id, payment_id: payment.id },
    read_at: null
  });
  return { ok: true };
}

function listMethods() {
  return {
    data: [
      { id: 'card', label: 'Card' },
      { id: 'fawry', label: 'Fawry' },
      { id: 'vodafone', label: 'Vodafone Cash' },
      { id: 'instapay', label: 'InstaPay' },
      { id: 'cash', label: 'Cash' }
    ]
  };
}

module.exports = { initiatePayment, verifyPayment, paymobWebhook, listMethods };

export {};
