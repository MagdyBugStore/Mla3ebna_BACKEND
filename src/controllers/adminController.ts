const { validateRequiredString, safePagination } = require('../utils/validation');
const { errorResponse } = require('../utils/http');
const adminService = require('../services/adminService');

async function listFields(req: any, res: any) {
  const status = validateRequiredString(req.query.status) ? String(req.query.status) : null;
  const { page, limit } = safePagination(req.query);
  const result = await adminService.listFields({ status, page, limit });
  return res.json(result);
}

async function approveField(req: any, res: any) {
  const field = await adminService.approveField(req.auth.userId, req.params.id);
  if (!field) return errorResponse(res, 404, 'Not found');
  return res.json({ success: true, status: field.status });
}

async function rejectField(req: any, res: any) {
  const reason = req.body?.reason ?? null;
  if (!validateRequiredString(reason)) return errorResponse(res, 422, 'Validation failed', { reason: 'required' });
  const field = await adminService.rejectField(req.auth.userId, req.params.id, String(reason).trim());
  if (!field) return errorResponse(res, 404, 'Not found');
  return res.json({ success: true, status: field.status });
}

async function listPayouts(req: any, res: any) {
  const status = validateRequiredString(req.query.status) ? String(req.query.status) : null;
  const { page, limit } = safePagination(req.query);
  const result = await adminService.listPayouts({ status, page, limit });
  return res.json(result);
}

async function markPayoutPaid(req: any, res: any) {
  const provider_ref = req.body?.provider_ref ?? null;
  const payout = await adminService.markPayoutPaid(
    req.auth.userId,
    req.params.id,
    validateRequiredString(provider_ref) ? String(provider_ref) : null
  );
  if (!payout) return errorResponse(res, 404, 'Not found');
  return res.json({ success: true, status: payout.status });
}

async function markPayoutFailed(req: any, res: any) {
  const reason = req.body?.reason ?? null;
  const payout = await adminService.markPayoutFailed(req.auth.userId, req.params.id, validateRequiredString(reason) ? String(reason) : null);
  if (!payout) return errorResponse(res, 404, 'Not found');
  return res.json({ success: true, status: payout.status });
}

module.exports = { listFields, approveField, rejectField, listPayouts, markPayoutPaid, markPayoutFailed };

export {};
