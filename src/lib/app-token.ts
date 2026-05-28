// Client-side shared-secret token storage. The token is required for every
// server function call (see app-token-middleware) and entered once via the
// AppGate UI.
const KEY = "app_access_token";

export function getAppToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setAppToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, token);
  window.dispatchEvent(new Event("app-token-changed"));
}

export function clearAppToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("app-token-changed"));
}
