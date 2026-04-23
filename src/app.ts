const cors = require('cors');
const express = require('express');
const { env } = require('./config/env');
const { buildV1Router } = require('./routes/v1');
const { uploadsDir } = require('./config/upload');
const path = require('path');

function safeSerialize(value) {
  const maxString = 200;
  const maxKeys = 40;
  const maxArray = 20;
  const maxDepth = 4;
  const redactedKey = /token|authorization|password|secret|card|otp/i;

  function walk(v, depth) {
    if (v === null || v === undefined) return v;
    if (typeof v === 'string') return v.length > maxString ? `${v.slice(0, maxString)}…` : v;
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) {
      if (depth >= maxDepth) return `[Array(${v.length})]`;
      return v.slice(0, maxArray).map((x) => walk(x, depth + 1));
    }
    if (typeof v === 'object') {
      if (depth >= maxDepth) return '[Object]';
      const out = {};
      const keys = Object.keys(v).slice(0, maxKeys);
      for (const k of keys) {
        if (redactedKey.test(k)) out[k] = '[REDACTED]';
        else out[k] = walk(v[k], depth + 1);
      }
      return out;
    }
    return String(v);
  }

  return walk(value, 0);
}

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const reqId = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  res.setHeader('x-request-id', reqId);
  let responseBody: any = undefined;

  const origJson = res.json.bind(res);
  res.json = (body) => {
    responseBody = body;
    return origJson(body);
  };
  const origSend = res.send.bind(res);
  res.send = (body) => {
    responseBody = body;
    return origSend(body);
  };

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    const auth = req.auth || null;
    const base = {
      reqId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Math.round(durationMs * 10) / 10,
      user_id: auth?.userId || null,
      role: auth?.role || null
    };

    const extras: any = {
      ip: req.ip || null,
      ua: req.headers['user-agent'] || null,
      query: safeSerialize(req.query || {})
    };
    if (env.logRequestBody && req.body !== undefined) {
      extras.body = safeSerialize(req.body);
    }
    if (env.logResponseBody && responseBody !== undefined) {
      extras.response = safeSerialize(responseBody);
    }

    console.log(JSON.stringify({ ...base, ...extras }));
    // src/app.ts - داخل دالة requestLogger، بعد سطر 82
    if (env.logRequestBody && req.body !== undefined) {
      extras.body = safeSerialize(req.body);
      console.log(`[BODY] ${JSON.stringify(safeSerialize(req.body))}`); // ← طباعة إضافية
    }
  });

  return next();
}

function createApp() {
  const app = express();

  // 1. الـ Parsers لازم تكون في الأول عشان الـ Log يشوف البيانات
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true })); // مهم لو بتبعت بيانات من Form
  app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin }));

  // 2. تعريف الـ Static Files (تأكد أن uploadsDir مساره صحيح ومطلق)
  // الحل الأضمن للمسار:
  const finalUploadsDir = uploadsDir || path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(finalUploadsDir));

  // 3. الـ Logging Middleware
  if (env.logRequests) {
    app.use(requestLogger);
  }

  // الـ Custom Log بتاعك (بعد الـ json parser عشان الـ Body يظهر)
  app.use((req, res, next) => {
    if (env.logRequests) {
      console.log(`\n📨 [${req.method}] ${req.originalUrl}`);
      if (req.body && Object.keys(req.body).length > 0) {
         console.log(`📦 Body:`, safeSerialize(req.body));
      }
    }
    next();
  });

  // 4. الـ Routes
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/v1', buildV1Router());

  return app;
}

module.exports = { createApp };

export { };
