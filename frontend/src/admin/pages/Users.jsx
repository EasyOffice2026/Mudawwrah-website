import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal.jsx';
import { api, apiError } from '../../lib/api';
import { dateTime, kwd } from '../../lib/format';

const ROLES = ['ADMIN', 'STAFF', 'CUSTOMER'];
const empty = { email: '', password: '', name: '', phone: '', role: 'STAFF', isActive: true };

export default function Users() {
  const { t, i18n } = useTranslation();
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ role: '', search: '' });
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const params = {};
      if (filters.role) params.role = filters.role;
      if (filters.search) params.search = filters.search;
      const { data } = await api.get('/users', { params });
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(apiError(err));
    }
  };

  useEffect(() => {
    load();
  }, [filters]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { id, _count, createdAt, orders, ...rest } = form;
      if (id) {
        const payload = { ...rest };
        if (!payload.password) delete payload.password;
        await api.put(`/users/${id}`, payload);
      } else {
        await api.post('/users', rest);
      }
      setForm(null);
      await load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      await api.delete(`/users/${id}`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  const openDetail = async (id) => {
    try {
      const { data } = await api.get(`/users/${id}`);
      setDetail(data);
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">{t('admin.users')}</h1>
        <button type="button" className="btn-primary" onClick={() => setForm({ ...empty })}>
          {t('common.create')}
        </button>
      </div>

      <div className="card grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">{t('admin.role')}</label>
          <select className="input" value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('common.search')}</label>
          <input className="input" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        </div>
      </div>

      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2 text-start">Name</th>
              <th className="py-2 text-start">Email</th>
              <th className="py-2 text-start">{t('admin.role')}</th>
              <th className="py-2 text-start">{t('admin.active')}</th>
              <th className="py-2 text-start">{t('admin.orders')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-gray-100">
                <td className="py-2 font-semibold">{user.name}</td>
                <td className="py-2 text-gray-500">{user.email}</td>
                <td className="py-2">{user.role}</td>
                <td className="py-2">{user.isActive ? t('common.yes') : t('common.no')}</td>
                <td className="py-2">{user._count?.orders ?? 0}</td>
                <td className="py-2 text-end">
                  <div className="flex justify-end gap-3 text-xs">
                    <button type="button" className="underline" onClick={() => openDetail(user.id)}>
                      {t('admin.view')}
                    </button>
                    <button type="button" className="underline" onClick={() => setForm({ ...user, password: '' })}>
                      {t('common.edit')}
                    </button>
                    <button type="button" className="text-brand underline" onClick={() => remove(user.id)}>
                      {t('common.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!users.length ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-500">
                  {t('common.noResults')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? t('common.edit') : t('common.create')}
        footer={
          <button type="submit" form="user-form" className="btn-primary w-full" disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        }
      >
        {form ? (
          <form id="user-form" onSubmit={save} className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('admin.email')}</label>
              <input type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">
                {t('admin.password')} {form.id ? '(leave blank to keep)' : ''}
              </label>
              <input
                type="password"
                className="input"
                required={!form.id}
                value={form.password || ''}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('admin.role')}</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                checked={Boolean(form.isActive)}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              {t('admin.active')}
            </label>
          </form>
        ) : null}
      </Modal>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.name} size="lg">
        {detail ? (
          <div className="space-y-3 text-sm">
            <p className="text-gray-500">
              {detail.email} · {detail.role}
            </p>
            <h4 className="font-bold">{t('admin.orders')}</h4>
            {!detail.orders?.length ? (
              <p className="text-gray-500">{t('common.noResults')}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {detail.orders.map((order) => (
                  <li key={order.id} className="flex justify-between py-2">
                    <span>
                      {order.orderNumber}
                      <span className="ms-2 text-xs text-gray-500">{dateTime(order.createdAt, i18n.language)}</span>
                    </span>
                    <span className="font-semibold">{kwd(order.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
