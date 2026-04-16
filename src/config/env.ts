function numberFromEnv(value: any, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const env = {
  port: numberFromEnv(process.env.PORT, 3000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mla3ebna',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret',
  accessTokenTtlSeconds: numberFromEnv(process.env.ACCESS_TOKEN_TTL_SECONDS, 60 * 60),
  refreshTokenTtlSeconds: numberFromEnv(process.env.REFRESH_TOKEN_TTL_SECONDS, 60 * 60 * 24 * 30),
  otpTtlSeconds: numberFromEnv(process.env.OTP_TTL_SECONDS, 5 * 60),
  googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  appleClientId: process.env.APPLE_CLIENT_ID || null,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  logRequests: String(process.env.LOG_REQUESTS ?? 'true').toLowerCase() === 'true',
  logRequestBody: String(process.env.LOG_REQUEST_BODY ?? 'true').toLowerCase() === 'true',  
  logResponseBody: String(process.env.LOG_RESPONSE_BODY ?? 'true').toLowerCase() === 'true' 
};

module.exports = { env };

export {};
