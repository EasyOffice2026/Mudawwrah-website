import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import { localized } from '../lib/format';
import { setStorefrontMeta } from '../lib/pageMeta';
import { applyTheme } from '../lib/theme';
import { applyTracking, captureAttribution } from '../lib/tracking';
import { useCart } from '../store/cart';
import CartBar from './components/CartBar.jsx';
import CartDrawer from './components/CartDrawer.jsx';
import CategorySheet from './components/CategorySheet.jsx';
import CategoryTabs from './components/CategoryTabs.jsx';
import CollapsedBar from './components/CollapsedBar.jsx';
import CheckoutModal from './components/CheckoutModal.jsx';
import CustomizeModal from './components/CustomizeModal.jsx';
import ItemCard from './components/ItemCard.jsx';
import ItemRow from './components/ItemRow.jsx';
import OfferStrip from './components/OfferStrip.jsx';
import SearchSheet from './components/SearchSheet.jsx';
import SplashScreen, { splashAlreadyPlayed } from './components/SplashScreen.jsx';
import StoreFooter from './components/StoreFooter.jsx';
import StoreHeader from './components/StoreHeader.jsx';

const MenuSkeleton = () => (
  <div className="px-3 pt-6">
    <div className="skeleton h-7 w-40 rounded-lg" />
    <div className="mt-4 grid grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index}>
          <div className="skeleton aspect-square w-full rounded-2xl" />
          <div className="skeleton mt-2 h-4 w-3/4 rounded" />
          <div className="skeleton mt-1.5 h-3 w-1/3 rounded" />
        </div>
      ))}
    </div>
  </div>
);

export default function Menu() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams();
  const navigate = useNavigate();
  const lang = i18n.language;
  const [tenant, setTenant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [customizing, setCustomizing] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // True once the hero has scrolled away and the compact store bar takes over.
  const [collapsed, setCollapsed] = useState(false);
  // Set when arriving with another restaurant's cart still held.
  const [searchOpen, setSearchOpen] = useState(false);
  const [favorite, setFavorite] = useState(localStorage.getItem('mdawra_favorite') === 'true');
  // Suppressed while the tab rail is driving the scroll, so the spy does not
  // fight the smooth scroll and flicker through every category on the way.
  const scrollLock = useRef(false);
  const sectionRefs = useRef({});
  // Zero-height marker just above the sticky rail. Once it scrolls out of
  // view the rail is pinned, which is the moment the store bar should appear.
  const sentinelRef = useRef(null);
  const { addLine, count, subtotal, ensureTenant, promo, setPromo } = useCart();

  const [splashDone, setSplashDone] = useState(() => splashAlreadyPlayed(slug));

  const load = async () => {
    setLoading(true);
    try {
      const [tenantRes, categoriesRes, settingsRes, promotionsRes] = await Promise.all([
        api.get('/tenants/current'),
        api.get('/categories'),
        api.get('/settings'),
        api.get('/promotions'),
      ]);
      setTenant(tenantRes.data);
      // Repaints the entire UI in this restaurant's palette, and renames the
      // tab and share tags so every storefront is not called "Mdawra".
      applyTheme(tenantRes.data);
      setStorefrontMeta(tenantRes.data, lang);
      setCategories(categoriesRes.data);
      setSettings(settingsRes.data);
      applyTracking(settingsRes.data);
      setPromotions(promotionsRes.data);
      setActiveId(categoriesRes.data[0]?.id || null);
      ensureTenant(slug, localized(tenantRes.data, "name", lang));
      setError(null);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  // Read once, from the very first URL this tab loaded — not on every
  // internal navigation between categories or restaurants, which carries no
  // campaign parameters and would otherwise look like a direct visit.
  useEffect(() => {
    captureAttribution();
  }, []);

  useEffect(() => {
    // Each restaurant keeps its own isolated cart — switching slugs never
    // touches another restaurant's items.
    ensureTenant(slug);
    load();
  }, [slug]);

  // Switching language has to retitle the page too, otherwise an Arabic
  // storefront still announces itself in English.
  useEffect(() => {
    if (tenant) setStorefrontMeta(tenant, lang);
  }, [tenant, lang]);

  // The store bar appears exactly when the category rail reaches the top —
  // which is where the product list begins — and is hidden before that.
  //
  // Watched with an observer on a sentinel sitting just above the rail rather
  // than measured inside the scroll handler: an observer reports the true
  // state on first paint and cannot be missed by a throttled or coalesced
  // scroll event, which is how a half-open header used to end up stranded in
  // the middle of the page.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [categories.length]);

  useEffect(() => {
    const onScroll = () => {
      if (scrollLock.current) return;
      const offset = 120;
      let current = activeId;
      for (const category of categories) {
        const node = sectionRefs.current[category.id];
        if (node && node.getBoundingClientRect().top <= offset) current = category.id;
      }
      if (current !== activeId) setActiveId(current);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [categories, activeId]);

  // What other customers are actually ordering, from the API rather than a
  // local guess. Refreshed when the cart opens so the rail reflects recent
  // trade and never suggests something already in the basket.
  const [suggestions, setSuggestions] = useState([]);

  const loadSuggestions = async () => {
    try {
      const exclude = [...new Set(useCart.getState().lines.map((l) => l.menuItemId))].join(',');
      const { data } = await api.get('/items/popular', { params: { limit: 8, exclude } });
      setSuggestions(data);
    } catch {
      // An upsell rail is not worth failing the cart over.
      setSuggestions([]);
    }
  };

  /**
   * Tapping the item itself always opens its sheet — the description,
   * nutrition and full photo live there, and adding an item sight-unseen is
   * not what a tap on the row means.
   */
  const onOpen = (item) => setCustomizing(item);

  /** The + button is the shortcut: straight into the cart, unless the item
   *  has options that have to be chosen first. */
  const onAdd = (item) => {
    if (item.isCustomizable && item.options?.length) return setCustomizing(item);
    addLine(item, [], 1);
  };

  const selectTab = (id) => {
    setActiveId(id);
    scrollLock.current = true;
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Long enough for the smooth scroll to settle before the spy resumes.
    setTimeout(() => {
      scrollLock.current = false;
    }, 650);
  };

  const applyOffer = async (promotion) => {
    try {
      const { data } = await api.post('/promotions/preview', { code: promotion.code, subtotal: subtotal() });
      setPromo(data);
    } catch (err) {
      // Below the minimum, or expired — surface it where the codes are shown.
      setError(apiError(err));
      setTimeout(() => setError(null), 3200);
    }
  };

  const share = async () => {
    const shareData = {
      title: settings ? localized(settings, 'restaurantName', lang) : 'Mdawra',
      url: window.location.href,
    };
    if (navigator.share) await navigator.share(shareData).catch(() => {});
    else await navigator.clipboard?.writeText(window.location.href).catch(() => {});
  };

  const toggleFavorite = () => {
    setFavorite((value) => {
      localStorage.setItem('mdawra_favorite', String(!value));
      return !value;
    });
  };

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-surface pb-28">
      {/* Brand reveal, then the storefront. */}
      {!splashDone && tenant ? (
        <SplashScreen tenant={tenant} slug={slug} lang={lang} onDone={() => setSplashDone(true)} />
      ) : null}

      <StoreHeader
        tenant={tenant}
        settings={settings}
        lang={lang}
        favorite={favorite}
        onToggleFavorite={toggleFavorite}
        onBack={() => navigate('/')}
        onShare={share}
        onSearch={() => setSearchOpen((value) => !value)}
      />

      <OfferStrip promotions={promotions} lang={lang} onApply={applyOffer} appliedCode={promo?.code} />

      {categories.length ? (
        // One sticky wrapper holds both the collapsed store bar and the
        // category rail, so they pin together and the menu scrolls beneath
        // them — the bar expands in place rather than covering the tabs.
        <>
        <div ref={sentinelRef} aria-hidden className="h-px" />
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur">
          <CollapsedBar
            collapsed={collapsed}
            title={localized(tenant, 'name', lang) || localized(settings, 'restaurantName', lang)}
            favorite={favorite}
            onToggleFavorite={toggleFavorite}
            onBack={() => navigate('/')}
            onShare={share}
            onSearch={() => setSearchOpen((value) => !value)}
          />
          <CategoryTabs
            categories={categories}
            activeId={activeId}
            onSelect={selectTab}
            onOpenAll={() => setSheetOpen(true)}
            lang={lang}
          />
        </div>
        </>
      ) : null}

      {loading ? <MenuSkeleton /> : null}

      {error ? (
        <div className="p-6 text-center">
          <p className="text-sm font-semibold text-brand">{error}</p>
          <button type="button" className="btn-ghost mt-3" onClick={load}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {!loading && !error && !categories.length ? (
        <p className="p-10 text-center text-sm text-ink-soft">{t('common.noResults')}</p>
      ) : null}

      {categories.map((category) => (
        <section
          key={category.id}
          ref={(el) => {
            sectionRefs.current[category.id] = el;
          }}
          className="scroll-mt-[108px] bg-white px-3 pb-2 pt-5 [&:not(:first-of-type)]:mt-3"
        >
          <h2 className="text-2xl font-extrabold tracking-tight">{localized(category, 'name', lang)}</h2>
          {localized(category, 'subtitle', lang) ? (
            <p className="mt-1 text-sm text-ink-soft">{localized(category, 'subtitle', lang)}</p>
          ) : null}

          {/* Keyed on the category so re-entering a section replays the stagger. */}
          {category.displayStyle === 'grid' ? (
            <div key={`${category.id}-${lang}`} className="stagger mt-4 grid grid-cols-2 gap-4">
              {category.items.map((item, index) => (
                <div key={item.id} style={{ '--i': index }}>
                  <ItemCard item={item} lang={lang} onOpen={onOpen} onAdd={onAdd} />
                </div>
              ))}
            </div>
          ) : (
            <div key={`${category.id}-${lang}`} className="stagger mt-2">
              {category.items.map((item, index) => (
                <div key={item.id} style={{ '--i': index }}>
                  <ItemRow item={item} lang={lang} onOpen={onOpen} onAdd={onAdd} />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <StoreFooter slug={slug} settings={settings} />

      <CartBar count={count()} subtotal={subtotal()} onOpen={() => { setCartOpen(true); loadSuggestions(); }} />

      {/* Headline offer stays pinned to the floor, lifting above itself when a
          cart bar appears so the two never overlap. */}
      <SearchSheet
        open={searchOpen}
        categories={categories}
        lang={lang}
        onClose={() => setSearchOpen(false)}
        onSelect={(item) => {
          setSearchOpen(false);
          setCustomizing(item);
        }}
      />

      <CategorySheet
        open={sheetOpen}
        categories={categories}
        activeId={activeId}
        onSelect={selectTab}
        onClose={() => setSheetOpen(false)}
        lang={lang}
      />

      <CustomizeModal
        item={customizing}
        lang={lang}
        onClose={() => setCustomizing(null)}
        onConfirm={(item, options, quantity) => {
          addLine(item, options, quantity);
          setCustomizing(null);
        }}
      />

      <CartDrawer
        open={cartOpen}
        settings={settings}
        suggestions={suggestions}
        promotions={promotions}
        lang={lang}
        onClose={() => setCartOpen(false)}
        onAddSuggestion={(item) => addLine(item, [], 1)}
        onCheckout={() => {
          setCartOpen(false);
          setCheckoutOpen(true);
        }}
      />

      <CheckoutModal
        open={checkoutOpen}
        settings={settings}
        tenant={tenant}
        lang={lang}
        onClose={() => setCheckoutOpen(false)}
      />
    </div>
  );
}
