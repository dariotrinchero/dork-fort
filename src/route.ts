// what is shown, kept in hash of URL as a path, eg. "#campfire" while a place is shown, & "#campfire/cookbook" while
// one of its windows is open; each history entry added here remembers the route it was added from
type Route = string[];

let listener: ((route: Route) => void) | undefined;

/**
 * Convert route to hash of URL.
 *
 * @param route route
 * @returns hash (without leading '#')
 */
const toHash = (route: Route): string => route.map(encodeURIComponent).join("/");

/**
 * Get current route.
 *
 * @returns route given by hash of URL
 */
export const currentRoute = (): Route => location.hash.slice(1).split("/").filter(Boolean).map(decodeURIComponent);

/**
 * Point URL at given route, without reloading page.
 *
 * @param route route
 * @param replace whether to replace current history entry, rather than adding a new one
 */
const setRoute = (route: Route, replace: boolean): void => {
    const hash = toHash(route);
    const url = hash ? `#${hash}` : location.pathname + location.search;
    if (replace) history.replaceState(null, "", url);
    else history.pushState({ from: currentRoute() }, "", url);
    listener?.(route);
};

/**
 * Listen for changes of route, by navigation within page, browser history, or editing of URL.
 *
 * @param onRoute called with new route
 */
export const onRouteChange = (onRoute: (route: Route) => void): void => {
    listener = onRoute;
    window.addEventListener("popstate", () => { onRoute(currentRoute()); });
    window.addEventListener("hashchange", () => { onRoute(currentRoute()); });
};

/**
 * Go to given route, adding entry to browser history.
 *
 * @param route route
 */
export const goTo = (route: Route): void => {
    if (toHash(route) !== toHash(currentRoute())) setRoute(route, false);
};

/**
 * Go back from current route: through browser history, if the current entry was added from an acceptable route,
 * & otherwise by replacing current entry with given route (eg. for pages loaded straight from a link).
 *
 * @param fallback route to replace current one with, if not going back through history
 * @param accept whether route from which current entry was added is acceptable to go back to
 */
export const goBack = (fallback: Route, accept: (from: Route) => boolean): void => {
    const { from } = (history.state ?? {}) as { from?: Route };
    if (from && accept(from)) history.back();
    else if (toHash(fallback) !== toHash(currentRoute())) setRoute(fallback, true);
};
