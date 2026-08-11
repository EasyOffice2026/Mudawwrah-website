const DEFAULTS = {
  brandColor: '#B00020',
  brandDark: '#8A0019',
  brandLight: '#F6E4E7',
  accentColor: '#FF6B00',
};

/** Tailwind consumes these as `rgb(var(--brand) / <alpha-value>)`. */
const toRgbTriplet = (hex) => {
  const clean = String(hex || '').replace('#', '');
  if (clean.length !== 6) return null;
  const int = parseInt(clean, 16);
  if (Number.isNaN(int)) return null;
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
};

const VARS = {
  '--brand': 'brandColor',
  '--brand-dark': 'brandDark',
  '--brand-light': 'brandLight',
  '--accent': 'accentColor',
};

/**
 * Repaints the whole app in a restaurant's colours. Because every component
 * already uses the `brand`/`accent` Tailwind classes, nothing else changes.
 */
export const applyTheme = (tenant) => {
  const source = { ...DEFAULTS, ...(tenant || {}) };
  const root = document.documentElement;
  for (const [cssVar, field] of Object.entries(VARS)) {
    const triplet = toRgbTriplet(source[field]);
    if (triplet) root.style.setProperty(cssVar, triplet);
  }
  // Darker accent for hover states, derived rather than stored.
  const accent = toRgbTriplet(source.accentColor);
  if (accent) {
    const dimmed = accent
      .split(' ')
      .map((n) => Math.max(0, Math.round(Number(n) * 0.85)))
      .join(' ');
    root.style.setProperty('--accent-dark', dimmed);
  }
};

export const resetTheme = () => applyTheme(DEFAULTS);
