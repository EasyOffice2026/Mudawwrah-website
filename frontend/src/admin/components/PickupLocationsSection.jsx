import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError } from '../../lib/api';
import { useAuth } from '../../store/auth';

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const FRIDAY = 5;
// Friday prayer, when most branches here stop taking orders.
const PRAYER_BREAK = { from: '11:00', to: '12:00' };
// Equal open and close is how the API stores "open 24 hours".
const ALL_DAY = '00:00';

const blankHours = () => DAYS.map((day) => ({ day, open: '09:00', close: '23:00', closed: false, breaks: [] }));

const blankBranch = () => ({
  nameEn: '',
  nameAr: '',
  addressEn: '',
  addressAr: '',
  directionsEn: '',
  phone: '',
  prepMinutes: 15,
  isActive: true,
  allowedIps: [],
  hours: blankHours(),
});

/** Branches saved before breaks existed have rows without them; give every row the full shape. */
const withBreaks = (hours) => (hours?.length ? hours : blankHours()).map((row) => ({ ...row, breaks: row.breaks || [] }));

/**
 * One weekday's row in the hours grid: a time range (or 24 hours), a
 * "closed" toggle, and any breaks inside the day such as Friday prayer.
 */
const HoursRow = ({ row, onChange }) => {
  const { t } = useTranslation();
  const allDay = row.open === row.close;
  const setBreak = (index, updated) => onChange({ ...row, breaks: row.breaks.map((b, i) => (i === index ? updated : b)) });

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[4.5rem_1fr_1fr] items-center gap-2 text-sm sm:grid-cols-[4.5rem_1fr_1fr_auto]">
        <span className="font-semibold text-gray-600">{t(`admin.days.${row.day}`)}</span>
        <input
          type="time"
          className="input"
          value={row.open}
          disabled={row.closed || allDay}
          onChange={(e) => onChange({ ...row, open: e.target.value })}
        />
        <input
          type="time"
          className="input"
          value={row.close}
          disabled={row.closed || allDay}
          onChange={(e) => onChange({ ...row, close: e.target.value })}
        />
        <div className="col-span-3 flex items-center gap-4 sm:col-span-1">
          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-gray-500">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand"
              checked={allDay}
              disabled={row.closed}
              onChange={(e) =>
                onChange(e.target.checked ? { ...row, open: ALL_DAY, close: ALL_DAY } : { ...row, open: '09:00', close: '23:00' })
              }
            />
            {t('admin.branches.allDay')}
          </label>
          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-gray-500">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand"
              checked={row.closed}
              onChange={(e) => onChange({ ...row, closed: e.target.checked })}
            />
            {t('admin.branches.closed')}
          </label>
          {!row.closed && row.breaks.length < 4 ? (
            <button
              type="button"
              className="whitespace-nowrap text-xs font-semibold text-brand underline disabled:hidden"
              onClick={() => onChange({ ...row, breaks: [...row.breaks, { ...PRAYER_BREAK }] })}
            >
              {t('admin.branches.addBreak')}
            </button>
          ) : null}
        </div>
      </div>
      {!row.closed
        ? row.breaks.map((brk, index) => (
            <div key={index} className="grid grid-cols-[4.5rem_1fr_1fr_auto] items-center gap-2 text-sm">
              <span className="text-xs text-gray-500">{t('admin.branches.breakLabel')}</span>
              <input type="time" className="input py-2" value={brk.from} onChange={(e) => setBreak(index, { ...brk, from: e.target.value })} />
              <input type="time" className="input py-2" value={brk.to} onChange={(e) => setBreak(index, { ...brk, to: e.target.value })} />
              <button
                type="button"
                aria-label={t('admin.branches.removeBreak')}
                title={t('admin.branches.removeBreak')}
                className="rounded-full px-2 text-lg leading-none text-gray-400 hover:bg-gray-100 disabled:hidden"
                onClick={() => onChange({ ...row, breaks: row.breaks.filter((_, i) => i !== index) })}
              >
                ×
              </button>
            </div>
          ))
        : null}
    </div>
  );
};

/**
 * One branch: its details, its opening hours, the static IPs its staff may
 * sign in from, and whether it is currently offered at checkout.
 *
 * Held open with its own draft state rather than saving field by field — a
 * branch's hours are edited together, and a half-saved week is worse than an
 * unsaved one. Only the owner may save; staff see the same card read-only.
 */
const BranchCard = ({ branch, canEdit, onSaved, onDeleted }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => ({ ...branch, hours: withBreaks(branch.hours) }));
  // Kept exactly as typed, so a half-written line isn't eaten mid-keystroke;
  // turned into a list only on save.
  const [ipsText, setIpsText] = useState(() => (branch.allowedIps || []).join('\n'));
  const [state, setState] = useState({ saving: false, error: null, saved: false });
  const isNew = !branch.id;

  const setHourRow = (updated) =>
    setDraft((d) => ({ ...d, hours: d.hours.map((row) => (row.day === updated.day ? updated : row)) }));

  const friday = draft.hours.find((row) => row.day === FRIDAY);
  const canAddPrayerBreak =
    friday && !friday.closed && !friday.breaks.some((b) => b.from === PRAYER_BREAK.from && b.to === PRAYER_BREAK.to);

  const save = async () => {
    setState({ saving: true, error: null, saved: false });
    try {
      const payload = {
        ...draft,
        allowedIps: ipsText
          .split(/[\s,]+/)
          .map((ip) => ip.trim())
          .filter(Boolean),
      };
      const { data } = isNew ? await api.post('/pickup-locations', payload) : await api.put(`/pickup-locations/${branch.id}`, payload);
      setDraft({ ...data, hours: withBreaks(data.hours) });
      setIpsText((data.allowedIps || []).join('\n'));
      setState({ saving: false, error: null, saved: true });
      onSaved(data);
    } catch (err) {
      setState({ saving: false, error: apiError(err), saved: false });
    }
  };

  const remove = async () => {
    if (isNew) return onDeleted(null);
    if (!window.confirm(t('admin.branches.confirmRemove', { name: draft.nameEn || t('admin.branches.thisBranch') }))) return;
    try {
      await api.delete(`/pickup-locations/${branch.id}`);
      onDeleted(branch.id);
    } catch (err) {
      setState((s) => ({ ...s, error: apiError(err) }));
    }
  };

  return (
    <div className="card space-y-4">
      {/* A disabled fieldset makes every control inside read-only in one place. */}
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t('admin.branches.nameEn')}</label>
            <input className="input" value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('admin.branches.nameAr')}</label>
            <input className="input" dir="rtl" value={draft.nameAr || ''} onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('admin.branches.addressEn')}</label>
            <input className="input" value={draft.addressEn || ''} onChange={(e) => setDraft({ ...draft, addressEn: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('admin.branches.addressAr')}</label>
            <input
              className="input"
              dir="rtl"
              value={draft.addressAr || ''}
              onChange={(e) => setDraft({ ...draft, addressAr: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{t('admin.branches.directions')}</label>
            <input
              className="input"
              placeholder={t('admin.branches.directionsPlaceholder')}
              value={draft.directionsEn || ''}
              onChange={(e) => setDraft({ ...draft, directionsEn: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{t('admin.branches.phone')}</label>
            <input className="input" value={draft.phone || ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('admin.branches.prepMinutes')}</label>
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
            {t('admin.branches.offered')}
          </label>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="label mb-0">{t('admin.branches.hours')}</p>
            {canEdit && canAddPrayerBreak ? (
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-xs"
                onClick={() => setHourRow({ ...friday, breaks: [...friday.breaks, { ...PRAYER_BREAK }] })}
              >
                {t('admin.branches.fridayPrayer')}
              </button>
            ) : null}
          </div>
          <div className="space-y-2.5 rounded-xl bg-gray-50 p-3">
            {draft.hours.map((row) => (
              <HoursRow key={row.day} row={row} onChange={setHourRow} />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-gray-500">{t('admin.branches.hoursHint')}</p>
        </div>

        <div>
          <label className="label">{t('admin.branches.allowedIps')}</label>
          <textarea
            className="input min-h-[4.5rem] font-mono"
            dir="ltr"
            rows={3}
            placeholder={t('admin.branches.allowedIpsPlaceholder')}
            value={ipsText}
            onChange={(e) => setIpsText(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">{t('admin.branches.allowedIpsHint')}</p>
        </div>
      </fieldset>

      {state.error ? <p className="text-sm font-semibold text-red-600">{state.error}</p> : null}
      {state.saved ? <p className="text-sm font-semibold text-green-600">{t('admin.branches.saved')}</p> : null}

      {canEdit ? (
        <div className="flex items-center gap-2">
          <button type="button" className="btn-primary" onClick={save} disabled={state.saving || !draft.nameEn.trim()}>
            {state.saving ? t('common.saving') : isNew ? t('admin.branches.addBranch') : t('admin.branches.saveChanges')}
          </button>
          <button type="button" className="btn-ghost text-red-600" onClick={remove}>
            {isNew ? t('admin.branches.discard') : t('admin.branches.remove')}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default function PickupLocationsSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Hours and allowed IPs decide when a branch trades and where its accounts
  // may sign in, so only the owner changes them (the API refuses anyone else).
  const canEdit = user?.role === 'ADMIN';
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

  if (branches === null) return <p className="text-sm text-gray-500">{error || t('common.loading')}</p>;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{t('admin.branches.title')}</h2>
        {canEdit ? (
          <button type="button" className="btn-ghost" onClick={() => setDrafts((d) => [...d, blankBranch()])}>
            {t('admin.branches.add')}
          </button>
        ) : null}
      </div>
      <p className="-mt-1 text-xs text-gray-500">{t('admin.branches.intro')}</p>
      {!canEdit ? <p className="text-xs font-semibold text-gray-600">{t('admin.branches.ownerOnly')}</p> : null}

      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}

      {!branches.length && !drafts.length ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">{t('admin.branches.none')}</p>
      ) : null}

      {branches.map((branch) => (
        <BranchCard
          key={branch.id}
          branch={branch}
          canEdit={canEdit}
          onSaved={(updated) => setBranches((list) => list.map((b) => (b.id === updated.id ? updated : b)))}
          onDeleted={(id) => setBranches((list) => list.filter((b) => b.id !== id))}
        />
      ))}

      {drafts.map((draft, index) => (
        <BranchCard
          // A fresh key per discard/re-add so a cleared draft doesn't reuse state.
          key={`draft-${index}`}
          branch={draft}
          canEdit={canEdit}
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
