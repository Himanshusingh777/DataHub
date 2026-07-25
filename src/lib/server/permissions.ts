// Permissions stub — RBAC not yet implemented server-side.
// All checks pass through (allow-all) so routes compile and run correctly.

export type Role = "owner" | "admin" | "member" | "viewer";

/** Returns null if allowed, or a response descriptor if denied. */
export function requirePermission(
  _role: Role | string,
  _permission: string,
  _ctx: { userId: string; workspaceId: string }
): { body: { error: string }; status: number } | null {
  // allow-all until server-side RBAC is implemented
  return null;
}
