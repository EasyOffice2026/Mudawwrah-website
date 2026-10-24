import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isInstalled, needsShareHint } from '../../lib/installApp';

/**
 * "Install the app" in the footer: a button where the browser allows it, the Share-menu instruction on iPhone, and
 * nothing at all once the website is already running as an installed app.
 */
export default function InstallApp() {
  const { t } = useTranslation();
  const [offer, setOffer] = useState(null);
  const [installed, setInstalled] = useState(() => isInstalled());

  useEffect(() => {
    const onOffer = (event) => {
      event.preventDefault();
      setOffer(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setOffer(null);
    };
    window.addEventListener('beforeinstallprompt', onOffer);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onOffer);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;
  if (offer) {
    return (
      <button
        type="button"
        className="btn-ghost mt-4"
        onClick={async () => {
          offer.prompt();
          await offer.userChoice.catch(() => {});
          setOffer(null);
        }}
      >
        {t('install.button')}
      </button>
    );
  }
  if (needsShareHint(navigator.userAgent, navigator.maxTouchPoints)) {
    return <p className="mt-4 text-xs text-ink-soft">{t('install.ios')}</p>;
  }
  return null;
}
