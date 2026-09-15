import { useEffect, useState } from 'react';
import { api, apiError } from '../../lib/api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const blankHours = () => DAYS.map((_, day) => ({ day, open: '09:00', close: '23:00', closed: false }));

const blankBranch = () => ({
  nameEn: '',
  nameAr: '',
  addressEn: '',
  addressAr: '',
  directionsEn: '',
  phone: '',
  prepMinutes: 15,
  isActive: true,
  hours: blankHours(),
});

/** One weekday's row in the hours grid: a time range, or a "closed" toggle. */
const HoursRow = ({ row, onChange }) => (
  <div className="grid grid-cols-[3rem_1fr_1fr_auto] items-center gap-2 text-sm">
    <span className="font-semibold text-gray-600">{DAYS[row.day]}</span>
    <input
      type="time"
      className="input"
      value={row.open}
      disabled={row.closed}
      onChange={(e) => onChange({ ...row, open: e.target.value })}
    />
    <input
      type="time"
      className="input"
      value={row.close}
      disabled={row.closed}
      onChange={(e) => onChange({ ...row, close: e.target.value })}
    />
    <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-gray-500">
      <input
        type="checkbox"
        className="h-4 w-4 accent-brand"
        checked={row.closed}
        onChange={(e) => onChange({ ...row, closed: e.target.checked })}
      />
      Closed
    </label>
  </div>
);

/**
 * One branch: its details, its collection hours, and whether it is currently
 * offered at checkout.
 *
 * Held open with its own draft state rather than saving field by field — a
 * branch's hours are edited together, and a half-saved week is worse than an
 * unsaved one.
 */
const BranchCard = ({ branch, onSaved, onDeleted }) => {
  const [draft, setDraft] = useState(branch);
  const [state, setState] = useState({ saving: false, error: null, saved: false });
  const isNew = !branch.id;

  const setHourRow = (updated) =>
    setDraft((d) => ({ ...d, hours: d.hours.map((row) => (row.day === updated.day ? updated : row)) }));

  const save = async () => {
    setState({ saving: true, error: null, saved: false });
    try {
      const { data } = isNew
        ? await api.post('/pickup-locations', draft)
        : await api.put(`/pickup-locations/${branch.id}`, draft);
      setDraft(data);
      setState({ saving: false, error: null, saved: true });
      onSaved(data);
    } catch (err) {
      setState({ saving: false, error: apiError(err), saved: false });
    }
  };

  const remove = async () => {
    if (isNew) return onDeleted(null);
    if (!window.confirm(`Remove ${draft.nameEn || 'this branch'}? Past orders keep their record of it.`)) return;
    try {
      await api.delete(`/pickup-locations/${branch.id}`);
      onDeleted(branch.id);
    } catch (err) {
      setState((s) => ({ ...s, error: apiError(err) }));
    }
  };

  return (
    <div className="card space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Branch name (EN)</label>
          <input className="input" value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} />
        </div>
        <div>
          <label className="label">Branch name (AR)</label>
          <input className="input" value={draft.nameAr || ''} onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })} />
        </div>
        <div>
          <label className="label">Address (EN)</label>
          <input className="input" value={draft.addressEn || ''} onChange={(e) => setDraft({ ...draft, addressEn: e.target.value })} />
        </div>
        <div>
          <label className="label">Address (AR)</label>
          <input className="input" value={draft.addressAr || ''} onChange={(e) => setDraft({ ...draft, addressAr: e.target.value })} />
        </div>
        <div>
          <label className="label">Landmark / directions</label>
          <input
            className="input"
            placeholder="e.g. Next to the Salmiya co-op, 2nd floor"
            value={draft.directionsEn || ''}
            onChange={(e) => setDraft({ ...draft, directionsEn: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Branch phone</label>
          <input className="input" value={draft.phone || ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">Ready in (minutes)</label>
          <input
            type="number"
            min="0"
            className="input"
            value={draft.prepMinutes}
            onChange={(e) => setDraft({ ...draft, prepMinutes: Number(e.target.value) })}
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand"
            checked={draft.isActive}
            onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
          />
          Offered at checkout
        </label>
      </div>

      <div>
        <p className="label mb-2">Collection hours</p>
        <div className="space-y-1.5 rounded-xl bg-gray-50 p-3">
          {draft.hours.map((row) => (
            <HoursRow key={row.day} row={row} onChange={setHourRow} />
          ))}
        </div>
      </div>

      {state.error ? <p className="text-sm font-semibold text-red-600">{state.error}</p> : null}
      {state.saved ? <p className="text-sm font-semibold text-green-600">Saved.</p> : null}

      <div className="flex items-center gap-2">
        <button type="button" className="btn-primary" onClick={save} disabled={state.saving || !draft.nameEn.trim()}>
          {state.saving ? 'Saving…' : isNew ? 'Add branch' : 'Save changes'}
        </button>
        <button type="button" className="btn-ghost text-red-600" onClick={remove}>
          {isNew ? 'Discard' : 'Remove branch'}
        </button>
      </div>
    </div>
  );
};

export default function PickupLocationsSection() {
  const [branches, setBranches] = useState(null);
  const [error, setError] = useState(null);
  const [drafts, setDrafts] = useState([]); // not-yet-saved new branches

  const load = () =>
    api
      .get('/pickup-locations/all')
      .then(({ data }) => setBranches(data))
      .catch((err) => setError(apiError(err)));

  useEffect(() => {
    load();
  }, []);

  if (branches === null) return <p className="text-sm text-gray-500">{error || 'Loading…'}</p>;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Pickup locations</h2>
        <button type="button" className="btn-ghost" onClick={() => setDrafts((d) => [...d, blankBranch()])}>
          + Add branch
        </button>
      </div>
      <p className="-mt-1 text-xs text-gray-500">
        A customer choosing pickup at checkout picks one of these. Each keeps its own hours, so a branch closed today
        does not have to be hidden everywhere.
      </p>

      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}

      {!branches.length && !drafts.length ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
          No branches yet — the single pickup address below still applies until one is added here.
        </p>
      ) : null}

      {branches.map((branch) => (
        <BranchCard
          key={branch.id}
          branch={branch}
          onSaved={(updated) => setBranches((list) => list.map((b) => (b.id === updated.id ? updated : b)))}
          onDeleted={(id) => setBranches((list) => list.filter((b) => b.id !== id))}
        />
      ))}

      {drafts.map((draft, index) => (
        <BranchCard
          // A fresh key per discard/re-add so a cleared draft doesn't reuse state.
          key={`draft-${index}`}
          branch={draft}
          onSaved={(created) => {
            setDrafts((list) => list.filter((_, i) => i !== index));
            setBranches((list) => [...list, created]);
          }}
          onDeleted={() => setDrafts((list) => list.filter((_, i) => i !== index))}
        />
      ))}
    </section>
  );
}
