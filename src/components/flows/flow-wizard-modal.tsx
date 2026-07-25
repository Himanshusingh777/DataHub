"use client";

/**
 * FlowWizardModal — multi-connector flow creation wizard.
 *
 * Steps:
 *   1. source   → pick connector (CSV, Instantly, Shopify, HubSpot, Stripe, Google Sheets, PostgreSQL …)
 *   2. auth     → enter credentials (or file upload for CSV)
 *   3. objects  → pick which tables/objects to sync (skipped for CSV)
 *   4. dataset  → BigQuery dataset + table name
 *   5. schedule → sync frequency
 *   6. review   → confirm + create
 */

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Upload, FileText, Database, Clock, CheckCircle2, Loader2,
  ChevronRight, AlertTriangle, Eye, RefreshCw, ArrowRight, Key, Globe, Table,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useFlowWizardStore, parseCSVText, type CSVData } from "@/stores/flow-wizard.store";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

// ── Connector catalog ─────────────────────────────────────────────────────────

interface ConnectorDef {
  id: string;
  name: string;
  description: string;
  color: string;
  abbr: string;
  status: "live" | "coming_soon";
  authFields: AuthField[];
  defaultObjects?: string[];
}

interface AuthField {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "password" | "url" | "textarea";
  hint?: string;
}

const CONNECTORS: ConnectorDef[] = [
  {
    id: "csv",
    name: "CSV / Excel",
    description: "Upload a file and sync it to BigQuery",
    color: "#10B981",
    abbr: "CSV",
    status: "live",
    authFields: [],
  },
  {
    id: "instantly",
    name: "Instantly",
    description: "Campaigns, leads & email analytics",
    color: "#6366F1",
    abbr: "IN",
    status: "live",
    authFields: [
      { key: "api_key", label: "API Key", placeholder: "inst_xxxxxxxxxxxxxxxx", type: "password",
        hint: "Find it in Instantly → Settings → API Keys" },
    ],
    defaultObjects: ["campaigns"],
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Orders, products, customers, inventory",
    color: "#96BF48",
    abbr: "SH",
    status: "live",
    authFields: [
      { key: "shop_domain", label: "Shop Domain", placeholder: "mystore.myshopify.com", type: "url",
        hint: "Your Shopify store URL (without https://)" },
      { key: "admin_api_access_token", label: "Admin API Access Token", placeholder: "shpat_xxxxxxxxxxxx", type: "password",
        hint: "Create a Private App in Shopify → Settings → Apps → Develop Apps" },
    ],
    defaultObjects: ["orders", "products", "customers"],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Contacts, companies, deals, tickets",
    color: "#FF7A59",
    abbr: "HS",
    status: "live",
    authFields: [
      { key: "api_key", label: "Private App Token", placeholder: "pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", type: "password",
        hint: "HubSpot → Settings → Integrations → Private Apps → Create app" },
    ],
    defaultObjects: ["contacts", "companies", "deals"],
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Charges, customers, subscriptions, invoices",
    color: "#635BFF",
    abbr: "ST",
    status: "live",
    authFields: [
      { key: "api_key", label: "Secret Key", placeholder: "sk_live_xxxxxxxxxxxxxxxxxxxxxxxx", type: "password",
        hint: "Stripe Dashboard → Developers → API Keys → Secret key" },
    ],
    defaultObjects: ["charges", "customers", "subscriptions"],
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Sync any Google Sheet to BigQuery",
    color: "#34A853",
    abbr: "GS",
    status: "live",
    authFields: [
      { key: "spreadsheet_id", label: "Spreadsheet ID", placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
        hint: "The ID from the URL: docs.google.com/spreadsheets/d/[ID]/edit" },
      { key: "service_account_json", label: "Service Account JSON", placeholder: '{"type":"service_account",...}', type: "textarea",
        hint: "Google Cloud → IAM → Service Accounts → Create key (JSON)" },
    ],
  },
  {
    id: "postgresql",
    name: "PostgreSQL",
    description: "Sync any PostgreSQL table to BigQuery",
    color: "#336791",
    abbr: "PG",
    status: "live",
    authFields: [
      { key: "host", label: "Host", placeholder: "db.example.com" },
      { key: "port", label: "Port", placeholder: "5432" },
      { key: "database", label: "Database", placeholder: "mydb" },
      { key: "username", label: "Username", placeholder: "postgres" },
      { key: "password", label: "Password", placeholder: "••••••••", type: "password" },
      { key: "table", label: "Table name", placeholder: "public.orders",
        hint: "Schema-qualified table name to sync (e.g. public.orders)" },
    ],
  },
  {
    id: "apollo",
    name: "Apollo.io",
    description: "People & company data from Apollo",
    color: "#FF6B35",
    abbr: "AP",
    status: "coming_soon",
    authFields: [],
  },
  {
    id: "amazon",
    name: "Amazon Seller",
    description: "Orders, inventory & performance",
    color: "#FF9900",
    abbr: "AMZ",
    status: "coming_soon",
    authFields: [],
  },
  {
    id: "flipkart",
    name: "Flipkart Seller",
    description: "Orders, listings & returns",
    color: "#2874F0",
    abbr: "FK",
    status: "coming_soon",
    authFields: [],
  },
  {
    id: "mysql",
    name: "MySQL",
    description: "Sync any MySQL table to BigQuery",
    color: "#4479A1",
    abbr: "MY",
    status: "coming_soon",
    authFields: [],
  },
  {
    id: "salesforce",
    name: "Salesforce",
    description: "CRM objects, reports & custom fields",
    color: "#00A1E0",
    abbr: "SF",
    status: "coming_soon",
    authFields: [],
  },
];

// ── Schedules ─────────────────────────────────────────────────────────────────

const SCHEDULES = [
  { value: "manual",     label: "Manual only",   desc: "Run only when you click sync" },
  { value: "every_hour", label: "Every hour",    desc: "Syncs continuously, hourly" },
  { value: "every_6h",   label: "Every 6 hours", desc: "4× per day" },
  { value: "every_day",  label: "Daily",          desc: "Once per day at midnight UTC" },
  { value: "every_week", label: "Weekly",         desc: "Every Monday at midnight UTC" },
];

// ── Step types ────────────────────────────────────────────────────────────────

type Step = "source" | "auth" | "dataset" | "schedule" | "review" | "creating" | "done";
const STEPS: Step[] = ["source", "auth", "dataset", "schedule", "review"];
const STEP_LABELS: Record<Step, string> = {
  source: "Source", auth: "Connect", dataset: "Destination",
  schedule: "Schedule", review: "Review", creating: "Creating", done: "Done",
};

// ── ConnectorCard ─────────────────────────────────────────────────────────────

function ConnectorCard({ conn, selected, onClick }: { conn: ConnectorDef; selected: boolean; onClick: () => void }) {
  const isSoon = conn.status === "coming_soon";
  return (
    <button
      disabled={isSoon}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border-2 p-3.5 text-left transition-all w-full",
        isSoon ? "opacity-40 cursor-not-allowed border-border bg-muted/10" :
        selected ? "border-brand-500 bg-brand-50 dark:bg-brand-950/20" :
        "border-border hover:border-brand-300 hover:bg-muted/30"
      )}
    >
      <div
        className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 text-white text-[10px] font-bold"
        style={{ backgroundColor: conn.color }}
      >
        {conn.abbr}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{conn.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {isSoon ? "Coming soon" : conn.description}
        </p>
      </div>
      {selected && !isSoon && <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0 ml-auto" />}
    </button>
  );
}

// ── CSV Upload Zone ───────────────────────────────────────────────────────────

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const [drag, setDrag] = React.useState(false);
  const ref = React.useRef<HTMLInputElement>(null);
  function pick(files: FileList | null) { const f = files?.[0]; if (f) onFile(f); }
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
      onClick={() => ref.current?.click()}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all",
        drag ? "border-brand-400 bg-brand-50 dark:bg-brand-950/20" : "border-border hover:border-brand-300 hover:bg-muted/30"
      )}
    >
      <input ref={ref} type="file" accept=".csv,.tsv,.txt,.xlsx" className="hidden" onChange={e => pick(e.target.files)} />
      <Upload className="h-8 w-8 text-muted-foreground mb-2" />
      <p className="text-sm font-medium text-foreground">Drop CSV here or click to browse</p>
      <p className="text-xs text-muted-foreground mt-1">CSV, TSV, or XLSX · max 50 MB</p>
    </div>
  );
}

// ── Preview Table ─────────────────────────────────────────────────────────────

function PreviewTable({ csv }: { csv: CSVData }) {
  const cols = csv.columns.filter(c => c.include);
  return (
    <div className="rounded-lg border border-border overflow-auto max-h-44">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            {cols.map(c => (
              <th key={c.name} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                {c.displayName} <span className="opacity-50">{c.type}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {csv.preview.slice(0, 6).map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {csv.columns.map((col, j) => col.include && (
                <td key={j} className="px-3 py-1.5 text-muted-foreground truncate max-w-[120px]">
                  {row[j] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Row summary ───────────────────────────────────────────────────────────────

function SummaryRow({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-6 w-6 flex items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0">{icon}</div>
      <p className="text-xs text-muted-foreground w-24 shrink-0">{label}</p>
      <p className="text-sm font-medium text-foreground truncate">{value}</p>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function FlowWizardModal() {
  const store = useFlowWizardStore();
  const { toast } = useToast();
  const router = useRouter();

  const [step, setStep] = React.useState<Step>("source");
  const [dir, setDir] = React.useState<1 | -1>(1);
  const [selectedConn, setSelectedConn] = React.useState<ConnectorDef | null>(null);
  const [creds, setCreds] = React.useState<Record<string, string>>({});
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authenticating, setAuthenticating] = React.useState(false);
  const [csv, setCsv] = React.useState<CSVData | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [dataset, setDataset] = React.useState("");
  const [tableName, setTableName] = React.useState("");
  const [flowName, setFlowName] = React.useState("");
  const [schedule, setSchedule] = React.useState("manual");
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  if (!store.active) return null;

  function reset() {
    setStep("source"); setSelectedConn(null); setCreds({});
    setAuthError(null); setCsv(null); setParseError(null);
    setDataset(""); setTableName(""); setFlowName("");
    setSchedule("manual"); setCreating(false); setCreateError(null);
  }

  function close() { store.closeWizard(); reset(); }

  function go(next: Step, d: 1 | -1 = 1) { setDir(d); setStep(next); }

  async function handleFile(file: File) {
    setParsing(true); setParseError(null);
    try {
      const text = await file.text();
      const data = parseCSVText(text, file.name, file.size);
      setCsv(data);
      const base = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
      setTableName(base);
      setFlowName(`CSV → BigQuery (${file.name})`);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to parse file");
    } finally { setParsing(false); }
  }

  async function handleAuth() {
    if (!selectedConn) return;
    if (selectedConn.id === "csv") { go("dataset"); return; }

    setAuthenticating(true); setAuthError(null);
    try {
      const res = await fetch("/api/connectors/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId: selectedConn.id, creds }),
      });
      const data = await res.json();
      if (data.ok) {
        // Save credentials to vault — use server-mapped field names so the sync runner can find them
        await fetch("/api/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service: selectedConn.id, data: data.mappedCreds ?? creds }),
        });
        setFlowName(`${selectedConn.name} → BigQuery`);
        setTableName(`${selectedConn.id}_data`);
        go("dataset");
      } else {
        setAuthError(data.error ?? "Authentication failed — check your credentials");
      }
    } catch {
      setAuthError("Network error — please try again");
    } finally { setAuthenticating(false); }
  }

  async function handleCreate() {
    if (!selectedConn) return;
    setCreating(true); setCreateError(null);
    go("creating");

    try {
      if (selectedConn.id === "csv") {
        // CSV path — upload rows directly to BigQuery
        if (!csv) throw new Error("No file uploaded");
        const includedCols = csv.columns.filter(c => c.include);
        const rows = (csv.allRows ?? csv.preview).map(row =>
          Object.fromEntries(includedCols.map((col, i) => [col.displayName, row[csv.columns.indexOf(col)] ?? null]))
        );
        const importRes = await fetch("/api/bigquery/csv-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: tableName, rows, dataset: dataset || undefined }),
        });
        const importData = await importRes.json();
        if (!importRes.ok || !importData.ok) {
          throw new Error(importData.notConfigured
            ? "BigQuery not configured. Go to Settings → Integrations first."
            : (importData.error ?? "BigQuery upload failed"));
        }
        const flowId = `flow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await fetch("/api/flows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: flowId, name: flowName || "CSV → BigQuery",
            sourceId: "csv", sourceName: "CSV Upload",
            destId: "bigquery", destName: "BigQuery",
            scheduleValue: schedule,
            warehouseTable: `${importData.dataset}.${tableName}`,
            dataset: importData.dataset, syncMode: "full",
          }),
        });
        toast.success("Flow created!", `${importData.rowsInserted} rows loaded into ${importData.dataset}.${tableName}`);
      } else {
        // API connector path — register flow, worker will pull data
        const flowId = `flow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const res = await fetch("/api/flows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: flowId, name: flowName,
            sourceId: selectedConn.id, sourceName: selectedConn.name,
            destId: "bigquery", destName: "BigQuery",
            scheduleValue: schedule,
            warehouseTable: `${dataset || "default"}.${tableName}`,
            dataset: dataset || undefined, syncMode: "full",
          }),
        });
        if (!res.ok) throw new Error("Failed to register flow");
        // Trigger immediate sync
        await fetch("/api/sync/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flowId, triggerBy: "manual" }),
        });
        toast.success("Flow created!", `${selectedConn.name} is syncing to BigQuery`);
      }

      go("done");
      setTimeout(() => { close(); router.refresh(); }, 2000);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Something went wrong");
      go("review");
    } finally { setCreating(false); }
  }

  const stepIdx = STEPS.indexOf(step);
  const variants = {
    enter: (d: number) => ({ opacity: 0, x: d > 0 ? 40 : -40 }),
    center: { opacity: 1, x: 0 },
    exit:  (d: number) => ({ opacity: 0, x: d > 0 ? -40 : 40 }),
  };

  const canContinue = (() => {
    if (step === "source") return !!selectedConn;
    if (step === "auth") {
      if (selectedConn?.id === "csv") return !!csv;
      return selectedConn?.authFields.every(f => creds[f.key]?.trim()) ?? false;
    }
    if (step === "dataset") return !!tableName.trim();
    return true;
  })();

  function handleNext() {
    if (step === "source") {
      go("auth");
    } else if (step === "auth") {
      if (selectedConn?.id === "csv") go("dataset");
      else handleAuth();
    } else if (step === "dataset") {
      go("schedule");
    } else if (step === "schedule") {
      go("review");
    } else if (step === "review") {
      handleCreate();
    }
  }

  function handleBack() {
    const prev: Record<Step, Step> = {
      source: "source", auth: "source", dataset: "auth",
      schedule: "dataset", review: "schedule", creating: "review", done: "review",
    };
    if (step === "source") close();
    else go(prev[step], -1);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-border bg-white dark:bg-[#0e0f1a] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="text-sm font-bold text-foreground">New Flow</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedConn ? `${selectedConn.name} → BigQuery` : "Connect a source to BigQuery"}
            </p>
          </div>
          <button onClick={close} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-accent">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Step tracker */}
        {step !== "creating" && step !== "done" && (
          <div className="flex items-center px-6 py-3 border-b border-border bg-muted/20">
            {STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors",
                    i < stepIdx ? "bg-brand-600 text-white" :
                    i === stepIdx ? "bg-brand-600 text-white ring-2 ring-brand-200 dark:ring-brand-800" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {i < stepIdx ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className={cn("text-[11px] font-medium", i === stepIdx ? "text-foreground" : "text-muted-foreground")}>
                    {STEP_LABELS[s]}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn("flex-1 h-px mx-2", i < stepIdx ? "bg-brand-400" : "bg-border")} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="min-h-[340px] overflow-hidden">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={variants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.18, ease: "easeInOut" }}
              className="p-6"
            >

              {/* ── Step 1: Source ── */}
              {step === "source" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Choose a source</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Select a connector to sync data to BigQuery</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                    {CONNECTORS.map(conn => (
                      <ConnectorCard
                        key={conn.id}
                        conn={conn}
                        selected={selectedConn?.id === conn.id}
                        onClick={() => { setSelectedConn(conn); setCreds({}); setCsv(null); }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Step 2: Auth / Upload ── */}
              {step === "auth" && selectedConn && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: selectedConn.color }}>
                      {selectedConn.abbr}
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Connect {selectedConn.name}</h2>
                      <p className="text-xs text-muted-foreground">{selectedConn.description}</p>
                    </div>
                  </div>

                  {authError && (
                    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/20 p-3 text-sm text-rose-700 dark:text-rose-400">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {authError}
                    </div>
                  )}

                  {/* CSV upload */}
                  {selectedConn.id === "csv" && (
                    <>
                      {!csv && !parsing && <UploadZone onFile={handleFile} />}
                      {parsing && (
                        <div className="flex items-center justify-center py-8 gap-3 text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin" /> <span className="text-sm">Parsing file…</span>
                        </div>
                      )}
                      {parseError && (
                        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                          <AlertTriangle className="h-4 w-4" /> {parseError}
                        </div>
                      )}
                      {csv && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-3">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{csv.fileName}</p>
                              <p className="text-xs text-muted-foreground">{csv.totalRows.toLocaleString()} rows · {csv.columns.length} columns</p>
                            </div>
                            <button onClick={() => setCsv(null)}><RefreshCw className="h-3.5 w-3.5 text-muted-foreground" /></button>
                          </div>
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Eye className="h-3 w-3" /> Preview</p>
                          <PreviewTable csv={csv} />
                        </div>
                      )}
                    </>
                  )}

                  {/* API connector credential form */}
                  {selectedConn.id !== "csv" && (
                    <div className="space-y-3">
                      {selectedConn.authFields.map(field => (
                        <div key={field.key}>
                          <Label className="text-xs font-medium">{field.label}</Label>
                          {field.type === "textarea" ? (
                            <textarea
                              value={creds[field.key] ?? ""}
                              onChange={e => setCreds(p => ({ ...p, [field.key]: e.target.value }))}
                              placeholder={field.placeholder}
                              rows={4}
                              className="mt-1.5 w-full rounded-lg border border-border bg-white dark:bg-[#0e0f1a] px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                            />
                          ) : (
                            <Input
                              type={field.type ?? "text"}
                              value={creds[field.key] ?? ""}
                              onChange={e => setCreds(p => ({ ...p, [field.key]: e.target.value }))}
                              placeholder={field.placeholder}
                              className="mt-1.5 h-9 text-sm"
                            />
                          )}
                          {field.hint && <p className="text-[11px] text-muted-foreground mt-1">{field.hint}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 3: Destination ── */}
              {step === "dataset" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">BigQuery destination</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Where should the data land in BigQuery?</p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs font-medium">Flow name</Label>
                      <Input value={flowName} onChange={e => setFlowName(e.target.value)}
                        placeholder="e.g. Shopify Orders → BigQuery" className="mt-1.5 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Dataset <span className="text-muted-foreground font-normal">(leave blank to use default from Settings)</span></Label>
                      <Input value={dataset} onChange={e => setDataset(e.target.value)}
                        placeholder="frugal_data" className="mt-1.5 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Table name <span className="text-rose-500">*</span></Label>
                      <Input value={tableName}
                        onChange={e => setTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                        placeholder="shopify_orders" className="mt-1.5 h-9 text-sm font-mono" />
                      <p className="text-[11px] text-muted-foreground mt-1">Lowercase, underscores only. Created automatically if it doesn't exist.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 4: Schedule ── */}
              {step === "schedule" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Sync schedule</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">How often should CrossTecch sync this data?</p>
                  </div>
                  <div className="space-y-2">
                    {SCHEDULES.map(s => (
                      <button key={s.value} onClick={() => setSchedule(s.value)}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all",
                          schedule === s.value ? "border-brand-500 bg-brand-50 dark:bg-brand-950/20" : "border-border hover:border-brand-300 hover:bg-muted/30"
                        )}>
                        <div className={cn("h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center",
                          schedule === s.value ? "border-brand-500" : "border-border")}>
                          {schedule === s.value && <div className="h-2 w-2 rounded-full bg-brand-500" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{s.label}</p>
                          <p className="text-xs text-muted-foreground">{s.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Step 5: Review ── */}
              {step === "review" && selectedConn && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Review & create</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Everything correct? Click Create to start syncing.</p>
                  </div>
                  {createError && (
                    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/20 p-3 text-sm text-rose-700 dark:text-rose-400">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {createError}
                    </div>
                  )}
                  <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                    <SummaryRow label="Source" value={selectedConn.name + (csv ? ` — ${csv.fileName}` : "")} icon={<Key className="h-3.5 w-3.5" />} />
                    <SummaryRow label="Destination" value={`BigQuery — ${dataset || "default"}.${tableName}`} icon={<Database className="h-3.5 w-3.5" />} />
                    {csv && <SummaryRow label="Rows" value={`${csv.totalRows.toLocaleString()} rows · ${csv.columns.filter(c => c.include).length} columns`} icon={<Table className="h-3.5 w-3.5" />} />}
                    <SummaryRow label="Schedule" value={SCHEDULES.find(s => s.value === schedule)?.label ?? schedule} icon={<Clock className="h-3.5 w-3.5" />} />
                    <SummaryRow label="Flow name" value={flowName || `${selectedConn.name} → BigQuery`} icon={<ArrowRight className="h-3.5 w-3.5" />} />
                  </div>
                </div>
              )}

              {/* ── Creating ── */}
              {step === "creating" && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="h-14 w-14 rounded-full bg-brand-50 dark:bg-brand-950/30 flex items-center justify-center">
                    <Loader2 className="h-7 w-7 text-brand-600 animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">Creating flow…</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedConn?.id === "csv" ? "Uploading data to BigQuery" : `Connecting to ${selectedConn?.name} and starting first sync`}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Done ── */}
              {step === "done" && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="h-14 w-14 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                    <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">Flow created!</p>
                    <p className="text-xs text-muted-foreground mt-1">Data is syncing to BigQuery. Redirecting…</p>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        {step !== "creating" && step !== "done" && (
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <Button variant="outline" size="sm" onClick={handleBack}>
              {step === "source" ? "Cancel" : "Back"}
            </Button>
            <Button size="sm" disabled={!canContinue || authenticating || creating} onClick={handleNext} className="gap-1.5">
              {authenticating ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Verifying…</>
              ) : step === "review" ? (
                <>Create Flow <ChevronRight className="h-3.5 w-3.5" /></>
              ) : step === "auth" && selectedConn?.id !== "csv" ? (
                <>Verify & Continue <ChevronRight className="h-3.5 w-3.5" /></>
              ) : (
                <>Continue <ChevronRight className="h-3.5 w-3.5" /></>
              )}
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
