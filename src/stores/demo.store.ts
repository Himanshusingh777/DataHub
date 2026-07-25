/**
 * demo.store.ts — STRIPPED of demo persistence.
 *
 * The old "demo mode" concept is removed. All flow state is now server-side
 * (SQLite via /api/flows, /api/runs). This module keeps its exports so
 * existing component imports don't break, but nothing is persisted to
 * localStorage and no mock flows are merged anywhere.
 */

import { create } from "zustand";
import type { DataFlow, FlowRun, FlowStatus } from "@/lib/flows-data";

// ── Event types (kept for any remaining references) ───────────────────────────

export type DemoEventType =
  | "flow_created"
  | "flow_deleted"
  | "flow_paused"
  | "flow_resumed"
  | "sync_run"
  | "sync_failed"
  | "sync_started"
  | "connector_reconnected"
  | "connector_disconnected"
  | "csv_uploaded"
  | "settings_changed"
  | "schedule_updated";

export interface DemoEvent {
  id: string;
  type: DemoEventType;
  title: string;
  description: string;
  ts: string;
  flowId?: string;
  flowName?: string;
  meta?: Record<string, string | number>;
}

export type ConnectorAuthStatus = "connected" | "error" | "disconnected";

// ── Minimal no-op store (no localStorage, no demo data) ──────────────────────

interface DemoState {
  flows: DataFlow[];
  events: DemoEvent[];
  connectorStatuses: Record<string, ConnectorAuthStatus>;
  hasEnteredDemo: boolean;
  addFlow: (flow: DataFlow) => void;
  updateFlow: (id: string, updates: Partial<DataFlow>) => void;
  deleteFlow: (id: string) => void;
  setFlowStatus: (id: string, status: FlowStatus) => void;
  appendRun: (flowId: string, run: FlowRun) => void;
  addEvent: (event: Omit<DemoEvent, "id" | "ts">) => void;
  setConnectorStatus: (flowId: string, status: ConnectorAuthStatus) => void;
  markDemoEntered: () => void;
  resetDemo: () => void;
}

export const useDemoStore = create<DemoState>()((set) => ({
  flows: [],
  events: [],
  connectorStatuses: {},
  hasEnteredDemo: false,

  addFlow: (flow) => set((s) => ({ flows: [...s.flows, flow] })),
  updateFlow: (id, updates) =>
    set((s) => ({ flows: s.flows.map((f) => (f.id === id ? { ...f, ...updates } : f)) })),
  deleteFlow: (id) => set((s) => ({ flows: s.flows.filter((f) => f.id !== id) })),
  setFlowStatus: (id, status) =>
    set((s) => ({ flows: s.flows.map((f) => (f.id === id ? { ...f, status } : f)) })),
  appendRun: () => { /* flows tracked server-side */ },
  addEvent: () => { /* activity tracked server-side */ },
  setConnectorStatus: (flowId, status) =>
    set((s) => ({ connectorStatuses: { ...s.connectorStatuses, [flowId]: status } })),
  markDemoEntered: () => set({ hasEnteredDemo: true }),
  resetDemo: () => set({ flows: [], events: [], connectorStatuses: {}, hasEnteredDemo: false }),
}));

/** No-op: MOCK_FLOWS are gone; real flows come from /api/flows. */
export function getAllFlows(_mockFlows: DataFlow[], demoFlows: DataFlow[]): DataFlow[] {
  return demoFlows;
}
