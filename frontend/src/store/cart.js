import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const lineKey = (itemId, optionIds) => `${itemId}::${[...optionIds].sort().join(',')}`;

export const useCart = create(
  persist(
    (set, get) => ({
      lines: [],
      tenantSlug: null,
      /** Shown in the "Start a new cart?" prompt when switching restaurants. */
      tenantName: null,
      /** Voucher preview returned by the API: { code, discount, freeDelivery }. */
      promo: null,
      cutlery: false,
      note: '',
      /**
       * Carts belong to one restaurant, so opening a different one cannot carry
       * items (or their prices) across.
       *
       * Claiming an empty cart for the new restaurant is free. A cart with
       * items is NOT cleared here — the caller is told so it can ask first, via
       * `switchTenant` once the customer confirms.
       */
      ensureTenant: (slug, name) => {
        const state = get();
        if (state.tenantSlug === slug) {
          // Keep the display name fresh (e.g. after a language switch).
          if (name && state.tenantName !== name) set({ tenantName: name });
          return { conflict: false };
        }
        if (!state.lines.length) {
          set({ tenantSlug: slug, tenantName: name ?? null, promo: null, cutlery: false, note: '' });
          return { conflict: false };
        }
        return { conflict: true, previousName: state.tenantName, previousSlug: state.tenantSlug };
      },
      /** Confirmed "Start a new cart?" — drop the old order and adopt the new restaurant. */
      switchTenant: (slug, name) =>
        set({ tenantSlug: slug, tenantName: name ?? null, lines: [], promo: null, cutlery: false, note: '' }),
      addLine: (item, options = [], quantity = 1) =>
        set((state) => {
          const optionIds = options.map((o) => o.id);
          const key = lineKey(item.id, optionIds);
          const existing = state.lines.find((l) => l.key === key);
          if (existing) {
            return {
              // A changed cart invalidates the voucher — its minimum may no
              // longer be met, so it is re-checked at checkout.
              promo: null,
              lines: state.lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l)),
            };
          }
          const extras = options.reduce((sum, o) => sum + Number(o.extraPrice), 0);
          const basePrice = Number(item.price);
          return {
            promo: null,
            lines: [
              ...state.lines,
              {
                key,
                menuItemId: item.id,
                nameEn: item.nameEn,
                nameAr: item.nameAr,
                imageUrl: item.image?.thumbnailUrl || item.image?.url || null,
                basePrice,
                // Kept so the cart can show what the line used to cost.
                compareAtPrice: item.compareAtPrice ? Number(item.compareAtPrice) : null,
                unitPrice: basePrice + extras,
                quantity,
                options: options.map((o) => ({
                  id: o.id,
                  nameEn: o.nameEn,
                  nameAr: o.nameAr,
                  extraPrice: Number(o.extraPrice),
                })),
              },
            ],
          };
        }),
      setQuantity: (key, quantity) =>
        set((state) => ({
          promo: null,
          lines:
            quantity <= 0
              ? state.lines.filter((l) => l.key !== key)
              : state.lines.map((l) => (l.key === key ? { ...l, quantity } : l)),
        })),
      removeLine: (key) => set((state) => ({ promo: null, lines: state.lines.filter((l) => l.key !== key) })),
      setPromo: (promo) => set({ promo }),
      setCutlery: (cutlery) => set({ cutlery }),
      setNote: (note) => set({ note }),
      clear: () => set({ lines: [], promo: null, cutlery: false, note: '' }),
      count: () => get().lines.reduce((sum, l) => sum + l.quantity, 0),
      subtotal: () => Number(get().lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0).toFixed(3)),
    }),
    { name: 'mdawra_cart' },
  ),
);
