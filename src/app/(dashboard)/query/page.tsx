"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play, Save, Clock, Database, ChevronDown, Loader2,
  CheckCircle, XCircle, Code2, BookOpen, Download,
  Lightbulb, History, Star, Trash2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  bytesProcessed: number;
  durationMs: number;
}

interface SavedQuery {
  id: string;
  name: string;
  description: string | null;
  sql: string;
  createdAt: string;
  updatedAt: string;
}

interface HistoryEntry {
  id: string;
  sql: string;
  status: "success" | "error";
  rowsReturned: number | null;
  durationMs: number | null;
  createdAt: string;
  error: string | null;
}

// ── SQL Templates ─────────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    label: "Row count",
    sql: "SELECT COUNT(*) AS total_rows\nFROM `project.dataset.table_name`",
  },
  {
    label: "Latest records",
    sql: "SELECT *\nFROM `project.dataset.table_name`\nORDER BY created_at DESC\nLIMIT 100",
  },
  {
    label: "Daily stats",
    sql: "SELECT\n  DATE(created_at) AS day,\n  COUNT(*) AS total,\n  SUM(amount) AS revenue\nFROM `project.dataset.orders`\nGROUP BY 1\nORDER BY 1 DESC",
  },
  {
    label: "Campaign performance",
    sql: "SELECT\n  name AS campaign,\n  contacted,\n  opened,\n  replied,\n  ROUND(reply_rate, 2) AS reply_pct\nFROM `project.dataset.instantly_campaigns`\nORDER BY reply_rate DESC",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function QueryStudioPage() {
  const [sql, setSql]               = useState("-- Write a SQL query here\nSELECT 1 AS hello");
  const [result, setResult]         = useState<QueryResult | null>(null);
  const [running, setRunning]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [savedQueries, setSaved]    = useState<SavedQuery[]>([]);
  const [history, setHistory]       = useState<HistoryEntry[]>([]);
  const [tab, setTab]               = useState<"results" | "history" | "saved">("results");
  const [saveModal, setSaveModal]   = useState(false);
  const [saveName, setSaveName]     = useState("");
  const [saveDesc, setSaveDesc]     = useState("");
  const textareaRef                 = useRef<HTMLTextAreaElement>(null);

  // Load saved + history on mount
  useEffect(() => {
    fetch("/api/query/saved").then(r => r.json()).then((d: { queries: SavedQuery[] }) => setSaved(d.queries ?? [])).catch(() => {});
    fetch("/api/query/history").then(r => r.json()).then((d: { history: HistoryEntry[] }) => setHistory(d.history ?? [])).catch(() => {});
  }, []);

  const runQuery = useCallback(async () => {
    if (!sql.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setTab("results");
    try {
      const res = await fetch("/api/query/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const data = await res.json() as { result?: QueryResult; error?: string };
      if (data.error) {
        setError(data.error);
      } else if (data.result) {
        setResult(data.result);
        // Refresh history
        fetch("/api/query/history").then(r => r.json()).then((d: { history: HistoryEntry[] }) => setHistory(d.history ?? [])).catch(() => {});
      }
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }, [sql]);

  async function handleSave() {
    if (!saveName.trim()) return;
    try {
      const res = await fetch("/api/query/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName, description: saveDesc, sql }),
      });
      const data = await res.json() as { query: SavedQuery };
      setSaved(prev => [data.query, ...prev]);
      setSaveModal(false);
      setSaveName("");
      setSaveDesc("");
    } catch (e: unknown) {
      alert(String(e));
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/query/saved/${id}`, { method: "DELETE" });
    setSaved(prev => prev.filter(q => q.id !== id));
  }

  function exportCSV() {
    if (!result) return;
    const header = result.columns.join(",");
    const rows = result.rows.map(r => result.columns.map(c => JSON.stringify(r[c] ?? "")).join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "query-result.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Keyboard shortcut: Ctrl+Enter to run
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runQuery();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runQuery]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-zinc-950">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <div className="flex items-center gap-1.5">
          <Code2 className="w-5 h-5 text-indigo-400" />
          <h1 className="text-sm font-bold text-white">Query Studio</h1>
        </div>
        <div className="h-4 w-px bg-zinc-700" />
        {/* Template picker */}
        <div className="relative group">
          <button className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-md px-2.5 py-1.5 transition-colors">
            <Lightbulb className="w-3.5 h-3.5" />
            Templates
            <ChevronDown className="w-3 h-3" />
          </button>
          <div className="absolute left-0 top-full mt-1 w-52 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-10 hidden group-hover:block">
            {TEMPLATES.map(t => (
              <button
                key={t.label}
                onClick={() => setSql(t.sql)}
                className="block w-full text-left px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg transition-colors"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setSaveModal(true)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-md px-3 py-1.5 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
          <button
            onClick={runQuery}
            disabled={running}
            className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {running
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Play className="w-3.5 h-3.5" />
            }
            {running ? "Running…" : "Run"} <span className="text-indigo-300 text-xs ml-1">⌘↩</span>
          </button>
        </div>
      </div>

      {/* Editor + Results split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — saved queries */}
        <div className="w-56 border-r border-zinc-800 bg-zinc-900 flex flex-col shrink-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-800">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Saved Queries</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {savedQueries.length === 0 ? (
              <div className="p-3 text-xs text-zinc-600 text-center">
                <BookOpen className="w-6 h-6 mx-auto mb-1 opacity-40" />
                No saved queries yet
              </div>
            ) : (
              savedQueries.map(q => (
                <div key={q.id} className="group px-3 py-2 border-b border-zinc-800/50 hover:bg-zinc-800/40 cursor-pointer" onClick={() => setSql(q.sql)}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-zinc-200 truncate">{q.name}</p>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(q.id); }}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  {q.description && <p className="text-[10px] text-zinc-600 mt-0.5 truncate">{q.description}</p>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* SQL editor */}
          <div className="relative border-b border-zinc-800" style={{ height: "45%" }}>
            <div className="absolute top-2 left-2 flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
            </div>
            <textarea
              ref={textareaRef}
              value={sql}
              onChange={e => setSql(e.target.value)}
              className="w-full h-full bg-zinc-950 text-zinc-100 font-mono text-sm resize-none outline-none p-4 pt-8 border-0"
              spellCheck={false}
              placeholder="-- Write SQL here (Ctrl+Enter to run)"
            />
          </div>

          {/* Results pane */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Tab bar */}
            <div className="flex items-center gap-0 border-b border-zinc-800 bg-zinc-900 shrink-0">
              {(["results", "history", "saved"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-xs font-medium capitalize border-b-2 transition-colors ${
                    tab === t
                      ? "border-indigo-500 text-white"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {t === "results" ? "Results" : t === "history" ? "History" : "Saved"}
                  {t === "results" && result && (
                    <span className="ml-1.5 bg-emerald-500/20 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded-full">
                      {result.rowCount.toLocaleString()}
                    </span>
                  )}
                </button>
              ))}
              {result && (
                <div className="ml-auto flex items-center gap-4 px-4 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatMs(result.durationMs)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    {formatBytes(result.bytesProcessed)}
                  </span>
                  <button onClick={exportCSV} className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300">
                    <Download className="w-3 h-3" />
                    CSV
                  </button>
                </div>
              )}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto">
              {tab === "results" && (
                <>
                  {running && (
                    <div className="flex items-center justify-center h-full text-zinc-500">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                        <span className="text-sm">Running query…</span>
                      </div>
                    </div>
                  )}
                  {error && !running && (
                    <div className="p-4 flex items-start gap-3 text-sm text-red-400">
                      <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <pre className="font-mono text-xs whitespace-pre-wrap">{error}</pre>
                    </div>
                  )}
                  {result && !running && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-zinc-800/80 sticky top-0">
                          <tr>
                            {result.columns.map(col => (
                              <th key={col} className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap border-r border-zinc-700/40 last:border-r-0">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {result.rows.map((row, i) => (
                            <tr key={i} className="hover:bg-zinc-800/30">
                              {result.columns.map(col => (
                                <td key={col} className="px-3 py-1.5 text-zinc-300 font-mono whitespace-nowrap border-r border-zinc-800 last:border-r-0 max-w-xs truncate">
                                  {row[col] === null ? <span className="text-zinc-600">NULL</span> : String(row[col])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!result && !running && !error && (
                    <div className="flex items-center justify-center h-full text-zinc-600 flex-col gap-2">
                      <Play className="w-8 h-8 opacity-30" />
                      <span className="text-sm">Run a query to see results</span>
                    </div>
                  )}
                </>
              )}

              {tab === "history" && (
                <div className="divide-y divide-zinc-800">
                  {history.length === 0 && (
                    <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">No query history yet</div>
                  )}
                  {history.map(h => (
                    <div
                      key={h.id}
                      className="px-4 py-3 hover:bg-zinc-800/30 cursor-pointer group"
                      onClick={() => setSql(h.sql)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {h.status === "success"
                          ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          : <XCircle className="w-3.5 h-3.5 text-red-400" />
                        }
                        <span className="text-[10px] text-zinc-500">
                          {new Date(h.createdAt).toLocaleString()}
                          {h.durationMs && ` · ${formatMs(h.durationMs)}`}
                          {h.rowsReturned !== null && ` · ${h.rowsReturned.toLocaleString()} rows`}
                        </span>
                      </div>
                      <pre className="font-mono text-xs text-zinc-400 line-clamp-2 whitespace-pre-wrap">{h.sql}</pre>
                      {h.error && <p className="text-xs text-red-400 mt-1 truncate">{h.error}</p>}
                    </div>
                  ))}
                </div>
              )}

              {tab === "saved" && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {savedQueries.length === 0 && (
                    <div className="col-span-2 text-center text-zinc-600 text-sm py-8">
                      <Star className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Save a query to find it here later
                    </div>
                  )}
                  {savedQueries.map(q => (
                    <div key={q.id} className="bg-zinc-800/40 border border-zinc-700/50 rounded-lg p-3 cursor-pointer hover:border-zinc-600 group" onClick={() => setSql(q.sql)}>
                      <div className="flex items-start justify-between">
                        <p className="font-medium text-sm text-white">{q.name}</p>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(q.id); }}
                          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 ml-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {q.description && <p className="text-xs text-zinc-500 mt-0.5">{q.description}</p>}
                      <pre className="font-mono text-[10px] text-zinc-600 mt-2 line-clamp-2">{q.sql}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save modal */}
      {saveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-96 shadow-xl">
            <h2 className="font-semibold text-white mb-4">Save Query</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Name *</label>
                <input
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="My analysis"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Description</label>
                <input
                  value={saveDesc}
                  onChange={e => setSaveDesc(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Optional description"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setSaveModal(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
              <button
                onClick={handleSave}
                disabled={!saveName.trim()}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
