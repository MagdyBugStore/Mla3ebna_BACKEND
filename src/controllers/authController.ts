const { validateRequiredString } = require('../utils/validation');
const { errorResponse } = require('../utils/http');
const authService = require('../services/authService');

async function oauth(req: any, res: any) {
  const provider = req.body?.provider;
  const id_token = req.body?.id_token;
  const errors: any = {};
  if (!validateRequiredString(provider)) errors.provider = 'required';
  if (!validateRequiredString(id_token)) errors.id_token = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const result = await authService.oauthLogin({ provider: String(provider).toLowerCase(), id_token: String(id_token) });
  if (!result.ok) {
    if (result.errors) return errorResponse(res, result.status, result.message || 'Validation error', result.errors);
    return errorResponse(res, result.status || 400, result.message || 'Unauthorized');
  }

  const access_token = authService.issueAccessToken(result.user);
  return res.json({
    access_token,
    refresh_token: result.refresh_token,
    user: {
      id: result.user.id,
      phone: result.user.phone,
      role: result.user.role,
      first_name: result.user.first_name,
      last_name: result.user.last_name,
      email: result.user.email,
      avatar_url: result.user.avatar_url
    }
  });
}

async function completeProfile(req: any, res: any) {
  const first_name = req.body?.first_name;
  const last_name = req.body?.last_name;
  const email = req.body?.email ?? null;
  const role = req.body?.role;
  const errors: any = {};
  if (!validateRequiredString(first_name)) errors.first_name = 'required';
  if (!validateRequiredString(last_name)) errors.last_name = 'required';
  if (!validateRequiredString(role)) errors.role = 'required';
  if (role && !['player', 'owner'].includes(role)) errors.role = 'invalid';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const user = await authService.completeProfile(req.auth.userId, {
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    email: validateRequiredString(email) ? String(email).trim() : null,
    role
  });
  if (!user) return errorResponse(res, 401, 'Unauthorized');

  const access_token = authService.issueAccessToken(user);
  return res.json({
    access_token,
    user: {
      id: user.id,
      phone: user.phone,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      avatar_url: user.avatar_url
    }
  });
}

async function refresh(req: any, res: any) {
  const refresh_token = req.body?.refresh_token;
  if (!validateRequiredString(refresh_token)) return errorResponse(res, 400, 'Validation error', { refresh_token: 'required' });
  const result = await authService.refreshAccessToken(refresh_token);
  if (!result) return errorResponse(res, 401, 'Unauthorized');
  return res.json(result);
}

async function logout(req: any, res: any) {
  const refresh_token = req.body?.refresh_token ?? null;
  await authService.logout(req.auth.userId, refresh_token);
  return res.json({ success: true });
}

module.exports = { oauth, completeProfile, refresh, logout };

export {};
