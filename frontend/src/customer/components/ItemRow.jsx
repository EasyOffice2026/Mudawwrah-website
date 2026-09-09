import { useTranslation } from 'react-i18next';
import { kwd, localized } from '../../lib/format';
import AddButton from './AddButton.jsx';

export default function ItemRow({ item, lang, onAdd }) {
  const { t } = useTranslation();
  const unavailable = item.isOutOfStock;
  const description = localized(item, 'description', lang);
  return (
    <div className="flex items-start gap-3 border-b border-gray-100 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold leading-snug">{localized(item, 'name', lang)}</p>
        {description ? <p className="mt-1 text-sm leading-snug text-gray-500">{description}</p> : null}
        <p className="mt-3 text-sm text-gray-700">{kwd(item.price)}</p>
        {unavailable ? <p className="mt-1 text-xs font-semibold text-brand">{t('menu.outOfStock')}</p> : null}
      </div>
      <div className="relative shrink-0">
        <img
          src={item.image?.url || '/placeholder.svg'}
          alt={localized(item, 'name', lang)}
          className="h-[110px] w-[110px] rounded-xl object-cover"
          loading="lazy"
        />
        <div className="absolute bottom-1 end-1">
          <AddButton onClick={() => onAdd(item)} customizable={item.isCustomizable} disabled={unavailable} />
        </div>
        {item.isCustomizable ? (
          <p className="mt-1 text-center text-[11px] text-gray-400">{t('menu.customizable')}</p>
        ) : null}
      </div>
    </div>
  );
}
