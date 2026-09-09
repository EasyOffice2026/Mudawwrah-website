export default function AddButton({ onClick, customizable, disabled }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        // The whole card is clickable; keep the button from firing it twice.
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-label={customizable ? 'customize' : 'add'}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-2xl font-light text-accent shadow-lift transition active:scale-90 disabled:text-ink-soft/40 disabled:shadow-none"
    >
      {customizable ? <span className="rtl:rotate-180">›</span> : '+'}
    </button>
  );
}
