import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import RestaurantPicker from './RestaurantPicker.jsx';

/** Shared by both routes below: which restaurant, if any, this Host belongs to. */
const useDomainTenant = () => {
  const [state, setState] = useState({ checked: false, slug: null });
  useEffect(() => {
    api
      .get('/tenants/current')
      .then(({ data }) => setState({ checked: true, slug: data.slug }))
      .catch(() => setState({ checked: true, slug: null }));
  }, []);
  return state;
};

/**
 * What the bare domain shows depends entirely on which domain it is.
 *
 * On the platform's own host (the *.vercel.app address, or a preview URL) the
 * root is the multi-restaurant picker — that is the one place it is correct
 * to show every restaurant together. But once a restaurant's own domain is
 * pointed here (Settings → the platform console's domain field), that same
 * root path must never show the picker: a restaurant's own visitors would see
 * its competitors listed on its own site.
 *
 * The distinction isn't made from the hostname string on the client — that
 * would mean hardcoding every restaurant's domain into the frontend, and
 * updating it by hand whenever one is added. Instead this asks the API the
 * same question resolveTenant already answers for every other request: does
 * the Host header this request arrived on belong to a restaurant? A "no"
 * (404) means we're on the platform's own host, so nothing else changes and
 * the picker renders exactly as it always has.
 */
export default function RootRoute() {
  const { checked, slug } = useDomainTenant();
  if (!checked) return null;
  if (slug) return <Navigate to={`/r/${slug}`} replace />;
  return <RestaurantPicker />;
}

/**
 * The admin equivalent of the same redirect — someone on a restaurant's own
 * domain reasonably tries yourdomain.com/admin before finding /r/:slug/admin.
 * Matched with the trailing "/admin/*" wildcard, so /admin, /admin/login and
 * /admin/orders all land on the right page rather than only the bare path.
 *
 * On the platform's own host this resolves to no tenant, same as RootRoute;
 * there is no sensible page to show at a bare /admin there, so it goes home.
 */
export function RootAdminRoute() {
  const { checked, slug } = useDomainTenant();
  const { '*': rest } = useParams();
  if (!checked) return null;
  if (slug) return <Navigate to={`/r/${slug}/admin${rest ? `/${rest}` : ''}`} replace />;
  return <Navigate to="/" replace />;
}
