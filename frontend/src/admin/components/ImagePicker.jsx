import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal.jsx';
import { api, apiError } from '../../lib/api';

export default function ImagePicker({ value, onChange }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [media, setMedia] = useState([]);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = () =>
    api
      .get('/media')
      .then(({ data }) => setMedia(data))
      .catch((err) => setError(apiError(err)));

  useEffect(() => {
    if (open) load();
  }, [open]);

  const selected = media.find((m) => m.id === value);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post('/media', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      await load();
      onChange(data.id);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {selected?.url ? <img src={selected.url} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
          {t('admin.selectImage')}
        </button>
        {value ? (
          <button type="button" className="text-sm text-gray-500 underline" onClick={() => onChange(null)}>
            {t('admin.noImage')}
          </button>
        ) : null}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t('admin.media')} size="lg">
        <label className="btn-primary mb-4 inline-flex cursor-pointer">
          {uploading ? t('common.saving') : t('admin.upload')}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        {error ? <p className="mb-2 text-sm font-semibold text-brand">{error}</p> : null}
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {media.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onChange(item.id);
                setOpen(false);
              }}
              className={`overflow-hidden rounded-lg border-2 ${item.id === value ? 'border-brand' : 'border-transparent'}`}
            >
              <img src={item.thumbnailUrl || item.url} alt={item.originalName} className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
