const { validateRequiredString, toNumber, safePagination } = require('../utils/validation');
const { errorResponse } = require('../utils/http');
const ownerService = require('../services/ownerService');

async function createField(req: any, res: any) {
  const { name, phone, city, area, address, lat, lng } = req.body || {};
  const errors: any = {};
  if (!validateRequiredString(name)) errors.name = 'required';
  if (!validateRequiredString(phone)) errors.phone = 'required';
  if (!validateRequiredString(city)) errors.city = 'required';
  if (!validateRequiredString(area)) errors.area = 'required';
  if (!validateRequiredString(address)) errors.address = 'required';
  if (!Number.isFinite(Number(lat))) errors.lat = 'required';
  if (!Number.isFinite(Number(lng))) errors.lng = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 422, 'Validation failed', errors);

  const field = await ownerService.createField(req.auth.userId, {
    name: String(name).trim(),
    phone: String(phone).trim(),
    city: String(city).trim(),
    area: String(area).trim(),
    address: String(address).trim(),
    lat: Number(lat),
    lng: Number(lng)
  });

  return res.status(201).json({ id: field.id, status: field.status, name: field.name });
}

async function updateField(req: any, res: any) {
  const patch: any = { ...req.body };
  if (Object.prototype.hasOwnProperty.call(patch, 'lat')) patch.lat = toNumber(patch.lat);
  if (Object.prototype.hasOwnProperty.call(patch, 'lng')) patch.lng = toNumber(patch.lng);
  const field = await ownerService.updateField(req.auth.userId, req.params.id, patch);
  if (!field) return errorResponse(res, 404, 'Not found');
  return res.json({ success: true });
}

async function specs(req: any, res: any) {
  const field = await ownerService.updateSpecs(req.auth.userId, req.params.id, req.body || {});
  if (!field) return errorResponse(res, 404, 'Not found');
  return res.json({ success: true });
}

async function pricing(req: any, res: any) {
  const { price_per_hour, peak_price_per_hour } = req.body || {};
  const errors: any = {};
  if (price_per_hour === undefined) errors.price_per_hour = 'required';
  if (peak_price_per_hour === undefined) errors.peak_price_per_hour = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 422, 'Validation failed', errors);

  const field = await ownerService.updatePricing(req.auth.userId, req.params.id, { price_per_hour, peak_price_per_hour });
  if (!field) return errorResponse(res, 404, 'Not found');
  return res.json({ success: true });
}

async function schedule(req: any, res: any) {
  const days = req.body?.days;
  if (!Array.isArray(days)) return errorResponse(res, 422, 'Validation failed', { days: 'required' });
  const mapped = days.map((d) => {
    const dow = Number(d.day_of_week);
    const map = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const day = Number.isInteger(dow) && dow >= 0 && dow <= 6 ? map[dow] : null;
    return {
      day,
      enabled: Boolean(d.is_open),
      open_time: d.open_time || '08:00',
      close_time: d.close_time || '24:00'
    };
  });
  if (mapped.some((m) => !m.day)) return errorResponse(res, 422, 'Validation failed', { days: 'invalid' });
  const field = await ownerService.updateSchedule(req.auth.userId, req.params.id, { days: mapped });
  if (!field) return errorResponse(res, 404, 'Not found');
  return res.json({ success: true });
}

async function submitForReview(req: any, res: any) {
  const field = await ownerService.submitForReview(req.auth.userId, req.params.id);
  if (!field) return errorResponse(res, 404, 'Not found');
  return res.json({ success: true, status: field.status });
}

async function photos(req: any, res: any) {
  const files = req.files || [];
  if (!Array.isArray(files) || files.length === 0) return errorResponse(res, 422, 'Validation failed', { files: 'required' });
  const added = await ownerService.addPhotos(req.auth.userId, req.params.id, files);
  if (!added) return errorResponse(res, 404, 'Not found');
  return res.json({ success: true, photos: added });
}

async function deletePhoto(req: any, res: any) {
  const field = await ownerService.deletePhoto(req.auth.userId, req.params.id, req.params.photoId);
  if (!field) return errorResponse(res, 404, 'Not found');
  return res.json({ success: true });
}

async function getField(req: any, res: any) {
  const field = await ownerService.getOwnerField(req.auth.userId, req.params.id);
  if (!field) return errorResponse(res, 404, 'Not found');
  return res.json({ ...field, id: field._id.toString() });
}

async function getMyField(req: any, res: any) {
  const field = await ownerService.getMyField(req.auth.userId);
  if (!field) return errorResponse(res, 404, 'Not found');
  return res.json({ ...field, id: field._id.toString() });
}

async function listBookings(req: any, res: any) {
  const status = validateRequiredString(req.query.status) ? String(req.query.status).toLowerCase() : null;
  const date = validateRequiredString(req.query.date) ? String(req.query.date) : null;
  const { page, limit } = safePagination(req.query);
  const result = await ownerService.listOwnerBookings(req.auth.userId, { status, date, page, limit });
  return res.json(result);
}

async function getBooking(req: any, res: any) {
  const result = await ownerService.getOwnerBookingById(req.auth.userId, req.params.id);
  if (!result) return errorResponse(res, 404, 'Not found');
  return res.json(result);
}

async function confirmBooking(req: any, res: any) {
  const booking = await ownerService.confirmAttendance(req.auth.userId, req.params.id);
  if (!booking) return errorResponse(res, 404, 'Not found');
  return res.json({ success: true, attended_at: booking.attended_at });
}

async function cancelBooking(req: any, res: any) {
  const ok = await ownerService.cancelBooking(req.auth.userId, req.params.id);
  if (!ok) return errorResponse(res, 404, 'Not found');
  return res.json({ success: true });
}

async function stats(req: any, res: any) {
  const period = validateRequiredString(req.query.period) ? String(req.query.period) : 'today';
  const result = await ownerService.getStats(req.auth.userId, period);
  return res.json(result);
}

async function revenue(req: any, res: any) {
  const from = validateRequiredString(req.query.from) ? String(req.query.from) : null;
  const to = validateRequiredString(req.query.to) ? String(req.query.to) : null;
  const group_by = validateRequiredString(req.query.group_by) ? String(req.query.group_by) : 'day';
  const result = await ownerService.getRevenue(req.auth.userId, { from, to, group_by });
  return res.json(result);
}

async function notifications(req: any, res: any) {
  const { page, limit } = safePagination(req.query);
  const result = await ownerService.listOwnerNotifications(req.auth.userId, { page, limit });
  return res.json(result);
}

async function notificationsReadAll(req: any, res: any) {
  await ownerService.readAllOwnerNotifications(req.auth.userId);
  return res.json({ success: true });
}

async function wallet(req: any, res: any) {
  const result = await ownerService.getWallet(req.auth.userId);
  return res.json(result);
}

async function ledger(req: any, res: any) {
  const from = validateRequiredString(req.query.from) ? String(req.query.from) : null;
  const to = validateRequiredString(req.query.to) ? String(req.query.to) : null;
  const { page, limit } = safePagination(req.query);
  const result = await ownerService.listLedger(req.auth.userId, { page, limit, from, to });
  return res.json(result);
}

async function payouts(req: any, res: any) {
  const { page, limit } = safePagination(req.query);
  const result = await ownerService.listPayouts(req.auth.userId, { page, limit });
  return res.json(result);
}

async function requestPayout(req: any, res: any) {
  const amount = req.body?.amount;
  const method = req.body?.method;
  const errors: any = {};
  if (amount === undefined) errors.amount = 'required';
  if (!validateRequiredString(method)) errors.method = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 422, 'Validation failed', errors);

  const result = await ownerService.requestPayout(req.auth.userId, { amount, method: String(method) });
  if (!result.ok) return errorResponse(res, result.status, result.message || 'Validation failed', result.errors || null);
  return res.json({ success: true, payout: { id: result.payout.id, status: result.payout.status } });
}

module.exports = {
  createField,
  updateField,
  specs,
  pricing,
  schedule,
  submitForReview,
  photos,
  deletePhoto,
  getField,
  getMyField,
  listBookings,
  getBooking,
  confirmBooking,
  cancelBooking,
  stats,
  revenue,
  notifications,
  notificationsReadAll,
  wallet,
  ledger,
  payouts,
  requestPayout
};

export {};
