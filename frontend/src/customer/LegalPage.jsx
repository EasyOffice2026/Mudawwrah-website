import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { localized } from '../lib/format';
import { setPageMeta } from '../lib/pageMeta';
import { tenantPath } from '../lib/tenant';
import { applyTheme } from '../lib/theme';
import { legalFor, PAGE_ORDER, PAGE_PATH, pageIn } from './legal/index.js';
import { richParts } from './legal/rich.js';

const linkClass = 'font-semibold text-brand underline-offset-2 hover:underline';

/** One paragraph, with the phone number and Instagram handle made clickable. */
const Paragraph = ({ text, contact }) => (
  <p>
    {richParts(text, contact).map((part, index) =>
      part.href ? (
        // bdi: a number or @handle inside Arabic text must keep its own left-to-right order.
        <bdi key={index} dir="ltr">
          <a
            href={part.href}
            className={linkClass}
            {...(part.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {part.text}
          </a>
        </bdi>
      ) : (
        <span key={index}>{part.text}</span>
      ),
    )}
  </p>
);

/**
 * About Us, Terms and Conditions, Return and Refund Policy: a restaurant's own
 * text (see ./legal), shown in whichever language the visitor is using.
 *
 * Nothing here waits on the server. The words are part of the site, so the page
 * opens even if the API is down; the restaurant's name and colours are fetched
 * alongside and applied if they arrive.
 */
export default function LegalPage({ page }) {
  const { slug } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const legal = legalFor(slug);
  const view = pageIn(legal, page, lang);
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/tenants/current')
      .then(({ data }) => {
        if (cancelled) return;
        setTenant(data);
        applyTheme(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // A client-side navigation keeps the old scroll position, so a visitor who clicked the
  // footer link at the bottom of a long menu would land in the middle of the text.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug, page]);

  const name = tenant ? localized(tenant, 'name', lang) : '';
  useEffect(() => {
    if (view) setPageMeta({ title: name ? `${view.title} · ${name}` : view.title });
  }, [view, name]);

  const toggleLanguage = () => i18n.changeLanguage(lang === 'ar' ? 'en' : 'ar');
  const others = legal ? PAGE_ORDER.filter((key) => key !== page && pageIn(legal, key, lang)) : [];

  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="sticky top-0 z-10 border-b border-hairline bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link to={tenantPath(slug)} aria-label={t('common.back')} className="icon-orb shadow-none">
            <span className="rtl:rotate-180">←</span>
          </Link>
          <span className="min-w-0 flex-1 truncate text-base font-extrabold">{name}</span>
          <button type="button" className="btn-ghost" onClick={toggleLanguage}>
            {t('common.language')}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        {view ? (
          <article lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <h1 className="text-2xl font-extrabold">{view.title}</h1>
            <div className="mt-5 space-y-4 text-[15px] leading-7">
              {view.blocks.map((block, index) =>
                block.h ? (
                  <h2 key={index} className="pt-4 text-lg font-extrabold">
                    {block.h}
                  </h2>
                ) : (
                  <Paragraph key={index} text={block.p} contact={legal.contact} />
                ),
              )}
            </div>
          </article>
        ) : (
          <div className="py-10 text-center">
            <p className="text-base font-semibold">{t('legal.notAvailable')}</p>
            <Link to={tenantPath(slug)} className={`mt-4 inline-block text-sm ${linkClass}`}>
              {t('legal.backToMenu')}
            </Link>
          </div>
        )}

        {others.length ? (
          <nav aria-label={t('legal.navLabel')} className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-5 text-sm">
            {others.map((key) => (
              <Link key={key} to={tenantPath(slug, PAGE_PATH[key])} className={linkClass}>
                {pageIn(legal, key, lang).title}
              </Link>
            ))}
          </nav>
        ) : null}
      </main>
    </div>
  );
}
