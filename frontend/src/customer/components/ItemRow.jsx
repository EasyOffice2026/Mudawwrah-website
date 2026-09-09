import { useTranslation } from 'react-i18next';
import { discountOf, kwd, localized, nutritionLine } from '../../lib/format';
import AddButton from './AddButton.jsx';

/**
 * List row, used by categories set to the "list" display style.
 *
 * Same shape as ItemCard: the row is a role="button" div rather than a
 * <button>, because it contains the real add button.
 */
export default function ItemRow({ item, lang, onAdd }) {
  const { t } = useTranslation();
  const unavailable = item.isOutOfStock || !item.isAvailable;
  const description = localized(item, 'description', lang);
  const discount = discountOf(item);
  const nutrition = nutritionLine(item, t);

  const open = () => {
    if (!unavailable) onAdd(item);
  };

  return (
    <div
      role="button"
      tabIndex={unavailable ? -1 : 0}
      aria-disabled={unavailable}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
      className={`flex w-full cursor-pointer items-start gap-3 border-b border-hairline py-4 text-start transition active:bg-surface ${
        unavailable ? 'cursor-default opacity-60' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        {item.isTopRated ? (
          <span className="chip mb-1.5 bg-amber-50 text-amber-700">★ {t('menu.topRated')}</span>
        ) : null}
        <p className="text-[15px] font-bold leading-snug">{localized(item, 'name', lang)}</p>
        {description ? <p className="mt-1 line-clamp-2 text-sm leading-snug text-ink-soft">{description}</p> : null}
        {nutrition ? <p className="mt-1 text-[11px] font-medium text-ink-soft/80">{nutrition}</p> : null}
        <p className="mt-2.5 flex items-baseline gap-2">
          <span className="text-[15px] font-bold">{kwd(item.price)}</span>
          {discount ? <span className="was-price">{kwd(discount.was)}</span> : null}
        </p>
        {unavailable ? <p className="mt-1 text-xs font-bold text-brand">{t('menu.outOfStock')}</p> : null}
      </div>

      <div className="relative shrink-0">
        <div className="overflow-hidden rounded-2xl bg-hairline">
          <img
            src={item.image?.thumbnailUrl || item.image?.url || '/placeholder.svg'}
            alt={localized(item, 'name', lang)}
            className={`h-[112px] w-[112px] object-cover ${unavailable ? 'grayscale' : ''}`}
            loading="lazy"
          />
        </div>
        {discount ? (
          <span className="chip absolute start-1.5 top-1.5 bg-discount text-white">−{discount.percent}%</span>
        ) : null}
        <span className="absolute -bottom-1 end-1">
          <AddButton onClick={() => onAdd(item)} customizable={item.isCustomizable} disabled={unavailable} />
        </span>
      </div>
    </div>
  );
}
