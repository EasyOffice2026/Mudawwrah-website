/**
 * Full-height overlay constrained to the same column as the menu.
 *
 * Every customer overlay (item sheet, cart, checkout) is pinned to the
 * viewport, but its panel is capped at `max-w-3xl` and centred — otherwise on
 * a desktop window the sheet stretches edge to edge while the storefront
 * behind it sits in a narrow column. On phones the cap never binds, so those
 * render exactly as a full-screen sheet.
 */
export default function SheetShell({ children, tone = 'white', onBackdropClick, label }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex justify-center bg-black/40"
    >
      {/* Clicking the dimmed gutter beside the panel closes the sheet, which
          is the only affordance a desktop user expects there. */}
      {onBackdropClick ? (
        <button type="button" aria-hidden tabIndex={-1} className="absolute inset-0 cursor-default" onClick={onBackdropClick} />
      ) : null}
      <div
        className={`relative flex h-full w-full max-w-3xl flex-col shadow-lift ${
          tone === 'surface' ? 'bg-surface' : 'bg-white'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
