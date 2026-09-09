import { useTranslation } from 'react-i18next';
import { discountOf, kwd, localized } from '../../lib/format';
import AddButton from './AddButton.jsx';

/**
 * Grid tile, used by categories set to the "grid" display style.
 *
 * The whole tile opens the item, but the add control inside it is a real
 * button — so the tile itself is a role="button" div rather than a <button>,
 * which may not contain another button.
 */
export default function ItemCard({ item, lang, onAdd }) {
  const { t } = useTranslation();
  const unavailable = item.isOutOfStock || !item.isAvailable;
  const discount = discountOf(item);

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
      className={`group flex cursor-pointer flex-col text-start transition active:scale-[0.98] ${
        unavailable ? 'cursor-default opacity-60' : ''
      }`}
    >
      <div className="relative w-full overflow-hidden rounded-2xl bg-hairline">
        <img
          src={item.image?.thumbnailUrl || item.image?.url || '/placeholder.svg'}
          alt={localized(item, 'name', lang)}
          className={`aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.04] ${
            unavailable ? 'grayscale' : ''
          }`}
          loading="lazy"
        />
        {discount ? (
          <span className="chip absolute start-2 top-2 bg-discount text-white">−{discount.percent}%</span>
        ) : null}
        {unavailable ? (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-extrabold uppercase tracking-wide text-ink">
            {t('menu.outOfStock')}
          </span>
        ) : null}
        <span className="absolute bottom-2 end-2">
          <AddButton onClick={() => onAdd(item)} customizable={item.isCustomizable} disabled={unavailable} />
        </span>
      </div>

      {item.isTopRated ? (
        <span className="chip mt-2 self-start bg-amber-50 text-amber-700">★ {t('menu.topRated')}</span>
      ) : null}
      <p className="mt-1.5 line-clamp-2 text-sm font-bold leading-snug">{localized(item, 'name', lang)}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-sm font-bold">{kwd(item.price)}</span>
        {discount ? <span className="was-price text-xs">{kwd(discount.was)}</span> : null}
      </p>
      {item.isCustomizable ? <p className="mt-0.5 text-[11px] text-ink-soft">{t('menu.customizable')}</p> : null}
    </div>
  );
}
