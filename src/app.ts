const cors = require('cors');
const express = require('express');
const { env } = require('./config/env');
const { buildV1Router } = require('./routes/v1');
const { uploadsDir } = require('./config/upload');
const path = require('path');


const RESET = '\x1b[0m';
const DIM   = '\x1b[2m';
const BOLD  = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED   = '\x1b[31m';
const CYAN  = '\x1b[36m';
const GRAY  = '\x1b[90m';

function colorStatus(s: number) {
  if (s < 300) return `${GREEN}${s}${RESET}`;
  if (s < 400) return `${CYAN}${s}${RESET}`;
  if (s < 500) return `${YELLOW}${s}${RESET}`;
  return `${RED}${s}${RESET}`;
}

function colorMethod(m: string) {
  const c = m === 'GET' ? CYAN : m === 'POST' ? GREEN : m === 'PUT' ? YELLOW : m === 'DELETE' ? RED : RESET;
  return `${c}${BOLD}${m.padEnd(6)}${RESET}`;
}

function shortPath(url: string) {
  const [path, qs] = url.split('?');
  if (!qs) return path;
  const params = new URLSearchParams(qs);
  const keys = [...params.keys()];
  return keys.length ? `${path}  ${GRAY}?${keys.join('&')}${RESET}` : path;
}

function summarizeResponse(body: any): string {
  if (body === null || body === undefined) return 'null';
  if (typeof body !== 'object') return String(body).slice(0, 80);
  if (Array.isArray(body)) return `[${body.length} items]`;

  const parts: string[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v)) parts.push(`${k}:[${(v as any[]).length}]`);
    else if (v && typeof v === 'object') parts.push(`${k}:{${Object.keys(v).join(',').slice(0, 40)}}`);
    else if (typeof v === 'string') parts.push(`${k}:"${(v as string).slice(0, 30)}"`);
    else parts.push(`${k}:${v}`);
  }
  return `{${parts.join(', ')}}`;
}

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const reqId = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  res.setHeader('x-request-id', reqId);
  let responseBody: any = undefined;

  const origJson = res.json.bind(res);
  res.json = (body) => { responseBody = body; return origJson(body); };

  res.on('finish', () => {
    const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10;
    const auth = req.auth || null;
    const uid = auth?.userId ? `${DIM}uid:${String(auth.userId).slice(-8)}${RESET}` : `${GRAY}uid:-${RESET}`;
    const msStr = ms > 500 ? `${YELLOW}${ms}ms${RESET}` : `${DIM}${ms}ms${RESET}`;

    // Body keys summary (POST/PUT only, skip empty)
    const body = req.body;
    const bodyKeys = body && typeof body === 'object' ? Object.keys(body).filter((k) => body[k] !== undefined) : [];
    const bodyStr = bodyKeys.length ? `  ${GRAY}body:{${bodyKeys.join(',')}}${RESET}` : '';

    // Response summary
    let respStr = '';
    if (responseBody !== undefined) {
      if (res.statusCode >= 400) {
        const msg = typeof responseBody === 'object'
          ? responseBody.message || responseBody.error
          : String(responseBody).slice(0, 80);
        if (msg) respStr = `  ${RED}← ${msg}${RESET}`;
      } else {
        respStr = `  ${GRAY}← ${summarizeResponse(responseBody)}${RESET}`;
      }
    }

    console.log(
      `${colorMethod(req.method)} ${shortPath(req.originalUrl)}  ${colorStatus(res.statusCode)}  ${msStr}  ${uid}${bodyStr}${respStr}`
    );
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

  // 4. الـ Routes
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/v1', buildV1Router());

  return app;
}

module.exports = { createApp };

export { };
