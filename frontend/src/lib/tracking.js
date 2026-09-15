/**
 * Loads each marketing pixel a restaurant has connected in Settings, onto its
 * own storefront only.
 *
 * The loader snippets below are the vendors' own standard install code, with
 * only the id interpolated — never markup from settings. The backend already
 * rejects anything that is not a bare id shaped like a real one (see
 * TRACKING_IDS in settingService.js); this only trusts that shape a second
 * time, so a bug on one side is not the only thing standing between a
 * restaurant's Settings page and arbitrary script execution on checkout.
 */

const ID_PATTERNS = {
  trackingGa4: /^G-[A-Z0-9]{4,15}$/i,
  trackingGtm: /^GTM-[A-Z0-9]{4,10}$/i,
  trackingMetaPixel: /^\d{8,20}$/,
  trackingTiktokPixel: /^[A-Z0-9]{10,30}$/i,
  trackingSnapPixel: /^[a-f0-9-]{20,60}$/i,
};

const safeId = (key, value) => {
  const id = String(value || '').trim();
  return id && ID_PATTERNS[key].test(id) ? id : null;
};

/** Adds a <script> once per tag id, and never twice for the same restaurant. */
const injectOnce = (tagId, build) => {
  if (document.getElementById(tagId)) return;
  const script = document.createElement('script');
  script.id = tagId;
  build(script);
  document.head.appendChild(script);
};

const loaders = {
  trackingGa4: (id) => {
    injectOnce('mdawra-ga4-lib', (s) => {
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    });
    injectOnce('mdawra-ga4-init', (s) => {
      s.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`;
    });
  },
  trackingGtm: (id) => {
    injectOnce('mdawra-gtm-init', (s) => {
      s.textContent = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`;
    });
  },
  trackingMetaPixel: (id) => {
    injectOnce('mdawra-meta-pixel', (s) => {
      s.textContent = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');`;
    });
  },
  trackingTiktokPixel: (id) => {
    injectOnce('mdawra-tiktok-pixel', (s) => {
      s.textContent = `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${id}');ttq.page();}(window,document,'ttq');`;
    });
  },
  trackingSnapPixel: (id) => {
    injectOnce('mdawra-snap-pixel', (s) => {
      s.textContent = `(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u)})(window,document,'https://sc-static.net/scevent.min.js');snaptr('init','${id}');snaptr('track','PAGE_VIEW');`;
    });
  },
};

/**
 * Call once the restaurant's settings have loaded. Safe to call again on
 * every settings refresh — already-loaded pixels are left alone, since
 * reloading a vendor's script mid-session can double-count events.
 */
export const applyTracking = (settings) => {
  if (!settings) return;
  for (const [key, load] of Object.entries(loaders)) {
    const id = safeId(key, settings[key]);
    if (id) load(id);
  }
};

const ATTRIBUTION_KEY = 'mdawra_attribution';
const UTM_PARAMS = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_term: 'utmTerm',
  utm_content: 'utmContent',
};

/**
 * Reads which campaign brought this visit, and remembers it for checkout.
 *
 * Call once when the storefront first loads — not on every internal
 * navigation, since a link within the app carries no utm parameters and would
 * otherwise look like the customer arrived with none. Kept in sessionStorage
 * rather than a query string on every route, so it survives browsing the menu
 * and only clears when the tab does.
 *
 * A later ad click overwrites an earlier one within the same session (the
 * last campaign the customer actually followed here), rather than keeping
 * whichever arrived first.
 */
export const captureAttribution = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    const utm = {};
    for (const [param, field] of Object.entries(UTM_PARAMS)) {
      const value = params.get(param);
      if (value) utm[field] = value.slice(0, 200);
    }
    if (Object.keys(utm).length) {
      sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(utm));
      return;
    }
    // No campaign tag, but arriving from somewhere other than this site is
    // still worth recording — and only on the first page of the visit, so an
    // in-app link a moment later does not overwrite it with our own referrer.
    if (sessionStorage.getItem(ATTRIBUTION_KEY)) return;
    const { referrer } = document;
    if (referrer && !referrer.includes(window.location.host)) {
      sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ referrer: referrer.slice(0, 500) }));
    }
  } catch {
    // Private browsing can block sessionStorage entirely; an order without
    // attribution is fine, a broken checkout over a marketing nicety is not.
  }
};

/** Read back what was captured, to attach to the order at checkout. */
export const getAttribution = () => {
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};
