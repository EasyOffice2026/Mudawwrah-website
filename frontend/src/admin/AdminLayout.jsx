import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { localized } from '../lib/format';
import { applyTheme } from '../lib/theme';
import { useAuth } from '../store/auth';

const links = [
  { to: '', labelKey: 'admin.dashboard', end: true },
  { to: 'menu', labelKey: 'admin.menu' },
  { to: 'orders', labelKey: 'admin.orders' },
  { to: 'media', labelKey: 'admin.media' },
  { to: 'banners', labelKey: 'admin.banners' },
  { to: 'users', labelKey: 'admin.users', adminOnly: true },
  { to: 'settings', labelKey: 'admin.settings' },
];

export default function AdminLayout() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams();
  const { user, loading, bootstrap, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    bootstrap();
  }, [bootstrap, slug]);

  useEffect(() => {
    api
      .get('/tenants/current')
      .then(({ data }) => {
        setTenant(data);
        applyTheme(data);
      })
      .catch(() => {});
  }, [slug]);

  useEffect(() => setOpen(false), [location.pathname]);

  if (loading) return <p className="p-8 text-center text-sm text-gray-500">{t('common.loading')}</p>;
  if (!user) return <Navigate to={`/r/${slug}/admin/login`} replace state={{ from: location.pathname }} />;

  const base = `/r/${slug}/admin`;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside
        className={`fixed inset-y-0 z-40 w-60 shrink-0 bg-brand p-4 text-white transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:rtl:translate-x-0'
        }`}
      >
        <p className="text-xl font-extrabold leading-tight">{tenant ? localized(tenant, 'name', i18n.language) : 'Admin'}</p>
        <p className="mb-6 text-xs text-white/70">{t('admin.dashboard')}</p>
        <nav className="space-y-1">
          {links
            .filter((link) => !link.adminOnly || user.role === 'ADMIN')
            .map((link) => (
              <NavLink
                key={link.to}
                to={link.to ? `${base}/${link.to}` : base}
                end={link.end}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-white text-brand' : 'text-white/90 hover:bg-white/10'}`
                }
              >
                {t(link.labelKey)}
              </NavLink>
            ))}
        </nav>
        <div className="mt-8 space-y-2 border-t border-white/20 pt-4 text-sm">
          <p className="font-semibold">{user.name}</p>
          <p className="text-white/70">
            {user.tenantId === null ? 'Platform owner · all restaurants' : user.role}
          </p>
          <button type="button" onClick={logout} className="btn w-full bg-white/15 text-white hover:bg-white/25">
            {t('admin.signOut')}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3">
          <button type="button" className="btn-ghost lg:hidden" onClick={() => setOpen((value) => !value)}>
            ☰
          </button>
          <div className="flex items-center gap-2">
            <a href={`/r/${slug}`} className="btn-ghost">
              {t('admin.viewStore')}
            </a>
            <a href="/" className="btn-ghost">
              {t('admin.allRestaurants')}
            </a>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
            >
              {t('common.language')}
            </button>
          </div>
        </header>
        <div className="p-4">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
