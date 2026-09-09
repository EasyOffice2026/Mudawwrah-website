import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className={`flex max-h-[92vh] w-full ${width} flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-base font-bold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-2xl leading-none text-gray-400 hover:bg-gray-100">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? <div className="border-t border-gray-100 px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
