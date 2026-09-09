import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiError } from '../../lib/api';

export default function MediaLibrary() {
  const { t } = useTranslation();
  const [media, setMedia] = useState([]);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = () =>
    api
      .get('/media')
      .then(({ data }) => setMedia(data))
      .catch((err) => setError(apiError(err)));

  useEffect(() => {
    load();
  }, []);

  const upload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const body = new FormData();
        body.append('file', file);
        await api.post('/media', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      await load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      await api.delete(`/media/${id}`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">{t('admin.media')}</h1>
        <label className="btn-primary cursor-pointer">
          {uploading ? t('common.saving') : t('admin.upload')}
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(event) => upload([...(event.target.files || [])])}
          />
        </label>
      </div>
      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {media.map((item) => (
          <div key={item.id} className="card p-2">
            <img src={item.thumbnailUrl || item.url} alt={item.originalName} className="aspect-square w-full rounded-lg object-cover" />
            <p className="mt-2 truncate text-xs text-gray-500">{item.originalName}</p>
            <p className="text-xs text-gray-400">{(item.size / 1024).toFixed(0)} KB</p>
            <button type="button" className="mt-2 text-xs font-semibold text-brand" onClick={() => remove(item.id)}>
              {t('common.delete')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
