export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
};

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || (err.name === 'ZodError' ? 400 : 500);
  const body = { error: err.message || 'Internal server error' };
  if (err.name === 'ZodError') {
    body.error = 'Validation failed';
    body.details = err.issues;
  } else if (err.details) {
    body.details = err.details;
  }
  if (status >= 500) console.error(err);
  res.status(status).json(body);
};

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
