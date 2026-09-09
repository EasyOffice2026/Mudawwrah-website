import { useTranslation } from 'react-i18next';

const Icon = ({ children, onClick, label, active }) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className={`flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-white text-base transition active:scale-90 ${
      active ? 'text-brand' : 'text-ink'
    }`}
  >
    {children}
  </button>
);

/**
 * Compact store bar that takes over once the hero has scrolled away, so the
 * restaurant name and its controls stay reachable the whole way down the menu.
 *
 * It collapses by animating its own height rather than sliding over the tabs:
 * both live in one sticky wrapper, so when this expands the category rail is
 * pushed down beneath it instead of being covered.
 */
export default function CollapsedBar({ collapsed, title, favorite, onToggleFavorite, onBack, onShare, onSearch }) {
  const { t, i18n } = useTranslation();

  return (
    <div
      aria-hidden={!collapsed}
      className={`overflow-hidden transition-[height,opacity] duration-300 ease-out ${
        collapsed ? 'h-14 opacity-100' : 'h-0 opacity-0'
      }`}
    >
      <div className="flex h-14 items-center gap-2 px-3">
        <Icon label={t('common.back')} onClick={onBack}>
          <span className="rtl:rotate-180">←</span>
        </Icon>
        <span className="min-w-0 flex-1 truncate text-base font-extrabold">{title}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
            className="rounded-full border border-hairline px-2.5 py-2 text-[11px] font-bold text-ink transition active:scale-90"
          >
            {t('common.language')}
          </button>
          <Icon label={t('common.favorite')} onClick={onToggleFavorite} active={favorite}>
            {favorite ? '♥' : '♡'}
          </Icon>
          <Icon label={t('common.share')} onClick={onShare}>
            ⤴
          </Icon>
          <Icon label={t('common.search')} onClick={onSearch}>
            ⌕
          </Icon>
        </div>
      </div>
    </div>
  );
}
