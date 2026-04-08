function errorCodeFor(status: number, hasDetails: boolean, message: string) {
  if (hasDetails) return 'VALIDATION_ERROR';
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) {
    if (/slot/i.test(String(message || ''))) return 'SLOT_ALREADY_BOOKED';
    return 'CONFLICT';
  }
  if (status === 422) return 'VALIDATION_ERROR';
  if (status >= 500) return 'INTERNAL_ERROR';
  return 'ERROR';
}

function errorResponse(res: any, status: number, message: string, details?: any) {
  const hasDetails = Boolean(details && Object.keys(details).length > 0);
  const error = errorCodeFor(status, hasDetails, message);
  const body: any = { statusCode: status, error, message };
  if (hasDetails) body.details = details;
  return res.status(status).json(body);
}

module.exports = { errorResponse };

export {};
