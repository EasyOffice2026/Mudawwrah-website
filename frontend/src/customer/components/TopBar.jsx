import { useTranslation } from 'react-i18next';

const IconButton = ({ children, onClick, label, active }) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className={`flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-lg ${
      active ? 'text-brand' : 'text-gray-700'
    }`}
  >
    {children}
  </button>
);

export default function TopBar({ title, subtitle, favorite, onToggleFavorite, onBack, onShare, onSearch }) {
  const { t, i18n } = useTranslation();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-gray-100 bg-white px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <IconButton label="back" onClick={onBack || (() => window.history.back())}>
          <span className="rtl:rotate-180">←</span>
        </IconButton>
        <span className="min-w-0">
          <span className="block truncate text-lg font-bold leading-tight">{title}</span>
          {subtitle ? <span className="block truncate text-xs text-gray-500">{subtitle}</span> : null}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
          className="rounded-full border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"
        >
          {t('common.language')}
        </button>
        <IconButton label="favorite" onClick={onToggleFavorite} active={favorite}>
          {favorite ? '♥' : '♡'}
        </IconButton>
        <IconButton label="share" onClick={onShare}>
          ⤴
        </IconButton>
        <IconButton label={t('common.search')} onClick={onSearch}>
          ⌕
        </IconButton>
      </div>
    </header>
  );
}
