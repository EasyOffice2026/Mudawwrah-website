import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { currentTenantSlug, tenantPath } from '../../lib/tenant';

/**
 * What the owner hands a driver: the address of the driver page, and the Android app that shows the same page
 * and keeps reporting the phone's position with the screen locked (driver-app/ in this repository).
 */
export default function DriverSetup() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const address = `${window.location.origin}${tenantPath(currentTenantSlug(), '/driver')}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard here (an old browser): the address is on screen to copy by hand.
    }
  };

  return (
    <div className="card space-y-2 text-sm" data-testid="driver-setup">
      <h2 className="text-base font-bold">🛵 {t('admin.driver.pageTitle')}</h2>
      <p className="text-gray-600">{t('admin.driver.pageHint')}</p>
      <p className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-gray-100 px-2 py-1 text-xs" dir="ltr">
          {address}
        </code>
        <button type="button" className="text-xs underline" onClick={copy}>
          {copied ? t('admin.driver.copied') : t('admin.driver.copy')}
        </button>
      </p>
      <a className="btn-ghost w-fit" href="/downloads/madawarah-driver.apk" download>
        ⬇️ {t('admin.driver.appDownload')}
      </a>
      <p className="text-xs text-gray-500">{t('admin.driver.appHint')}</p>
    </div>
  );
}
