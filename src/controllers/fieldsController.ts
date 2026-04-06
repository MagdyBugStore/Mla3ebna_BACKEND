const { validateRequiredString, toNumber, safePagination } = require('../utils/validation');
const { errorResponse } = require('../utils/http');
const fieldsService = require('../services/fieldsService');

async function list(req: any, res: any) {
  const q = validateRequiredString(req.query.q) ? String(req.query.q) : null;
  const sport = validateRequiredString(req.query.sport) ? String(req.query.sport).toLowerCase() : null;
  const city = validateRequiredString(req.query.city) ? String(req.query.city) : null;
  const area = validateRequiredString(req.query.area) ? String(req.query.area) : null;
  const lat = toNumber(req.query.lat);
  const lng = toNumber(req.query.lng);
  const format = validateRequiredString(req.query.format) ? String(req.query.format) : null;
  const { page, limit } = safePagination(req.query);

  const result = await fieldsService.listFields({
    q,
    sport,
    city,
    area,
    lat,
    lng,
    page,
    limit,
    format,
    currentUserId: req.auth?.userId || null
  });
  return res.json(result);
}

async function getById(req: any, res: any) {
  const field = await fieldsService.getFieldById(req.params.id, req.auth?.userId || null, req.auth?.role || null);
  if (!field) return errorResponse(res, 404, 'Not found');
  return res.json(field);
}

async function listReviews(req: any, res: any) {
  const { page, limit } = safePagination(req.query);
  const result = await fieldsService.listFieldReviews(req.params.id, { page, limit });
  return res.json(result);
}

async function slots(req: any, res: any) {
  const date = req.query.date;
  if (!validateRequiredString(date)) return errorResponse(res, 400, 'Validation error', { date: 'required' });
  const result = await fieldsService.getSlots(req.params.id, String(date));
  if (!result.ok && result.reason === 'not_found') return errorResponse(res, 404, 'Not found');
  if (!result.ok && result.reason === 'invalid_date') return errorResponse(res, 400, 'Validation error', { date: 'invalid' });
  return res.json(result.data);
}

async function favoritesList(req: any, res: any) {
  const result = await fieldsService.listFavorites(req.auth.userId);
  return res.json(result);
}

async function favoritesAdd(req: any, res: any) {
  const result = await fieldsService.addFavorite(req.auth.userId, req.params.id);
  if (!result.ok) return errorResponse(res, result.status, result.status === 404 ? 'Not found' : 'Unauthorized');
  return res.json({ success: true });
}

async function favoritesRemove(req: any, res: any) {
  const result = await fieldsService.removeFavorite(req.auth.userId, req.params.id);
  if (!result.ok) return errorResponse(res, result.status, result.status === 404 ? 'Not found' : 'Unauthorized');
  return res.json({ success: true });
}

module.exports = { list, getById, listReviews, slots, favoritesList, favoritesAdd, favoritesRemove };

export {};
