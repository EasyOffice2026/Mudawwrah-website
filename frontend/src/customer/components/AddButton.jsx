export default function AddButton({ onClick, customizable, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={customizable ? 'customize' : 'add'}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl font-light text-accent shadow-card disabled:text-gray-300"
    >
      {customizable ? <span className="rtl:rotate-180">›</span> : '+'}
    </button>
  );
}
