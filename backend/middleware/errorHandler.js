class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function notFound(req, res) {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
}

function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(err.details ? { details: err.details } : {}),
  });
}

module.exports = { HttpError, notFound, errorHandler };
