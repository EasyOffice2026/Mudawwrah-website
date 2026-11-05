/**
 * Printing on a Sunmi handheld's built-in printer, when the print station runs inside our Android app
 * (printer-app/ in this repository), which hands the page `window.SunmiPrinter`.
 *
 * Chrome on Android always shows its print preview, so a station there can never print by itself. In the app,
 * the ticket is drawn as a picture exactly as it looks on paper and sent straight to the printer: no preview, no
 * pop-up. The app answers each picture with window.__sunmiPrinted(job, ok, message).
 */

// The printable width of a 58 mm roll, which the ticket is laid out at; the app scales it to the print head.
const TICKET_WIDTH = '48mm';
// The print head of a 58 mm Sunmi printer, in dots.
const PAPER_DOTS = 384;
// A printer that never answers (the app closed mid-print) counts as a failure, tried again later.
const ANSWER_WITHIN_MS = 30_000;

export const hasSunmi = () => typeof window !== 'undefined' && Boolean(window.SunmiPrinter);

/** "ready", "connecting", "no-printer", "out-of-paper", "cover-open", "overheated" or "error". */
export const sunmiStatus = () => {
  try {
    return window.SunmiPrinter.status();
  } catch {
    return 'error';
  }
};

const waiting = new Map();
if (typeof window !== 'undefined') {
  window.__sunmiPrinted = (job, ok, message) => {
    waiting.get(job)?.(ok, message);
  };
}

/** The ticket on screen (it is hidden until printed), as a PNG as wide as the print head. */
const drawTicket = async (node) => {
  const { toPng } = await import('html-to-image');
  const before = node.getAttribute('style');
  node.style.cssText = `display:block;position:fixed;left:-10000px;top:0;width:${TICKET_WIDTH};background:#fff;`;
  try {
    return await toPng(node, {
      pixelRatio: PAPER_DOTS / node.offsetWidth,
      backgroundColor: '#ffffff',
      // Off the screen on the page, but at the picture's own top left.
      style: { position: 'static', left: 'auto', top: 'auto' },
      // The website's fonts are not readable inside the picture; the device's own (Roboto, with Arabic) is used.
      skipFonts: true,
    });
  } finally {
    if (before === null) node.removeAttribute('style');
    else node.setAttribute('style', before);
  }
};

/** Prints the ticket shown in `node`; resolves when the printer says it printed, rejects with the reason if not. */
export const printOnSunmi = async (node, jobId) => {
  const picture = await drawTicket(node);
  const job = `${jobId}-${Date.now()}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(job);
      reject(new Error('no answer from the printer'));
    }, ANSWER_WITHIN_MS);
    waiting.set(job, (ok, message) => {
      clearTimeout(timer);
      waiting.delete(job);
      if (ok) resolve();
      else reject(new Error(message || 'printer error'));
    });
    window.SunmiPrinter.print(job, picture);
  });
};

/** Back to the Printing page in the app, to choose another branch's station. */
export const forgetSunmiStation = () => window.SunmiPrinter?.forgetStation();
