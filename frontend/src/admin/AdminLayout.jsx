import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { localized } from '../lib/format';
import { applyTheme } from '../lib/theme';
import { useAuth } from '../store/auth';

// Who sees each page. ADMIN is the owner; a BRANCH account only ever gets the
// order desk (its own branch's orders and sold-out list). App.jsx enforces the
// same split on the routes, so hiding a link here is never the only guard.
const OWNER = ['ADMIN'];
const STAFF = ['ADMIN', 'STAFF'];
const DESK = ['ADMIN', 'STAFF', 'BRANCH'];

const links = [
  // Relative paths: the admin is mounted under /r/:slug/admin, so absolute
  // "/admin/..." links would leave the restaurant behind.
  { to: '', labelKey: 'admin.dashboard', end: true, roles: STAFF },
  { to: 'menu', labelKey: 'admin.menu', roles: STAFF },
  { to: 'orders', labelKey: 'admin.orders', roles: DESK },
  { to: 'sold-out', labelKey: 'admin.soldOut', roles: DESK },
  { to: 'media', labelKey: 'admin.media', roles: STAFF },
  { to: 'banners', labelKey: 'admin.banners', roles: STAFF },
  { to: 'promotions', labelKey: 'admin.promotions', roles: STAFF },
  { to: 'feedback', labelKey: 'admin.feedback', roles: STAFF },
  { to: 'zones', labelKey: 'admin.zones', roles: OWNER },
  { to: 'users', labelKey: 'admin.users', roles: OWNER },
  { to: 'settings', labelKey: 'admin.settings', roles: STAFF },
];

export default function AdminLayout() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams();
  const { user, loading, bootstrap, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [tenant, setTenant] = useState(null);
  const [branch, setBranch] = useState(null);

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

  // A branch account works under its branch's name. The public list is the one
  // it can read, and its branch is always in it: an inactive branch's account
  // cannot sign in at all.
  useEffect(() => {
    if (user?.role !== 'BRANCH' || !user.branchId) return setBranch(null);
    api
      .get('/pickup-locations')
      .then(({ data }) => setBranch(data.find((b) => b.id === user.branchId) || null))
      .catch(() => setBranch(null));
  }, [user?.role, user?.branchId, slug]);

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
        <p className="mb-6 text-xs text-white/70">{branch ? localized(branch, 'name', i18n.language) : t('admin.dashboard')}</p>
        <nav className="space-y-1">
          {links
            .filter((link) => link.roles.includes(user.role))
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
            {user.tenantId === null ? 'Platform owner · all restaurants' : t(`admin.roles.${user.role}`, user.role)}
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
            {branch ? (
              <span className="rounded-full bg-brand-light px-3 py-1 text-xs font-bold text-brand">
                {t('admin.branch')}: {localized(branch, 'name', i18n.language)}
              </span>
            ) : null}
            <a href={`/r/${slug}`} className="btn-ghost">
              {t('admin.viewStore')}
            </a>
            {/* Only the operator who runs every restaurant. A restaurant's own
                staff are given this dashboard, and must see no trace of the
                other tenants — not even a link out to a list of them. */}
            {user.tenantId === null ? (
              <a href="/platform" className="btn-ghost">
                {t('admin.allRestaurants')}
              </a>
            ) : null}
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
