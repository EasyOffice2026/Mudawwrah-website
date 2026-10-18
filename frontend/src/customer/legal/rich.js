const escapeForRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Splits a paragraph into plain pieces and the pieces worth making clickable:
 * the restaurant's phone number and its Instagram handle (the `contact` block
 * of a restaurant's page content). Everything else comes back untouched, so the
 * wording on the page is always exactly the wording supplied.
 *
 * Returns [{ text }] for plain text and [{ text, href }] for a link.
 */
export const richParts = (text, contact = {}) => {
  const links = new Map();
  if (contact.phone && contact.phoneHref) links.set(contact.phone, contact.phoneHref);
  if (contact.instagram?.label && contact.instagram?.url) links.set(contact.instagram.label, contact.instagram.url);
  if (!links.size) return [{ text }];
  const pattern = new RegExp(`(${[...links.keys()].map(escapeForRegex).join('|')})`, 'g');
  return text
    .split(pattern)
    .filter(Boolean)
    .map((part) => (links.has(part) ? { text: part, href: links.get(part) } : { text: part }));
};
