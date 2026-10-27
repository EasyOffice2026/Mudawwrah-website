import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal.jsx';
import { api, apiError } from '../../lib/api';
import { parseCsv, rowsFromTable, templateTable } from '../../lib/menuSheet';
import { downloadWorkbook } from '../reports/reportExport.js';

/**
 * "Import from Excel": the whole menu (or new prices) from one spreadsheet. The file is read here, the server
 * checks every row and shows what it would create or update, and only "Import" changes the menu, all at once.
 * Nothing is ever deleted; pictures are added afterwards.
 */
export default function MenuImport({ open, onClose, onImported }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const reset = () => {
    setRows(null);
    setPreview(null);
    setError(null);
    setDone(null);
    setFileName('');
  };
  const close = () => {
    reset();
    onClose();
  };

  const downloadTemplate = () =>
    downloadWorkbook([{ sheet: 'Menu', data: templateTable(), columns: templateTable()[0].map(() => ({ width: 22 })) }], 'menu-template.xlsx');

  const choose = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    reset();
    setFileName(file.name);
    setBusy(true);
    try {
      const table = /\.csv$/i.test(file.name)
        ? parseCsv(await file.text())
        : await import('read-excel-file/browser').then(({ readSheet }) => readSheet(file));
      const read = rowsFromTable(table);
      if (!read.length) throw new Error(t('admin.menuImport.empty'));
      setRows(read);
      const { data } = await api.post('/menu/import/preview', { rows: read });
      setPreview(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const importNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post('/menu/import', { rows });
      setDone(data);
      setPreview(null);
      onImported();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const issues = preview?.rows.filter((r) => r.action === 'error') || [];
  const changes = preview?.rows.filter((r) => r.action === 'create' || r.action === 'update') || [];

  return (
    <Modal open={open} onClose={close} title={t('admin.menuImport.title')} size="lg">
      <div className="space-y-4 text-sm">
        <p className="text-gray-600">{t('admin.menuImport.intro')}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={downloadTemplate}>
            {t('admin.menuImport.template')}
          </button>
          <label className="btn-primary cursor-pointer">
            {busy ? t('admin.menuImport.reading') : t('admin.menuImport.choose')}
            <input type="file" accept=".xlsx,.csv" className="hidden" disabled={busy} onChange={choose} />
          </label>
        </div>
        {fileName ? <p className="text-xs text-gray-500">{fileName}</p> : null}
        {error ? <p className="font-semibold text-brand">{error}</p> : null}

        {preview ? (
          <div className="space-y-3">
            <p className="font-semibold">
              {t('admin.menuImport.summary', { create: preview.create, update: preview.update, unchanged: preview.unchanged })}
              {preview.newCategories.length ? ` ${t('admin.menuImport.newCategories', { names: preview.newCategories.join(', ') })}` : ''}
            </p>
            {issues.length ? (
              <div className="rounded-xl bg-red-50 p-3 text-red-800">
                <p className="font-bold">{t('admin.menuImport.fixFirst', { count: issues.length })}</p>
                <ul className="mt-1 space-y-0.5">
                  {issues.slice(0, 50).map((r) => (
                    <li key={r.row}>
                      {t('admin.menuImport.row', { row: r.row })}
                      {r.name ? ` (${r.name})` : ''}: {r.error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {changes.length ? (
              <div className="max-h-64 overflow-y-auto rounded-xl border">
                <table className="w-full text-xs">
                  <tbody>
                    {changes.map((r) => (
                      <tr key={r.row} className="border-t first:border-t-0">
                        <td className="px-2 py-1 text-gray-500">{r.row}</td>
                        <td className="px-2 py-1">{r.category}</td>
                        <td className="px-2 py-1 font-semibold">{r.name}</td>
                        <td className="px-2 py-1">
                          {r.action === 'create'
                            ? t('admin.menuImport.willCreate')
                            : t('admin.menuImport.willUpdate', { fields: r.changes.map((f) => t(`admin.menuImport.fields.${f}`, f)).join(', ') })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <button type="button" className="btn-primary" disabled={busy || issues.length > 0 || !changes.length} onClick={importNow}>
              {busy ? t('admin.menuImport.importing') : t('admin.menuImport.import', { count: changes.length })}
            </button>
          </div>
        ) : null}

        {done ? (
          <p className="rounded-xl bg-green-50 p-3 font-semibold text-green-800">
            {t('admin.menuImport.done', { create: done.create, update: done.update })}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
