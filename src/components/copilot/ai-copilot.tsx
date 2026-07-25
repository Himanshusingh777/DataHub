"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, X, Send, Plus, Trash2, Edit3, Check, ChevronLeft,
  Copy, RefreshCw, Zap, Database, GitBranch, Upload, AlertCircle,
  BarChart3, MessageSquare, History
} from "lucide-react";
import { useCopilotStore } from "@/stores/copilot.store";
import type { CopilotMessage, CopilotConversation } from "@/stores/copilot.store";
import { cn } from "@/lib/utils";

// ── Suggested prompts ─────────────────────────────────────────────────────────
const SUGGESTIONS = [
  { icon: Zap,          label: "Connect Shopify",    prompt: "Connect my Shopify store as a source connector" },
  { icon: GitBranch,    label: "Create pipeline",    prompt: "Help me create a new data pipeline from Shopify to Snowflake" },
  { icon: RefreshCw,    label: "Run today's sync",   prompt: "Run all scheduled sync jobs for today" },
  { icon: AlertCircle,  label: "Show failed jobs",   prompt: "Show me all failed sync jobs from the last 24 hours" },
  { icon: Upload,       label: "Upload CSV",         prompt: "Help me upload and import a CSV file into the platform" },
  { icon: Database,     label: "Create connector",   prompt: "Walk me through creating a new database connector" },
  { icon: BarChart3,    label: "Analytics report",   prompt: "Generate an analytics summary for this week's data activity" },
  { icon: MessageSquare, label: "Pipeline health",   prompt: "What's the health status of my active pipelines?" },
];

// ── Mock AI responses ─────────────────────────────────────────────────────────
const MOCK_RESPONSES: Record<string, string> = {
  default: `I can help you with that! Here's what I found:

## Quick Summary

Your CrossTecch workspace is running smoothly with **12 active connectors** and **8 pipelines** configured.

### Recent Activity
- ✅ Shopify sync completed — 2,841 records processed
- ✅ Salesforce sync completed — 1,204 contacts updated
- ⚠️ Stripe connector rate-limited — retrying in 15 minutes

### Recommended Actions

1. **Review failed jobs** — 3 jobs need attention in the last 24h
2. **Update Stripe credentials** — API key expiring in 7 days
3. **Enable monitoring alerts** — Set up Slack notifications for failures

\`\`\`bash
# Quick status check via API
curl -H "Authorization: Bearer ct_live_xxx" \\
  https://api.crosstecch.io/v1/jobs/status
\`\`\`

Is there anything specific you'd like me to help with?`,
  shopify: `## Connecting Your Shopify Store

I'll walk you through connecting Shopify as a source connector in 3 steps.

### Step 1 — Open Connector Setup
Navigate to **Connectors → Add Connector** and search for "Shopify".

### Step 2 — Authenticate
You'll need your **Shopify store URL** and a **Private App API key**:

\`\`\`
Store URL: https://your-store.myshopify.com
API Key:   shpat_xxxxxxxxxxxxxxxxxxxxx
\`\`\`

### Step 3 — Select Objects to Sync
Choose which Shopify objects to replicate:
- 🛍️ Orders & Line Items
- 👥 Customers
- 📦 Products & Variants
- 💰 Transactions
- 📊 Analytics Events

**Estimated sync time:** ~15 minutes for initial load

Shall I navigate you to the Connector setup page now?`,
  pipeline: `## Creating a Shopify → Snowflake Pipeline

Here's the recommended pipeline architecture:

\`\`\`
[Shopify Source] → [Filter: Paid Orders] → [Rename Columns] → [Snowflake Destination]
\`\`\`

### Pipeline Configuration

| Setting | Value |
|---------|-------|
| Source | Shopify (connected) |
| Destination | Snowflake DW |
| Schedule | Every 6 hours |
| Incremental | Yes — by updated_at |
| Transform | Rename + Type cast |

### Estimated Performance
- **Initial load:** ~45 minutes
- **Incremental:** ~2 minutes per run
- **Data volume:** ~500 MB/month

I can create this pipeline automatically. Want me to proceed?`,
  failed: `## Failed Sync Jobs — Last 24 Hours

Found **3 failed jobs** that need your attention:

| Job | Connector | Error | Time |
|-----|-----------|-------|------|
| sync-8821 | Stripe | Rate limit 429 | 2h ago |
| sync-8804 | HubSpot | Auth token expired | 5h ago |
| sync-8791 | PostgreSQL | Connection timeout | 8h ago |

### Recommended Fixes

1. **Stripe** — Reduce sync frequency to every 2 hours (free tier limit)
2. **HubSpot** — Re-authenticate via Connectors → HubSpot → Reconnect
3. **PostgreSQL** — Check firewall rules allow CrossTecch IPs

**Auto-retry available** for Stripe and PostgreSQL failures.

Want me to trigger a retry for the Stripe and PostgreSQL jobs?`,
};

function getMockResponse(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("shopify") || lower.includes("connect")) return MOCK_RESPONSES.shopify;
  if (lower.includes("pipeline") || lower.includes("create")) return MOCK_RESPONSES.pipeline;
  if (lower.includes("failed") || lower.includes("error") || lower.includes("jobs")) return MOCK_RESPONSES.failed;
  return MOCK_RESPONSES.default;
}

// ── Markdown renderer (minimal, inline) ───────────────────────────────────────
function MiniMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  function fmt(text: string): React.ReactNode {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((p, pi) => {
      if (p.startsWith("**") && p.endsWith("**")) return <strong key={pi} className="font-semibold text-foreground">{p.slice(2,-2)}</strong>;
      if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return <em key={pi} className="italic">{p.slice(1,-1)}</em>;
      if (p.startsWith("`") && p.endsWith("`")) return <code key={pi} className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono text-brand-600 dark:text-brand-400">{p.slice(1,-1)}</code>;
      return p;
    });
  }

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      nodes.push(
        <div key={`cb-${i}`} className="my-2 rounded-lg overflow-hidden border border-border text-[11px]">
          <pre className="bg-[#0a0b16] px-3 py-2.5 overflow-x-auto text-slate-300 font-mono leading-5 whitespace-pre">
            <code>{codeLines.join("\n")}</code>
          </pre>
        </div>
      );
    } else if (line.startsWith("## ")) {
      nodes.push(<h3 key={i} className="mt-3 mb-1 text-sm font-bold text-foreground">{fmt(line.slice(3))}</h3>);
    } else if (line.startsWith("### ")) {
      nodes.push(<h4 key={i} className="mt-2 mb-1 text-xs font-semibold text-foreground">{fmt(line.slice(4))}</h4>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].slice(2));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="my-1.5 space-y-0.5 pl-2">
          {items.map((it, ii) => (
            <li key={ii} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" /><span>{fmt(it)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, "")); i++; }
      nodes.push(
        <ol key={`ol-${i}`} className="my-1.5 space-y-0.5 pl-2">
          {items.map((it, ii) => (
            <li key={ii} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-950/30 text-[9px] font-bold text-brand-600 dark:text-brand-400">{ii+1}</span>
              <span>{fmt(it)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!lines[i].includes("---")) rows.push(lines[i].split("|").map(c=>c.trim()).filter(Boolean));
        i++;
      }
      if (rows.length > 0) {
        const [header, ...body] = rows;
        nodes.push(
          <div key={`tbl-${i}`} className="my-2 overflow-x-auto rounded-lg border border-border text-[11px]">
            <table className="w-full">
              <thead><tr className="border-b border-border bg-muted/40">{header.map((h,j)=><th key={j} className="px-2.5 py-1.5 text-left font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
              <tbody>{body.map((row,ri)=><tr key={ri} className="border-b border-border/50 last:border-0">{row.map((cell,ci)=><td key={ci} className="px-2.5 py-1.5 text-muted-foreground">{fmt(cell)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        continue;
      }
    } else if (line.trim() === "") {
      // blank
    } else {
      nodes.push(<p key={i} className="my-1 text-xs leading-5 text-muted-foreground">{fmt(line)}</p>);
    }
    i++;
  }
  return <div>{nodes}</div>;
}

// ── Streaming dots ─────────────────────────────────────────────────────────────
function StreamDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.div key={i} className="h-1.5 w-1.5 rounded-full bg-brand-400"
          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }} />
      ))}
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: CopilotMessage }) {
  const [copied, setCopied] = React.useState(false);
  function copy() {
    navigator.clipboard.writeText(msg.content).catch(()=>{});
    setCopied(true);
    setTimeout(()=>setCopied(false),2000);
  }

  if (msg.role === "user") {
    return (
      <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-600 px-3.5 py-2.5 text-white text-xs leading-5">
          {msg.content}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className="flex gap-2.5 group">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-sm mt-0.5">
        <Sparkles className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        {msg.isStreaming ? <StreamDots /> : (
          <>
            <MiniMarkdown content={msg.content} />
            <button onClick={copy} className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors opacity-0 group-hover:opacity-100">
              {copied ? <><Check className="h-3 w-3 text-emerald-500"/>Copied</> : <><Copy className="h-3 w-3"/>Copy</>}
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ── Conversation list ──────────────────────────────────────────────────────────
function ConversationList({ conversations, activeId, onSelect, onCreate, onDelete, onRename }: {
  conversations: CopilotConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [editing, setEditing] = React.useState<string|null>(null);
  const [editVal, setEditVal] = React.useState("");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5"><History className="h-3.5 w-3.5"/>History</span>
        <button onClick={onCreate} className="flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 font-medium">
          <Plus className="h-3 w-3"/>New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {conversations.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center mt-6">No conversations yet</p>
        )}
        {conversations.map((conv) => (
          <div key={conv.id} className={cn("group flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors",
            activeId===conv.id ? "bg-brand-50 dark:bg-brand-950/20" : "hover:bg-muted/40"
          )} onClick={()=>onSelect(conv.id)}>
            {editing===conv.id ? (
              <input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)}
                onBlur={()=>{onRename(conv.id,editVal||conv.title);setEditing(null);}}
                onKeyDown={e=>{if(e.key==="Enter"){onRename(conv.id,editVal||conv.title);setEditing(null);}}}
                className="flex-1 text-[11px] bg-transparent border-b border-brand-300 outline-none text-foreground"
                onClick={e=>e.stopPropagation()} />
            ) : (
              <span className="flex-1 text-[11px] text-foreground truncate">{conv.title}</span>
            )}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button onClick={e=>{e.stopPropagation();setEditing(conv.id);setEditVal(conv.title);}}
                className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                <Edit3 className="h-3 w-3"/>
              </button>
              <button onClick={e=>{e.stopPropagation();onDelete(conv.id);}}
                className="p-0.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/20 text-muted-foreground hover:text-rose-500">
                <Trash2 className="h-3 w-3"/>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main sidebar ───────────────────────────────────────────────────────────────
function CopilotSidebar() {
  const {
    activeConversationId, conversations, setOpen,
    newConversation, setActiveConversation,
    addMessage, updateMessage,
    renameConversation, deleteConversation,
  } = useCopilotStore();

  const [input, setInput] = React.useState("");
  const [showHistory, setShowHistory] = React.useState(false);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const activeConv = conversations.find(c=>c.id===activeConversationId) ?? null;

  React.useEffect(()=>{
    bottomRef.current?.scrollIntoView({behavior:"smooth"});
  }, [activeConv?.messages]);

  async function sendMessage(text?: string) {
    const content = text ?? input.trim();
    if (!content || isStreaming) return;
    setInput("");

    let convId = activeConversationId;
    if (!convId) convId = newConversation();

    const userMsg: CopilotMessage = { id: Math.random().toString(36).slice(2), role:"user", content, timestamp: new Date() };
    addMessage(convId, userMsg);

    const aiId = Math.random().toString(36).slice(2);
    const aiMsg: CopilotMessage = { id: aiId, role:"assistant", content:"", timestamp: new Date(), isStreaming: true };
    addMessage(convId, aiMsg);
    setIsStreaming(true);

    // Simulate streaming
    const response = getMockResponse(content);
    let streamed = "";
    const chunks = response.split(" ");
    for (let i = 0; i < chunks.length; i++) {
      await new Promise(r=>setTimeout(r, 18 + Math.random()*15));
      streamed += (i===0?"":"")+chunks[i]+(i<chunks.length-1?" ":"");
      updateMessage(convId, aiId, streamed, true);
    }
    updateMessage(convId, aiId, response, false);
    setIsStreaming(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0e0f1a]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <button onClick={()=>setShowHistory(p=>!p)} className={cn("flex h-7 w-7 items-center justify-center rounded-lg transition-colors", showHistory?"bg-brand-100 dark:bg-brand-950/30 text-brand-600":"text-muted-foreground hover:bg-muted")}>
          <History className="h-3.5 w-3.5"/>
        </button>
        <div className="flex items-center gap-1.5 flex-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-600">
            <Sparkles className="h-3 w-3 text-white"/>
          </div>
          <span className="text-sm font-semibold text-foreground">AI Copilot</span>
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/30 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">BETA</span>
        </div>
        <button onClick={()=>newConversation()} title="New chat"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors">
          <Plus className="h-3.5 w-3.5"/>
        </button>
        <button onClick={()=>setOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors">
          <X className="h-4 w-4"/>
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* History panel */}
        <AnimatePresence>
          {showHistory && (
            <motion.div initial={{width:0,opacity:0}} animate={{width:180,opacity:1}} exit={{width:0,opacity:0}}
              className="border-r border-border overflow-hidden shrink-0">
              <ConversationList conversations={conversations} activeId={activeConversationId}
                onSelect={(id)=>{setActiveConversation(id);setShowHistory(false);}}
                onCreate={()=>{newConversation();setShowHistory(false);}}
                onDelete={deleteConversation} onRename={renameConversation} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat area */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {!activeConv || activeConv.messages.length === 0 ? (
              <div className="flex flex-col items-center pt-6 pb-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-lg mb-3">
                  <Sparkles className="h-6 w-6 text-white"/>
                </div>
                <h3 className="text-sm font-bold text-foreground">CrossTecch Copilot</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">Ask me anything about your data pipelines, connectors, or sync jobs.</p>
                <div className="mt-5 grid grid-cols-2 gap-1.5 w-full">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.label} onClick={()=>sendMessage(s.prompt)}
                      className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-2.5 py-2 text-left hover:bg-muted hover:border-brand-200 transition-all group">
                      <s.icon className="h-3.5 w-3.5 shrink-0 text-brand-400 group-hover:text-brand-600"/>
                      <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground truncate">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {activeConv.messages.map((msg)=>(
                  <MessageBubble key={msg.id} msg={msg}/>
                ))}
                <div ref={bottomRef}/>
              </>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 px-3 pb-3 pt-2 border-t border-border">
            <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100 dark:focus-within:ring-brand-950/30 transition-all">
              <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={handleKey} rows={1} placeholder="Ask Copilot anything…"
                className="flex-1 resize-none bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none max-h-28 leading-5"
                style={{height:"auto"}} onInput={e=>{const t=e.currentTarget;t.style.height="auto";t.style.height=t.scrollHeight+"px";}}
                disabled={isStreaming}/>
              <button onClick={()=>sendMessage()} disabled={!input.trim()||isStreaming}
                className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all",
                  input.trim()&&!isStreaming?"bg-brand-600 text-white hover:bg-brand-700 shadow-sm":"bg-muted text-muted-foreground/40 cursor-not-allowed"
                )}>
                <Send className="h-3.5 w-3.5"/>
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground/50 text-center">AI responses are simulated for demo purposes</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Floating button + sidebar overlay ─────────────────────────────────────────
export function AICopilot() {
  const { isOpen, toggleOpen } = useCopilotStore();

  return (
    <>
      {/* Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] xl:hidden"
              onClick={()=>toggleOpen()} />
            {/* Panel */}
            <motion.div initial={{x:"100%"}} animate={{x:0}} exit={{x:"100%"}}
              transition={{type:"spring",damping:28,stiffness:320}}
              className="fixed right-0 top-0 z-50 h-full w-80 border-l border-border shadow-2xl">
              <CopilotSidebar/>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* FAB */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button initial={{scale:0,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0,opacity:0}}
            transition={{type:"spring",damping:20,stiffness:300}}
            onClick={toggleOpen}
            className="fixed bottom-6 right-6 z-40 flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-[0_8px_30px_rgba(99,102,241,0.4)] hover:shadow-[0_8px_40px_rgba(99,102,241,0.6)] transition-shadow"
            style={{height:52,width:52}}
            aria-label="Open AI Copilot"
          >
            <motion.div animate={{rotate:[0,10,-10,0]}} transition={{duration:2,repeat:Infinity,repeatDelay:4}}>
              <Sparkles className="h-5.5 w-5.5 text-white" style={{height:22,width:22}}/>
            </motion.div>
            {/* Pulse ring */}
            <motion.div animate={{scale:[1,1.5],opacity:[0.6,0]}} transition={{duration:2,repeat:Infinity,repeatDelay:1}}
              className="absolute inset-0 rounded-2xl bg-brand-400 pointer-events-none"/>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
