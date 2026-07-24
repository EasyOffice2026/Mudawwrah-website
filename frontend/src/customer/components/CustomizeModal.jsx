import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/Modal.jsx';
import { kwd, localized } from '../../lib/format';

export default function CustomizeModal({ item, lang, onClose, onConfirm }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState([]);
  const [quantity, setQuantity] = useState(1);

  const groups = useMemo(() => {
    const map = new Map();
    for (const option of item?.options || []) {
      const key = localized(option, 'group', lang) || t('menu.extras');
      map.set(key, [...(map.get(key) || []), option]);
    }
    return [...map.entries()];
  }, [item, lang, t]);

  const toggle = (option, group) => {
    setSelected((current) => {
      if (current.includes(option.id)) return current.filter((id) => id !== option.id);
      const groupIds = group.map((o) => o.id);
      const chosenInGroup = current.filter((id) => groupIds.includes(id));
      const maxSelect = option.maxSelect || 1;
      if (chosenInGroup.length >= maxSelect) {
        return [...current.filter((id) => !groupIds.includes(id)).concat(chosenInGroup.slice(1)), option.id];
      }
      return [...current, option.id];
    });
  };

  const selectedOptions = (item?.options || []).filter((o) => selected.includes(o.id));
  const unitPrice = Number(item?.price || 0) + selectedOptions.reduce((sum, o) => sum + Number(o.extraPrice), 0);

  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      title={localized(item, 'name', lang)}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-gray-300 px-3 py-2">
            <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="text-lg">
              −
            </button>
            <span className="w-6 text-center text-sm font-semibold">{quantity}</span>
            <button type="button" onClick={() => setQuantity((q) => q + 1)} className="text-lg">
              +
            </button>
          </div>
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={() => onConfirm(item, selectedOptions, quantity)}
          >
            {t('menu.addToCart')} · {kwd(unitPrice * quantity)}
          </button>
        </div>
      }
    >
      <img
        src={item?.image?.url || '/placeholder.svg'}
        alt={localized(item, 'name', lang)}
        className="mb-4 aspect-video w-full rounded-xl object-cover"
      />
      {localized(item, 'description', lang) ? (
        <p className="mb-4 text-sm text-gray-500">{localized(item, 'description', lang)}</p>
      ) : null}
      {groups.map(([group, options]) => (
        <section key={group} className="mb-4">
          <h4 className="mb-2 text-sm font-bold">
            {group}
            {options.some((o) => o.isRequired) ? <span className="ms-2 text-xs text-brand">{t('menu.required')}</span> : null}
          </h4>
          <div className="space-y-2">
            {options.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(option.id)}
                    onChange={() => toggle(option, options)}
                    className="h-4 w-4 accent-brand"
                  />
                  {localized(option, 'name', lang)}
                </span>
                {Number(option.extraPrice) > 0 ? (
                  <span className="text-sm text-gray-500">+ {kwd(option.extraPrice)}</span>
                ) : null}
              </label>
            ))}
          </div>
        </section>
      ))}
    </Modal>
  );
}
