import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { discountOf, kwd, localized, nutritionLine } from '../../lib/format';
import SheetShell from './SheetShell.jsx';

/**
 * Full-height item sheet: hero photo, option groups with their own selection
 * limits, and a sticky "Add item" bar whose price tracks every tick.
 *
 * Groups come from `groupEn`/`groupAr` on each option. A group's limit is the
 * largest `maxSelect` among its options, which is how the admin expresses
 * "choose up to N" for the whole group.
 */
export default function CustomizeModal({ item, lang, onClose, onConfirm }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const itemId = item?.id;

  // A fresh sheet every time, so a previous item's extras never leak into it.
  useEffect(() => {
    if (itemId) {
      setSelected([]);
      setQuantity(1);
    }
  }, [itemId]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const option of item?.options || []) {
      const key = localized(option, 'group', lang) || t('menu.extras');
      map.set(key, [...(map.get(key) || []), option]);
    }
    return [...map.entries()].map(([name, options]) => ({
      name,
      options,
      limit: Math.max(...options.map((o) => o.maxSelect || 1)),
      required: options.some((o) => o.isRequired),
    }));
  }, [item, lang, t]);

  const toggle = (option, group) => {
    setSelected((current) => {
      if (current.includes(option.id)) return current.filter((id) => id !== option.id);
      const groupIds = group.options.map((o) => o.id);
      const chosen = current.filter((id) => groupIds.includes(id));
      if (chosen.length >= group.limit) {
        // At the limit: drop the oldest pick in this group to make room.
        return [...current.filter((id) => id !== chosen[0]), option.id];
      }
      return [...current, option.id];
    });
  };

  // Required groups must be satisfied before the item can be added.
  const unmet = groups.filter((g) => g.required && !g.options.some((o) => selected.includes(o.id)));

  if (!item) return null;

  const selectedOptions = (item.options || []).filter((o) => selected.includes(o.id));
  const extras = selectedOptions.reduce((sum, o) => sum + Number(o.extraPrice), 0);
  const unitPrice = Number(item.price) + extras;
  const discount = discountOf(item);
  const wasTotal = discount ? (discount.was + extras) * quantity : null;
  const nutrition = nutritionLine(item, t);

  return (
    <SheetShell onBackdropClick={onClose} label={localized(item, 'name', lang)}>
      <div className="flex-1 overflow-y-auto pb-32">
        <div className="relative">
          <img
            src={item.image?.url || item.image?.thumbnailUrl || '/placeholder.svg'}
            alt={localized(item, 'name', lang)}
            className="h-64 w-full object-cover"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="icon-orb absolute start-3 top-3"
          >
            ×
          </button>
        </div>

        <div className="px-4 pt-5">
          <h2 className="text-xl font-extrabold leading-tight">{localized(item, 'name', lang)}</h2>
          {localized(item, 'description', lang) ? (
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{localized(item, 'description', lang)}</p>
          ) : null}
          {nutrition ? <p className="mt-2 text-xs font-medium text-ink-soft/80">{nutrition}</p> : null}
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-lg font-extrabold">{kwd(item.price)}</span>
            {discount ? (
              <>
                <span className="was-price">{kwd(discount.was)}</span>
                <span className="chip bg-discount text-white">−{discount.percent}%</span>
              </>
            ) : null}
          </p>
        </div>

        {groups.map((group) => (
          <section key={group.name} className="mt-6 border-t-8 border-surface px-4 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold">{group.name}</h3>
                <p className="mt-0.5 text-xs text-ink-soft">{t('menu.chooseUpTo', { count: group.limit })}</p>
              </div>
              <span
                className={`chip shrink-0 ${group.required ? 'bg-brand-light text-brand' : 'bg-surface text-ink-soft'}`}
              >
                {group.required ? t('menu.required') : t('menu.optional')}
              </span>
            </div>

            <div className="mt-3 divide-y divide-hairline">
              {group.options.map((option) => {
                const checked = selected.includes(option.id);
                const extra = Number(option.extraPrice);
                return (
                  <label key={option.id} className="flex cursor-pointer items-center justify-between gap-3 py-3.5">
                    <span className="text-[15px]">{localized(option, 'name', lang)}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      {extra > 0 ? <span className="text-sm font-semibold text-ink-soft">+ {kwd(extra)}</span> : null}
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(option, group)}
                        className="h-5 w-5 rounded accent-brand"
                      />
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="border-t border-hairline bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {unmet.length ? (
          <p className="mb-2 text-center text-xs font-semibold text-brand">
            {t('menu.selectRequired', { group: unmet[0].name })}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-hairline">
            <button
              type="button"
              aria-label="decrease"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="px-3.5 py-2.5 text-xl leading-none text-ink-soft transition active:scale-90"
            >
              −
            </button>
            <span className="w-6 text-center text-sm font-extrabold">{quantity}</span>
            <button
              type="button"
              aria-label="increase"
              onClick={() => setQuantity((q) => q + 1)}
              className="px-3.5 py-2.5 text-xl leading-none text-accent transition active:scale-90"
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="btn-primary flex-1 justify-between py-3.5"
            disabled={unmet.length > 0}
            onClick={() => onConfirm(item, selectedOptions, quantity)}
          >
            <span>{t('menu.addToCart')}</span>
            <span className="flex items-baseline gap-2">
              {wasTotal ? <span className="text-xs font-medium text-white/65 line-through">{kwd(wasTotal)}</span> : null}
              <span>{kwd(unitPrice * quantity)}</span>
            </span>
          </button>
        </div>
      </div>
    </SheetShell>
  );
}
