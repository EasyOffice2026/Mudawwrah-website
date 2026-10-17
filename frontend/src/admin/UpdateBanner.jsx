import { useTranslation } from 'react-i18next';
import { useBuildUpdate } from '../lib/version.js';

/**
 * Shown on every admin page once a newer version of the site has been deployed.
 * Not dismissible and never automatic: a reload mid-way through an order isn't
 * ours to force, but a screen that stays on last week's code is exactly how the
 * same bug gets reported twice.
 */
export default function UpdateBanner() {
  const { t } = useTranslation();
  const newer = useBuildUpdate();
  if (!newer) return null;
  return (
    <div role="status" className="no-print sticky top-0 z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 bg-gray-900 px-4 py-2.5 text-sm text-white">
      <span className="font-bold">{t('admin.update.banner')}</span>
      <span className="text-white/80">{t('admin.update.hint')}</span>
      <button type="button" className="rounded-lg bg-white px-3 py-1 font-bold text-gray-900 hover:bg-gray-200" onClick={() => window.location.reload()}>
        {t('admin.update.refresh')}
      </button>
    </div>
  );
}
