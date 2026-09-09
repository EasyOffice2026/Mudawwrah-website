export const kwd = (value) => `KWD ${Number(value || 0).toFixed(3)}`;

export const localized = (entity, field, lang) => {
  const suffix = lang === 'ar' ? 'Ar' : 'En';
  const key = `${field}${suffix}`;
  return entity?.[key] || entity?.[`${field}En`] || entity?.[`${field}Ar`] || '';
};

export const dateTime = (value, lang) =>
  new Date(value).toLocaleString(lang === 'ar' ? 'ar-KW' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Discount maths for a menu item. `compareAtPrice` is the pre-discount price;
 * it only counts when it is genuinely above what the customer pays now.
 */
export const discountOf = (item) => {
  const price = Number(item?.price || 0);
  const was = Number(item?.compareAtPrice || 0);
  if (!was || was <= price) return null;
  return { was, percent: Math.round(((was - price) / was) * 100) };
};

/** "KCAL-455, PROTEIN-30g" strip under an item name, when the data exists. */
export const nutritionLine = (item, t) => {
  const parts = [];
  if (item?.calories != null) parts.push(`${t('menu.kcal')} ${item.calories}`);
  if (item?.protein != null) parts.push(`${t('menu.protein')} ${item.protein}g`);
  if (item?.fat != null) parts.push(`${t('menu.fat')} ${item.fat}g`);
  if (item?.carbs != null) parts.push(`${t('menu.carbs')} ${item.carbs}g`);
  return parts.length ? parts.join(' · ') : null;
};
