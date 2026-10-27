import { useEffect } from 'react';

// Built with VITE_STAGE=staging (npm run deploy:staging): the test copy, which must never be mistaken for the real
// site, by the team or by a client looking at a screenshot.
export const isStagingBuild = import.meta.env.VITE_STAGE === 'staging';

const SUFFIX = ' · TEST';

/**
 * A coloured frame around every page and a "TEST SITE" badge, plus " · TEST" at the end of the tab's title. Both
 * let clicks through, so the pages underneath are tested exactly as they are. The title gets a suffix, not a
 * prefix: the order desk puts its "(3)" new-order count at the start.
 */
export default function StagingBar() {
  useEffect(() => {
    const mark = () => {
      if (!document.title.endsWith(SUFFIX)) document.title += SUFFIX;
    };
    mark();
    const title = document.querySelector('title');
    if (!title) return undefined;
    const watch = new MutationObserver(mark);
    watch.observe(title, { childList: true, characterData: true, subtree: true });
    return () => watch.disconnect();
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[2147483647] border-4 border-amber-400">
      <span className="absolute bottom-2 left-2 rounded bg-amber-400 px-2 py-0.5 text-[11px] font-bold tracking-wide text-black shadow">
        TEST SITE · موقع تجريبي
      </span>
    </div>
  );
}
