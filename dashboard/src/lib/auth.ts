/**
 * Session-scoped storage for the admin bearer token.
 *
 * We deliberately keep this in `sessionStorage` (not `localStorage`) so
 * the token only lives as long as the tab — closing the browser logs the
 * operator out.  There is no refresh token; the same `ADMIN_API_KEY`
 * value is used for every API call.
 */

const TOKEN_KEY = "devin-proxy-admin-token";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  window.sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  window.sessionStorage.removeItem(TOKEN_KEY);
}
