import mdawra from './pages/mdawra.js';

/** The URL piece after /r/<restaurant>/ for each page, and the order they are listed in. */
export const PAGE_PATH = { about: '/about', terms: '/terms', refund: '/refund-policy' };
export const PAGE_ORDER = ['about', 'terms', 'refund'];

/**
 * One entry per restaurant, keyed by its slug.
 *
 * A restaurant with no entry shows no links and these URLs say "not available".
 * That is deliberate: the pages are a restaurant's own legal text, so a
 * restaurant that hasn't supplied any must never show another one's.
 *
 * To add one: create ./pages/<slug>.js shaped like mdawra.js and list it here.
 */
const BY_RESTAURANT = { mdawra };

export const legalFor = (slug) => BY_RESTAURANT[String(slug || '').toLowerCase()] || null;

/** A page in the language asked for, else the other one, else null. */
export const pageIn = (legal, page, lang) => {
  const content = legal?.[page];
  return content ? content[lang] || content.en || content.ar || null : null;
};
