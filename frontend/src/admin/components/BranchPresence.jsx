import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { localized } from '../../lib/format';
import { agoParts } from '../../lib/waiting';

/**
 * For the owner: is each branch's order screen actually open and checking for orders? A branch that is not
 * connected cannot see its orders, so this is the first thing to look at when orders are going unanswered.
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
          <li key={branch.id} className="flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2" data-testid={`presence-${branch.id}`}>
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${branch.online ? 'bg-green-500' : 'bg-red-500'}`} aria-hidden="true" />
            <span className="min-w-0 text-sm">
              <span className="block truncate font-semibold">{localized(branch, 'name', lang)}</span>
              <span className={`block text-xs ${branch.online ? 'text-green-700' : 'text-red-700'}`}>
                {branch.online
                  ? t('admin.presence.connected')
                  : branch.lastSeenAt
                    ? t('admin.presence.lastSeen', { when: when(branch.lastSeenAt) })
                    : t('admin.presence.never')}
              </span>
              {branch.address ? <span className="block truncate text-[11px] text-gray-400">{branch.address}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
