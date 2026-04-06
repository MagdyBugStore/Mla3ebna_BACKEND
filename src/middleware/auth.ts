const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { errorResponse } = require('../utils/http');

function requireAuth(req: any, res: any, next: any) {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(header);
  if (!m) return errorResponse(res, 401, 'Unauthorized');
  try {
    const payload = jwt.verify(m[1], env.jwtSecret);
    req.auth = { userId: payload.sub, role: payload.role };
    return next();
  } catch (_e) {
    return errorResponse(res, 401, 'Unauthorized');
  }
}

function requireRole(role: string) {
  return (req: any, res: any, next: any) => {
    if (!req.auth) return errorResponse(res, 401, 'Unauthorized');
    if (req.auth.role !== role) return errorResponse(res, 403, 'Forbidden');
    return next();
  };
}

function optionalAuth(req: any, _res: any, next: any) {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(header);
  if (!m) return next();
  try {
    const payload = jwt.verify(m[1], env.jwtSecret);
    req.auth = { userId: payload.sub, role: payload.role };
  } catch (_e) {
    req.auth = null;
  }
  return next();
}

module.exports = { requireAuth, requireRole, optionalAuth };

export {};
