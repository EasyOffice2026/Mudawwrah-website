import crypto from 'crypto';

/**
 * One line of JSON per request, with an id that follows the request everywhere: the X-Request-Id response header,
 * the error log, and the short "ref" a visitor sees when something fails. When a client reports a problem, that
 * ref leads straight to the request and its error in Render's logs.
 *
 * The path is logged without its query string (a query can carry a secret), and nothing from the body is logged.
 */
const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

export const requestLog = ({ write = (line) => console.log(line) } = {}) => (req, res, next) => {
  const started = process.hrtime.bigint();
  // An id handed over by a proxy is kept when it looks like one; anything else gets a fresh id.
  const incoming = req.get('x-request-id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  res.on('finish', () => {
    write(
      JSON.stringify({
        at: new Date().toISOString(),
        id: req.id,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
        tenant: req.tenant?.slug || undefined,
        user: req.user?.sub || undefined,
      }),
    );
  });
  next();
};

/** The short form of a request id that a visitor can read out or send in a screenshot. */
export const shortRef = (id) => String(id || '').replace(/-/g, '').slice(0, 8);
