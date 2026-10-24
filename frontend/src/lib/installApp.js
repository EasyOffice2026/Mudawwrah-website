/**
 * Installing the website as an app. Chrome, Edge and Android offer a button (the browser fires `beforeinstallprompt`);
 * iPhone has no button and needs "Share, then Add to Home Screen", so those visitors get that instruction instead.
 */

/** True when this page is already running as an installed app (no browser bars). */
export const isInstalled = (win = window) =>
  Boolean(win.matchMedia?.('(display-mode: standalone)').matches || win.navigator?.standalone === true);

/** True for Safari on iPhone and iPad, where the only way to install is the Share menu. Chrome and others on iPhone cannot. */
export const needsShareHint = (userAgent = '', maxTouchPoints = 0) => {
  const iPhoneOrPad = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const safari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(userAgent);
  return iPhoneOrPad && safari;
};
