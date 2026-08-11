import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { localized } from '../../lib/format';
import { applyTheme } from '../../lib/theme';
import { useAuth } from '../../store/auth';

export default function Login() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    api
      .get('/tenants/current')
      .then(({ data }) => {
        setTenant(data);
        applyTheme(data);
      })
      .catch(() => {});
  }, [slug]);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(form.email, form.password);
      navigate(`/r/${slug}/admin`, { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-extrabold text-brand">
            {tenant ? localized(tenant, 'name', i18n.language) : t('admin.login')}
          </h1>
          <p className="text-xs text-gray-500">{t('admin.login')}</p>
        </div>
        <div>
          <label className="label">{t('admin.email')}</label>
          <input
            className="input"
            type="email"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </div>
        <div>
          <label className="label">{t('admin.password')}</label>
          <input
            className="input"
            type="password"
            required
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </div>
        {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? t('common.loading') : t('admin.signIn')}
        </button>
      </form>
    </div>
  );
}
