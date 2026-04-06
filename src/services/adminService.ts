const Field = require('../models/Field');
const Notification = require('../models/Notification');
const Payout = require('../models/Payout');
const WalletAccount = require('../models/WalletAccount');
const LedgerEntry = require('../models/LedgerEntry');

async function listFields({ status, page, limit }) {
  const filter: any = {};
  if (status) filter.status = status;
  const total = await Field.countDocuments(filter);
  const docs = await Field.find(filter)
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return {
    data: docs.map((f) => ({
      id: f._id.toString(),
      status: f.status,
      name: f.name,
      city: f.city,
      area: f.area,
      address: f.address,
      owner_id: f.owner_id,
      review: f.review || null,
      created_at: f.created_at
    })),
    meta: { page, limit, total }
  };
}

async function approveField(adminId, fieldId) {
  const field = await Field.findById(fieldId);
  if (!field) return null;
  field.status = 'active';
  field.review = {
    submitted_at: field.review?.submitted_at || new Date(),
    reviewed_at: new Date(),
    reviewed_by: adminId,
    reject_reason: null
  };
  await field.save();

  await Notification.create({
    user_id: field.owner_id,
    type: 'field_approved',
    title: 'تم قبول الملعب',
    body: 'تمت الموافقة على الملعب وأصبح نشطًا',
    data: { field_id: field.id },
    read_at: null
  });

  return field;
}

async function rejectField(adminId, fieldId, reason) {
  const field = await Field.findById(fieldId);
  if (!field) return null;
  field.status = 'rejected';
  field.review = {
    submitted_at: field.review?.submitted_at || new Date(),
    reviewed_at: new Date(),
    reviewed_by: adminId,
    reject_reason: reason || 'rejected'
  };
  await field.save();

  await Notification.create({
    user_id: field.owner_id,
    type: 'field_rejected',
    title: 'تم رفض الملعب',
    body: reason || 'تم رفض الملعب، برجاء تعديل البيانات وإعادة الإرسال',
    data: { field_id: field.id, reason: reason || null },
    read_at: null
  });

  return field;
}

async function listPayouts({ status, page, limit }) {
  const filter: any = {};
  if (status) filter.status = status;
  const total = await Payout.countDocuments(filter);
  const docs = await Payout.find(filter)
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return {
    data: docs.map((p) => ({
      id: p._id.toString(),
      owner_id: p.owner_id,
      account_id: p.account_id,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      method: p.method,
      provider_ref: p.provider_ref || null,
      created_at: p.created_at,
      paid_at: p.paid_at || null
    })),
    meta: { page, limit, total }
  };
}

async function markPayoutPaid(adminId, payoutId, provider_ref) {
  const payout = await Payout.findById(payoutId);
  if (!payout) return null;
  if (payout.status === 'paid') return payout;

  payout.status = 'paid';
  payout.provider_ref = provider_ref || payout.provider_ref || null;
  payout.paid_at = new Date();
  await payout.save();

  const wallet = await WalletAccount.findById(payout.account_id);
  if (wallet) {
    wallet.pending_balance = Math.max(0, Number(wallet.pending_balance || 0) - Number(payout.amount || 0));
    await wallet.save();
  }

  await Notification.create({
    user_id: payout.owner_id,
    type: 'payout_paid',
    title: 'تم صرف الأرباح',
    body: `تم صرف مبلغ ${payout.amount} ${payout.currency || 'EGP'}`,
    data: { payout_id: payout.id },
    read_at: null
  });

  await LedgerEntry.create({
    account_id: payout.account_id,
    type: 'adjustment',
    direction: 'credit',
    amount: 0,
    currency: payout.currency || 'EGP',
    booking_id: null,
    payment_id: null,
    refund_id: null,
    occurred_at: new Date(),
    meta: { payout_id: payout.id, admin_id: adminId, status: 'paid' }
  });

  return payout;
}

async function markPayoutFailed(adminId, payoutId, reason) {
  const payout = await Payout.findById(payoutId);
  if (!payout) return null;
  if (payout.status === 'failed') return payout;

  payout.status = 'failed';
  await payout.save();

  const wallet = await WalletAccount.findById(payout.account_id);
  if (wallet) {
    const amt = Number(payout.amount || 0);
    wallet.pending_balance = Math.max(0, Number(wallet.pending_balance || 0) - amt);
    wallet.available_balance = Number(wallet.available_balance || 0) + amt;
    await wallet.save();

    await LedgerEntry.create({
      account_id: wallet.id,
      type: 'adjustment',
      direction: 'credit',
      amount: amt,
      currency: wallet.currency || 'EGP',
      booking_id: null,
      payment_id: null,
      refund_id: null,
      occurred_at: new Date(),
      meta: { payout_id: payout.id, admin_id: adminId, reason: reason || null, status: 'failed_return' }
    });
  }

  await Notification.create({
    user_id: payout.owner_id,
    type: 'payout_failed',
    title: 'فشل صرف الأرباح',
    body: reason || 'فشل صرف الأرباح وسيتم إعادة الرصيد للمحفظة',
    data: { payout_id: payout.id, reason: reason || null },
    read_at: null
  });

  return payout;
}

module.exports = {
  listFields,
  approveField,
  rejectField,
  listPayouts,
  markPayoutPaid,
  markPayoutFailed
};

export {};
