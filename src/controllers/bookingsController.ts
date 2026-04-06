const { validateRequiredString, safePagination } = require('../utils/validation');
const { errorResponse } = require('../utils/http');
const bookingsService = require('../services/bookingsService');

async function create(req: any, res: any) {
  const field_id = req.body?.field_id;
  const slot_id = req.body?.slot_id;
  const date = req.body?.date;
  const payment_method = req.body?.payment_method;
  const errors: any = {};
  if (!validateRequiredString(field_id)) errors.field_id = 'required';
  if (!validateRequiredString(slot_id)) errors.slot_id = 'required';
  if (!validateRequiredString(date)) errors.date = 'required';
  if (!validateRequiredString(payment_method)) errors.payment_method = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const result = await bookingsService.createBooking(req.auth.userId, {
    field_id,
    slot_id,
    date: String(date),
    payment_method
  });

  if (!result.ok) {
    if (result.errors) return errorResponse(res, result.status, 'Validation error', result.errors);
    return errorResponse(res, result.status, result.message || (result.status === 404 ? 'Not found' : 'Unauthorized'));
  }

  return res.json({
    id: result.booking.id,
    reference: result.booking.reference,
    status: result.booking.status,
    payment_status: result.booking.payment_status || null,
    field: { id: result.field._id.toString(), name: result.field.name },
    date: result.booking.date,
    start_time: result.booking.start_time,
    end_time: result.booking.end_time,
    total_price: result.booking.total_price,
    payment_method: result.booking.payment_method,
    created_at: result.booking.created_at
  });
}

async function list(req: any, res: any) {
  const status = validateRequiredString(req.query.status) ? String(req.query.status).toLowerCase() : null;
  const { page, limit } = safePagination(req.query);
  const result = await bookingsService.listMyBookings(req.auth.userId, { status, page, limit });
  return res.json(result);
}

async function getById(req: any, res: any) {
  const result = await bookingsService.getMyBookingById(req.auth.userId, req.params.id);
  if (!result) return errorResponse(res, 404, 'Not found');
  return res.json(result);
}

async function cancel(req: any, res: any) {
  const result = await bookingsService.cancelMyBooking(req.auth.userId, req.params.id);
  if (!result.ok) return errorResponse(res, result.status, 'Not found');
  return res.json({ success: true, refund_amount: result.refund_amount || 0, policy: result.policy || null });
}

async function review(req: any, res: any) {
  const rating = req.body?.rating;
  const comment = req.body?.comment ?? null;
  const errors: any = {};
  const ratingNum = Number(rating);
  if (!Number.isFinite(ratingNum)) errors.rating = 'required';
  if (Number.isFinite(ratingNum) && (ratingNum < 1 || ratingNum > 5)) errors.rating = 'invalid';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const result = await bookingsService.submitReview(req.auth.userId, req.params.id, {
    rating: ratingNum,
    comment: validateRequiredString(comment) ? String(comment).trim() : null
  });
  if (!result.ok) return errorResponse(res, result.status, result.message || 'Not found');
  return res.json({ success: true, review: result.review });
}

module.exports = { create, list, getById, cancel, review };

export {};
