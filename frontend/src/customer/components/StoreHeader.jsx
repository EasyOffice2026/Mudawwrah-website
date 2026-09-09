import { useTranslation } from 'react-i18next';
import { kwd, localized } from '../../lib/format';

const Orb = ({ children, onClick, label, active }) => (
  <button type="button" aria-label={label} onClick={onClick} className={`icon-orb ${active ? 'text-brand' : ''}`}>
    {children}
  </button>
);

/**
 * The storefront hero: the restaurant's own photography full-bleed, its
 * controls floating over it, and an info card that overlaps the image and
 * carries the details a customer decides on — rating, wait, delivery fee.
 */
export default function StoreHeader({
  tenant,
  settings,
  lang,
  favorite,
  onToggleFavorite,
  onBack,
  onShare,
  onSearch,
}) {
  const { t, i18n } = useTranslation();
  const name = localized(tenant, 'name', lang) || localized(settings, 'restaurantName', lang);
  const cuisine = localized(tenant, 'cuisine', lang);
  const rating = tenant?.rating != null ? Number(tenant.rating).toFixed(1) : null;
  const deliveryFee = Number(settings?.deliveryFee || 0);
  const closed = settings && settings.isOpen !== 'true';

  const reviews = (count) => {
    if (!count) return null;
    // 1,240 reviews reads as "1k+" the way a store listing shows it.
    if (count >= 1000) return `${Math.floor(count / 1000)}k+`;
    return String(count);
  };

  return (
    <header className="relative">
      <div className="relative h-52 w-full overflow-hidden bg-hairline">
        {tenant?.heroUrl ? (
          <img src={tenant.heroUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-brand to-brand-dark" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/10" />

        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <Orb label={t('common.back')} onClick={onBack}>
            <span className="rtl:rotate-180">←</span>
          </Orb>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
              className="icon-orb w-auto px-3 text-xs font-bold"
            >
              {t('common.language')}
            </button>
            <Orb label={t('common.favorite')} onClick={onToggleFavorite} active={favorite}>
              {favorite ? '♥' : '♡'}
            </Orb>
            <Orb label={t('common.share')} onClick={onShare}>
              ⤴
            </Orb>
            <Orb label={t('common.search')} onClick={onSearch}>
              ⌕
            </Orb>
          </div>
        </div>
      </div>

      {/* Info card, pulled up over the hero. */}
      <div className="relative -mt-10 px-3">
        <div className="animate-rise rounded-2xl bg-white p-4 shadow-lift">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-hairline bg-white">
              {tenant?.logoUrl ? (
                <img src={tenant.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-extrabold text-brand">{(name || '').slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-extrabold leading-tight">{name}</h1>
              {cuisine ? <p className="mt-0.5 truncate text-sm text-ink-soft">{cuisine}</p> : null}
              {rating ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm font-bold">
                  <span className="text-amber-400">★</span>
                  <span>{rating}</span>
                  {reviews(tenant?.ratingCount) ? (
                    <span className="font-medium text-ink-soft">({reviews(tenant.ratingCount)})</span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline pt-3 text-[13px] text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>⏱</span>
              {t('store.prepWindow', {
                min: tenant?.prepMinutesMin ?? 15,
                max: tenant?.prepMinutesMax ?? 25,
              })}
            </span>
            <span aria-hidden className="text-hairline">•</span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>🛵</span>
              {deliveryFee > 0 ? kwd(deliveryFee) : t('store.freeDelivery')}
            </span>
            {localized(settings, 'address', lang) ? (
              <>
                <span aria-hidden className="text-hairline">•</span>
                <span className="truncate">{localized(settings, 'address', lang)}</span>
              </>
            ) : null}
          </div>

          {closed ? (
            <p className="mt-3 rounded-xl bg-brand-light px-3 py-2 text-sm font-semibold text-brand">
              {t('menu.closedNotice')}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
