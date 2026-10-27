import { reportError } from '../services/errorReports.js';
import { shortRef } from './requestLog.js';

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
  // The request id ties this error to its request line in the log, and to the ref the visitor sees.
  if (status >= 500) {
    console.error(`[error] request ${req.id || '-'}`, err);
    reportError(err, { requestId: req.id, tenant: req.tenant?.slug, path: req.originalUrl?.split('?')[0] });
  }
  const ref = req.id ? shortRef(req.id) : undefined;
  if (status >= 500 && ref) body.ref = ref;
  // Customers never see database text. A full connection pool is "busy, try again"; any other
  // unexpected failure is a plain message. The real error stays in the server log above.
  if (status >= 500 && !err.status) {
    const message = String(err.message || '');
    if (/EMAXCONN|max clients reached/i.test(message)) {
      res.set('Retry-After', '2');
      return res.status(503).json({ error: 'We are busy for a moment. Please try again in a few seconds.', ref });
    }
    // Anything else unexpected (a programming error, a library failure) is not the visitor's business either.
    return res.status(500).json({ error: 'Something went wrong. Please try again.', ref });
  }
  res.status(status).json(body);
};

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
