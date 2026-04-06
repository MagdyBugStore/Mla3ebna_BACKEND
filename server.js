const cors = require('cors');
const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { getDb, updateDb, generateId } = require('./db');

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 60 * 60);
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 30);
const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS || 5 * 60);

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '');
      cb(null, `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

function nowIso() {
  return new Date().toISOString();
}

function toNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normalizeDayName(jsDay) {
  switch (jsDay) {
    case 0:
      return 'sunday';
    case 1:
      return 'monday';
    case 2:
      return 'tuesday';
    case 3:
      return 'wednesday';
    case 4:
      return 'thursday';
    case 5:
      return 'friday';
    case 6:
      return 'saturday';
    default:
      return 'sunday';
  }
}

function parseTimeToMinutes(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 24) return null;
  if (mm < 0 || mm > 59) return null;
  if (hh === 24 && mm !== 0) return null;
  return hh * 60 + mm;
}

function minutesToHHMM(minutes) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function isPeakTime(startMinutes) {
  const hh = Math.floor(startMinutes / 60);
  return hh >= 18 && hh < 22;
}

function validateRequiredString(value) {
  if (typeof value !== 'string') return false;
  return value.trim().length > 0;
}

function errorResponse(res, status, message, errors) {
  if (errors && Object.keys(errors).length > 0) {
    return res.status(status).json({ message, errors });
  }
  return res.status(status).json({ message });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(header);
  if (!m) return errorResponse(res, 401, 'Unauthorized');
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.auth = { userId: payload.sub, role: payload.role };
    return next();
  } catch (_e) {
    return errorResponse(res, 401, 'Unauthorized');
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.auth) return errorResponse(res, 401, 'Unauthorized');
    if (req.auth.role !== role) return errorResponse(res, 403, 'Forbidden');
    return next();
  };
}

async function getCurrentUser(req) {
  const db = await getDb();
  return db.users.find((u) => u.id === req.auth.userId) || null;
}

function issueAccessToken(user) {
  const payload = { sub: user.id, role: user.role };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

function randomToken() {
  return `${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function safePagination(query) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  return { page, limit, offset: (page - 1) * limit };
}

function makeBookingReference() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `ML-${n}`;
}

function computeFieldRatingMeta(db, fieldId) {
  const reviews = db.reviews.filter((r) => r.field_id === fieldId);
  const review_count = reviews.length;
  const rating = review_count === 0 ? 0 : reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / review_count;
  return { rating: Number(rating.toFixed(1)), review_count };
}

function buildSlotsForDate(db, field, dateStr) {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const dayName = normalizeDayName(date.getUTCDay());
  const dayCfg = Array.isArray(field.schedule) ? field.schedule.find((d) => d.day === dayName) : null;
  if (!dayCfg || dayCfg.enabled === false) {
    return { date: dateStr, slots: [] };
  }
  const openMin = parseTimeToMinutes(dayCfg.open_time || '08:00') ?? 8 * 60;
  const closeMin = parseTimeToMinutes(dayCfg.close_time || '24:00') ?? 24 * 60;
  const start = Math.max(0, Math.min(openMin, 24 * 60));
  const end = Math.max(0, Math.min(closeMin, 24 * 60));
  if (end <= start) return { date: dateStr, slots: [] };

  const bookedSet = new Set(
    db.bookings
      .filter((b) => b.field_id === field.id && b.date === dateStr && b.status !== 'cancelled')
      .map((b) => `${b.start_time}-${b.end_time}`)
  );

  const slots = [];
  for (let t = start; t + 60 <= end; t += 60) {
    const start_time = minutesToHHMM(t);
    const end_time = minutesToHHMM(t + 60);
    const key = `${start_time}-${end_time}`;
    const status = bookedSet.has(key) ? 'booked' : 'available';
    const is_peak = isPeakTime(t);
    const id = `slot_${field.id}_${dateStr}_${start_time.replace(':', '')}`;
    slots.push({ id, start_time, end_time, status, is_peak });
  }
  return { date: dateStr, slots };
}

app.get('/health', (_req, res) => res.json({ ok: true }));

const v1 = express.Router();
app.use('/v1', v1);

v1.post('/auth/send-otp', async (req, res) => {
  const phone = req.body?.phone;
  const errors = {};
  if (!validateRequiredString(phone)) errors.phone = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const otpCode = '1234';
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();

  await updateDb((db) => {
    db.otp = db.otp.filter((o) => o.phone !== phone);
    db.otp.push({ phone, otp: otpCode, expires_at: expiresAt, created_at: nowIso() });
  });

  return res.json({ success: true });
});

v1.post('/auth/verify-otp', async (req, res) => {
  const phone = req.body?.phone;
  const otp = req.body?.otp;
  const errors = {};
  if (!validateRequiredString(phone)) errors.phone = 'required';
  if (!validateRequiredString(otp)) errors.otp = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const result = await updateDb((db) => {
    const record = db.otp.find((o) => o.phone === phone);
    if (!record) return { ok: false, reason: 'invalid' };
    if (record.otp !== otp) return { ok: false, reason: 'invalid' };
    if (new Date(record.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };

    let user = db.users.find((u) => u.phone === phone);
    if (!user) {
      user = {
        id: generateId('user'),
        phone,
        role: 'player',
        first_name: null,
        last_name: null,
        email: null,
        avatar_url: null,
        favorites: [],
        fcm_token: null,
        created_at: nowIso()
      };
      db.users.push(user);
    }

    db.otp = db.otp.filter((o) => o.phone !== phone);
    const refresh_token = randomToken();
    db.refresh_tokens.push({
      token: refresh_token,
      user_id: user.id,
      revoked_at: null,
      created_at: nowIso(),
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString()
    });

    return { ok: true, user, refresh_token };
  });

  if (!result.ok) {
    const message = result.reason === 'expired' ? 'OTP expired' : 'Invalid OTP';
    return errorResponse(res, 400, message);
  }

  const access_token = issueAccessToken(result.user);
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
});

v1.post('/auth/complete-profile', requireAuth, async (req, res) => {
  const first_name = req.body?.first_name;
  const last_name = req.body?.last_name;
  const email = req.body?.email ?? null;
  const role = req.body?.role;
  const errors = {};
  if (!validateRequiredString(first_name)) errors.first_name = 'required';
  if (!validateRequiredString(last_name)) errors.last_name = 'required';
  if (!validateRequiredString(role)) errors.role = 'required';
  if (role && !['player', 'owner'].includes(role)) errors.role = 'invalid';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const user = await updateDb((db) => {
    const u = db.users.find((x) => x.id === req.auth.userId);
    if (!u) return null;
    u.first_name = first_name;
    u.last_name = last_name;
    u.email = validateRequiredString(email) ? String(email).trim() : null;
    u.role = role;
    return u;
  });

  if (!user) return errorResponse(res, 401, 'Unauthorized');

  const access_token = issueAccessToken(user);
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
});

v1.post('/auth/refresh', async (req, res) => {
  const refresh_token = req.body?.refresh_token;
  if (!validateRequiredString(refresh_token)) return errorResponse(res, 400, 'Validation error', { refresh_token: 'required' });

  const result = await updateDb((db) => {
    const record = db.refresh_tokens.find((t) => t.token === refresh_token);
    if (!record) return { ok: false };
    if (record.revoked_at) return { ok: false };
    if (new Date(record.expires_at).getTime() < Date.now()) return { ok: false };
    const user = db.users.find((u) => u.id === record.user_id);
    if (!user) return { ok: false };
    return { ok: true, user };
  });

  if (!result.ok) return errorResponse(res, 401, 'Unauthorized');

  return res.json({ access_token: issueAccessToken(result.user) });
});

v1.post('/auth/logout', requireAuth, async (req, res) => {
  const refresh_token = req.body?.refresh_token ?? null;
  if (!refresh_token) return res.json({ success: true });

  await updateDb((db) => {
    const record = db.refresh_tokens.find((t) => t.token === refresh_token && t.user_id === req.auth.userId);
    if (record && !record.revoked_at) record.revoked_at = nowIso();
  });

  return res.json({ success: true });
});

v1.get('/fields/favorites', requireAuth, async (req, res) => {
  const db = await getDb();
  const user = db.users.find((u) => u.id === req.auth.userId);
  if (!user) return errorResponse(res, 401, 'Unauthorized');

  const favoritesSet = new Set(user.favorites || []);
  const fields = db.fields
    .filter((f) => favoritesSet.has(f.id))
    .map((f) => {
      const ratingMeta = computeFieldRatingMeta(db, f.id);
      return {
        id: f.id,
        name: f.name,
        sport: f.sport,
        surface: f.surface,
        size: f.size,
        price_per_hour: f.price_per_hour,
        peak_price_per_hour: f.peak_price_per_hour,
        rating: ratingMeta.rating,
        review_count: ratingMeta.review_count,
        distance_km: null,
        city: f.city,
        area: f.area,
        address: f.address,
        lat: f.lat,
        lng: f.lng,
        cover_image_url: f.cover_image_url,
        amenities: f.amenities || [],
        is_favorite: true,
        is_covered: Boolean(f.is_covered)
      };
    });

  return res.json({ data: fields, meta: { page: 1, limit: fields.length, total: fields.length } });
});

v1.get('/fields', async (req, res) => {
  const db = await getDb();
  const q = validateRequiredString(req.query.q) ? String(req.query.q).toLowerCase() : null;
  const sport = validateRequiredString(req.query.sport) ? String(req.query.sport).toLowerCase() : null;
  const city = validateRequiredString(req.query.city) ? String(req.query.city).toLowerCase() : null;
  const area = validateRequiredString(req.query.area) ? String(req.query.area).toLowerCase() : null;
  const lat = toNumber(req.query.lat);
  const lng = toNumber(req.query.lng);
  const { page, limit, offset } = safePagination(req.query);
  const format = validateRequiredString(req.query.format) ? String(req.query.format) : null;

  let items = db.fields.filter((f) => f.status !== 'deleted');
  if (q) items = items.filter((f) => String(f.name || '').toLowerCase().includes(q));
  if (sport) items = items.filter((f) => String(f.sport || '').toLowerCase() === sport);
  if (city) items = items.filter((f) => String(f.city || '').toLowerCase().includes(city));
  if (area) items = items.filter((f) => String(f.area || '').toLowerCase().includes(area));

  const total = items.length;
  items = items.slice(offset, offset + limit);

  if (format === 'pins') {
    const pins = items.map((f) => ({
      id: f.id,
      name: f.name,
      lat: f.lat,
      lng: f.lng,
      price_per_hour: f.price_per_hour,
      rating: computeFieldRatingMeta(db, f.id).rating
    }));
    return res.json({ data: pins, meta: { page, limit, total } });
  }

  const authHeader = req.headers.authorization || '';
  let currentUser = null;
  if (/^Bearer\s+/.test(authHeader)) {
    try {
      const payload = jwt.verify(authHeader.replace(/^Bearer\s+/, ''), JWT_SECRET);
      currentUser = db.users.find((u) => u.id === payload.sub) || null;
    } catch (_e) {
      currentUser = null;
    }
  }

  const favoritesSet = new Set((currentUser && currentUser.favorites) || []);

  const data = items.map((f) => {
    const ratingMeta = computeFieldRatingMeta(db, f.id);
    const distance_km = lat !== null && lng !== null ? Number(haversineKm(lat, lng, f.lat, f.lng).toFixed(1)) : null;
    return {
      id: f.id,
      name: f.name,
      sport: f.sport,
      surface: f.surface,
      size: f.size,
      price_per_hour: f.price_per_hour,
      peak_price_per_hour: f.peak_price_per_hour,
      rating: ratingMeta.rating,
      review_count: ratingMeta.review_count,
      distance_km,
      city: f.city,
      area: f.area,
      address: f.address,
      lat: f.lat,
      lng: f.lng,
      cover_image_url: f.cover_image_url,
      amenities: f.amenities || [],
      is_favorite: favoritesSet.has(f.id),
      is_covered: Boolean(f.is_covered)
    };
  });

  return res.json({ data, meta: { page, limit, total } });
});

v1.get('/fields/:id/reviews', async (req, res) => {
  const db = await getDb();
  const field = db.fields.find((f) => f.id === req.params.id);
  if (!field) return errorResponse(res, 404, 'Not found');

  const { page, limit, offset } = safePagination(req.query);
  const all = db.reviews
    .filter((r) => r.field_id === field.id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const total = all.length;
  const items = all.slice(offset, offset + limit).map((r) => {
    const user = db.users.find((u) => u.id === r.user_id) || null;
    return {
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      user: user
        ? {
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            avatar_url: user.avatar_url
          }
        : null
    };
  });

  return res.json({ data: items, meta: { page, limit, total } });
});

v1.get('/fields/:id/slots', async (req, res) => {
  const db = await getDb();
  const field = db.fields.find((f) => f.id === req.params.id);
  if (!field) return errorResponse(res, 404, 'Not found');
  const date = req.query.date;
  if (!validateRequiredString(date)) return errorResponse(res, 400, 'Validation error', { date: 'required' });
  const result = buildSlotsForDate(db, field, String(date));
  if (!result) return errorResponse(res, 400, 'Validation error', { date: 'invalid' });
  return res.json(result);
});

v1.post('/fields/:id/favorites', requireAuth, async (req, res) => {
  const updated = await updateDb((db) => {
    const user = db.users.find((u) => u.id === req.auth.userId);
    const field = db.fields.find((f) => f.id === req.params.id);
    if (!user) return { ok: false, status: 401 };
    if (!field) return { ok: false, status: 404 };
    user.favorites = Array.isArray(user.favorites) ? user.favorites : [];
    if (!user.favorites.includes(field.id)) user.favorites.push(field.id);
    return { ok: true };
  });
  if (!updated.ok) return errorResponse(res, updated.status, updated.status === 404 ? 'Not found' : 'Unauthorized');
  return res.json({ success: true });
});

v1.delete('/fields/:id/favorites', requireAuth, async (req, res) => {
  const updated = await updateDb((db) => {
    const user = db.users.find((u) => u.id === req.auth.userId);
    const field = db.fields.find((f) => f.id === req.params.id);
    if (!user) return { ok: false, status: 401 };
    if (!field) return { ok: false, status: 404 };
    user.favorites = (user.favorites || []).filter((x) => x !== field.id);
    return { ok: true };
  });
  if (!updated.ok) return errorResponse(res, updated.status, updated.status === 404 ? 'Not found' : 'Unauthorized');
  return res.json({ success: true });
});

v1.get('/fields/:id', async (req, res) => {
  const db = await getDb();
  const field = db.fields.find((f) => f.id === req.params.id);
  if (!field) return errorResponse(res, 404, 'Not found');

  const ratingMeta = computeFieldRatingMeta(db, field.id);
  let is_favorite = false;
  const authHeader = req.headers.authorization || '';
  if (/^Bearer\s+/.test(authHeader)) {
    try {
      const payload = jwt.verify(authHeader.replace(/^Bearer\s+/, ''), JWT_SECRET);
      const user = db.users.find((u) => u.id === payload.sub) || null;
      is_favorite = Boolean(user && (user.favorites || []).includes(field.id));
    } catch (_e) {
      is_favorite = false;
    }
  }

  const owner = db.users.find((u) => u.id === field.owner_id) || null;
  return res.json({
    id: field.id,
    name: field.name,
    sport: field.sport,
    surface: field.surface,
    size: field.size,
    price_per_hour: field.price_per_hour,
    peak_price_per_hour: field.peak_price_per_hour,
    rating: ratingMeta.rating,
    review_count: ratingMeta.review_count,
    city: field.city,
    area: field.area,
    address: field.address,
    lat: field.lat,
    lng: field.lng,
    cover_image_url: field.cover_image_url,
    photos: field.photos || [],
    amenities: field.amenities || [],
    is_favorite,
    is_covered: Boolean(field.is_covered),
    owner: owner
      ? {
          id: owner.id,
          name: [owner.first_name, owner.last_name].filter(Boolean).join(' ').trim(),
          phone: owner.phone
        }
      : null
  });
});

v1.post('/bookings', requireAuth, async (req, res) => {
  const field_id = req.body?.field_id;
  const slot_id = req.body?.slot_id;
  const date = req.body?.date;
  const payment_method = req.body?.payment_method;
  const errors = {};
  if (!validateRequiredString(field_id)) errors.field_id = 'required';
  if (!validateRequiredString(slot_id)) errors.slot_id = 'required';
  if (!validateRequiredString(date)) errors.date = 'required';
  if (!validateRequiredString(payment_method)) errors.payment_method = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const result = await updateDb((db) => {
    const user = db.users.find((u) => u.id === req.auth.userId);
    if (!user) return { ok: false, status: 401 };
    const field = db.fields.find((f) => f.id === field_id);
    if (!field) return { ok: false, status: 404 };

    const slotsResult = buildSlotsForDate(db, field, String(date));
    if (!slotsResult) return { ok: false, status: 400, errors: { date: 'invalid' } };
    const slot = slotsResult.slots.find((s) => s.id === slot_id);
    if (!slot) return { ok: false, status: 400, errors: { slot_id: 'invalid' } };
    if (slot.status !== 'available') return { ok: false, status: 409, message: 'Slot not available' };

    const total_price = slot.is_peak ? field.peak_price_per_hour : field.price_per_hour;
    const booking = {
      id: generateId('booking'),
      reference: makeBookingReference(),
      status: 'confirmed',
      user_id: user.id,
      field_id: field.id,
      date: String(date),
      start_time: slot.start_time,
      end_time: slot.end_time,
      total_price,
      payment_method: String(payment_method),
      attended_at: null,
      created_at: nowIso()
    };
    db.bookings.push(booking);
    db.notifications.push({
      id: generateId('notif'),
      user_id: user.id,
      title: 'تم إنشاء الحجز',
      body: `تم إنشاء حجزك بنجاح (${booking.reference})`,
      read_at: null,
      created_at: nowIso()
    });

    return { ok: true, booking, field };
  });

  if (!result.ok) {
    if (result.errors) return errorResponse(res, result.status, 'Validation error', result.errors);
    return errorResponse(res, result.status, result.message || (result.status === 404 ? 'Not found' : 'Unauthorized'));
  }

  return res.json({
    id: result.booking.id,
    reference: result.booking.reference,
    status: result.booking.status,
    field: { id: result.field.id, name: result.field.name },
    date: result.booking.date,
    start_time: result.booking.start_time,
    end_time: result.booking.end_time,
    total_price: result.booking.total_price,
    payment_method: result.booking.payment_method,
    created_at: result.booking.created_at
  });
});

v1.get('/bookings', requireAuth, async (req, res) => {
  const db = await getDb();
  const status = validateRequiredString(req.query.status) ? String(req.query.status).toLowerCase() : null;
  const { page, limit, offset } = safePagination(req.query);

  let items = db.bookings.filter((b) => b.user_id === req.auth.userId);
  if (status && ['upcoming', 'past', 'cancelled'].includes(status)) {
    if (status === 'cancelled') {
      items = items.filter((b) => b.status === 'cancelled');
    } else if (status === 'upcoming') {
      items = items.filter((b) => b.status !== 'cancelled' && String(b.date) >= String(new Date().toISOString().slice(0, 10)));
    } else if (status === 'past') {
      items = items.filter((b) => b.status !== 'cancelled' && String(b.date) < String(new Date().toISOString().slice(0, 10)));
    }
  }

  items = items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const total = items.length;
  const slice = items.slice(offset, offset + limit);

  const data = slice.map((b) => {
    const field = db.fields.find((f) => f.id === b.field_id) || null;
    return {
      id: b.id,
      reference: b.reference,
      status: b.status,
      date: b.date,
      start_time: b.start_time,
      end_time: b.end_time,
      total_price: b.total_price,
      field: field ? { id: field.id, name: field.name, cover_image_url: field.cover_image_url, city: field.city, area: field.area } : null
    };
  });

  return res.json({ data, meta: { page, limit, total } });
});

v1.get('/bookings/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const booking = db.bookings.find((b) => b.id === req.params.id && b.user_id === req.auth.userId);
  if (!booking) return errorResponse(res, 404, 'Not found');
  const field = db.fields.find((f) => f.id === booking.field_id) || null;
  return res.json({
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    date: booking.date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    total_price: booking.total_price,
    payment_method: booking.payment_method,
    created_at: booking.created_at,
    field: field
      ? {
          id: field.id,
          name: field.name,
          address: field.address,
          city: field.city,
          area: field.area,
          cover_image_url: field.cover_image_url
        }
      : null
  });
});

v1.delete('/bookings/:id', requireAuth, async (req, res) => {
  const updated = await updateDb((db) => {
    const booking = db.bookings.find((b) => b.id === req.params.id && b.user_id === req.auth.userId);
    if (!booking) return { ok: false, status: 404 };
    booking.status = 'cancelled';
    return { ok: true };
  });
  if (!updated.ok) return errorResponse(res, updated.status, 'Not found');
  return res.json({ success: true });
});

v1.post('/bookings/:id/review', requireAuth, async (req, res) => {
  const rating = req.body?.rating;
  const comment = req.body?.comment ?? null;
  const errors = {};
  const ratingNum = Number(rating);
  if (!Number.isFinite(ratingNum)) errors.rating = 'required';
  if (Number.isFinite(ratingNum) && (ratingNum < 1 || ratingNum > 5)) errors.rating = 'invalid';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const result = await updateDb((db) => {
    const booking = db.bookings.find((b) => b.id === req.params.id && b.user_id === req.auth.userId);
    if (!booking) return { ok: false, status: 404 };

    const exists = db.reviews.find((r) => r.booking_id === booking.id);
    if (exists) return { ok: false, status: 409, message: 'Review already submitted' };

    const review = {
      id: generateId('review'),
      booking_id: booking.id,
      field_id: booking.field_id,
      user_id: booking.user_id,
      rating: ratingNum,
      comment: validateRequiredString(comment) ? String(comment).trim() : null,
      created_at: nowIso()
    };
    db.reviews.push(review);
    return { ok: true, review };
  });

  if (!result.ok) return errorResponse(res, result.status, result.message || 'Not found');
  return res.json({ success: true, review: result.review });
});

v1.get('/payments/methods', (_req, res) => {
  return res.json({
    data: [
      { method: 'card', enabled: true },
      { method: 'vodafone_cash', enabled: true },
      { method: 'fawry', enabled: true },
      { method: 'instapay', enabled: true },
      { method: 'cash', enabled: true }
    ]
  });
});

v1.post('/payments/initiate', requireAuth, async (req, res) => {
  const booking_id = req.body?.booking_id;
  const method = req.body?.method;
  const card_token = req.body?.card_token ?? null;
  const errors = {};
  if (!validateRequiredString(booking_id)) errors.booking_id = 'required';
  if (!validateRequiredString(method)) errors.method = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const result = await updateDb((db) => {
    const booking = db.bookings.find((b) => b.id === booking_id && b.user_id === req.auth.userId);
    if (!booking) return { ok: false, status: 404 };
    const payment = {
      id: generateId('payment'),
      booking_id: booking.id,
      user_id: booking.user_id,
      method: String(method),
      card_token: validateRequiredString(card_token) ? String(card_token) : null,
      status: 'pending',
      transaction_id: null,
      created_at: nowIso()
    };
    db.payments.push(payment);
    return { ok: true, payment };
  });

  if (!result.ok) return errorResponse(res, result.status, 'Not found');
  return res.json({ payment_id: result.payment.id, status: result.payment.status });
});

v1.post('/payments/verify', requireAuth, async (req, res) => {
  const payment_id = req.body?.payment_id;
  const transaction_id = req.body?.transaction_id;
  const errors = {};
  if (!validateRequiredString(payment_id)) errors.payment_id = 'required';
  if (!validateRequiredString(transaction_id)) errors.transaction_id = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const result = await updateDb((db) => {
    const payment = db.payments.find((p) => p.id === payment_id && p.user_id === req.auth.userId);
    if (!payment) return { ok: false, status: 404 };
    payment.status = 'paid';
    payment.transaction_id = String(transaction_id);
    return { ok: true, payment };
  });

  if (!result.ok) return errorResponse(res, result.status, 'Not found');
  return res.json({ success: true, status: result.payment.status });
});

v1.get('/profile', requireAuth, async (req, res) => {
  const user = await getCurrentUser(req);
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
});

v1.put('/profile', requireAuth, async (req, res) => {
  const first_name = req.body?.first_name;
  const last_name = req.body?.last_name;
  const email = req.body?.email ?? null;
  const errors = {};
  if (first_name !== undefined && first_name !== null && !validateRequiredString(first_name)) errors.first_name = 'invalid';
  if (last_name !== undefined && last_name !== null && !validateRequiredString(last_name)) errors.last_name = 'invalid';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const user = await updateDb((db) => {
    const u = db.users.find((x) => x.id === req.auth.userId);
    if (!u) return null;
    if (first_name !== undefined) u.first_name = validateRequiredString(first_name) ? String(first_name).trim() : u.first_name;
    if (last_name !== undefined) u.last_name = validateRequiredString(last_name) ? String(last_name).trim() : u.last_name;
    if (email !== undefined) u.email = validateRequiredString(email) ? String(email).trim() : null;
    return u;
  });
  if (!user) return errorResponse(res, 401, 'Unauthorized');
  return res.json({ success: true });
});

v1.put('/profile/avatar', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return errorResponse(res, 400, 'Validation error', { file: 'required' });
  const url = `/uploads/${req.file.filename}`;
  const user = await updateDb((db) => {
    const u = db.users.find((x) => x.id === req.auth.userId);
    if (!u) return null;
    u.avatar_url = url;
    return u;
  });
  if (!user) return errorResponse(res, 401, 'Unauthorized');
  return res.json({ avatar_url: url });
});

v1.get('/profile/notifications', requireAuth, async (req, res) => {
  const db = await getDb();
  const { page, limit, offset } = safePagination(req.query);
  const all = db.notifications
    .filter((n) => n.user_id === req.auth.userId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const total = all.length;
  const data = all.slice(offset, offset + limit);
  return res.json({ data, meta: { page, limit, total } });
});

v1.put('/profile/notifications/read-all', requireAuth, async (req, res) => {
  await updateDb((db) => {
    for (const n of db.notifications) {
      if (n.user_id === req.auth.userId && !n.read_at) n.read_at = nowIso();
    }
  });
  return res.json({ success: true });
});

v1.put('/profile/fcm-token', requireAuth, async (req, res) => {
  const token = req.body?.token;
  if (!validateRequiredString(token)) return errorResponse(res, 400, 'Validation error', { token: 'required' });
  const user = await updateDb((db) => {
    const u = db.users.find((x) => x.id === req.auth.userId);
    if (!u) return null;
    u.fcm_token = String(token);
    return u;
  });
  if (!user) return errorResponse(res, 401, 'Unauthorized');
  return res.json({ success: true });
});

v1.post('/owner/fields', requireAuth, requireRole('owner'), async (req, res) => {
  const { name, phone, city, address, lat, lng } = req.body || {};
  const errors = {};
  if (!validateRequiredString(name)) errors.name = 'required';
  if (!validateRequiredString(phone)) errors.phone = 'required';
  if (!validateRequiredString(city)) errors.city = 'required';
  if (!validateRequiredString(address)) errors.address = 'required';
  if (!Number.isFinite(Number(lat))) errors.lat = 'required';
  if (!Number.isFinite(Number(lng))) errors.lng = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const field = await updateDb((db) => {
    const f = {
      id: generateId('field'),
      owner_id: req.auth.userId,
      status: 'pending',
      name: String(name).trim(),
      phone: String(phone).trim(),
      city: String(city).trim(),
      area: null,
      address: String(address).trim(),
      lat: Number(lat),
      lng: Number(lng),
      sport: null,
      surface: null,
      size: null,
      price_per_hour: 0,
      peak_price_per_hour: 0,
      amenities: [],
      is_covered: false,
      cover_image_url: null,
      photos: [],
      schedule: [],
      created_at: nowIso()
    };
    db.fields.push(f);
    return f;
  });

  return res.json({ id: field.id, status: field.status });
});

v1.put('/owner/fields/:id', requireAuth, requireRole('owner'), async (req, res) => {
  const updated = await updateDb((db) => {
    const field = db.fields.find((f) => f.id === req.params.id && f.owner_id === req.auth.userId);
    if (!field) return { ok: false, status: 404 };
    const allowed = ['name', 'phone', 'city', 'area', 'address', 'lat', 'lng', 'is_covered', 'cover_image_url'];
    for (const k of allowed) {
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, k)) field[k] = req.body[k];
    }
    return { ok: true };
  });
  if (!updated.ok) return errorResponse(res, updated.status, 'Not found');
  return res.json({ success: true });
});

v1.put('/owner/fields/:id/specs', requireAuth, requireRole('owner'), async (req, res) => {
  const { sport, surface, size, amenities } = req.body || {};
  const updated = await updateDb((db) => {
    const field = db.fields.find((f) => f.id === req.params.id && f.owner_id === req.auth.userId);
    if (!field) return { ok: false, status: 404 };
    if (sport !== undefined) field.sport = sport;
    if (surface !== undefined) field.surface = surface;
    if (size !== undefined) field.size = size;
    if (amenities !== undefined) field.amenities = Array.isArray(amenities) ? amenities : [];
    return { ok: true };
  });
  if (!updated.ok) return errorResponse(res, updated.status, 'Not found');
  return res.json({ success: true });
});

v1.put('/owner/fields/:id/pricing', requireAuth, requireRole('owner'), async (req, res) => {
  const { price_per_hour, peak_price_per_hour } = req.body || {};
  const errors = {};
  if (price_per_hour === undefined) errors.price_per_hour = 'required';
  if (peak_price_per_hour === undefined) errors.peak_price_per_hour = 'required';
  if (Object.keys(errors).length) return errorResponse(res, 400, 'Validation error', errors);

  const updated = await updateDb((db) => {
    const field = db.fields.find((f) => f.id === req.params.id && f.owner_id === req.auth.userId);
    if (!field) return { ok: false, status: 404 };
    field.price_per_hour = Number(price_per_hour);
    field.peak_price_per_hour = Number(peak_price_per_hour);
    return { ok: true };
  });
  if (!updated.ok) return errorResponse(res, updated.status, 'Not found');
  return res.json({ success: true });
});

v1.put('/owner/fields/:id/schedule', requireAuth, requireRole('owner'), async (req, res) => {
  const days = req.body?.days;
  if (!Array.isArray(days)) return errorResponse(res, 400, 'Validation error', { days: 'required' });

  const updated = await updateDb((db) => {
    const field = db.fields.find((f) => f.id === req.params.id && f.owner_id === req.auth.userId);
    if (!field) return { ok: false, status: 404 };
    field.schedule = days;
    if (field.status === 'pending') field.status = 'active';
    return { ok: true };
  });
  if (!updated.ok) return errorResponse(res, updated.status, 'Not found');
  return res.json({ success: true });
});

v1.put('/owner/fields/:id/photos', requireAuth, requireRole('owner'), upload.array('files', 10), async (req, res) => {
  const files = req.files || [];
  if (!Array.isArray(files) || files.length === 0) return errorResponse(res, 400, 'Validation error', { files: 'required' });

  const result = await updateDb((db) => {
    const field = db.fields.find((f) => f.id === req.params.id && f.owner_id === req.auth.userId);
    if (!field) return { ok: false, status: 404 };
    field.photos = Array.isArray(field.photos) ? field.photos : [];
    const added = files.map((f) => ({ id: generateId('photo'), url: `/uploads/${f.filename}` }));
    field.photos.push(...added);
    if (!field.cover_image_url && added[0]) field.cover_image_url = added[0].url;
    return { ok: true, added };
  });

  if (!result.ok) return errorResponse(res, result.status, 'Not found');
  return res.json({ success: true, photos: result.added });
});

v1.delete('/owner/fields/:id/photos/:photoId', requireAuth, requireRole('owner'), async (req, res) => {
  const updated = await updateDb((db) => {
    const field = db.fields.find((f) => f.id === req.params.id && f.owner_id === req.auth.userId);
    if (!field) return { ok: false, status: 404 };
    field.photos = (field.photos || []).filter((p) => p.id !== req.params.photoId);
    return { ok: true };
  });
  if (!updated.ok) return errorResponse(res, updated.status, 'Not found');
  return res.json({ success: true });
});

v1.get('/owner/fields/:id', requireAuth, requireRole('owner'), async (req, res) => {
  const db = await getDb();
  const field = db.fields.find((f) => f.id === req.params.id && f.owner_id === req.auth.userId);
  if (!field) return errorResponse(res, 404, 'Not found');
  return res.json(field);
});

v1.get('/owner/bookings', requireAuth, requireRole('owner'), async (req, res) => {
  const db = await getDb();
  const status = validateRequiredString(req.query.status) ? String(req.query.status).toLowerCase() : null;
  const date = validateRequiredString(req.query.date) ? String(req.query.date) : null;
  const { page, limit, offset } = safePagination(req.query);

  const ownerFieldIds = new Set(db.fields.filter((f) => f.owner_id === req.auth.userId).map((f) => f.id));
  let items = db.bookings.filter((b) => ownerFieldIds.has(b.field_id));
  if (date) items = items.filter((b) => b.date === date);
  if (status && ['upcoming', 'past', 'cancelled'].includes(status)) {
    if (status === 'cancelled') items = items.filter((b) => b.status === 'cancelled');
    if (status === 'upcoming') items = items.filter((b) => b.status !== 'cancelled' && b.date >= new Date().toISOString().slice(0, 10));
    if (status === 'past') items = items.filter((b) => b.status !== 'cancelled' && b.date < new Date().toISOString().slice(0, 10));
  }
  items = items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const total = items.length;
  const slice = items.slice(offset, offset + limit);
  const data = slice.map((b) => {
    const field = db.fields.find((f) => f.id === b.field_id) || null;
    const user = db.users.find((u) => u.id === b.user_id) || null;
    return {
      id: b.id,
      reference: b.reference,
      status: b.status,
      date: b.date,
      start_time: b.start_time,
      end_time: b.end_time,
      total_price: b.total_price,
      field: field ? { id: field.id, name: field.name } : null,
      player: user
        ? { id: user.id, first_name: user.first_name, last_name: user.last_name, phone: user.phone, avatar_url: user.avatar_url }
        : null
    };
  });
  return res.json({ data, meta: { page, limit, total } });
});

v1.get('/owner/bookings/:id', requireAuth, requireRole('owner'), async (req, res) => {
  const db = await getDb();
  const ownerFieldIds = new Set(db.fields.filter((f) => f.owner_id === req.auth.userId).map((f) => f.id));
  const booking = db.bookings.find((b) => b.id === req.params.id && ownerFieldIds.has(b.field_id));
  if (!booking) return errorResponse(res, 404, 'Not found');
  const field = db.fields.find((f) => f.id === booking.field_id) || null;
  const user = db.users.find((u) => u.id === booking.user_id) || null;
  return res.json({
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    date: booking.date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    total_price: booking.total_price,
    created_at: booking.created_at,
    attended_at: booking.attended_at,
    field: field ? { id: field.id, name: field.name } : null,
    player: user ? { id: user.id, first_name: user.first_name, last_name: user.last_name, phone: user.phone } : null
  });
});

v1.put('/owner/bookings/:id/confirm', requireAuth, requireRole('owner'), async (req, res) => {
  const result = await updateDb((db) => {
    const ownerFieldIds = new Set(db.fields.filter((f) => f.owner_id === req.auth.userId).map((f) => f.id));
    const booking = db.bookings.find((b) => b.id === req.params.id && ownerFieldIds.has(b.field_id));
    if (!booking) return { ok: false, status: 404 };
    booking.attended_at = nowIso();
    return { ok: true, booking };
  });
  if (!result.ok) return errorResponse(res, result.status, 'Not found');
  return res.json({ success: true, attended_at: result.booking.attended_at });
});

v1.delete('/owner/bookings/:id', requireAuth, requireRole('owner'), async (req, res) => {
  const result = await updateDb((db) => {
    const ownerFieldIds = new Set(db.fields.filter((f) => f.owner_id === req.auth.userId).map((f) => f.id));
    const booking = db.bookings.find((b) => b.id === req.params.id && ownerFieldIds.has(b.field_id));
    if (!booking) return { ok: false, status: 404 };
    booking.status = 'cancelled';
    return { ok: true };
  });
  if (!result.ok) return errorResponse(res, result.status, 'Not found');
  return res.json({ success: true });
});

v1.get('/owner/stats', requireAuth, requireRole('owner'), async (req, res) => {
  const db = await getDb();
  const period = validateRequiredString(req.query.period) ? String(req.query.period) : 'today';
  const ownerFieldIds = new Set(db.fields.filter((f) => f.owner_id === req.auth.userId).map((f) => f.id));

  const todayStr = new Date().toISOString().slice(0, 10);
  let fromStr = todayStr;
  if (period === 'week') {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 7);
    fromStr = d.toISOString().slice(0, 10);
  } else if (period === 'month') {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    fromStr = d.toISOString().slice(0, 10);
  }

  const bookings = db.bookings.filter(
    (b) => ownerFieldIds.has(b.field_id) && b.status !== 'cancelled' && b.date >= fromStr && b.date <= todayStr
  );

  const total_bookings = bookings.length;
  const total_revenue = bookings.reduce((s, b) => s + Number(b.total_price || 0), 0);
  const { rating, review_count } = (() => {
    const reviews = db.reviews.filter((r) => ownerFieldIds.has(r.field_id));
    const count = reviews.length;
    const avg = count === 0 ? 0 : reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / count;
    return { rating: Number(avg.toFixed(1)), review_count: count };
  })();

  const occupancy_rate = total_bookings === 0 ? 0 : Math.min(1, total_bookings / (7 * 16));

  return res.json({
    period,
    total_bookings,
    total_revenue,
    occupancy_rate: Number(occupancy_rate.toFixed(2)),
    average_rating: rating,
    review_count,
    delta: { bookings_pct: 0, revenue_pct: 0 }
  });
});

v1.get('/owner/stats/revenue', requireAuth, requireRole('owner'), async (req, res) => {
  const db = await getDb();
  const from = validateRequiredString(req.query.from) ? String(req.query.from) : null;
  const to = validateRequiredString(req.query.to) ? String(req.query.to) : null;
  const group_by = validateRequiredString(req.query.group_by) ? String(req.query.group_by) : 'day';
  const ownerFieldIds = new Set(db.fields.filter((f) => f.owner_id === req.auth.userId).map((f) => f.id));

  const fromStr = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toStr = to || new Date().toISOString().slice(0, 10);
  const bookings = db.bookings.filter((b) => ownerFieldIds.has(b.field_id) && b.status !== 'cancelled' && b.date >= fromStr && b.date <= toStr);

  const buckets = {};
  for (const b of bookings) {
    const key = group_by === 'week' ? `${b.date.slice(0, 4)}-W${Math.ceil(Number(b.date.slice(5, 7)) / 3)}` : b.date;
    buckets[key] = (buckets[key] || 0) + Number(b.total_price || 0);
  }

  const data = Object.keys(buckets)
    .sort()
    .map((k) => ({ key: k, revenue: buckets[k] }));

  return res.json({ from: fromStr, to: toStr, group_by, data });
});

v1.get('/owner/notifications', requireAuth, requireRole('owner'), async (req, res) => {
  const db = await getDb();
  const { page, limit, offset } = safePagination(req.query);
  const all = db.notifications
    .filter((n) => n.user_id === req.auth.userId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const total = all.length;
  const data = all.slice(offset, offset + limit);
  return res.json({ data, meta: { page, limit, total } });
});

v1.put('/owner/notifications/read-all', requireAuth, requireRole('owner'), async (req, res) => {
  await updateDb((db) => {
    for (const n of db.notifications) {
      if (n.user_id === req.auth.userId && !n.read_at) n.read_at = nowIso();
    }
  });
  return res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Mla3ebna backend listening on http://localhost:${PORT}`);
});
