const { validateRequiredString } = require('../utils/validation');
const { errorResponse } = require('../utils/http');
const paymentsService = require('../services/paymentsService');

async function methods(_req: any, res: any) {
  return res.json(paymentsService.listMethods());
}

async function initiate(req: any, res: any) {
  const booking_id = req.body?.booking_id;
  const method = req.body?.method;
  const card_token = req.body?.card_token ?? null;
  const errors: any = {};
  if (!validateRequiredString(booking_id)) errors.booking_id = 'required';
  if (!validateRequiredString(method)) errors.method = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 422, 'Validation failed', errors);

  const result = await paymentsService.initiatePayment(req.auth.userId, {
    booking_id,
    method,
    card_token: validateRequiredString(card_token) ? String(card_token) : null
  });
  if (!result.ok) return errorResponse(res, result.status, result.status === 409 ? 'Conflict' : 'Not found');
  return res.json({
    payment_id: result.payment.id,
    status: 'pending',
    redirect_url: null,
    amount: result.payment.amount || 0,
    currency: result.payment.currency || 'EGP'
  });
}

async function verify(req: any, res: any) {
  const payment_id = req.body?.payment_id;
  const transaction_id = req.body?.transaction_id;
  const errors: any = {};
  if (!validateRequiredString(payment_id)) errors.payment_id = 'required';
  if (!validateRequiredString(transaction_id)) errors.transaction_id = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 422, 'Validation failed', errors);

  const result = await paymentsService.verifyPayment(req.auth.userId, { payment_id, transaction_id });
  if (!result.ok) return errorResponse(res, result.status, 'Not found');
  const booking = result.booking;
  return res.json({
    payment_id: result.payment.id,
    status: result.payment.status === 'paid' ? 'success' : 'failed',
    booking: booking
      ? {
          id: booking.id,
          reference: booking.reference,
          status: booking.status
        }
      : null
  });
}

async function paymobWebhook(req: any, res: any) {
  const event_id = req.body?.event_id ?? null;
  const payment_id = req.body?.payment_id ?? null;
  const transaction_id = req.body?.transaction_id ?? null;
  const status = req.body?.status ?? null;
  const payload = req.body ?? null;

  const result = await paymentsService.paymobWebhook({
    event_id: validateRequiredString(event_id) ? String(event_id) : null,
    payment_id: validateRequiredString(payment_id) ? String(payment_id) : null,
    transaction_id: validateRequiredString(transaction_id) ? String(transaction_id) : null,
    status: validateRequiredString(status) ? String(status) : null,
    payload
  });
  if (!result.ok) return errorResponse(res, result.status || 400, result.status === 404 ? 'Not found' : 'Validation failed');
  return res.json({ success: true, ignored: Boolean(result.ignored) });
}

module.exports = { methods, initiate, verify, paymobWebhook };

export {};
