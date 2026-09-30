/**
 * Small fetch wrapper: attaches the access token, refreshes it once on 401,
 * and turns the backend error envelope into an `ApiError`.
 */
const TOKEN_KEY = "gm.tokens";

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function loadTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: Tokens | null): void {
  try {
    if (tokens) localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: session-only login */
  }
}

let onAuthLost: () => void = () => {};
export function setOnAuthLost(fn: () => void): void {
  onAuthLost = fn;
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    const err = body?.error;
    if (err) return new ApiError(res.status, err.code, err.message, err.details);
  } catch {
    /* non-JSON error */
  }
  return new ApiError(res.status, "error", res.statusText || "Request failed");
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const tokens = loadTokens();
  if (!tokens) return false;
  refreshing ??= (async () => {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });
    if (!res.ok) return false;
    const body = await res.json();
    saveTokens({ access_token: body.access_token, refresh_token: body.refresh_token });
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const tokens = loadTokens();
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (tokens) headers.set("Authorization", `Bearer ${tokens.access_token}`);

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401 && retry && tokens) {
    if (await refreshTokens()) return api<T>(path, init, false);
    saveTokens(null);
    onAuthLost();
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
