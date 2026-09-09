import { useEffect, useRef } from 'react';
import { localized } from '../../lib/format';

/**
 * Sticky category rail. The active tab keeps itself centred, and the underline
 * is a single element that slides between tabs rather than one border per tab —
 * that sliding pill is what makes switching categories feel like movement.
 */
export default function CategoryTabs({ categories, activeId, onSelect, onOpenAll, lang }) {
  const containerRef = useRef(null);
  const tabRefs = useRef({});
  const underlineRef = useRef(null);

  useEffect(() => {
    const tab = tabRefs.current[activeId];
    const container = containerRef.current;
    const underline = underlineRef.current;
    if (!tab || !container) return;

    // Scroll the rail itself rather than calling tab.scrollIntoView(): that
    // scrolls every scrollable ancestor including the document, and because
    // this nav is sticky the page gets yanked back to the rail's natural
    // offset. The scroll-spy then re-fires it, so the page cannot be scrolled
    // past this point at all. Moving only `container.scrollLeft` keeps the
    // centring behaviour without ever touching the vertical page scroll.
    const centred = tab.offsetLeft - (container.clientWidth - tab.offsetWidth) / 2;
    const maxLeft = container.scrollWidth - container.clientWidth;
    container.scrollTo({ left: Math.max(0, Math.min(centred, maxLeft)), behavior: 'smooth' });

    if (underline) {
      // Position against the scrolling content, not the viewport, so the
      // underline stays glued to its tab while the rail scrolls.
      underline.style.width = `${tab.offsetWidth}px`;
      underline.style.transform = `translateX(${tab.offsetLeft}px)`;
    }
  }, [activeId, categories]);

  return (
    // Positioning belongs to the sticky wrapper in Menu.jsx, which pins this
    // rail together with the collapsed store bar above it.
    <nav className="border-b border-hairline bg-white/95 backdrop-blur">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onOpenAll}
          aria-label="all categories"
          className="shrink-0 px-3 py-3.5 text-lg text-ink-soft transition active:scale-90"
        >
          ☰
        </button>
        <div ref={containerRef} className="no-scrollbar relative flex flex-1 items-center gap-1 overflow-x-auto pe-3">
          {categories.map((category) => {
            const active = category.id === activeId;
            return (
              <button
                key={category.id}
                type="button"
                ref={(el) => {
                  tabRefs.current[category.id] = el;
                }}
                onClick={() => onSelect(category.id)}
                className={`shrink-0 whitespace-nowrap px-3 py-3.5 text-sm transition-colors duration-200 ${
                  active ? 'font-extrabold text-ink' : 'font-medium text-ink-soft'
                }`}
              >
                {localized(category, 'name', lang)}
              </button>
            );
          })}
          <span
            ref={underlineRef}
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 h-[3px] rounded-full bg-brand transition-[transform,width] duration-300 ease-out"
          />
        </div>
      </div>
    </nav>
  );
}
