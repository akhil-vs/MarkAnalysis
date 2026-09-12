const SESSION_KEY = "sma_session";

/** Soft flag so the SPA knows a cookie session may exist (cookies themselves are httpOnly). */
export function hasSessionHint() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

export function setSessionHint(on) {
  if (on) sessionStorage.setItem(SESSION_KEY, "1");
  else sessionStorage.removeItem(SESSION_KEY);
}

/** @deprecated Prefer cookie sessions; kept so older code paths clear any leftover bearer token. */
export function getToken() {
  return null;
}

/** @deprecated Prefer cookie sessions. */
export function setToken(_token) {
  // no-op — access/refresh tokens live in httpOnly cookies
}


/** Short-lived GET cache for stable catalogs (classes/exams/subjects/users). */
const catalogCache = new Map();
const catalogInflight = new Map();
const CATALOG_TTL_MS = 60_000;
const CATALOG_PATHS = ["/api/classes", "/api/exams", "/api/subjects", "/api/users"];

function catalogKey(path) {
  const base = path.split("?")[0];
  return CATALOG_PATHS.find((p) => base === p) ? path : null;
}

export function invalidateApiCache(prefix = "") {
  for (const key of [...catalogCache.keys()]) {
    if (!prefix || key.startsWith(prefix)) catalogCache.delete(key);
  }
  for (const key of [...catalogInflight.keys()]) {
    if (!prefix || key.startsWith(prefix)) catalogInflight.delete(key);
  }
}

function invalidateForMutation(path) {
  if (path.startsWith("/api/classes") || path.startsWith("/api/students")) {
    invalidateApiCache("/api/classes");
  }
  if (path.startsWith("/api/exams")) invalidateApiCache("/api/exams");
  if (path.startsWith("/api/subjects")) invalidateApiCache("/api/subjects");
  if (path.startsWith("/api/users")) invalidateApiCache("/api/users");
}

let refreshPromise = null;

async function tryRefreshSession() {
  if (!refreshPromise) {
    refreshPromise = fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => {
        if (!res.ok) {
          setSessionHint(false);
          return false;
        }
        setSessionHint(true);
        return true;
      })
      .catch(() => {
        setSessionHint(false);
        return false;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request(path, { method = "GET", body, headers } = {}, { retry = true } = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(path, {
    method,
    cache: "no-store",
    credentials: "include",
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body == null ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (
    res.status === 401 &&
    retry &&
    path !== "/api/auth/login" &&
    path !== "/api/auth/refresh" &&
    path !== "/api/auth/logout" &&
    path !== "/api/auth/signup" &&
    !path.startsWith("/api/schools/")
  ) {
    const refreshed = await tryRefreshSession();
    if (refreshed) return request(path, { method, body, headers }, { retry: false });
    setSessionHint(false);
    if (!path.startsWith("/api/auth")) window.location.assign("/login");
  }

  if (res.status === 304) {
    const err = new Error("Stale cached response");
    err.status = 304;
    throw err;
  }

  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const err = new Error(
        res.ok
          ? "Invalid response from server"
          : res.status === 504 || res.status === 503
            ? "Request timed out — try again"
            : "Request failed"
      );
      err.status = res.status;
      throw err;
    }
  }
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    err.data = data;
    throw err;
  }

  if (method !== "GET") invalidateForMutation(path);
  return data;
}

export async function api(path, { method = "GET", body, headers } = {}) {
  const cacheKey = method === "GET" ? catalogKey(path) : null;
  if (cacheKey) {
    const hit = catalogCache.get(cacheKey);
    if (hit && Date.now() < hit.expires) return hit.data;
    const pending = catalogInflight.get(cacheKey);
    if (pending) return pending;
  }

  const run = request(path, { method, body, headers });

  if (cacheKey) {
    catalogInflight.set(cacheKey, run);
    try {
      const data = await run;
      catalogCache.set(cacheKey, { data, expires: Date.now() + CATALOG_TTL_MS });
      return data;
    } finally {
      catalogInflight.delete(cacheKey);
    }
  }

  return run;
}


export async function download(path, filename) {
  const res = await fetch(path, {
    cache: "no-store",
    credentials: "include",
  });
  if (res.status === 401) {
    const refreshed = await tryRefreshSession();
    if (refreshed) return download(path, filename);
    setSessionHint(false);
    window.location.assign("/login");
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
