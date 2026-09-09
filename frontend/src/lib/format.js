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
