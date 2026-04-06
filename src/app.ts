const cors = require('cors');
const express = require('express');
const { env } = require('./config/env');
const { buildV1Router } = require('./routes/v1');
const { uploadsDir } = require('./config/upload');

function createApp() {
  const app = express();
  app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin }));
  app.use(express.json({ limit: '2mb' }));
  app.use('/uploads', express.static(uploadsDir));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/v1', buildV1Router());

  return app;
}

module.exports = { createApp };

export {};
