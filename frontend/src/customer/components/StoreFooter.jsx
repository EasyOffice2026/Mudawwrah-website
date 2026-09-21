import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { tenantPath } from '../../lib/tenant';

/**
 * Contact details at the bottom of the menu, and a way in for staff.
 *
 * The admin link is deliberately plain text, not a button — a customer
 * scrolling the menu should be able to ignore it entirely, while staff who
 * already know to look for it can still find it without memorising a URL.
 */
export default function StoreFooter({ slug, settings }) {
  const { t } = useTranslation();

  return (
    <footer className="mt-8 border-t border-hairline px-4 py-6 text-center text-sm text-ink-soft">
      <p className="font-bold text-ink">{t('footer.contactUs')}</p>
      {settings?.address ? <p className="mt-1">{settings.address}</p> : null}
      {settings?.contactPhone ? (
        <p className="mt-1">
          <a href={`tel:${settings.contactPhone}`} className="text-brand">
            {settings.contactPhone}
          </a>
        </p>
      ) : null}
      <Link to={tenantPath(slug, '/admin/login')} className="mt-4 inline-block text-xs text-ink-soft underline">
        {t('footer.admin')}
      </Link>
    </footer>
  );
}
