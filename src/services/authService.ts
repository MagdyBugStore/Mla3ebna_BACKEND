const jwt = require('jsonwebtoken');
const https = require('https');
const crypto = require('crypto');
const { env } = require('../config/env');
const User = require('../models/User');
const AuthIdentity = require('../models/AuthIdentity');
const Otp = require('../models/Otp');
const RefreshToken = require('../models/RefreshToken');
const { randomToken } = require('../utils/ids');

const jwksCache = new Map();

function base64UrlToBuffer(str: any) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64');
}

function decodeJwtHeader(token: any) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(base64UrlToBuffer(parts[0]).toString('utf8'));
  } catch (_e) {
    return null;
  }
}

function fetchJson(url: string) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res: any) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: any) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function getJwks(url: string) {
  const cached: any = jwksCache.get(url) || null;
  if (cached && Date.now() - cached.fetchedAt < 60 * 60 * 1000) return cached.keys;
  const json: any = await fetchJson(url);
  const keys = Array.isArray(json?.keys) ? json.keys : [];
  jwksCache.set(url, { keys, fetchedAt: Date.now() });
  return keys;
}

async function publicKeyForKid({ jwksUrl, kid }: any) {
  const keys = await getJwks(jwksUrl);
  const jwk = keys.find((k: any) => k && k.kid === kid) || null;
  if (!jwk) return null;
  try {
    const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    return keyObject.export({ type: 'spki', format: 'pem' });
  } catch (_e) {
    return null;
  }
}

async function verifyGoogleIdToken(id_token: string) {
  if (!env.googleClientId) return { ok: false, status: 500, message: 'GOOGLE_CLIENT_ID not configured' };
  const header = decodeJwtHeader(id_token);
  if (!header?.kid) return { ok: false, status: 400, message: 'Invalid token' };
  const pub = await publicKeyForKid({ jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs', kid: header.kid });
  if (!pub) return { ok: false, status: 400, message: 'Invalid token' };
  try {
    const payload = jwt.verify(id_token, pub, {
      algorithms: ['RS256'],
      audience: env.googleClientId,
      issuer: ['https://accounts.google.com', 'accounts.google.com']
    });
    return { ok: true, payload };
  } catch (_e) {
    return { ok: false, status: 400, message: 'Invalid token' };
  }
}

async function verifyAppleIdToken(id_token: string) {
  if (!env.appleClientId) return { ok: false, status: 500, message: 'APPLE_CLIENT_ID not configured' };
  const header = decodeJwtHeader(id_token);
  if (!header?.kid) return { ok: false, status: 400, message: 'Invalid token' };
  const pub = await publicKeyForKid({ jwksUrl: 'https://appleid.apple.com/auth/keys', kid: header.kid });
  if (!pub) return { ok: false, status: 400, message: 'Invalid token' };
  try {
    const payload = jwt.verify(id_token, pub, {
      algorithms: ['RS256'],
      audience: env.appleClientId,
      issuer: 'https://appleid.apple.com'
    });
    return { ok: true, payload };
  } catch (_e) {
    return { ok: false, status: 400, message: 'Invalid token' };
  }
}

function issueAccessToken(user: any) {
  const payload = { sub: user.id, role: user.role };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.accessTokenTtlSeconds });
}

async function sendOtp(phone: string) {
  const otpCode = '1234';
  const expiresAt = new Date(Date.now() + env.otpTtlSeconds * 1000);
  await Otp.findOneAndUpdate(
    { phone },
    { phone, otp: otpCode, expires_at: expiresAt },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return { success: true };
}

async function verifyOtp({ phone, otp }: any) {
  const record = await Otp.findOne({ phone });
  if (!record) return { ok: false, reason: 'invalid' };
  if (record.otp !== otp) return { ok: false, reason: 'invalid' };
  if (record.expires_at.getTime() < Date.now()) return { ok: false, reason: 'expired' };

  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({
      phone,
      role: 'player',
      first_name: null,
      last_name: null,
      email: null,
      avatar_url: null,
      favorites: [],
      fcm_token: null,
      fcm_tokens: []
    });
  }

  await AuthIdentity.findOneAndUpdate(
    { provider: 'otp', phone },
    { user_id: user.id, provider: 'otp', phone, email: user.email || null, verified_at: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Otp.deleteOne({ phone });
  const refresh_token = randomToken();
  await RefreshToken.create({
    token: refresh_token,
    user_id: user.id,
    revoked_at: null,
    expires_at: new Date(Date.now() + env.refreshTokenTtlSeconds * 1000)
  });

  const is_new_user = !user.profile_completed_at;
  return { ok: true, user, refresh_token, is_new_user };
}

async function completeProfile(userId: string, { first_name, last_name, email, role }: any) {
  const user = await User.findById(userId);
  if (!user) return null;
  user.first_name = first_name;
  user.last_name = last_name;
  user.email = email || null;
  user.role = role;
  if (!user.profile_completed_at) user.profile_completed_at = new Date();
  await user.save();
  return user;
}

async function oauthLogin({ provider, id_token }: any) {
  const p = String(provider || '').toLowerCase();
  if (!['google', 'apple'].includes(p)) return { ok: false, status: 400, message: 'Validation error', errors: { provider: 'invalid' } };
  if (!id_token) return { ok: false, status: 400, message: 'Validation error', errors: { id_token: 'required' } };

  const verified = p === 'google' ? await verifyGoogleIdToken(id_token) : await verifyAppleIdToken(id_token);
  if (!verified.ok) return verified;

  const sub = String(verified.payload?.sub || '');
  if (!sub) return { ok: false, status: 400, message: 'Invalid token' };

  const email = verified.payload?.email ? String(verified.payload.email) : null;
  const picture = verified.payload?.picture ? String(verified.payload.picture) : null;
  const given_name = verified.payload?.given_name ? String(verified.payload.given_name) : null;
  const family_name = verified.payload?.family_name ? String(verified.payload.family_name) : null;

  const identity = await AuthIdentity.findOne({ provider: p, provider_user_id: sub }).lean();
  let user = identity ? await User.findById(identity.user_id) : null;
  if (!user && email) {
    user = await User.findOne({ email });
  }
  if (!user) {
    user = await User.create({
      phone: null,
      role: 'player',
      first_name: given_name,
      last_name: family_name,
      email,
      avatar_url: picture,
      favorites: [],
      fcm_token: null,
      fcm_tokens: [],
      profile_completed_at: null,
      default_city: null
    });
  } else {
    if (email && !user.email) user.email = email;
    if (picture && !user.avatar_url) user.avatar_url = picture;
    if (given_name && !user.first_name) user.first_name = given_name;
    if (family_name && !user.last_name) user.last_name = family_name;
    await user.save();
  }

  await AuthIdentity.findOneAndUpdate(
    { provider: p, provider_user_id: sub },
    { user_id: user.id, provider: p, provider_user_id: sub, email, phone: null, verified_at: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const refresh_token = randomToken();
  await RefreshToken.create({
    token: refresh_token,
    user_id: user.id,
    revoked_at: null,
    expires_at: new Date(Date.now() + env.refreshTokenTtlSeconds * 1000)
  });

  return { ok: true, user, refresh_token };
}

async function refreshAccessToken(refresh_token: string) {
  const record = await RefreshToken.findOne({ token: refresh_token });
  if (!record) return null;
  if (record.revoked_at) return null;
  if (record.expires_at.getTime() < Date.now()) return null;
  const user = await User.findById(record.user_id);
  if (!user) return null;
  return { access_token: issueAccessToken(user) };
}

async function logout(userId: string, refresh_token: string) {
  if (!refresh_token) return { success: true };
  await RefreshToken.updateOne({ token: refresh_token, user_id: userId }, { revoked_at: new Date() });
  return { success: true };
}

module.exports = {
  issueAccessToken,
  oauthLogin,
  completeProfile,
  refreshAccessToken,
  logout
};

export {};
