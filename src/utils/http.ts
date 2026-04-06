function errorResponse(res: any, status: number, message: string, errors?: any) {
  if (errors && Object.keys(errors).length > 0) {
    return res.status(status).json({ message, errors });
  }
  return res.status(status).json({ message });
}

module.exports = { errorResponse };

export {};
