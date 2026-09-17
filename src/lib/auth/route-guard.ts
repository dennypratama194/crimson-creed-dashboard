/**
 * The proxy's signed-in / signed-out routing, as a pure function so every
 * combination is testable without a request.
 *
 * The proxy only knows whether a valid session exists. Whether that session
 * belongs to an ACTIVE member is decided by the (app) guards, which send an
 * unusable session to /account-unavailable. That page is deliberately NOT
 * public: a public path bounces signed-in users to /dashboard, and the guard
 * would bounce them straight back — the redirect loop this layout replaces.
 */

const PUBLIC_PATHS = ["/login", "/forgot-password"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export type RouteDecision =
  { action: "next" } | { action: "redirect"; pathname: string; next?: string };

export function routeDecision(
  signedIn: boolean,
  pathname: string,
): RouteDecision {
  if (!signedIn && !isPublicPath(pathname)) {
    return {
      action: "redirect",
      pathname: "/login",
      next: pathname !== "/" ? pathname : undefined,
    };
  }
  if (signedIn && isPublicPath(pathname)) {
    return { action: "redirect", pathname: "/dashboard" };
  }
  return { action: "next" };
}
