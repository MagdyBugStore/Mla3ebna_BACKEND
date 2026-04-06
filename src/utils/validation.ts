function validateRequiredString(value: any) {
  if (typeof value !== 'string') return false;
  return value.trim().length > 0;
}

function toNumber(v: any) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safePagination(query: any) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  return { page, limit, offset: (page - 1) * limit };
}

module.exports = { validateRequiredString, toNumber, safePagination };

export {};
