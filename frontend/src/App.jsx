import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './admin/AdminLayout.jsx';
import AdminOnly from './admin/AdminOnly.jsx';
import Banners from './admin/pages/Banners.jsx';
import Dashboard from './admin/pages/Dashboard.jsx';
import Login from './admin/pages/Login.jsx';
import MediaLibrary from './admin/pages/MediaLibrary.jsx';
import MenuManager from './admin/pages/MenuManager.jsx';
import Orders from './admin/pages/Orders.jsx';
import Settings from './admin/pages/Settings.jsx';
import Users from './admin/pages/Users.jsx';
import Menu from './customer/Menu.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Menu />} />
      <Route path="/admin/login" element={<Login />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="menu" element={<MenuManager />} />
        <Route path="orders" element={<Orders />} />
        <Route path="media" element={<MediaLibrary />} />
        <Route path="banners" element={<Banners />} />
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
  );
}
