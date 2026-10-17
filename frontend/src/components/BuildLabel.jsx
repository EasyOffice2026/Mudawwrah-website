import { useTranslation } from 'react-i18next';
import { BUILD } from '../lib/version.js';
import { formatBuildTime } from '../lib/versionCheck.js';

/**
 * "Version dab75f6 · 6 Oct, 21:00": which build this screen is running, so a
 * screenshot from the client settles at a glance whether they are current.
 * A trailing + means the build came from changes that were never committed.
 */
export default function BuildLabel({ className = '' }) {
  const { t, i18n } = useTranslation();
  const dev = import.meta.env.DEV;
  const when = dev ? '' : formatBuildTime(BUILD.builtAt, i18n.language);
  return (
    <p className={className} title={BUILD.dirty ? t('admin.version.unsaved') : undefined}>
      {t('admin.version.label')}{' '}
      <span className="font-mono" dir="ltr">
        {dev ? t('admin.version.dev') : `${BUILD.commit}${BUILD.dirty ? '+' : ''}`}
      </span>
      {when ? ` · ${when}` : ''}
    </p>
  );
}
