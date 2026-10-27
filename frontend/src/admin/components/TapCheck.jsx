import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError } from '../../lib/api';
import { kwd } from '../../lib/format';

/**
 * "Check with Tap" on the daily closing: the day's payments compared with what Tap itself captured, so the day can
 * be closed without ticking every line by hand. Matching payments are ticked on the sheet; anything else is listed
 * with what to do. Staff can record a payment Tap took whose notice never reached us (Tap is asked again first).
 */
export default function TapCheck({ date, branchId, canRecord, onMatched, onRecorded }) {
  const { t } = useTranslation();
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.get('/reports/closing/tap', { params: { date, ...(branchId ? { branchId } : {}) } });
      setResult(data);
      if (data.available) onMatched(data.matched.map((row) => row.reference));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const record = async (reference) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/reports/closing/tap/${encodeURIComponent(reference)}/record`);
      onRecorded();
      await check();
    } catch (err) {
      setError(apiError(err));
      setBusy(false);
    }
  };

  const issues = result?.available
    ? [
        ['notPaidHere', result.notPaidHere],
        ['amountDiffers', result.amountDiffers],
        ['notInTap', result.notInTap],
        ['unknown', result.unknown],
      ].filter(([, rows]) => rows.length)
    : [];

  return (
    <section className="card no-print space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">{t('admin.closing.tap.title')}</h2>
          <p className="text-xs text-gray-500">{t('admin.closing.tap.intro')}</p>
        </div>
        <button type="button" className="btn-primary" disabled={busy} onClick={check}>
          {busy ? t('admin.closing.tap.checking') : t('admin.closing.tap.check')}
        </button>
      </div>

      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}

      {result && !result.available ? <p className="text-sm text-gray-500">{t('admin.closing.tap.unavailable')}</p> : null}

      {result?.available && result.ok ? (
        <p className="rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">
          ✅ {t('admin.closing.tap.allMatch', { count: result.matched.length })}
        </p>
      ) : null}

      {issues.map(([kind, rows]) => (
        <div key={kind} className="rounded-xl bg-amber-50 p-3 text-sm">
          <p className="font-bold text-amber-900">
            {t(`admin.closing.tap.${kind}.title`)} ({rows.length})
          </p>
          <p className="mb-2 text-xs text-amber-800">{t(`admin.closing.tap.${kind}.what`)}</p>
          <ul className="space-y-1">
            {rows.map((row) => (
              <li key={row.reference} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-semibold">{row.orderNumber || '—'}</span>{' '}
                  <span className="font-mono text-xs" dir="ltr">
                    {row.reference}
                  </span>{' '}
                  · {kwd(row.amount)}
                  {row.tapAmount !== undefined ? ` · Tap: ${kwd(row.tapAmount)}` : ''}
                </span>
                {kind === 'notPaidHere' && canRecord ? (
                  <button type="button" className="btn-ghost py-1 text-xs" disabled={busy} onClick={() => record(row.reference)}>
                    {t('admin.closing.tap.record')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {result?.available && !result.ok ? (
        <p className="text-xs text-gray-500">{t('admin.closing.tap.matchedSome', { count: result.matched.length })}</p>
      ) : null}
    </section>
  );
}
