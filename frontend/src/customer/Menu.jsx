import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError } from '../lib/api';
import { localized } from '../lib/format';
import { useCart } from '../store/cart';
import BannerCarousel from './components/BannerCarousel.jsx';
import CartBar from './components/CartBar.jsx';
import CartDrawer from './components/CartDrawer.jsx';
import CategoryTabs from './components/CategoryTabs.jsx';
import CheckoutModal from './components/CheckoutModal.jsx';
import CustomizeModal from './components/CustomizeModal.jsx';
import ItemCard from './components/ItemCard.jsx';
import ItemRow from './components/ItemRow.jsx';
import TopBar from './components/TopBar.jsx';

export default function Menu() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [categories, setCategories] = useState([]);
  const [banners, setBanners] = useState([]);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [customizing, setCustomizing] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [favorite, setFavorite] = useState(localStorage.getItem('mdawra_favorite') === 'true');
  const sectionRefs = useRef({});
  const { addLine, count, subtotal } = useCart();

  const load = async () => {
    setLoading(true);
    try {
      const [categoriesRes, bannersRes, settingsRes] = await Promise.all([
        api.get('/categories'),
        api.get('/banners'),
        api.get('/settings'),
      ]);
      setCategories(categoriesRes.data);
      setBanners(bannersRes.data);
      setSettings(settingsRes.data);
      setActiveId(categoriesRes.data[0]?.id || null);
      setError(null);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const offset = 140;
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

  const visibleCategories = useMemo(() => {
    if (!query.trim()) return categories;
    const needle = query.trim().toLowerCase();
    return categories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) =>
          [item.nameEn, item.nameAr, item.descriptionEn, item.descriptionAr]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(needle)),
        ),
      }))
      .filter((category) => category.items.length);
  }, [categories, query]);

  const onAdd = (item) => {
    if (item.isCustomizable && item.options?.length) return setCustomizing(item);
    addLine(item, [], 1);
  };

  const selectTab = (id) => {
    setActiveId(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const share = async () => {
    const shareData = { title: settings ? localized(settings, 'restaurantName', lang) : 'Mdawra', url: window.location.href };
    if (navigator.share) await navigator.share(shareData).catch(() => {});
    else await navigator.clipboard?.writeText(window.location.href).catch(() => {});
  };

  const toggleFavorite = () => {
    setFavorite((value) => {
      localStorage.setItem('mdawra_favorite', String(!value));
      return !value;
    });
  };

  const restaurantName = settings ? localized(settings, 'restaurantName', lang) : t('brand');

  return (
    <div className="mx-auto min-h-screen max-w-3xl pb-24">
      <TopBar
        title={restaurantName}
        favorite={favorite}
        onToggleFavorite={toggleFavorite}
        onShare={share}
        onSearch={() => setSearchOpen((open) => !open)}
      />

      {searchOpen ? (
        <div className="border-b border-gray-100 bg-white px-3 py-2">
          <input
            autoFocus
            className="input"
            placeholder={t('common.searchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      ) : null}

      <BannerCarousel banners={banners} lang={lang} />

      {categories.length ? (
        <CategoryTabs categories={categories} activeId={activeId} onSelect={selectTab} lang={lang} />
      ) : null}

      {settings && settings.isOpen !== 'true' ? (
        <p className="mx-3 mt-3 rounded-lg bg-brand-light px-3 py-2 text-sm font-semibold text-brand">
          {t('menu.closedNotice')}
        </p>
      ) : null}

      {loading ? <p className="p-6 text-center text-sm text-gray-500">{t('common.loading')}</p> : null}

      {error ? (
        <div className="p-6 text-center">
          <p className="text-sm font-semibold text-brand">{error}</p>
          <button type="button" className="btn-ghost mt-3" onClick={load}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {!loading && !error && !visibleCategories.length ? (
        <p className="p-6 text-center text-sm text-gray-500">{t('common.noResults')}</p>
      ) : null}

      {visibleCategories.map((category) => (
        <section
          key={category.id}
          ref={(el) => {
            sectionRefs.current[category.id] = el;
          }}
          className="scroll-mt-32 px-3 pt-5"
        >
          <h2 className="text-2xl font-extrabold">{localized(category, 'name', lang)}</h2>
          {localized(category, 'subtitle', lang) ? (
            <p className="mt-1 text-sm text-gray-500">{localized(category, 'subtitle', lang)}</p>
          ) : null}
          {category.displayStyle === 'grid' ? (
            <div className="mt-4 grid grid-cols-2 gap-4">
              {category.items.map((item) => (
                <ItemCard key={item.id} item={item} lang={lang} onAdd={onAdd} />
              ))}
            </div>
          ) : (
            <div className="mt-2">
              {category.items.map((item) => (
                <ItemRow key={item.id} item={item} lang={lang} onAdd={onAdd} />
              ))}
            </div>
          )}
        </section>
      ))}

      <CartBar count={count()} subtotal={subtotal()} onOpen={() => setCartOpen(true)} />

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
        onClose={() => setCartOpen(false)}
        onCheckout={() => {
          setCartOpen(false);
          setCheckoutOpen(true);
        }}
      />

      <CheckoutModal open={checkoutOpen} settings={settings} onClose={() => setCheckoutOpen(false)} />
    </div>
  );
}
