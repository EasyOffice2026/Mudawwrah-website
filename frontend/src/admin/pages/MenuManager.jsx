import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal.jsx';
import { api, apiError } from '../../lib/api';
import { kwd, localized } from '../../lib/format';
import ImagePicker from '../components/ImagePicker.jsx';

const emptyCategory = {
  nameEn: '',
  nameAr: '',
  subtitleEn: '',
  subtitleAr: '',
  displayStyle: 'list',
  isVisible: true,
};

const emptyItem = {
  nameEn: '',
  nameAr: '',
  descriptionEn: '',
  descriptionAr: '',
  price: '',
  categoryId: '',
  imageId: null,
  isAvailable: true,
  isOutOfStock: false,
  isFeatured: false,
  isCustomizable: false,
  options: [],
};

export default function MenuManager() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [categoryForm, setCategoryForm] = useState(null);
  const [itemForm, setItemForm] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get('/categories/all');
      setCategories(data);
      setActiveCategoryId((current) => current || data[0]?.id || null);
      setError(null);
    } catch (err) {
      setError(apiError(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activeCategory = useMemo(
    () => categories.find((category) => category.id === activeCategoryId) || null,
    [categories, activeCategoryId],
  );

  const move = async (list, index, direction, endpoint) => {
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const ids = list.map((entry) => entry.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await api.post(endpoint, { orderedIds: ids });
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  const saveCategory = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { id, ...payload } = categoryForm;
      if (id) await api.put(`/categories/${id}`, payload);
      else await api.post('/categories', payload);
      setCategoryForm(null);
      await load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (id) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      await api.delete(`/categories/${id}`);
      setActiveCategoryId(null);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  const saveItem = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { id, category, image, createdAt, updatedAt, ...rest } = itemForm;
      const payload = {
        ...rest,
        price: Number(rest.price),
        options: (rest.options || []).map(({ id: optionId, menuItemId, ...option }) => ({
          ...option,
          extraPrice: Number(option.extraPrice || 0),
        })),
      };
      if (id) await api.put(`/items/${id}`, payload);
      else await api.post('/items', payload);
      setItemForm(null);
      await load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (id) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      await api.delete(`/items/${id}`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  const toggleItemFlag = async (item, flag) => {
    try {
      await api.put(`/items/${item.id}`, { [flag]: !item[flag] });
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  const bulkAvailability = async (isAvailable) => {
    const ids = selected.length ? selected : (activeCategory?.items || []).map((item) => item.id);
    if (!ids.length) return;
    try {
      await api.post('/items/bulk-availability', { ids, isAvailable });
      setSelected([]);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">{t('admin.menu')}</h1>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => setCategoryForm({ ...emptyCategory })}>
            {t('admin.newCategory')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!activeCategoryId}
            onClick={() => setItemForm({ ...emptyItem, categoryId: activeCategoryId })}
          >
            {t('admin.newItem')}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <section className="card space-y-2">
          <h2 className="font-bold">{t('admin.categories')}</h2>
          {categories.map((category, index) => (
            <div
              key={category.id}
              className={`rounded-lg border p-2 ${category.id === activeCategoryId ? 'border-brand bg-brand-light' : 'border-gray-200'}`}
            >
              <button type="button" className="w-full text-start" onClick={() => setActiveCategoryId(category.id)}>
                <p className="text-sm font-semibold">{localized(category, 'name', lang)}</p>
                <p className="text-xs text-gray-500">
                  {category._count?.items ?? category.items.length} · {category.displayStyle}
                  {category.isVisible ? '' : ` · ${t('admin.visible')}: ${t('common.no')}`}
                </p>
              </button>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button type="button" onClick={() => move(categories, index, -1, '/categories/reorder')}>
                  ↑
                </button>
                <button type="button" onClick={() => move(categories, index, 1, '/categories/reorder')}>
                  ↓
                </button>
                <button type="button" className="text-gray-600 underline" onClick={() => setCategoryForm({ ...category })}>
                  {t('common.edit')}
                </button>
                <button type="button" className="text-brand underline" onClick={() => deleteCategory(category.id)}>
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </section>

        <section className="card">
          {!activeCategory ? (
            <p className="text-sm text-gray-500">{t('common.noResults')}</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold">{localized(activeCategory, 'name', lang)}</h2>
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost text-xs" onClick={() => bulkAvailability(true)}>
                    {t('admin.enableAll')}
                  </button>
                  <button type="button" className="btn-ghost text-xs" onClick={() => bulkAvailability(false)}>
                    {t('admin.disableAll')}
                  </button>
                </div>
              </div>
              <ul className="divide-y divide-gray-100">
                {activeCategory.items.map((item, index) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand"
                      checked={selected.includes(item.id)}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
                        )
                      }
                    />
                    {item.image?.url ? (
                      <img src={item.image.thumbnailUrl || item.image.url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-gray-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{localized(item, 'name', lang)}</p>
                      <p className="text-xs text-gray-500">{kwd(item.price)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Toggle label={t('admin.available')} value={item.isAvailable} onChange={() => toggleItemFlag(item, 'isAvailable')} />
                      <Toggle label={t('admin.outOfStock')} value={item.isOutOfStock} onChange={() => toggleItemFlag(item, 'isOutOfStock')} />
                      <Toggle label={t('admin.featured')} value={item.isFeatured} onChange={() => toggleItemFlag(item, 'isFeatured')} />
                      <button type="button" onClick={() => move(activeCategory.items, index, -1, '/items/reorder')}>
                        ↑
                      </button>
                      <button type="button" onClick={() => move(activeCategory.items, index, 1, '/items/reorder')}>
                        ↓
                      </button>
                      <button
                        type="button"
                        className="text-gray-600 underline"
                        onClick={() => setItemForm({ ...item, price: String(item.price), options: item.options || [] })}
                      >
                        {t('common.edit')}
                      </button>
                      <button type="button" className="text-brand underline" onClick={() => deleteItem(item.id)}>
                        {t('common.delete')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(categoryForm)}
        onClose={() => setCategoryForm(null)}
        title={categoryForm?.id ? t('common.edit') : t('admin.newCategory')}
        footer={
          <button type="submit" form="category-form" className="btn-primary w-full" disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        }
      >
        {categoryForm ? (
          <form id="category-form" onSubmit={saveCategory} className="space-y-3">
            <Field label="Name (EN)" value={categoryForm.nameEn} onChange={(v) => setCategoryForm({ ...categoryForm, nameEn: v })} required />
            <Field label="Name (AR)" value={categoryForm.nameAr} onChange={(v) => setCategoryForm({ ...categoryForm, nameAr: v })} required />
            <Field label="Subtitle (EN)" value={categoryForm.subtitleEn || ''} onChange={(v) => setCategoryForm({ ...categoryForm, subtitleEn: v })} />
            <Field label="Subtitle (AR)" value={categoryForm.subtitleAr || ''} onChange={(v) => setCategoryForm({ ...categoryForm, subtitleAr: v })} />
            <div>
              <label className="label">Layout</label>
              <select
                className="input"
                value={categoryForm.displayStyle}
                onChange={(event) => setCategoryForm({ ...categoryForm, displayStyle: event.target.value })}
              >
                <option value="list">list</option>
                <option value="grid">grid</option>
              </select>
            </div>
            <Checkbox
              label={t('admin.visible')}
              value={categoryForm.isVisible}
              onChange={(v) => setCategoryForm({ ...categoryForm, isVisible: v })}
            />
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(itemForm)}
        onClose={() => setItemForm(null)}
        title={itemForm?.id ? t('common.edit') : t('admin.newItem')}
        size="lg"
        footer={
          <button type="submit" form="item-form" className="btn-primary w-full" disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        }
      >
        {itemForm ? (
          <form id="item-form" onSubmit={saveItem} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name (EN)" value={itemForm.nameEn} onChange={(v) => setItemForm({ ...itemForm, nameEn: v })} required />
              <Field label="Name (AR)" value={itemForm.nameAr || ''} onChange={(v) => setItemForm({ ...itemForm, nameAr: v })} />
            </div>
            <Field
              label="Description (EN)"
              value={itemForm.descriptionEn || ''}
              onChange={(v) => setItemForm({ ...itemForm, descriptionEn: v })}
            />
            <Field
              label="Description (AR)"
              value={itemForm.descriptionAr || ''}
              onChange={(v) => setItemForm({ ...itemForm, descriptionAr: v })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Price (KWD)"
                type="number"
                step="0.001"
                value={itemForm.price}
                onChange={(v) => setItemForm({ ...itemForm, price: v })}
                required
              />
              <div>
                <label className="label">{t('admin.categories')}</label>
                <select
                  className="input"
                  value={itemForm.categoryId}
                  onChange={(event) => setItemForm({ ...itemForm, categoryId: event.target.value })}
                  required
                >
                  <option value="">—</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {localized(category, 'name', lang)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">{t('admin.media')}</label>
              <ImagePicker value={itemForm.imageId} onChange={(imageId) => setItemForm({ ...itemForm, imageId })} />
            </div>
            <div className="flex flex-wrap gap-4">
              <Checkbox label={t('admin.available')} value={itemForm.isAvailable} onChange={(v) => setItemForm({ ...itemForm, isAvailable: v })} />
              <Checkbox label={t('admin.outOfStock')} value={itemForm.isOutOfStock} onChange={(v) => setItemForm({ ...itemForm, isOutOfStock: v })} />
              <Checkbox label={t('admin.featured')} value={itemForm.isFeatured} onChange={(v) => setItemForm({ ...itemForm, isFeatured: v })} />
              <Checkbox
                label={t('admin.customizable')}
                value={itemForm.isCustomizable}
                onChange={(v) => setItemForm({ ...itemForm, isCustomizable: v })}
              />
            </div>

            {itemForm.isCustomizable ? (
              <section className="rounded-lg border border-gray-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-bold">Customization options</h4>
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() =>
                      setItemForm({
                        ...itemForm,
                        options: [...(itemForm.options || []), { groupEn: 'Extras', groupAr: 'إضافات', nameEn: '', nameAr: '', extraPrice: 0, maxSelect: 1 }],
                      })
                    }
                  >
                    {t('common.add')}
                  </button>
                </div>
                <div className="space-y-2">
                  {(itemForm.options || []).map((option, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_90px_70px_40px]">
                      <input
                        className="input"
                        placeholder="Group (EN)"
                        value={option.groupEn || ''}
                        onChange={(event) => updateOption(itemForm, setItemForm, index, { groupEn: event.target.value })}
                      />
                      <input
                        className="input"
                        placeholder="Option (EN)"
                        value={option.nameEn || ''}
                        onChange={(event) => updateOption(itemForm, setItemForm, index, { nameEn: event.target.value })}
                      />
                      <input
                        className="input"
                        placeholder="Option (AR)"
                        value={option.nameAr || ''}
                        onChange={(event) => updateOption(itemForm, setItemForm, index, { nameAr: event.target.value })}
                      />
                      <input
                        className="input"
                        type="number"
                        step="0.001"
                        placeholder="Extra"
                        value={option.extraPrice ?? 0}
                        onChange={(event) => updateOption(itemForm, setItemForm, index, { extraPrice: event.target.value })}
                      />
                      <input
                        className="input"
                        type="number"
                        min="1"
                        placeholder="Max"
                        value={option.maxSelect ?? 1}
                        onChange={(event) => updateOption(itemForm, setItemForm, index, { maxSelect: Number(event.target.value) })}
                      />
                      <button
                        type="button"
                        className="text-brand"
                        onClick={() =>
                          setItemForm({ ...itemForm, options: itemForm.options.filter((_, i) => i !== index) })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </form>
        ) : null}
      </Modal>
    </div>
  );
}

const updateOption = (itemForm, setItemForm, index, patch) =>
  setItemForm({
    ...itemForm,
    options: itemForm.options.map((option, i) => (i === index ? { ...option, ...patch } : option)),
  });

const Field = ({ label, value, onChange, type = 'text', ...rest }) => (
  <div>
    <label className="label">{label}</label>
    <input className="input" type={type} value={value} onChange={(event) => onChange(event.target.value)} {...rest} />
  </div>
);

const Checkbox = ({ label, value, onChange }) => (
  <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" className="h-4 w-4 accent-brand" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
    {label}
  </label>
);

const Toggle = ({ label, value, onChange }) => (
  <button
    type="button"
    onClick={onChange}
    className={`rounded-full px-2 py-1 font-semibold ${value ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500'}`}
  >
    {label}
  </button>
);
