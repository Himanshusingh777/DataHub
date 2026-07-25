/**
 * auth-utils — thin re-export shim so new API routes can import
 * getUserId from @/lib/server/auth-utils (matches the pattern used
 * across all Phase B–I routes). The real implementation lives in auth.ts.
 */
export { getUserId, getSessionUser, LOCAL_USER_ID, getAuthContext } from "./auth";
