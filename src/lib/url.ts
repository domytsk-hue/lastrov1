/**
 * Changes only the address bar (a tab, an open lesson): useSearchParams follows it, and no
 * request goes to the server. router.replace would re-render the page on the server just to
 * switch a tab — a full round trip before anything moved.
 */
export function replaceQuery(url: string) {
  window.history.replaceState(window.history.state, "", url);
}
