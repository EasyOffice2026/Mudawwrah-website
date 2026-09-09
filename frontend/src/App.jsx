import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AdminOnly from './admin/AdminOnly.jsx';
import Menu from './customer/Menu.jsx';
import RestaurantPicker from './platform/RestaurantPicker.jsx';

// The admin panel (and its charting library) is loaded on demand, so a
// customer opening the menu on mobile data never downloads it.
const AdminLayout = lazy(() => import('./admin/AdminLayout.jsx'));
const Banners = lazy(() => import('./admin/pages/Banners.jsx'));
const Dashboard = lazy(() => import('./admin/pages/Dashboard.jsx'));
const Feedback = lazy(() => import('./admin/pages/Feedback.jsx'));
const Login = lazy(() => import('./admin/pages/Login.jsx'));
const MediaLibrary = lazy(() => import('./admin/pages/MediaLibrary.jsx'));
const MenuManager = lazy(() => import('./admin/pages/MenuManager.jsx'));
const Orders = lazy(() => import('./admin/pages/Orders.jsx'));
const Settings = lazy(() => import('./admin/pages/Settings.jsx'));
const Users = lazy(() => import('./admin/pages/Users.jsx'));

export default function App() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-gray-500">Loading…</p>}>
    <Routes>
      {/* Platform level — every restaurant running on the same codebase. */}
      <Route path="/" element={<RestaurantPicker />} />

      {/* One restaurant. In production this is also reachable at
          <slug>.yourplatform.com or the restaurant's own domain. */}
      <Route path="/r/:slug" element={<Menu />} />
      <Route path="/r/:slug/admin/login" element={<Login />} />
      <Route path="/r/:slug/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="menu" element={<MenuManager />} />
        <Route path="orders" element={<Orders />} />
        <Route path="media" element={<MediaLibrary />} />
        <Route path="banners" element={<Banners />} />
        <Route path="feedback" element={<Feedback />} />
        <Route path="feedback" element={<Feedback />} />
        <Route
          path="users"
          element={
            <AdminOnly>
              <Users />
            </AdminOnly>
          }
        />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
