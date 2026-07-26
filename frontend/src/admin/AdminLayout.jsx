import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';

const links = [
  { to: '/admin', labelKey: 'admin.dashboard', end: true },
  { to: '/admin/menu', labelKey: 'admin.menu' },
  { to: '/admin/orders', labelKey: 'admin.orders' },
  { to: '/admin/media', labelKey: 'admin.media' },
  { to: '/admin/banners', labelKey: 'admin.banners' },
  { to: '/admin/feedback', labelKey: 'admin.feedback' },
  { to: '/admin/users', labelKey: 'admin.users', adminOnly: true },
  { to: '/admin/settings', labelKey: 'admin.settings' },
];

export default function AdminLayout() {
  const { t, i18n } = useTranslation();
  const { user, loading, bootstrap, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => setOpen(false), [location.pathname]);

  if (loading) return <p className="p-8 text-center text-sm text-gray-500">{t('common.loading')}</p>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside
        className={`fixed inset-y-0 z-40 w-60 shrink-0 bg-brand p-4 text-white transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:rtl:translate-x-0'
        }`}
      >
        <p className="mb-6 text-xl font-extrabold">Mdawra Admin</p>
        <nav className="space-y-1">
          {links
            .filter((link) => !link.adminOnly || user.role === 'ADMIN')
            .map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
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
          <p className="text-white/70">{user.role}</p>
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
            <a href="/" className="btn-ghost">
              {t('brand')}
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
