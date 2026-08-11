import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const lineKey = (itemId, optionIds) => `${itemId}::${[...optionIds].sort().join(',')}`;

export const useCart = create(
  persist(
    (set, get) => ({
      lines: [],
      tenantSlug: null,
      /**
       * Carts belong to one restaurant. Opening a different one starts a fresh
       * cart rather than carrying items (and prices) across.
       */
      ensureTenant: (slug) =>
        set((state) => (state.tenantSlug === slug ? state : { tenantSlug: slug, lines: [] })),
      addLine: (item, options = [], quantity = 1) =>
        set((state) => {
          const optionIds = options.map((o) => o.id);
          const key = lineKey(item.id, optionIds);
          const existing = state.lines.find((l) => l.key === key);
          if (existing) {
            return {
              lines: state.lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l)),
            };
          }
          const unitPrice = Number(item.price) + options.reduce((sum, o) => sum + Number(o.extraPrice), 0);
          return {
            lines: [
              ...state.lines,
              {
                key,
                menuItemId: item.id,
                nameEn: item.nameEn,
                nameAr: item.nameAr,
                imageUrl: item.image?.thumbnailUrl || item.image?.url || null,
                unitPrice,
                quantity,
                options: options.map((o) => ({ id: o.id, nameEn: o.nameEn, nameAr: o.nameAr, extraPrice: Number(o.extraPrice) })),
              },
            ],
          };
        }),
      setQuantity: (key, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((l) => l.key !== key)
              : state.lines.map((l) => (l.key === key ? { ...l, quantity } : l)),
        })),
      removeLine: (key) => set((state) => ({ lines: state.lines.filter((l) => l.key !== key) })),
      clear: () => set({ lines: [] }),
      count: () => get().lines.reduce((sum, l) => sum + l.quantity, 0),
      subtotal: () => Number(get().lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0).toFixed(3)),
    }),
    { name: 'mdawra_cart' },
  ),
);
