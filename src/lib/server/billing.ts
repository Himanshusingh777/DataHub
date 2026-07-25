// Billing stubs — billing module removed; functions kept as no-ops so callers compile.

export function recordUsage(_args: {
  workspaceId?: string;
  metric?: string;
  quantity?: number;
  [key: string]: unknown;
}): void {
  // no-op
}

export function rollupUsageEvents(_args?: { workspaceId?: string }): {
  groupsCollapsed: number;
  rowsRemoved: number;
} {
  return { groupsCollapsed: 0, rowsRemoved: 0 };
}
