import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { kwd } from '../../lib/format';

/** Floating cart bar. It bumps whenever the count changes, so adding an item
 *  from anywhere on the page gets an acknowledgement without a toast. */
export default function CartBar({ count, subtotal, onOpen }) {
  const { t } = useTranslation();
  const [bump, setBump] = useState(false);
  const previous = useRef(count);

  useEffect(() => {
    if (count > previous.current) {
      setBump(true);
      const timer = setTimeout(() => setBump(false), 440);
      previous.current = count;
      return () => clearTimeout(timer);
    }
    previous.current = count;
  }, [count]);

  if (!count) return null;

  return (
    // Pinned to the viewport, but the inner wrapper is capped to the same
    // max-w-3xl column as the menu — otherwise the bar stretches the full
    // width of a desktop window while the content sits in a narrow column.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div className="pointer-events-auto mx-auto max-w-3xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onOpen}
          className={`btn-primary w-full justify-between py-4 text-base shadow-lift ${bump ? 'animate-bump' : ''}`}
        >
          <span className="flex items-center gap-2">
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-extrabold">
              {count}
            </span>
            {t('cart.viewCart')}
          </span>
          <span>{kwd(subtotal)}</span>
        </button>
      </div>
    </div>
  );
}
