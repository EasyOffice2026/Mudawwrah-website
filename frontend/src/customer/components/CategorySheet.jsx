import { useTranslation } from 'react-i18next';
import { localized } from '../../lib/format';

/** Full category index, opened from the ☰ beside the tabs. */
export default function CategorySheet({ open, categories, activeId, onSelect, onClose, lang }) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end" role="dialog" aria-modal="true">
      <button type="button" aria-label={t('common.close')} onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="animate-sheet relative mx-auto max-h-[70vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white pb-6">
        <div className="sticky top-0 flex items-center justify-between border-b border-hairline bg-white px-4 py-3.5">
          <h3 className="text-base font-extrabold">{t('menu.categories')}</h3>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-ink-soft">
            ×
          </button>
        </div>
        <ul className="px-2 py-2">
          {categories.map((category) => {
            const active = category.id === activeId;
            return (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(category.id);
                    onClose();
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-start text-[15px] transition ${
                    active ? 'bg-brand-light font-extrabold text-brand' : 'font-medium hover:bg-surface'
                  }`}
                >
                  <span>{localized(category, 'name', lang)}</span>
                  <span className="text-xs text-ink-soft">{category.items?.length ?? 0}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
