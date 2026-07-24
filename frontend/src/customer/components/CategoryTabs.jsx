import { useEffect, useRef } from 'react';
import { localized } from '../../lib/format';

export default function CategoryTabs({ categories, activeId, onSelect, lang }) {
  const containerRef = useRef(null);
  const tabRefs = useRef({});

  useEffect(() => {
    const tab = tabRefs.current[activeId];
    if (tab && containerRef.current) {
      tab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeId]);

  return (
    <nav className="sticky top-[57px] z-20 border-b border-gray-100 bg-white">
      <div ref={containerRef} className="no-scrollbar flex items-center gap-1 overflow-x-auto px-3">
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
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm transition ${
                active ? 'border-black font-bold text-black' : 'border-transparent text-gray-500'
              }`}
            >
              {localized(category, 'name', lang)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
