import { useEffect, useState } from 'react';
import { localized } from '../../lib/format';

/**
 * Brand reveal shown once when a storefront is opened.
 *
 * The client asked for "brands logo animation ... and then move to website",
 * so this paints the restaurant's own palette full-bleed, animates its mark and
 * wordmark in, then dissolves into the menu. It is deliberately short (about
 * 1.6s) and only plays once per restaurant per browser session — a returning
 * customer tapping between categories should never sit through it twice.
 */
const SESSION_KEY = (slug) => `mdawra_splash_${slug || 'platform'}`;

export const splashAlreadyPlayed = (slug) => {
  try {
    return sessionStorage.getItem(SESSION_KEY(slug)) === '1';
  } catch {
    // Private windows can throw on access; never let that block the menu.
    return false;
  }
};

const markPlayed = (slug) => {
  try {
    sessionStorage.setItem(SESSION_KEY(slug), '1');
  } catch {
    /* storage unavailable — the splash simply plays again next time */
  }
};

export default function SplashScreen({ tenant, slug, lang, onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const hold = reduced ? 260 : 1450;
    const exit = reduced ? 0 : 420;

    const toExit = setTimeout(() => setLeaving(true), hold);
    const toDone = setTimeout(() => {
      markPlayed(slug);
      onDone();
    }, hold + exit);
    return () => {
      clearTimeout(toExit);
      clearTimeout(toDone);
    };
  }, [slug, onDone]);

  const name = localized(tenant, 'name', lang) || '';
  const tagline = localized(tenant, 'tagline', lang);
  // Two-letter monogram stands in until a restaurant uploads a logo.
  const monogram = name.trim().slice(0, 2).toUpperCase();

  return (
    <div
      role="presentation"
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-brand ${
        leaving ? 'animate-splash-out' : ''
      }`}
    >
      {/* Expanding ring behind the mark, in the restaurant's accent. */}
      <span className="pointer-events-none absolute h-56 w-56 rounded-full border-2 border-white/30 animate-splash-ring" />

      <div className="relative animate-splash-mark">
        <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-[28px] bg-white shadow-lift">
          {tenant?.logoUrl ? (
            <img src={tenant.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-4xl font-extrabold tracking-tight text-brand">{monogram}</span>
          )}
          {/* Light sweep across the mark, the way a metallic logo catches light. */}
          <span className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent animate-splash-sweep" />
        </div>
      </div>

      <div className="animate-splash-word mt-7 px-8 text-center">
        <p className="text-2xl font-extrabold tracking-[0.08em] text-white">{name}</p>
        {tagline ? <p className="mt-2 text-sm text-white/75">{tagline}</p> : null}
      </div>
    </div>
  );
}
