import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import { setPageMeta } from '../lib/pageMeta';
import { resetTheme } from '../lib/theme';
import { useAuth } from '../store/auth';
import { fetchCurrentUser, isPlatformOperator } from './PlatformLogin.jsx';

/**
 * One row per restaurant: where it can be reached, and which domain serves it.
 *
 * The domain is edited here rather than in a restaurant's own settings because
 * a hostname is claimed platform-wide — letting a store set it for itself would
 * let it take a name another store is using.
 */
const StoreRow = ({ tenant, counts, onSaved }) => {
  const [domain, setDomain] = useState(tenant.customDomain || '');
  const [state, setState] = useState({ saving: false, error: null, saved: false });

  const [waPhoneNumberId, setWaPhoneNumberId] = useState(tenant.whatsappPhoneNumberId || '');
  const [waState, setWaState] = useState({ saving: false, error: null, saved: false });

  const dirty = (tenant.customDomain || '') !== domain.trim();
  const waDirty = (tenant.whatsappPhoneNumberId || '') !== waPhoneNumberId.trim();

  const save = async () => {
    setState({ saving: true, error: null, saved: false });
    try {
      // An empty field means "no domain", which has to reach the API as null —
      // an empty string would sit in the column as a hostname nobody can use.
      const { data } = await api.put(`/tenants/${tenant.id}`, { customDomain: domain.trim() || null });
      setState({ saving: false, error: null, saved: true });
      onSaved(data);
    } catch (err) {
      setState({ saving: false, error: apiError(err), saved: false });
    }
  };

  const saveWaPhoneNumberId = async () => {
    setWaState({ saving: true, error: null, saved: false });
    try {
      const { data } = await api.put(`/tenants/${tenant.id}`, {
        whatsappPhoneNumberId: waPhoneNumberId.trim() || null,
      });
      setWaState({ saving: false, error: null, saved: true });
      onSaved(data);
    } catch (err) {
      setWaState({ saving: false, error: apiError(err), saved: false });
    }
  };

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
            style={{ backgroundColor: tenant.brandColor || '#111827' }}
          >
            {(tenant.nameEn || tenant.slug).slice(0, 2).toUpperCase()}
          </span>
          <div>
            <p className="text-base font-extrabold leading-tight">{tenant.nameEn}</p>
            <p className="text-xs text-gray-500">
              /r/{tenant.slug}
              {counts ? ` · ${counts.items} items · ${counts.categories} categories` : ''} · {tenant.currency}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              tenant.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
            }`}
          >
            {tenant.isActive ? 'Live' : 'Disabled'}
          </span>
          <Link to={`/r/${tenant.slug}`} className="btn-ghost text-xs">
            Storefront
          </Link>
          <Link to={`/r/${tenant.slug}/admin`} className="btn bg-gray-900 text-xs text-white">
            Its dashboard
          </Link>
        </div>
      </div>

      <div className="rounded-xl bg-gray-50 p-3">
        <label className="label" htmlFor={`domain-${tenant.id}`}>
          Own domain
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={`domain-${tenant.id}`}
            className="input min-w-0 flex-1"
            placeholder="order.restaurant.com — leave empty for none"
            value={domain}
            onChange={(event) => {
              setDomain(event.target.value);
              setState((s) => ({ ...s, saved: false }));
            }}
          />
          <button type="button" className="btn bg-gray-900 text-white" onClick={save} disabled={!dirty || state.saving}>
            {state.saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {state.error ? <p className="mt-2 text-xs font-semibold text-red-600">{state.error}</p> : null}
        {state.saved ? (
          <p className="mt-2 text-xs font-semibold text-green-700">
            Saved. Point this hostname at the platform and it serves {tenant.nameEn}.
          </p>
        ) : null}
        {!state.error && !state.saved ? (
          <p className="mt-2 text-xs text-gray-500">
            Also always reachable at <code>{tenant.slug}</code>.yourplatform.com and /r/{tenant.slug}.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl bg-gray-50 p-3">
        <label className="label" htmlFor={`wa-phone-${tenant.id}`}>
          WhatsApp phone number ID
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={`wa-phone-${tenant.id}`}
            className="input min-w-0 flex-1"
            placeholder="From Meta's WhatsApp Cloud API — leave empty to disable"
            value={waPhoneNumberId}
            onChange={(event) => {
              setWaPhoneNumberId(event.target.value);
              setWaState((s) => ({ ...s, saved: false }));
            }}
          />
          <button
            type="button"
            className="btn bg-gray-900 text-white"
            onClick={saveWaPhoneNumberId}
            disabled={!waDirty || waState.saving}
          >
            {waState.saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {waState.error ? <p className="mt-2 text-xs font-semibold text-red-600">{waState.error}</p> : null}
        {waState.saved ? (
          <p className="mt-2 text-xs font-semibold text-green-700">
            Saved. Messages to this WhatsApp number now route to {tenant.nameEn}.
          </p>
        ) : null}
        {!waState.error && !waState.saved ? (
          <p className="mt-2 text-xs text-gray-500">
            Which of the business's registered WhatsApp numbers the bot answers as this restaurant.
          </p>
        ) : null}
      </div>
    </div>
  );
};

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);

/**
 * A brand new restaurant, plus the one account that can sign into it.
 *
 * Both are created together — a restaurant with no admin is a dead end that
 * would need a developer to fix by hand, which is exactly what this button
 * exists to avoid. The password is generated on the server and shown here
 * exactly once, the same rule Settings follows for tracking IDs and the
 * rotate-credentials script follows for staff passwords: nothing this
 * sensitive is ever typed into a form.
 */
const NewRestaurantForm = ({ onCreated, onCancel }) => {
  const [form, setForm] = useState({ nameEn: '', nameAr: '', slug: '', adminEmail: '', brandColor: '#B00020' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [state, setState] = useState({ saving: false, error: null });
  const [created, setCreated] = useState(null);

  const setField = (key) => (event) => {
    const value = event.target.value;
    setForm((f) => ({
      ...f,
      [key]: value,
      // Follows the name into a slug until the operator edits the slug
      // themselves — after that, typing the name faster never overwrites
      // a slug they deliberately changed.
      ...(key === 'nameEn' && !slugTouched ? { slug: slugify(value) } : {}),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null });
    try {
      const { data } = await api.post('/tenants', form);
      setCreated(data);
    } catch (err) {
      setState({ saving: false, error: apiError(err) });
    }
  };

  if (created) {
    return (
      <div className="card space-y-3 border-2 border-green-600">
        <p className="font-bold text-green-700">{created.tenant.nameEn} is live.</p>
        <div className="rounded-xl bg-gray-50 p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Its admin sign-in</p>
          <p className="mt-1">
            Dashboard: <code>/r/{created.tenant.slug}/admin</code>
          </p>
          <p>
            Email: <code>{created.admin.email}</code>
          </p>
          <p>
            Password: <code className="font-bold">{created.admin.password}</code>
          </p>
          <p className="mt-2 text-xs font-semibold text-red-600">
            Shown once — copy it now. Send it to whoever runs this restaurant over a different channel than
            wherever you send the dashboard link.
          </p>
        </div>
        <button type="button" className="btn bg-gray-900 text-white" onClick={() => onCreated(created.tenant)}>
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <p className="font-bold">New restaurant</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Name (EN)</label>
          <input className="input" required value={form.nameEn} onChange={setField('nameEn')} />
        </div>
        <div>
          <label className="label">Name (AR)</label>
          <input className="input" required value={form.nameAr} onChange={setField('nameAr')} dir="rtl" />
        </div>
        <div>
          <label className="label">Web address</label>
          <div className="flex items-center gap-1 text-sm text-gray-500">
            <span className="shrink-0">/r/</span>
            <input
              className="input"
              required
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm((f) => ({ ...f, slug: slugify(e.target.value) }));
              }}
            />
          </div>
        </div>
        <div>
          <label className="label">Brand colour</label>
          <input type="color" className="h-10 w-full rounded-lg border border-gray-200" value={form.brandColor} onChange={setField('brandColor')} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Admin email — who signs into this restaurant's dashboard</label>
          <input type="email" className="input" required value={form.adminEmail} onChange={setField('adminEmail')} />
        </div>
      </div>

      {state.error ? <p className="text-sm font-semibold text-red-600">{state.error}</p> : null}

      <div className="flex items-center gap-2">
        <button type="submit" className="btn bg-gray-900 text-white" disabled={state.saving}>
          {state.saving ? 'Creating…' : 'Create restaurant'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
};

export default function PlatformConsole() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [counts, setCounts] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addingRestaurant, setAddingRestaurant] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // /tenants/all is the operator's view and includes disabled stores;
      // the public list is read alongside it purely for the menu counts.
      const [all, pub] = await Promise.all([api.get('/tenants/all'), api.get('/tenants').catch(() => ({ data: [] }))]);
      setTenants(all.data);
      setCounts(
        Object.fromEntries(
          pub.data.map((t) => [t.slug, { items: t._count?.items ?? 0, categories: t._count?.categories ?? 0 }]),
        ),
      );
      setError(null);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    resetTheme();
    document.documentElement.dir = 'ltr';
    setPageMeta({ title: 'Platform console', description: 'Manage every restaurant on the platform.', lang: 'en' });

    // The token alone is not the check — a restaurant's own admin holds a valid
    // token too, and must not be able to open this page by typing the URL.
    fetchCurrentUser().then((user) => {
      if (!isPlatformOperator(user)) {
        navigate('/platform/login', { replace: true });
        return;
      }
      load();
    });
  }, []);

  const signOut = () => {
    logout();
    navigate('/platform/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-end justify-between gap-3 px-4 py-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Platform console</p>
            <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Every restaurant</h1>
            <p className="mt-2 max-w-xl text-sm text-gray-600">
              Each one keeps its own menu, orders, staff and dashboard. Nothing is shared between them.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!addingRestaurant ? (
              <button type="button" className="btn bg-gray-900 text-white" onClick={() => setAddingRestaurant(true)}>
                + Add restaurant
              </button>
            ) : null}
            <button type="button" className="btn-ghost" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        {addingRestaurant ? (
          <NewRestaurantForm
            onCancel={() => setAddingRestaurant(false)}
            onCreated={() => {
              setAddingRestaurant(false);
              load();
            }}
          />
        ) : null}

        {loading ? <p className="py-10 text-center text-sm text-gray-500">Loading restaurants…</p> : null}

        {error ? (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold text-red-600">{error}</p>
            <button type="button" className="btn-ghost mt-3" onClick={load}>
              Retry
            </button>
          </div>
        ) : null}

        {tenants.map((tenant) => (
          <StoreRow
            key={tenant.id}
            tenant={tenant}
            counts={counts[tenant.slug]}
            onSaved={(updated) => setTenants((list) => list.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)))}
          />
        ))}

        {!loading && !error ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-600">
            <p className="font-semibold text-gray-800">Connecting a restaurant&apos;s own domain</p>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>Enter the hostname above and save it.</li>
              <li>Add the domain to the hosting project so it answers on HTTPS.</li>
              <li>
                At the registrar, point the hostname at the platform — a CNAME for a subdomain such as
                <code> order.restaurant.com</code>, or the host&apos;s A record for a bare domain.
              </li>
              <li>Once DNS resolves, that hostname serves this restaurant with no code change.</li>
            </ol>
          </div>
        ) : null}
      </main>
    </div>
  );
}
