import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { apiError } from '../../lib/api';
import { useAuth } from '../../store/auth';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(form.email, form.password);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <h1 className="text-xl font-extrabold text-brand">{t('admin.login')}</h1>
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
