const { validateRequiredString } = require('../utils/validation');
const { errorResponse } = require('../utils/http');
const { env } = require('../config/env');
const authService = require('../services/authService');
const profileService = require('../services/profileService');

async function social(req: any, res: any) {
  const provider = req.body?.provider;
  const id_token = req.body?.id_token;
  const errors: any = {};
  if (!validateRequiredString(provider)) errors.provider = 'required';
  if (!validateRequiredString(id_token)) errors.id_token = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 422, 'Validation failed', errors);

  const result = await authService.oauthLogin({ provider: String(provider).toLowerCase(), id_token: String(id_token) });
  if (!result.ok) {
    if (result.errors) return errorResponse(res, result.status, result.message || 'Validation failed', result.errors);
    return errorResponse(res, result.status || 400, result.message || 'Unauthorized');
  }

  const access_token = authService.issueAccessToken(result.user);
  const is_onboarded = Boolean(result.user.profile_completed_at);
  const display_name = [result.user.first_name, result.user.last_name].filter(Boolean).join(' ') || result.user.email || null;
  return res.json({
    access_token,
    refresh_token: result.refresh_token,
    expires_in: env.accessTokenTtlSeconds,
    user: {
      id: result.user.id,
      email: result.user.email,
      display_name,
      avatar_url: result.user.avatar_url,
      role: is_onboarded ? result.user.role : null,
      is_onboarded
    },
    is_new_user: Boolean(result.is_new_user) || !is_onboarded
  });
}

async function completeProfile(req: any, res: any) {
  const first_name = req.body?.first_name;
  const last_name = req.body?.last_name;
  const role = req.body?.role;
  const errors: any = {};
  if (!validateRequiredString(first_name)) errors.first_name = 'required';
  if (!validateRequiredString(last_name)) errors.last_name = 'required';
  if (!validateRequiredString(role)) errors.role = 'required';
  if (role && !['player', 'owner'].includes(role)) errors.role = 'invalid';
  if (Object.keys(errors).length) return errorResponse(res, 422, 'Validation failed', errors);

  const user = await authService.completeProfile(req.auth.userId, {
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    email: undefined,
    role
  });
  if (!user) return errorResponse(res, 401, 'Unauthorized');

  // إصدار access_token جديد
  const access_token = authService.issueAccessToken(user);
  const expires_in = env.accessTokenTtlSeconds;

  return res.json({
    access_token,
    expires_in,
    user: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      is_onboarded: true
    }
  });
}

async function refresh(req: any, res: any) {
  const refresh_token = req.body?.refresh_token;
  if (!validateRequiredString(refresh_token)) return errorResponse(res, 422, 'Validation failed', { refresh_token: 'required' });
  const result = await authService.refreshAccessToken(refresh_token);
  if (!result) return errorResponse(res, 401, 'Unauthorized');
  return res.json({ access_token: result.access_token, expires_in: env.accessTokenTtlSeconds });
}

async function logout(req: any, res: any) {
  const refresh_token = req.body?.refresh_token ?? null;
  await authService.logout(req.auth.userId, refresh_token);
  return res.json({ success: true });
}

async function fcmToken(req: any, res: any) {
  const token = req.body?.token;
  if (!validateRequiredString(token)) return errorResponse(res, 422, 'Validation failed', { token: 'required' });
  const user = await profileService.updateFcmToken(req.auth.userId, String(token));
  if (!user) return errorResponse(res, 401, 'Unauthorized');
  return res.json({ success: true });
}

module.exports = { social, completeProfile, refresh, logout, fcmToken };

export { };
