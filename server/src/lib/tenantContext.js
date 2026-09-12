import { AsyncLocalStorage } from "node:async_hooks";

/** Request-scoped school tenant id. Unset for platform admin and public routes. */
export const tenantStore = new AsyncLocalStorage();

export function currentTenantId() {
  return tenantStore.getStore() || null;
}

export function runWithTenant(tenantId, fn) {
  return tenantStore.run(tenantId || null, fn);
}
