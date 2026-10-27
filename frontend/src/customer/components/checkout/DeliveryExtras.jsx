import { useTranslation } from 'react-i18next';
import { kwd } from '../../../lib/format';

const NOTES = ['callOnArrival', 'dontRingBell', 'leaveAtReception', 'ringDoorbell'];

/** A one-tap note for the rider ("Call on arrival"...); tapping the chosen one again clears it. */
export function DeliveryInstructions({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <section className="mt-3 bg-white px-3 py-4">
      <h3 className="text-[15px] font-extrabold">{t('checkout.instructions')}</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {NOTES.map((key) => {
          const label = t(`checkout.${key}`);
          const active = value === label;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(active ? '' : label)}
              className={`rounded-xl border p-2.5 text-xs font-semibold transition active:scale-[0.98] ${
                active ? 'border-brand bg-brand-light text-brand' : 'border-hairline bg-white text-ink-soft'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** The rider's tip, from the restaurant's presets; tapping the chosen one again removes it. */
export function TipPicker({ presets, tip, onChange }) {
  const { t } = useTranslation();
  return (
    <section className="mt-3 bg-white px-3 py-4">
      <h3 className="text-[15px] font-extrabold">{t('checkout.tipTitle')}</h3>
      <p className="mt-0.5 text-xs text-ink-soft">{t('checkout.tipHint')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(tip === preset ? 0 : preset)}
            className={`rounded-xl border px-3.5 py-2.5 text-sm font-bold transition active:scale-95 ${
              tip === preset ? 'border-brand bg-brand-light text-brand' : 'border-hairline bg-white'
            }`}
          >
            {kwd(preset)}
          </button>
        ))}
        {tip > 0 ? (
          <button type="button" onClick={() => onChange(0)} className="px-2 text-sm font-bold text-ink-soft underline">
            {t('cart.remove')}
          </button>
        ) : null}
      </div>
    </section>
  );
}
