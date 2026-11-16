import { useEffect, useState } from 'react';

/**
 * Hash-based routing (#/budgets). Hash URLs work on GitHub Pages sub-paths and in the single-file
 * build without any server setup, and need no router dependency.
 */
export const ROUTES = ['overview', 'transactions', 'budgets', 'savings', 'insights', 'plans', 'settings'] as const;
export type Route = (typeof ROUTES)[number];

/** '#/budgets' -> 'budgets'. Anything unknown (including no hash) is the Overview. */
export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0].toLowerCase();
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'overview';
}

export const hrefFor = (route: Route) => (route === 'overview' ? '#/' : `#/${route}`);

/** The current page, kept in step with the address bar (back/forward buttons work). */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(route: Route) {
  if (parseRoute(window.location.hash) !== route) window.location.hash = hrefFor(route);
}
