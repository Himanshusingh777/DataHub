"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileText, X, CheckCircle2, AlertTriangle, ChevronDown,
  ArrowRight, Database, Loader2, RefreshCw, Eye, Table, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn, formatBytes } from "@/lib/utils";
import { parseCSVText } from "@/stores/flow-wizard.store";
import type { CSVData, ColumnType } from "@/stores/flow-wizard.store";

// ── Types ─────────────────────────────────────────────────────────────────────

type ImportStep = "upload" | "preview" | "importing" | "success" | "error";

const TYPE_COLORS: Record<ColumnType, string> = {
  string:  "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  number:  "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  boolean: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400",
  date:    "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
};

const COLUMN_TYPES: ColumnType[] = ["string", "number", "boolean", "date"];

// ── Upload Zone ───────────────────────────────────────────────────────────────

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (f) onFile(f);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 text-center transition-all duration-200 cursor-pointer",
        dragging
          ? "border-brand-400 bg-brand-50 dark:bg-brand-950/20"
          : "border-border hover:border-brand-300 hover:bg-muted/30"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt"
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
      <motion.div
        animate={dragging ? { scale: 1.1 } : { scale: 1 }}
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-2xl transition-colors mb-5",
          dragging ? "bg-brand-100 dark:bg-brand-950/40" : "bg-muted group-hover:bg-brand-50 dark:group-hover:bg-brand-950/20"
        )}
      >
        <Upload className={cn("h-7 w-7 transition-colors", dragging ? "text-brand-600" : "text-muted-foreground group-hover:text-brand-500")} />
      </motion.div>
      <h3 className="text-base font-semibold text-foreground">
        {dragging ? "Drop your file here" : "Drag & drop your CSV"}
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        or <span className="text-brand-600 font-medium">browse to upload</span>
      </p>
      <p className="mt-3 text-xs text-muted-foreground/60">
        Supports CSV, TSV · Max 50 MB · UTF-8 encoding
      </p>
    </div>
  );
}

// ── Data Preview Table ────────────────────────────────────────────────────────

function DataPreview({ data, headers }: { data: string[][]; headers: string[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="overflow-x-auto max-h-72">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 border-b border-border sticky top-0">
            <tr>
              <th className="w-8 py-2 px-3 text-left text-muted-foreground font-medium">#</th>
              {headers.map((h) => (
                <th key={h} className="py-2 px-3 text-left font-semibold text-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} className={cn("border-b border-border/50 last:border-0", ri % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                <td className="py-2 px-3 text-muted-foreground/60 font-mono">{ri + 1}</td>
                {row.map((cell, ci) => (
                  <td key={ci} className="py-2 px-3 text-foreground whitespace-nowrap max-w-[200px] truncate font-mono">
                    {cell || <span className="text-muted-foreground/40 italic">empty</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Column Mapper ─────────────────────────────────────────────────────────────

function ColumnMapper({
  csvData,
  onChange,
}: {
  csvData: CSVData;
  onChange: (cols: CSVData["columns"]) => void;
}) {
  function updateType(idx: number, type: ColumnType) {
    const next = csvData.columns.map((c, i) => i === idx ? { ...c, type } : c);
    onChange(next);
  }
  function updateName(idx: number, displayName: string) {
    const next = csvData.columns.map((c, i) => i === idx ? { ...c, displayName } : c);
    onChange(next);
  }
  function toggleInclude(idx: number) {
    const next = csvData.columns.map((c, i) => i === idx ? { ...c, include: !c.include } : c);
    onChange(next);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-[auto_1.5fr_1fr_1.5fr_auto] gap-0 bg-muted/50 border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Include</span>
        <span className="ml-3">Source Column</span>
        <span>Type</span>
        <span>BigQuery Field Name</span>
        <span>Nulls</span>
      </div>
      <div className="divide-y divide-border/50 max-h-80 overflow-y-auto">
        {csvData.columns.map((col, i) => (
          <div
            key={col.name}
            className={cn(
              "grid grid-cols-[auto_1.5fr_1fr_1.5fr_auto] items-center gap-4 px-4 py-3",
              !col.include && "opacity-40"
            )}
          >
            {/* Toggle */}
            <input
              type="checkbox"
              checked={col.include}
              onChange={() => toggleInclude(i)}
              className="h-4 w-4 rounded border-border accent-brand-600 cursor-pointer"
            />

            {/* Source name + sample */}
            <div className="min-w-0 ml-3">
              <p className="text-sm font-medium text-foreground font-mono truncate">{col.name}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {col.sample.filter(Boolean).slice(0, 2).join(", ") || "—"} · {col.nonEmptyCount} non-empty
              </p>
            </div>

            {/* Type */}
            <div className="relative">
              <select
                value={col.type}
                onChange={(e) => updateType(i, e.target.value as ColumnType)}
                disabled={!col.include}
                className={cn(
                  "w-full appearance-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium pr-7 focus:outline-none focus:ring-2 focus:ring-ring",
                  TYPE_COLORS[col.type]
                )}
              >
                {COLUMN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>

            {/* BQ field name */}
            <Input
              value={col.displayName}
              onChange={(e) => updateName(i, e.target.value)}
              disabled={!col.include}
              className="h-8 text-xs font-mono"
            />

            {/* Null count */}
            <div className="flex justify-end">
              {col.nonEmptyCount < col.totalRows ? (
                <span className="text-xs text-amber-600 font-medium tabular-nums">
                  {col.totalRows - col.nonEmptyCount}
                </span>
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Import Progress ───────────────────────────────────────────────────────────

function ImportProgress({ progress }: { progress: number }) {
  const stages = [
    { label: "Validating schema",      done: progress > 10 },
    { label: "Sending rows to server", done: progress > 35 },
    { label: "Writing to BigQuery",    done: progress > 65 },
    { label: "Running load job",       done: progress > 85 },
    { label: "Committing transaction", done: progress >= 100 },
  ];
  const current = stages.findLastIndex((s) => !s.done);

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative mb-8">
        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
          <motion.circle
            cx="50" cy="50" r="40" fill="none"
            stroke="hsl(var(--primary))" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 40}`}
            strokeDashoffset={`${2 * Math.PI * 40 * (1 - progress / 100)}`}
            transition={{ duration: 0.5 }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-foreground tabular-nums">{progress}%</span>
        </div>
      </div>
      <div className="w-full max-w-sm space-y-2.5">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-center gap-3">
            {s.done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : i === current ? (
              <Loader2 className="h-4 w-4 animate-spin text-brand-500 shrink-0" />
            ) : (
              <div className="h-4 w-4 rounded-full border-2 border-border shrink-0" />
            )}
            <span className={cn(
              "text-sm text-left",
              s.done ? "text-foreground" : i === current ? "text-brand-600 font-medium" : "text-muted-foreground"
            )}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [step, setStep]               = React.useState<ImportStep>("upload");
  const [csvData, setCsvData]         = React.useState<CSVData | null>(null);
  const [columns, setColumns]         = React.useState<CSVData["columns"]>([]);
  const [activeTab, setActiveTab]     = React.useState<"preview" | "mapping">("preview");
  const [tableName, setTableName]     = React.useState("");
  const [importProgress, setImportProgress] = React.useState(0);
  const [parseError, setParseError]   = React.useState<string | null>(null);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [result, setResult]           = React.useState<{
    rowsInserted: number; columns: number; table: string; dataset: string; tableCreated: boolean;
  } | null>(null);
  // Keep File reference so we can re-parse all rows (not just preview 20) on import
  const fileRef = React.useRef<File | null>(null);

  // ── Real file parsing ──────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setParseError(null);
    setStep("preview");
    fileRef.current = file;
    try {
      // Use parseCSVText (from flow-wizard store) — it populates allRows up to 5000 rows
      const text = await file.text();
      const data = parseCSVText(text, file.name, file.size);
      setCsvData(data);
      setColumns(data.columns);
      const base = file.name.replace(/\.(csv|tsv|txt)$/i, "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      setTableName(base.slice(0, 64) || "imported_data");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse file.");
      setStep("upload");
    }
  }

  // ── Real BigQuery import ──────────────────────────────────────────────────

  async function handleImport() {
    if (!csvData) return;
    setStep("importing");
    setImportError(null);
    setImportProgress(10);

    // Re-read the full file to get ALL rows (csvData.preview is capped at 20)
    const includedCols = columns.filter((c) => c.include);
    const colIndexMap: Record<string, number> = {};
    csvData.columns.forEach((c, i) => { colIndexMap[c.name] = i; });

    // Prefer allRows from CSVData (populated by flow-wizard parser up to 5000 rows)
    let allRows: string[][] = csvData.allRows ?? csvData.preview;
    if (!csvData.allRows && fileRef.current) {
      try {
        const text = await fileRef.current.text();
        const fullData = parseCSVText(text, fileRef.current.name, fileRef.current.size);
        allRows = fullData.allRows ?? fullData.preview;
      } catch { /* keep fallback */ }
    }

    const rows: Record<string, unknown>[] = allRows.map((row) =>
      Object.fromEntries(
        includedCols.map((col) => {
          const idx = colIndexMap[col.name] ?? 0;
          const raw = row[idx] ?? "";
          let val: unknown = raw === "" ? null : raw;
          if (val !== null) {
            if (col.type === "number") val = Number(raw) || null;
            else if (col.type === "boolean") val = raw.toLowerCase() === "true" || raw === "1";
          }
          return [col.displayName, val];
        })
      )
    );

    setImportProgress(35);

    try {
      const res = await fetch("/api/bigquery/csv-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: tableName, rows }),
      });

      setImportProgress(85);
      const json = await res.json();
      setImportProgress(100);

      await new Promise((r) => setTimeout(r, 400));

      if (json.ok) {
        setResult(json);
        setStep("success");
      } else if (json.notConfigured) {
        setImportError("BigQuery not configured. Go to Settings → Connections → BigQuery and save your service account JSON first.");
        setStep("error");
      } else {
        setImportError(json.error ?? "Import failed.");
        setStep("error");
      }
    } catch {
      setImportError("Network error — check your connection and try again.");
      setStep("error");
    }
  }

  function reset() {
    setStep("upload");
    setCsvData(null);
    setColumns([]);
    setTableName("");
    setImportProgress(0);
    setParseError(null);
    setImportError(null);
    setResult(null);
    setActiveTab("preview");
  }

  const includedCount = columns.filter((c) => c.include).length;
  const nullCols = columns.filter((c) => c.nonEmptyCount < c.totalRows).length;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold text-foreground">CSV Import</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Upload a CSV file — data is parsed locally and loaded directly into your BigQuery warehouse.
        </p>
      </motion.div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(["upload", "preview", "importing", "success"] as const).map((s, i) => {
          const order = { upload: 0, preview: 1, importing: 2, success: 3, error: 2 };
          const cur = order[step] ?? 0;
          const this_ = order[s] ?? 0;
          const isDone = cur > this_;
          const isActive = s === step;
          return (
            <React.Fragment key={s}>
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                  isActive ? "bg-brand-600 text-white" :
                  isDone ? "bg-emerald-500 text-white" :
                  "bg-muted text-muted-foreground"
                )}>
                  {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={cn(
                  "text-xs font-medium capitalize hidden sm:inline",
                  isActive ? "text-foreground" : isDone ? "text-emerald-600" : "text-muted-foreground"
                )}>
                  {s === "preview" ? "Configure" : s}
                </span>
              </div>
              {i < 3 && <div className={cn("h-px w-8 transition-colors", isDone ? "bg-emerald-400" : "bg-border")} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Parse error banner */}
      {parseError && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/20 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-400">{parseError}</p>
        </div>
      )}

      <AnimatePresence mode="wait">

        {/* ── Upload ── */}
        {step === "upload" && (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <UploadZone onFile={handleFile} />

            {/* Info banner */}
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20 px-4 py-3">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                BigQuery credentials are read from your saved settings. Make sure you have configured BigQuery in
                {" "}<span className="font-medium">Settings → Connections</span> before importing.
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Preview & Configure ── */}
        {step === "preview" && csvData && (
          <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* File stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "File",        value: csvData.fileName },
                { label: "File Size",   value: formatBytes(csvData.fileSize) },
                { label: "Total Rows",  value: csvData.totalRows.toLocaleString() },
                { label: "Columns",     value: `${includedCount} / ${csvData.columns.length} selected` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-4 text-center">
                  <p className="text-sm font-bold text-foreground truncate" title={s.value}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Destination */}
            <div className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">BigQuery Destination</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Destination</Label>
                  <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 text-sm text-muted-foreground">
                    <Database className="h-4 w-4" />
                    BigQuery (from your saved credentials)
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Table Name</Label>
                  <Input
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value.replace(/[^a-zA-Z0-9_]/g, "_"))}
                    className="font-mono"
                    placeholder="my_table"
                  />
                </div>
              </div>
            </div>

            {/* Tabs: Preview / Column Mapping */}
            <div className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                  <button
                    onClick={() => setActiveTab("preview")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      activeTab === "preview" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Eye className="h-3.5 w-3.5" /> Preview (first 20 rows)
                  </button>
                  <button
                    onClick={() => setActiveTab("mapping")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      activeTab === "mapping" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Table className="h-3.5 w-3.5" /> Column Mapping ({columns.length})
                  </button>
                </div>
                {nullCols > 0 && (
                  <Badge variant="warning" className="gap-1 text-[10px]">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {nullCols} columns with empty values
                  </Badge>
                )}
              </div>
              <div className="p-5">
                {activeTab === "preview" ? (
                  <DataPreview
                    data={csvData.preview}
                    headers={csvData.columns.map((c) => c.name)}
                  />
                ) : (
                  <ColumnMapper csvData={{ ...csvData, columns }} onChange={setColumns} />
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={reset} className="gap-2">
                <X className="h-4 w-4" /> Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!tableName || includedCount === 0}
                className="gap-2 h-10"
              >
                <Database className="h-4 w-4" />
                Import {csvData.totalRows.toLocaleString()} rows to BigQuery
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── Importing ── */}
        {step === "importing" && (
          <motion.div key="importing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a]">
              <div className="border-b border-border px-6 py-4">
                <h3 className="text-sm font-semibold text-foreground">Importing to BigQuery…</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Writing to table <span className="font-mono font-medium">{tableName}</span>
                </p>
              </div>
              <div className="px-6">
                <ImportProgress progress={importProgress} />
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Error ── */}
        {step === "error" && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/20 p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-rose-500 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-foreground mb-2">Import Failed</h2>
              <p className="text-sm text-rose-700 dark:text-rose-400 max-w-md mx-auto mb-6">{importError}</p>
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" onClick={reset} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Try Again
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Success ── */}
        {step === "success" && result && (
          <motion.div key="success" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-10 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30 mx-auto mb-6"
              >
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </motion.div>

              <h2 className="text-xl font-bold text-foreground">Import Successful!</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Data loaded into{" "}
                <span className="font-mono font-medium">{result.dataset}.{result.table}</span>
                {result.tableCreated && <span className="text-brand-600"> (new table created)</span>}
              </p>

              <div className="mt-6 grid grid-cols-3 gap-4 max-w-sm mx-auto">
                {[
                  { label: "Rows Inserted", value: result.rowsInserted.toLocaleString() },
                  { label: "Columns",       value: result.columns.toString() },
                  { label: "Errors",        value: "0" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-muted/40 p-3">
                    <p className="text-lg font-bold text-foreground">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-center gap-3">
                <Button variant="outline" onClick={reset} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Import Another File
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
