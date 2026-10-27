/**
 * Content-Security-Policy reports. The website sends its policy in report-only mode first (frontend/vercel.json):
 * nothing is blocked, but each browser reports what the policy would have blocked. Those reports land here, one
 * short log line each, so the policy can be switched to enforcing once the log shows only what should be blocked.
 *
 * Only the directive, the blocked host and the page's path are logged: never full addresses (they can carry
 * tokens) and never anything about the visitor.
 */
const hostOf = (value) => {
  try {
    return new URL(value).host || String(value);
  } catch {
    return String(value || '').slice(0, 40); // 'inline', 'eval', 'data' and the like
  }
};
const pathOf = (value) => {
  try {
    return new URL(value).pathname;
  } catch {
    return '';
  }
};

export const report = (req, res) => {
  // The older report-uri format sends one object; the Reporting API sends a list.
  const reports = Array.isArray(req.body) ? req.body.map((r) => r?.body || {}) : [req.body?.['csp-report'] || {}];
  for (const r of reports.slice(0, 10)) {
    const directive = r['effective-directive'] || r.effectiveDirective || r['violated-directive'] || '';
    const blocked = hostOf(r['blocked-uri'] || r.blockedURL || '');
    const page = pathOf(r['document-uri'] || r.documentURL || '');
    console.warn(JSON.stringify({ csp: String(directive).slice(0, 40), blocked: blocked.slice(0, 80), page: page.slice(0, 80) }));
  }
  res.status(204).end();
};
