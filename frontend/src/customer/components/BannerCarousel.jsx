import { localized } from '../../lib/format';

export default function BannerCarousel({ banners, lang }) {
  if (!banners?.length) return null;
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto px-3 py-3">
      {banners.map((banner) => {
        const content = (
          <div className="relative h-28 w-72 shrink-0 overflow-hidden rounded-xl bg-brand-light">
            {banner.image?.url ? (
              <img src={banner.image.url} alt={localized(banner, 'title', lang)} className="h-full w-full object-cover" />
            ) : null}
            {localized(banner, 'title', lang) ? (
              <span className="absolute bottom-2 start-3 rounded bg-black/50 px-2 py-1 text-xs font-semibold text-white">
                {localized(banner, 'title', lang)}
              </span>
            ) : null}
          </div>
        );
        return banner.linkUrl ? (
          <a key={banner.id} href={banner.linkUrl} target="_blank" rel="noreferrer">
            {content}
          </a>
        ) : (
          <div key={banner.id}>{content}</div>
        );
      })}
    </div>
  );
}
