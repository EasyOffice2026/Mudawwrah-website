import { useTranslation } from 'react-i18next';
import { kwd, localized } from '../../lib/format';
import AddButton from './AddButton.jsx';

export default function ItemCard({ item, lang, onAdd }) {
  const { t } = useTranslation();
  const unavailable = item.isOutOfStock;
  return (
    <div className="flex flex-col">
      <div className="relative">
        <img
          src={item.image?.url || '/placeholder.svg'}
          alt={localized(item, 'name', lang)}
          className="aspect-square w-full rounded-xl object-cover"
          loading="lazy"
        />
        <div className="absolute bottom-2 end-2">
          <AddButton onClick={() => onAdd(item)} customizable={item.isCustomizable} disabled={unavailable} />
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold leading-tight">{localized(item, 'name', lang)}</p>
      <p className="text-sm text-gray-700">{kwd(item.price)}</p>
      {unavailable ? <p className="text-xs font-semibold text-brand">{t('menu.outOfStock')}</p> : null}
      {item.isCustomizable ? <p className="text-xs text-gray-400">{t('menu.customizable')}</p> : null}
    </div>
  );
}
