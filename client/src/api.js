const TOKEN_KEY = "sma_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
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

export async function api(path, { method = "GET", body, headers } = {}) {
  const cacheKey = method === "GET" ? catalogKey(path) : null;
  if (cacheKey) {
    const hit = catalogCache.get(cacheKey);
    if (hit && Date.now() < hit.expires) return hit.data;
    const pending = catalogInflight.get(cacheKey);
    if (pending) return pending;
  }

  const run = (async () => {
    const token = getToken();
    const isForm = body instanceof FormData;
    const res = await fetch(path, {
      method,
      cache: "no-store",
      headers: {
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body == null ? undefined : isForm ? body : JSON.stringify(body),
    });

    if (res.status === 401) {
      setToken(null);
      if (!path.startsWith("/api/auth")) window.location.assign("/login");
    }

    // 304 has an empty body; treat it as a failed dynamic API response.
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
  })();

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
  const token = getToken();
  const res = await fetch(path, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
