/**
 * Turns a dropped pin into the area and street a customer would otherwise
 * have typed by hand.
 *
 * Deliberately narrow: Kuwait's addressing (block/street/building as
 * separate, sometimes inconsistent fields) doesn't reliably decompose into
 * Google's address_components, so this only ever fills what it can extract
 * with real confidence — the neighbourhood and the road name. Building,
 * floor and block stay for the customer to enter; a pin cannot know which
 * floor they live on, and guessing wrong would be worse than an empty field.
 *
 * Requires the Geocoding API enabled on the same Google Cloud project as the
 * Maps key. If it isn't (yet), or the lookup fails for any reason, this
 * resolves to an empty result rather than throwing — reverse geocoding is a
 * convenience on top of the map, never something checkout depends on.
 */
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const AREA_TYPES = ['sublocality_level_1', 'sublocality', 'neighborhood', 'locality'];
const STREET_TYPES = ['route'];

const findComponent = (components, types) => {
  for (const type of types) {
    const match = components.find((c) => c.types.includes(type));
    if (match) return match.long_name;
  }
  return '';
};

export const reverseGeocode = async (lat, lng) => {
  if (!MAPS_KEY) return { area: '', street: '' };
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${MAPS_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    const components = data.results?.[0]?.address_components;
    if (!components) return { area: '', street: '' };
    return {
      area: findComponent(components, AREA_TYPES),
      street: findComponent(components, STREET_TYPES),
    };
  } catch {
    return { area: '', street: '' };
  }
};
