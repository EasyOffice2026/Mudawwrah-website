import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { localized } from '../../lib/format';
import { agoParts } from '../../lib/waiting';

/** One part of a branch (its order screen, or its printer): a dot and "Connected" or when it was last seen. */
const Line = ({ label, seen, missing, when, t }) => (
  <span className="mt-0.5 flex items-center gap-1.5 text-xs">
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${seen?.online ? 'bg-green-500' : seen?.lastSeenAt ? 'bg-red-500' : 'bg-gray-300'}`}
      aria-hidden="true"
    />
    <span className="text-gray-600">{label}:</span>
    <span className={seen?.online ? 'font-semibold text-green-700' : seen?.lastSeenAt ? 'font-semibold text-red-700' : 'text-gray-500'}>
      {seen?.online ? t('admin.presence.connected') : seen?.lastSeenAt ? t('admin.presence.lastSeen', { when: when(seen.lastSeenAt) }) : missing}
    </span>
  </span>
);

/**
 * For the owner: is each branch's order screen actually open and checking for orders, and is its printer (the print
 * station, in Chrome or the Sunmi app) running? A branch that is not connected cannot see or print its orders, so
 * this is the first thing to look at when orders are going unanswered.
 */
export default function BranchPresence() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [branches, setBranches] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get('/branches/presence')
        .then(({ data }) => alive && setBranches(data))
        .catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!branches?.length) return null;
  const when = (iso) => {
    const { key, count } = agoParts(iso);
    return t(`admin.presence.when.${key}`, { count });
  };

  return (
    <section className="card" data-testid="branch-presence">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">{t('admin.presence.title')}</h2>
        <p className="text-xs text-gray-500">{t('admin.presence.hint')}</p>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {branches.map((branch) => (
          <li key={branch.id} className="rounded-xl bg-gray-50 px-3 py-2" data-testid={`presence-${branch.id}`}>
            <span className="block truncate text-sm font-semibold">{localized(branch, 'name', lang)}</span>
            <Line label={t('admin.presence.screen')} seen={branch} missing={t('admin.presence.never')} when={when} t={t} />
            <Line label={t('admin.presence.printer')} seen={branch.printer} missing={t('admin.presence.noPrinter')} when={when} t={t} />
            {branch.address ? <span className="block truncate text-[11px] text-gray-400">{branch.address}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
