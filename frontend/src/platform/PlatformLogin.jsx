import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import { setPageMeta } from '../lib/pageMeta';
import { resetTheme } from '../lib/theme';
import { useAuth } from '../store/auth';

/**
 * Sign-in for the platform operator — the reseller who runs every restaurant,
 * as opposed to a restaurant's own admin.
 *
 * Signing in here is deliberately not enough on its own: the account must also
 * belong to no single restaurant. A restaurant's admin who lands on this page
 * is signed straight back out, so a store owner can never see the console
 * listing everybody else's stores.
 */
export default function PlatformLogin() {
  const navigate = useNavigate();
  const { login, logout } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    resetTheme();
    document.documentElement.dir = 'ltr';
    setPageMeta({ title: 'Platform console', description: 'Manage every restaurant on the platform.', lang: 'en' });
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await login(form.email, form.password);
      if (user.tenantId !== null || user.role !== 'ADMIN') {
        logout();
        setError('That account manages a single restaurant. Use its own admin sign-in instead.');
        return;
      }
      navigate('/platform', { replace: true });
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
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Platform</p>
          <h1 className="mt-1 text-xl font-extrabold">Operator sign-in</h1>
          <p className="mt-1 text-xs text-gray-500">
            For the account that manages every restaurant. A single restaurant&apos;s admin signs in from its own
            store instead.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="platform-email">
            Email
          </label>
          <input
            id="platform-email"
            className="input"
            type="email"
            required
            autoComplete="username"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </div>

        <div>
          <label className="label" htmlFor="platform-password">
            Password
          </label>
          <input
            id="platform-password"
            className="input"
            type="password"
            required
            autoComplete="current-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </div>

        {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}

        <button type="submit" className="btn w-full bg-gray-900 text-white" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

/** Shared by the console so both agree on what counts as an operator. */
export const isPlatformOperator = (user) => Boolean(user) && user.tenantId === null && user.role === 'ADMIN';

/** Fetches the signed-in account, or null when the stored token is no longer good. */
export const fetchCurrentUser = async () => {
  try {
    const { data } = await api.get('/auth/me');
    return data;
  } catch {
    return null;
  }
};
