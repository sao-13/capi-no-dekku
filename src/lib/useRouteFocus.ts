import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** The path last shown. Kept outside the layouts so moving between Layout and FocusLayout still counts as navigating. */
let shownPath: string | null = null;

/** After navigating (not on first load), start at the top and move focus to <main>. Returns the ref for <main>. */
export function useRouteFocus() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (shownPath === pathname) return;
    const first = shownPath === null;
    shownPath = pathname;
    if (first) return;
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return mainRef;
}
