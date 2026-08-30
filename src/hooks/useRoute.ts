import { useCallback, useEffect, useState } from "react";

/**
 * Minimal path-based router — the app only has two destinations (home and
 * /about), so a full routing library would be more machinery than the app
 * needs. pushState + a popstate listener covers back/forward correctly; the
 * server's catch-all already serves index.html for any non-/api path, so a
 * hard refresh on /about works too.
 */
export function useRoute(): [string, (path: string) => void] {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) {
      window.history.pushState({}, "", to);
      setPath(to);
    }
    window.scrollTo(0, 0);
  }, []);

  return [path, navigate];
}
