/**
 * flow-wizard.store.ts
 *
 * Full multi-step wizard state for creating a new DataFlow.
 *
 * Steps:
 *   source      → pick connector
 *   auth        → demo OAuth (or CSV upload+preview+mapping if source=csv)
 *   destination → pick destination
 *   schedule    → pick sync frequency
 *   review      → summary, confirm
 *   creating    → animated sync + log generation
 *   done        → complete (triggers redirect externally)
 *
 * State is persisted so Back never loses data, and refresh restores wizard.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Step ordering ─────────────────────────────────────────────────────────────

export type WizardStep =
  | "source"
  | "auth"
  | "objects"
  | "flowname"    // NEW Step 2: name your flow
  | "dataset"     // NEW Step 3+4: choose BQ dataset + table name
  | "destination" // kept for type compat but no longer in the active step list
  | "schedule"
  | "review"
  | "creating"
  | "done";

export const WIZARD_STEPS: WizardStep[] = [
  "source",
  "auth",
  "objects",
  "flowname",
  "dataset",
  "schedule",
  "review",
  "creating",
];

export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  source:      "Source",
  auth:        "Connect",
  objects:     "Objects",
  flowname:    "Name",
  dataset:     "Dataset",
  destination: "Destination", // unused in tracker
  schedule:    "Schedule",
  review:      "Review",
  creating:    "Creating",
  done:        "Done",
};

/** Steps shown in the progress tracker (excludes "creating" and "done") */
export const TRACKER_STEPS: WizardStep[] = [
  "source",
  "auth",
  "objects",
  "flowname",
  "dataset",
  "schedule",
  "review",
];

// ── CSV types ─────────────────────────────────────────────────────────────────

export type ColumnType = "string" | "number" | "date" | "boolean";

export interface CSVColumn {
  /** Original header from file */
  name: string;
  /** User-editable display name → becomes destination column name */
  displayName: string;
  /** Detected data type */
  type: ColumnType;
  /** Whether to include this column in the sync */
  include: boolean;
  /** Whether this column is the primary key */
  primaryKey: boolean;
  /** Sample values from first 5 rows */
  sample: string[];
  /** Count of non-empty values (for validation) */
  nonEmptyCount: number;
  /** Total rows scanned */
  totalRows: number;
}

export interface CSVData {
  fileName: string;
  fileSize: number;
  delimiter: "," | "\t" | ";" | "|";
  encoding: string;
  /** Total data rows (excluding header) */
  totalRows: number;
  columns: CSVColumn[];
  /** First 20 rows of raw values (parallel to columns) */
  preview: string[][];
  /**
   * Full parsed rows (capped at 5,000) — used for the REAL BigQuery load.
   * Held in memory only; stripped from localStorage persistence to stay
   * within quota. If lost on refresh, the user re-uploads.
   */
  allRows?: string[][];
}

// ── Auth types ────────────────────────────────────────────────────────────────

export type AuthStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "failed"
  | "skipped";

// ── Store ─────────────────────────────────────────────────────────────────────

interface WizardState {
  active: boolean;
  step: WizardStep;
  /** Animation direction: 1 = forward, -1 = backward */
  direction: 1 | -1;

  // Step data
  source: string | null;
  authStatus: AuthStatus;
  csvData: CSVData | null;
  /** Selected object IDs for the "objects" step */
  selectedObjects: string[];
  destination: string | null;
  schedule: string;
  /** Human-readable name for this flow (Step 2 of new wizard) */
  flowName: string;
  /** BigQuery dataset name for this flow (Step 3 — auto-created if missing) */
  dataset: string;
  /** BigQuery table name for this flow (Step 4) */
  tableName: string;
  /** ID of the flow created in demo store — used for redirect */
  createdFlowId: string | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  startWizard: () => void;
  closeWizard: () => void;
  resetWizard: () => void;

  goTo: (step: WizardStep, dir?: 1 | -1) => void;
  goNext: () => void;
  goBack: () => void;

  setSource: (source: string) => void;
  setAuthStatus: (status: AuthStatus) => void;
  setCSVData: (data: CSVData | null) => void;
  updateCSVColumn: (name: string, updates: Partial<CSVColumn>) => void;
  setSelectedObjects: (ids: string[]) => void;
  toggleSelectedObject: (id: string) => void;
  setDestination: (destination: string) => void;
  setSchedule: (schedule: string) => void;
  setFlowName: (name: string) => void;
  setDataset: (dataset: string) => void;
  setTableName: (tableName: string) => void;
  setCreatedFlowId: (id: string) => void;
}

export const useFlowWizardStore = create<WizardState>()(
  persist(
    (set, get) => ({
      active: false,
      step: "source",
      direction: 1,

      source: null,
      authStatus: "idle",
      csvData: null,
      selectedObjects: [],
      destination: null,
      schedule: "every_hour",
      flowName: "",
      dataset: "",
      tableName: "",
      createdFlowId: null,

      // ── Control ──────────────────────────────────────────────────────────
      startWizard: () =>
        set({
          active: true,
          step: "source",
          direction: 1,
          source: null,
          authStatus: "idle",
          csvData: null,
          selectedObjects: [],
          destination: null,
          schedule: "every_hour",
          flowName: "",
          dataset: "",
          tableName: "",
          createdFlowId: null,
        }),

      closeWizard: () => set({ active: false }),

      resetWizard: () =>
        set({
          active: false,
          step: "source",
          direction: 1,
          source: null,
          authStatus: "idle",
          csvData: null,
          selectedObjects: [],
          destination: null,
          schedule: "every_hour",
          flowName: "",
          dataset: "",
          tableName: "",
          createdFlowId: null,
        }),

      goTo: (step, dir = 1) => set({ step, direction: dir }),

      goNext: () => {
        const { step, source } = get();
        const idx = WIZARD_STEPS.indexOf(step);
        if (idx < 0 || idx >= WIZARD_STEPS.length - 1) return;
        let next = WIZARD_STEPS[idx + 1];
        // Skip auth step only if source is already authenticated
        // (never skip — auth serves as CSV upload for csv source)
        set({ step: next, direction: 1 });
      },

      goBack: () => {
        const { step } = get();
        const idx = WIZARD_STEPS.indexOf(step);
        if (idx <= 0) return;
        set({ step: WIZARD_STEPS[idx - 1], direction: -1 });
      },

      // ── Data setters ─────────────────────────────────────────────────────
      setSource: (source) =>
        set({ source, authStatus: "idle", csvData: null, selectedObjects: [] }),

      setAuthStatus: (authStatus) => set({ authStatus }),

      setCSVData: (csvData) => set({ csvData }),

      updateCSVColumn: (name, updates) =>
        set((s) => {
          if (!s.csvData) return {};
          return {
            csvData: {
              ...s.csvData,
              columns: s.csvData.columns.map((c) =>
                c.name === name ? { ...c, ...updates } : c
              ),
            },
          };
        }),

      setSelectedObjects: (ids) => set({ selectedObjects: ids }),

      toggleSelectedObject: (id) =>
        set((s) => ({
          selectedObjects: s.selectedObjects.includes(id)
            ? s.selectedObjects.filter((x) => x !== id)
            : [...s.selectedObjects, id],
        })),

      setDestination: (destination) => set({ destination }),

      setSchedule: (schedule) => set({ schedule }),

      setFlowName: (flowName) => set({ flowName }),

      setDataset: (dataset) => set({ dataset }),

      setTableName: (tableName) => set({ tableName }),

      setCreatedFlowId: (id) => set({ createdFlowId: id }),
    }),
    {
      name: "crosstecch-wizard-v1",
      partialize: (s) => ({
        active: s.active,
        step: s.step,
        source: s.source,
        authStatus: s.authStatus,
        // Strip allRows from persistence — too large for localStorage
        csvData: s.csvData ? { ...s.csvData, allRows: undefined } : null,
        selectedObjects: s.selectedObjects,
        destination: s.destination,
        schedule: s.schedule,
        flowName: s.flowName,
        dataset: s.dataset,
        tableName: s.tableName,
        createdFlowId: s.createdFlowId,
      }),
    }
  )
);

// ── CSV parsing utilities ─────────────────────────────────────────────────────

/** Detect the most likely delimiter in a CSV string */
export function detectDelimiter(text: string): "," | "\t" | ";" | "|" {
  const firstLine = text.split("\n")[0] ?? "";
  const counts = {
    ",": (firstLine.match(/,/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "|": (firstLine.match(/\|/g) ?? []).length,
  } as const;
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0]) as
    | ","
    | "\t"
    | ";"
    | "|";
}

/** Infer column data type from a sample of string values */
export function detectType(values: string[]): ColumnType {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return "string";

  const boolLike = /^(true|false|yes|no|1|0)$/i;
  const numLike   = /^-?\d+(\.\d+)?$/;
  const dateLike  = /^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{2,4}/;

  if (nonEmpty.every((v) => boolLike.test(v.trim()))) return "boolean";
  if (nonEmpty.every((v) => numLike.test(v.trim())))  return "number";
  if (nonEmpty.every((v) => dateLike.test(v.trim()))) return "date";
  return "string";
}

/** Parse a CSV file text into structured CSVData */
export function parseCSVText(
  text: string,
  fileName: string,
  fileSize: number
): CSVData {
  const delimiter = detectDelimiter(text);

  // Split into lines, removing empty trailing lines
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    throw new Error("CSV must have at least a header row and one data row.");
  }

  const splitLine = (line: string): string[] => {
    // Simple parser: handle quoted fields
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"' && !inQuotes) { inQuotes = true; continue; }
      if (ch === '"' && inQuotes) { inQuotes = false; continue; }
      if (ch === delimiter && !inQuotes) { result.push(cur); cur = ""; continue; }
      cur += ch;
    }
    result.push(cur);
    return result;
  };

  const headers = splitLine(lines[0]!).map((h) => h.trim());
  const dataLines = lines.slice(1);
  const totalRows = dataLines.length;

  // Parse up to 200 rows for analysis
  const analysisRows = dataLines.slice(0, 200).map(splitLine);

  // Preview: first 20 rows
  const preview = dataLines.slice(0, 20).map(splitLine);

  // Full rows for the REAL warehouse load (capped at 5,000)
  const allRows = dataLines.slice(0, 5000).map(splitLine);

  const columns: CSVColumn[] = headers.map((header, colIdx) => {
    const colValues = analysisRows.map((row) => row[colIdx] ?? "");
    const sample = analysisRows.slice(0, 5).map((row) => row[colIdx] ?? "");
    const nonEmptyCount = colValues.filter((v) => v.trim() !== "").length;

    return {
      name: header,
      displayName: header
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, ""),
      type: detectType(colValues),
      include: true,
      primaryKey: false,
      sample,
      nonEmptyCount,
      totalRows,
    };
  });

  // Auto-detect primary key: prefer "id", "uuid", "key" columns
  const pkCandidates = ["id", "uuid", "key", "_id", "order_id", "customer_id"];
  const autoKey = columns.find((c) =>
    pkCandidates.some((k) => c.name.toLowerCase().includes(k))
  );
  if (autoKey) autoKey.primaryKey = true;

  return {
    fileName,
    fileSize,
    delimiter,
    encoding: "UTF-8",
    totalRows,
    columns,
    preview,
    allRows,
  };
}
