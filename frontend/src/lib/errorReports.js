/**
 * Crash reports from the browser: a page that breaks for a customer or a branch is sent to Sentry, which emails
 * us, instead of waiting for someone to send a screenshot.
 *
 * Off unless VITE_SENTRY_DSN is set when the website is built (a DSN is public by design: it can only send
 * reports). Staff pages only (the admin, the print station, the platform console): the library is large, and a
 * customer's failed checkout already reaches Sentry from the server. Loaded after the page, so it never slows
 * anything down. No personal data: no IP addresses, no form contents, no session replays.
 */
import { BUILD } from './version.js';

export const startErrorReports = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || !import.meta.env.PROD) return;
  if (!/[/](admin|print|platform)([/]|$)/.test(window.location.pathname)) return;
  const start = () =>
    import('@sentry/react')
      .then((Sentry) =>
        Sentry.init({
          dsn,
          release: BUILD.commit,
          environment: 'production',
          sendDefaultPii: false,
          tracesSampleRate: 0,
          // Browser extensions and the like, not ours.
          denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
        }),
      )
      .catch(() => {});
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
};
