/**
 * Per-page title and share tags.
 *
 * The app is one HTML file serving every restaurant, so without this each
 * storefront inherited the same hardcoded tab title — Burger House's page
 * announced itself as Mdawra. These are set at runtime as the tenant loads.
 *
 * Worth knowing the limit: crawlers that do not run JavaScript — WhatsApp and
 * most chat apps among them — read only the static HTML the host serves, so
 * they will see the fallbacks in index.html rather than what is set here.
 * Search engines that render JS do pick these up. Proper link previews need
 * the tags injected server-side at deploy time; see docs/reference/README.md.
 */

const upsertMeta = (selector, attrs) => {
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement('meta');
    for (const [key, value] of Object.entries(attrs)) {
      if (key !== 'content') tag.setAttribute(key, value);
    }
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', attrs.content ?? '');
};

export const setPageMeta = ({ title, description, image, lang } = {}) => {
  if (title) document.title = title;
  if (lang) document.documentElement.setAttribute('lang', lang);

  if (description) {
    upsertMeta('meta[name="description"]', { name: 'description', content: description });
  }

  // Open Graph and Twitter, for the crawlers that do execute JS.
  if (title) {
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
  }
  if (description) {
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
  }
  if (image) {
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: image });
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
  }
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: window.location.href });
};

/** Storefront: the restaurant's own name, cuisine and hero shot. */
export const setStorefrontMeta = (tenant, lang) => {
  if (!tenant) return;
  const name = (lang === 'ar' ? tenant.nameAr : tenant.nameEn) || tenant.nameEn;
  const cuisine = (lang === 'ar' ? tenant.cuisineAr : tenant.cuisineEn) || '';
  const tagline = (lang === 'ar' ? tenant.taglineAr : tenant.taglineEn) || '';
  setPageMeta({
    title: cuisine ? `${name} · ${cuisine}` : name,
    description: tagline || `Order from ${name} online.`,
    image: tenant.heroUrl || undefined,
    lang,
  });
};
