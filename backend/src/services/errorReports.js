/**
 * Crash reports: unexpected server errors are sent to Sentry, which emails us, so a failure is seen when it
 * happens rather than when a client reports it.
 *
 * Off unless SENTRY_DSN is set (Render → Environment). Nothing about customers is sent: no request bodies, no
 * cookies, no addresses; only the error, the request id, the restaurant and the path. Loaded only when switched
 * on, so a server without it never loads the library.
 */
let ready = null;

export const startErrorReports = () => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || ready) return ready;
  ready = import('@sentry/node')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV || 'development',
        release: process.env.RENDER_GIT_COMMIT || undefined,
        sendDefaultPii: false,
        tracesSampleRate: 0,
      });
      console.log('[errors] crash reports are on');
      return Sentry;
    })
    .catch((error) => {
      console.error('[errors] crash reports could not start:', error.message);
      return null;
    });
  return ready;
};

/** Sends one error with what identifies its request. Never throws, never delays the response. */
export const reportError = (error, { requestId, tenant, path } = {}) => {
  const started = startErrorReports();
  if (!started) return;
  started
    .then((Sentry) =>
      Sentry?.withScope((scope) => {
        if (requestId) scope.setTag('request_id', requestId);
        if (tenant) scope.setTag('restaurant', tenant);
        if (path) scope.setTag('path', path);
        Sentry.captureException(error);
      }),
    )
    .catch(() => {});
};
