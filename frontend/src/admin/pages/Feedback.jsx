import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError } from '../../lib/api';
import { dateTime, kwd } from '../../lib/format';

export default function Feedback() {
  const { t, i18n } = useTranslation();
  const [result, setResult] = useState({ data: [], total: 0, page: 1, pageSize: 20, averageRating: null });
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/feedback', { params: { page, pageSize: 20 } })
      .then(({ data }) => setResult(data))
      .catch((err) => setError(apiError(err)));
  }, [page]);

  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">{t('admin.feedback')}</h1>

      <div className="card flex items-center justify-between">
        <span className="text-sm text-gray-500">{t('admin.averageRating')}</span>
        <span className="text-lg font-extrabold">{result.averageRating ?? '—'}</span>
      </div>

      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-start text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2 text-start">{t('admin.orderNumber')}</th>
              <th className="py-2 text-start">{t('admin.customer')}</th>
              <th className="py-2 text-start">{t('admin.rating')}</th>
              <th className="py-2 text-start">{t('admin.comment')}</th>
              <th className="py-2 text-end">{t('admin.total')}</th>
              <th className="py-2 text-start">{t('admin.placedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="py-2 font-semibold">{row.order?.orderNumber}</td>
                <td className="py-2">
                  {row.order?.customerName}
                  <span className="block text-xs text-gray-500">{row.phone}</span>
                </td>
                <td className="py-2">{'⭐'.repeat(row.rating)}</td>
                <td className="py-2 text-gray-600">{row.comment || '—'}</td>
                <td className="py-2 text-end font-semibold">{kwd(row.order?.total)}</td>
                <td className="py-2 text-gray-500">{dateTime(row.createdAt, i18n.language)}</td>
              </tr>
            ))}
            {!result.data.length ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-500">
                  {t('common.noResults')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {pages > 1 ? (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm">
            <button type="button" className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ‹
            </button>
            <span>
              {page} / {pages}
            </span>
            <button type="button" className="btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              ›
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
