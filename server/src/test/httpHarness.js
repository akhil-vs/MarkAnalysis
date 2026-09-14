import http from "node:http";
import app from "../app.js";

/** Minimal cookie jar for credentialed fetch against the test server. */
export class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  store(response) {
    const lines =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
    for (const line of lines) {
      const [pair] = String(line).split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!name) continue;
      if (!value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header() {
    if (!this.cookies.size) return "";
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  has(name) {
    return this.cookies.has(name);
  }

  clear() {
    this.cookies.clear();
  }
}

/**
 * Start the Express app on an ephemeral port.
 * Callers must `await server.close()` in after().
 */
export async function startTestServer() {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  async function request(path, { method = "GET", body, jar, headers = {} } = {}) {
    const cookieJar = jar || new CookieJar();
    const init = {
      method,
      headers: { ...headers },
      redirect: "manual",
    };
    const cookieHeader = cookieJar.header();
    if (cookieHeader) init.headers.cookie = cookieHeader;
    if (body !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    const res = await fetch(`${baseUrl}${path}`, init);
    cookieJar.store(res);
    const text = await res.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: res.status, headers: res.headers, json, text, jar: cookieJar };
  }

  return {
    baseUrl,
    request,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

export async function loginAs(server, { email, password = "password123", jar } = {}) {
  const cookieJar = jar || new CookieJar();
  const res = await server.request("/api/auth/login", {
    method: "POST",
    body: { email, password },
    jar: cookieJar,
  });
  return { ...res, jar: cookieJar };
}
