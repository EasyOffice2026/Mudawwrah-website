import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError } from '../../lib/api';
import { localized } from '../../lib/format';
import { useAuth } from '../../store/auth';

/**
 * Items sold out at one branch only. A branch account always works on its own
 * branch (the server ignores any other); the owner and staff pick one first.
 *
 * The menu comes from the public category list — exactly what customers can
 * order — so an item switched off restaurant-wide in Menu & inventory is not
 * listed here at all: there is nothing left to sell out.
 */
export default function SoldOut() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isBranch = user?.role === 'BRANCH';
  const lang = i18n.language;
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [categories, setCategories] = useState(null);
  const [soldOut, setSoldOut] = useState(() => new Set());
  const [busy, setBusy] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/categories')
      .then(({ data }) => setCategories(data))
      .catch((err) => setError(apiError(err)));
    if (isBranch) return;
    api
      .get('/pickup-locations/all')
      .then(({ data }) => {
        setBranches(data);
        if (data.length === 1) setBranchId(data[0].id);
      })
      .catch((err) => setError(apiError(err)));
  }, [isBranch]);

  // A branch account's list is its own; anyone else's waits for a branch.
  const activeBranch = isBranch ? user.branchId : branchId;
  useEffect(() => {
    if (!activeBranch) return;
    api
      .get('/branch-sold-out', { params: isBranch ? {} : { branchId: activeBranch } })
      .then(({ data }) => {
        setSoldOut(new Set(data.menuItemIds));
        setError(null);
      })
      .catch((err) => setError(apiError(err)));
  }, [activeBranch, isBranch]);

  const toggle = async (itemId, value) => {
    // Flipped straight away so a busy counter isn't left waiting on the
    // network; put back if the server refuses.
    const apply = (on) =>
      setSoldOut((current) => {
        const next = new Set(current);
        if (on) next.add(itemId);
        else next.delete(itemId);
        return next;
      });
    apply(value);
    setBusy((current) => new Set(current).add(itemId));
    try {
      await api.put('/branch-sold-out', { menuItemId: itemId, soldOut: value, ...(isBranch ? {} : { branchId: activeBranch }) });
      setError(null);
    } catch (err) {
      apply(!value);
      setError(apiError(err));
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }
  };

  const term = search.trim().toLowerCase();
  const matches = (item) => !term || [item.nameEn, item.nameAr].some((name) => name?.toLowerCase().includes(term));
  const groups = (categories || [])
    .map((category) => ({ category, items: (category.items || []).filter(matches) }))
    .filter((group) => group.items.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">{t('admin.soldOut')}</h1>
        {activeBranch ? (
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
            {t('admin.soldOutPage.count', { count: soldOut.size })}
          </span>
        ) : null}
      </div>
      <p className="-mt-2 text-xs text-gray-500">{t('admin.soldOutPage.hint')}</p>

      <div className={`card grid gap-3 ${isBranch ? '' : 'sm:grid-cols-2'}`}>
        {!isBranch ? (
          <div>
            <label className="label">{t('admin.branch')}</label>
            <select
              className="input"
              value={branchId}
              onChange={(e) => {
                // Never show one branch's flags under another's name while the new list loads.
                setSoldOut(new Set());
                setBranchId(e.target.value);
              }}
            >
              <option value="">{t('admin.chooseBranch')}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {localized(branch, 'name', lang)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label className="label">{t('common.search')}</label>
          <input
            className="input"
            placeholder={t('admin.soldOutPage.searchItems')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}

      {!isBranch && !branches.length && categories ? (
        <div className="card text-center text-sm text-gray-500">{t('admin.soldOutPage.noBranches')}</div>
      ) : !activeBranch ? (
        <div className="card text-center text-sm text-gray-500">{t('admin.soldOutPage.pickBranch')}</div>
      ) : categories === null ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : !groups.length ? (
        <div className="card text-center text-sm text-gray-500">{t('common.noResults')}</div>
      ) : (
        groups.map(({ category, items }) => (
          <section key={category.id} className="card">
            <h2 className="mb-2 font-bold">{localized(category, 'name', lang)}</h2>
            <ul className="divide-y divide-gray-100">
              {items.map((item) => {
                const isSoldOut = soldOut.has(item.id);
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className={`text-sm font-semibold ${isSoldOut ? 'text-gray-400 line-through' : ''}`}>
                      {localized(item, 'name', lang)}
                    </span>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-gray-600">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand"
                        checked={isSoldOut}
                        disabled={busy.has(item.id)}
                        onChange={(e) => toggle(item.id, e.target.checked)}
                      />
                      {t('admin.soldOutPage.toggle')}
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
