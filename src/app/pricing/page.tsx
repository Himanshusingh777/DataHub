"use client";

import React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, ArrowRight, Zap, Sparkles, ChevronDown } from "lucide-react";
import { ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

// ── Data ──────────────────────────────────────────────────────────────────────
const PLANS = [
  {
    id: "free", name: "Free", monthly: 0, yearly: 0, color: "#64748b",
    badge: "", cta: "Get started free", ctaHref: ROUTES.REGISTER,
    desc: "For individuals and side projects exploring data integration.",
    highlight: false,
    limits: { connectors: 2, dataGB: 1, syncFreq: "Daily", members: 1, apiCalls: "100/mo" },
  },
  {
    id: "starter", name: "Starter", monthly: 49, yearly: 39, color: "#6366f1",
    badge: "", cta: "Start free trial", ctaHref: ROUTES.REGISTER,
    desc: "For small teams getting started with data integration.",
    highlight: false,
    limits: { connectors: 5, dataGB: 10, syncFreq: "Every 6h", members: 3, apiCalls: "1,000/mo" },
  },
  {
    id: "growth", name: "Growth", monthly: 199, yearly: 159, color: "#8b5cf6",
    badge: "Most popular", cta: "Start free trial", ctaHref: ROUTES.REGISTER,
    desc: "For growing teams that need speed, volume, and collaboration.",
    highlight: true,
    limits: { connectors: 25, dataGB: 250, syncFreq: "Hourly", members: 15, apiCalls: "50,000/mo" },
  },
  {
    id: "enterprise", name: "Enterprise", monthly: 799, yearly: 639, color: "#10b981",
    badge: "", cta: "Contact sales", ctaHref: "#contact",
    desc: "For enterprises with custom scale, security, and SLA requirements.",
    highlight: false,
    limits: { connectors: "Unlimited", dataGB: "Unlimited", syncFreq: "Real-time", members: "Unlimited", apiCalls: "Unlimited" },
  },
];

// ── Feature matrix ────────────────────────────────────────────────────────────
const FEATURE_GROUPS = [
  {
    group: "Data Sources",
    features: [
      { label: "Native connectors",        values: ["2", "5", "25", "Unlimited"] },
      { label: "Custom API connectors",     values: [false, false, true, true] },
      { label: "Database connectors",       values: [false, true, true, true] },
      { label: "File connectors (S3, GCS)", values: [false, false, true, true] },
      { label: "Real-time CDC streams",     values: [false, false, false, true] },
    ],
  },
  {
    group: "Pipelines & Sync",
    features: [
      { label: "Pipelines",                 values: ["1", "5", "25", "Unlimited"] },
      { label: "Sync frequency",            values: ["Daily", "Every 6h", "Hourly", "Real-time"] },
      { label: "Data volume / month",       values: ["1 GB", "10 GB", "250 GB", "Unlimited"] },
      { label: "Incremental syncs",         values: [false, true, true, true] },
      { label: "Auto-retry on failure",     values: [false, true, true, true] },
      { label: "Custom SQL transforms",     values: [false, false, true, true] },
    ],
  },
  {
    group: "Monitoring",
    features: [
      { label: "Sync job history",          values: ["7 days", "30 days", "90 days", "1 year"] },
      { label: "Activity logs",             values: [false, true, true, true] },
      { label: "Email alerts",              values: [false, true, true, true] },
      { label: "Slack notifications",       values: [false, false, true, true] },
      { label: "Custom webhook alerts",     values: [false, false, true, true] },
    ],
  },
  {
    group: "Team & Security",
    features: [
      { label: "Team members",              values: ["1", "3", "15", "Unlimited"] },
      { label: "Role-based access (RBAC)",  values: [false, false, true, true] },
      { label: "API key management",        values: [false, true, true, true] },
      { label: "SSO / SAML",               values: [false, false, false, true] },
      { label: "Audit logs",               values: [false, false, true, true] },
      { label: "IP allowlisting",          values: [false, false, false, true] },
    ],
  },
  {
    group: "Support",
    features: [
      { label: "Community support",         values: [true, true, true, true] },
      { label: "Email support",             values: [false, true, true, true] },
      { label: "Priority support",          values: [false, false, true, true] },
      { label: "Dedicated CSM",             values: [false, false, false, true] },
      { label: "SLA guarantee",             values: [false, false, false, "99.9%"] },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function Cell({ val }: { val: boolean | string }) {
  if (val === true)  return <Check className="h-4 w-4 text-emerald-500 mx-auto" />;
  if (val === false) return <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />;
  return <span className="text-sm font-medium text-foreground">{val}</span>;
}

// ── Nav (minimal) ─────────────────────────────────────────────────────────────
function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white/90 dark:bg-[#0a0b10]/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">CrossTecch</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href={ROUTES.LOGIN} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Sign in</Link>
          <Link href={ROUTES.REGISTER} className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-sm">
            Start free <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

// ── FAQ (extracted to avoid hooks-in-map) ─────────────────────────────────────
const PRICING_FAQ = [
  { q: "Can I upgrade or downgrade at any time?", a: "Yes. Plan changes take effect at the start of the next billing cycle. If you upgrade mid-cycle, you're charged the prorated difference." },
  { q: "What counts toward my data volume?", a: "Data volume is calculated as the total uncompressed bytes of records synced during a calendar month across all connectors and pipelines." },
  { q: "Do team member seats cost extra?", a: "No — each plan includes a set number of team members at no extra cost. Enterprise plans support unlimited members." },
  { q: "Is there a free trial?", a: "Yes — all paid plans include a 14-day free trial. No credit card required to start." },
  { q: "What payment methods do you accept?", a: "Visa, Mastercard, American Express, and ACH bank transfer for annual Enterprise plans." },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button onClick={() => setOpen(p => !p)} className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-muted/20 transition-colors">
        <span className="text-sm font-semibold text-foreground">{q}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform ml-4", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PricingFAQ() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h2 className="text-2xl font-extrabold text-foreground text-center mb-8">Pricing FAQ</h2>
      <div className="space-y-3">
        {PRICING_FAQ.map(item => <FaqItem key={item.q} q={item.q} a={item.a} />)}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PricingPage() {
  const [cycle, setCycle] = React.useState<"monthly" | "yearly">("monthly");
  const [openGroup, setOpenGroup] = React.useState<string | null>("Data Sources");

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0b10]">
      <Nav />

      {/* Hero */}
      <div className="relative overflow-hidden py-20 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_0%,rgba(99,102,241,0.12),transparent)]" />
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 mx-auto max-w-3xl px-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/30 px-3 py-1 text-xs font-semibold text-brand-700 dark:text-brand-300 mb-5">
            <Sparkles className="h-3.5 w-3.5 text-brand-500" /> Simple, transparent pricing
          </span>
          <h1 className="text-5xl font-extrabold tracking-tight text-foreground">Start free. Scale with confidence.</h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-xl mx-auto">
            No hidden fees, no per-seat surprises. Pick a plan that fits today and upgrade as you grow.
          </p>

          {/* Billing toggle */}
          <div className="mt-8 inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
            {(["monthly", "yearly"] as const).map((c) => (
              <button key={c} onClick={() => setCycle(c)}
                className={cn("rounded-lg px-5 py-2 text-sm font-semibold capitalize transition-all",
                  cycle === c ? "bg-white dark:bg-[#0e0f1a] text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}>
                {c}
                {c === "yearly" && (
                  <span className="ml-2 rounded-full bg-emerald-100 dark:bg-emerald-950/30 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                    Save 20%
                  </span>
                )}
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Plan cards */}
      <div className="mx-auto max-w-7xl px-6 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {PLANS.map((plan, i) => {
            const price = cycle === "yearly" ? plan.yearly : plan.monthly;
            return (
              <motion.div key={plan.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                className={cn("relative flex flex-col rounded-2xl border-2 p-6 transition-all",
                  plan.highlight
                    ? "border-violet-400 bg-white dark:bg-[#0e0f1a] shadow-[0_0_0_4px_rgba(139,92,246,0.12)]"
                    : "border-border bg-white dark:bg-[#0e0f1a] hover:border-border/80 hover:shadow-sm"
                )}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-bold text-white shadow-sm"
                    style={{ backgroundColor: plan.color }}>
                    {plan.badge}
                  </div>
                )}

                <div className="mb-4">
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: plan.color }}>{plan.name}</span>
                  <div className="mt-2 flex items-end gap-1">
                    {price === 0
                      ? <span className="text-4xl font-extrabold text-foreground">Free</span>
                      : plan.id === "enterprise"
                        ? <span className="text-4xl font-extrabold text-foreground">${price}</span>
                        : <><span className="text-4xl font-extrabold text-foreground">${price}</span><span className="text-sm text-muted-foreground mb-1">/mo</span></>
                    }
                  </div>
                  {cycle === "yearly" && plan.monthly > 0 && plan.id !== "enterprise" && (
                    <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">Save ${(plan.monthly - plan.yearly) * 12}/year</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground leading-4">{plan.desc}</p>
                </div>

                {/* Quick limits */}
                <div className="mb-5 space-y-2 flex-1">
                  {[
                    ["Connectors", plan.limits.connectors],
                    ["Data / month", typeof plan.limits.dataGB === "number" ? `${plan.limits.dataGB} GB` : plan.limits.dataGB],
                    ["Sync frequency", plan.limits.syncFreq],
                    ["Team members", plan.limits.members],
                    ["API calls", plan.limits.apiCalls],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <span className="text-xs font-semibold text-foreground">{val}</span>
                    </div>
                  ))}
                </div>

                <Link href={plan.ctaHref}
                  className={cn("flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all",
                    plan.highlight
                      ? "text-white shadow-sm hover:opacity-90"
                      : "border border-border text-foreground hover:bg-muted"
                  )}
                  style={plan.highlight ? { backgroundColor: plan.color } : {}}>
                  {plan.cta}
                  {plan.id !== "enterprise" && <ArrowRight className="h-3.5 w-3.5" />}
                </Link>

                {plan.id !== "enterprise" && (
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">14-day free trial · No card required</p>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Feature comparison table */}
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-foreground">Full feature comparison</h2>
          <p className="mt-3 text-muted-foreground">Everything that's included in each plan</p>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground w-56">Feature</th>
                {PLANS.map(p => (
                  <th key={p.id} className="px-4 py-4 text-center">
                    <span className="text-sm font-bold" style={{ color: p.color }}>{p.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_GROUPS.map((group) => (
                <React.Fragment key={group.group}>
                  <tr>
                    <td colSpan={5} className="px-6 py-3 bg-muted/40 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      {group.group}
                    </td>
                  </tr>
                  {group.features.map((feat, fi) => (
                    <tr key={feat.label} className={cn("border-b border-border/60 last:border-0", fi % 2 === 0 ? "bg-white dark:bg-[#0e0f1a]" : "bg-muted/10")}>
                      <td className="px-6 py-3.5 text-sm text-muted-foreground">{feat.label}</td>
                      {feat.values.map((val, vi) => (
                        <td key={vi} className="px-4 py-3.5 text-center">
                          <Cell val={val as boolean | string} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile accordion */}
        <div className="md:hidden space-y-2">
          {FEATURE_GROUPS.map((group) => (
            <div key={group.group} className="rounded-xl border border-border overflow-hidden">
              <button onClick={() => setOpenGroup(openGroup === group.group ? null : group.group)}
                className="flex w-full items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors">
                <span className="text-sm font-bold text-foreground">{group.group}</span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", openGroup === group.group && "rotate-180")} />
              </button>
              <AnimatePresence>
                {openGroup === group.group && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    {group.features.map(feat => (
                      <div key={feat.label} className="border-t border-border/60 px-5 py-3">
                        <p className="text-xs font-semibold text-foreground mb-2">{feat.label}</p>
                        <div className="grid grid-cols-4 gap-2">
                          {PLANS.map((plan, vi) => (
                            <div key={plan.id} className="text-center">
                              <p className="text-[10px] text-muted-foreground mb-1" style={{ color: plan.color }}>{plan.name}</p>
                              <Cell val={feat.values[vi] as boolean | string} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <PricingFAQ />

      {/* CTA */}
      <div className="mx-auto max-w-3xl px-6 py-16">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="rounded-3xl bg-gradient-to-br from-brand-500 via-violet-600 to-purple-700 p-10 text-center text-white shadow-[0_20px_60px_rgba(99,102,241,0.3)]">
          <Sparkles className="h-10 w-10 mx-auto mb-4 text-white/80" />
          <h2 className="text-3xl font-extrabold">Ready to get started?</h2>
          <p className="mt-3 text-white/80 max-w-md mx-auto">Join 500+ companies. Start your 14-day free trial — no credit card required.</p>
          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href={ROUTES.REGISTER}
              className="flex items-center gap-2 rounded-2xl bg-white px-7 py-3 text-sm font-bold text-brand-700 hover:bg-white/90 transition-colors shadow-sm">
              Start free trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={ROUTES.DASHBOARD}
              className="flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 backdrop-blur-sm px-7 py-3 text-sm font-bold text-white hover:bg-white/20 transition-colors">
              View live demo
            </Link>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>© 2026 CrossTecch · <Link href="/" className="hover:text-foreground">Home</Link> · <Link href="/docs" className="hover:text-foreground">Docs</Link> · <Link href="/help" className="hover:text-foreground">Help</Link></p>
      </footer>
    </div>
  );
}
