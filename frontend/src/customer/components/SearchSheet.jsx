import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { discountOf, kwd, localized } from '../../lib/format';
import SheetShell from './SheetShell.jsx';

/**
 * Full-screen menu search.
 *
 * Search used to be a field wedged under the store header that filtered the
 * page beneath it, which meant losing your place in the menu to look something
 * up. As a sheet it sits over the menu and hands back a result, leaving the
 * page exactly where it was.
 */
export default function SearchSheet({ open, categories, lang, onClose, onSelect }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    // Opening straight into the keyboard is the point of a search sheet.
    const timer = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const seen = new Set();
    return categories
      .flatMap((category) => (category.items || []).map((item) => ({ item, category })))
      .filter(({ item }) =>
        [item.nameEn, item.nameAr, item.descriptionEn, item.descriptionAr]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(needle)),
      )
      .filter(({ item }) => {
        // The same dish appears in several categories; show it once.
        const key = item.nameEn.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 30);
  }, [categories, query]);

  if (!open) return null;

  return (
    <SheetShell onBackdropClick={onClose} label={t('common.search')}>
      <header className="flex items-center gap-2 border-b border-hairline bg-white px-3 py-3">
        <button type="button" onClick={onClose} aria-label={t('common.back')} className="icon-orb shadow-none">
          <span className="rtl:rotate-180">←</span>
        </button>
        <input
          ref={inputRef}
          className="input flex-1"
          placeholder={t('common.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </header>

      <div className="flex-1 overflow-y-auto">
        {!query.trim() ? (
          <p className="px-6 py-16 text-center text-sm text-ink-soft">{t('common.searchPrompt')}</p>
        ) : !results.length ? (
          <p className="px-6 py-16 text-center text-sm text-ink-soft">{t('common.noResults')}</p>
        ) : (
          <ul className="bg-white">
            {results.map(({ item, category }) => {
              const discount = discountOf(item);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="flex w-full items-center gap-3 border-b border-hairline px-3 py-3 text-start transition active:bg-surface"
                  >
                    <img
                      src={item.image?.thumbnailUrl || item.image?.url || '/placeholder.svg'}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                      loading="lazy"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold">{localized(item, 'name', lang)}</span>
                      <span className="block truncate text-xs text-ink-soft">
                        {localized(category, 'name', lang)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="text-sm font-bold">{kwd(item.price)}</span>
                      {discount ? <span className="was-price text-xs">{kwd(discount.was)}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SheetShell>
  );
}
