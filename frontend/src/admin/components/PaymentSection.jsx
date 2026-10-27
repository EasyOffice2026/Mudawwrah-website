import { useEffect, useState } from 'react';
import { api, apiError } from '../../lib/api';

const ACCOUNT_TEXT = {
  own: "Your own Tap account. Customers' payments go straight to it.",
  platform: "The platform's Tap account (set up by your developer).",
  none: 'Not connected: customers cannot pay online.',
};

/**
 * Online payment (Tap). The owner saves the restaurant's own Tap secret key here: the server checks it with Tap
 * first, stores it encrypted, and never shows it again (only its last four characters). Owners only: anyone else
 * gets a 403 and the section stays hidden.
 */
export default function PaymentSection() {
  const [state, setState] = useState(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    api
      .get('/settings/payment')
      .then(({ data }) => setState(data))
      .catch((err) => (err.response?.status === 403 ? setHidden(true) : setError(apiError(err))));
  }, []);

  if (hidden) return null;

  const run = async (request, done) => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const { data } = await request();
      setState(data);
      setKey('');
      setStatus(done);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };
  const save = () => run(() => api.put('/settings/payment', { secretKey: key }), 'Saved. Tap accepted the key.');
  const remove = () => {
    if (!window.confirm('Remove your Tap key? Customers will no longer be sent to Tap to pay.')) return;
    run(() => api.delete('/settings/payment'), 'Removed.');
  };

  return (
    <section className="card space-y-3">
      <h2 className="font-bold">Online payment (Tap)</h2>
      {state ? (
        <div className="space-y-1 text-sm">
          <p>
            {ACCOUNT_TEXT[state.account]}{' '}
            {state.mode ? (
              <span
                className={`ms-1 rounded px-1.5 py-0.5 text-xs font-bold ${state.mode === 'live' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}
              >
                {state.mode === 'live' ? 'LIVE' : 'TEST'}
              </span>
            ) : null}
          </p>
          {state.keyHint ? (
            <p className="text-gray-500">
              Key:{' '}
              <span className="font-mono" dir="ltr">
                {state.keyHint}
              </span>
            </p>
          ) : null}
          {state.pilot ? <p className="text-amber-700">Test mode: only the test phone numbers are sent to the payment page.</p> : null}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Loading…</p>
      )}

      <div>
        <label className="label" htmlFor="tap-secret-key">
          {state?.account === 'own' ? 'Replace your Tap secret key' : 'Your Tap secret key'}
        </label>
        <input
          id="tap-secret-key"
          className="input font-mono"
          dir="ltr"
          type="password"
          autoComplete="off"
          placeholder="sk_live_…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-500">
          From your Tap dashboard → goSell → API Credentials: the <strong>secret</strong> key (sk_live_…), never the
          public one. It is checked with Tap before it is saved, stored encrypted, and never shown again.
        </p>
      </div>

      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}
      {status ? <p className="text-sm font-semibold text-green-600">{status}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy || !key.trim()} onClick={save}>
          {busy ? 'Checking with Tap…' : 'Check and save'}
        </button>
        {state?.account === 'own' ? (
          <button type="button" className="btn-ghost" disabled={busy} onClick={remove}>
            Remove key
          </button>
        ) : null}
      </div>
    </section>
  );
}
