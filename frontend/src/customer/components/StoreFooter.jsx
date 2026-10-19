import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { tenantPath } from '../../lib/tenant';
import { legalFor, PAGE_ORDER, PAGE_PATH, pageIn } from '../legal/index.js';

/**
 * Contact details at the bottom of the menu, and links to the restaurant's own pages.
 *
 * There is deliberately no link to the admin panel: this is the customer's page.
 * Staff sign in at /r/<slug>/admin/login, or at /admin on the restaurant's own
 * domain (see RootAdminRoute), and bookmark it.
 */
export default function StoreFooter({ slug, settings }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  // Only a restaurant that has supplied its own pages gets links to them.
  const legal = legalFor(slug);

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
      {legal ? (
        <nav aria-label={t('legal.navLabel')} className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
          {PAGE_ORDER.filter((key) => pageIn(legal, key, lang)).map((key) => (
            <Link key={key} to={tenantPath(slug, PAGE_PATH[key])} className="underline-offset-2 hover:underline">
              {pageIn(legal, key, lang).title}
            </Link>
          ))}
        </nav>
      ) : null}
    </footer>
  );
}
