import { useEffect, useState } from 'react';
import { api, apiError } from '../../lib/api';

/**
 * Foodics POS connection. Secrets are write-only: the API returns a masked
 * tail, and leaving a field blank on save keeps what is stored. Only admins
 * can load this section, so a 403 for staff simply hides it.
 */
export default function FoodicsSection() {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState({ accessToken: '', branchId: '', webhookSecret: '' });
  const [branches, setBranches] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    api
      .get('/foodics/settings')
      .then(({ data }) => {
        setSaved(data);
        setForm((f) => ({ ...f, branchId: data.branchId || '' }));
      })
      .catch((err) => (err.response?.status === 403 ? setHidden(true) : setError(apiError(err))));
  }, []);

  if (hidden) return null;

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const { data } = await api.put('/foodics/settings', form);
      setSaved(data);
      setForm({ accessToken: '', branchId: data.branchId || '', webhookSecret: '' });
      setStatus('Saved.');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const loadBranches = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.get('/foodics/branches');
      setBranches(data);
      setStatus(data.length ? 'Connected — pick the branch that should receive orders.' : 'Connected, but no branches were returned.');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const webhookUrl = saved?.webhookPath ? `${api.defaults.baseURL.replace(/\/api\/?$/, '')}${saved.webhookPath}` : '';

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">Foodics POS</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${saved?.configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {saved?.configured ? 'Connected' : 'Not configured'}
        </span>
      </div>
      <p className="-mt-1 text-xs text-gray-500">
        Every website and WhatsApp order is sent to this Foodics branch as it comes in (online payments once paid).
        Each menu item needs its Foodics product ID filled in under Menu for the push to succeed.
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {status ? <p className="text-sm text-green-700">{status}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Access token {saved?.accessToken ? <span className="text-gray-400">(saved {saved.accessToken})</span> : null}</label>
          <input
            className="input"
            type="password"
            autoComplete="off"
            placeholder={saved?.accessToken ? 'Leave blank to keep' : 'Foodics API access token'}
            value={form.accessToken}
            onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Branch ID</label>
          {branches?.length ? (
            <select className="input" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.reference ? ` (${b.reference})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              placeholder="Branch UUID from Foodics"
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            />
          )}
        </div>
        <div>
          <label className="label">
            Webhook secret {saved?.webhookSecret ? <span className="text-gray-400">(saved {saved.webhookSecret})</span> : null}
          </label>
          <input
            className="input"
            type="password"
            autoComplete="off"
            placeholder={saved?.webhookSecret ? 'Leave blank to keep' : 'Any long random string'}
            value={form.webhookSecret}
            onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Webhook URL (paste into Foodics → Integrations → Webhooks)</label>
          <input className="input" readOnly value={webhookUrl} onFocus={(e) => e.target.select()} />
          <p className="mt-1 text-xs text-gray-500">
            Subscribe to order events and send the secret above in an <code>X-Foodics-Secret</code> header.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={save}>
          Save Foodics settings
        </button>
        <button type="button" className="btn-ghost" disabled={busy || !saved?.accessToken} onClick={loadBranches}>
          Test connection &amp; list branches
        </button>
      </div>
    </section>
  );
}
