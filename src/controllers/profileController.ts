const { validateRequiredString, safePagination } = require('../utils/validation');
const { errorResponse } = require('../utils/http');
const profileService = require('../services/profileService');

async function get(req: any, res: any) {
  const user = await profileService.getProfile(req.auth.userId);
  if (!user) return errorResponse(res, 401, 'Unauthorized');
  return res.json({
    id: user.id,
    phone: user.phone,
    role: user.role,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    avatar_url: user.avatar_url
  });
}

async function update(req: any, res: any) {
  const first_name = req.body?.first_name;
  const last_name = req.body?.last_name;
  const email = req.body?.email;
  const errors: any = {};
  if (first_name !== undefined && first_name !== null && !validateRequiredString(first_name)) errors.first_name = 'invalid';
  if (last_name !== undefined && last_name !== null && !validateRequiredString(last_name)) errors.last_name = 'invalid';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const user = await profileService.updateProfile(req.auth.userId, {
    first_name: first_name !== undefined ? String(first_name).trim() : undefined,
    last_name: last_name !== undefined ? String(last_name).trim() : undefined,
    email: email !== undefined ? (validateRequiredString(email) ? String(email).trim() : null) : undefined
  });
  if (!user) return errorResponse(res, 401, 'Unauthorized');
  return res.json({ success: true });
}

async function avatar(req: any, res: any) {
  if (!req.file) return errorResponse(res, 400, 'Validation error', { file: 'required' });
  const url = `/uploads/${req.file.filename}`;
  const user = await profileService.updateAvatar(req.auth.userId, url);
  if (!user) return errorResponse(res, 401, 'Unauthorized');
  return res.json({ avatar_url: url });
}

async function notifications(req: any, res: any) {
  const { page, limit } = safePagination(req.query);
  const result = await profileService.listNotifications(req.auth.userId, { page, limit });
  return res.json(result);
}

async function notificationsReadAll(req: any, res: any) {
  await profileService.readAllNotifications(req.auth.userId);
  return res.json({ success: true });
}

async function fcmToken(req: any, res: any) {
  const token = req.body?.token;
  if (!validateRequiredString(token)) return errorResponse(res, 400, 'Validation error', { token: 'required' });
  const user = await profileService.updateFcmToken(req.auth.userId, String(token));
  if (!user) return errorResponse(res, 401, 'Unauthorized');
  return res.json({ success: true });
}

module.exports = { get, update, avatar, notifications, notificationsReadAll, fcmToken };

export {};
