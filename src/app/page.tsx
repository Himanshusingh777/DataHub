"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight, Zap, CheckCircle2, Database, GitBranch, RefreshCw,
  BarChart3, Shield, Clock, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth.store";
import { useDemoStore } from "@/stores/demo.store";
import { ROUTES } from "@/config/routes";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5, delay, ease: [0.4, 0, 0.2, 1] as const },
});

const CONNECTORS = [
  { name: "Shopify",      abbr: "SH", color: "#96BF48" },
  { name: "Stripe",       abbr: "ST", color: "#635BFF" },
  { name: "HubSpot",      abbr: "HS", color: "#FF7A59" },
  { name: "Google Ads",   abbr: "GA", color: "#4285F4" },
  { name: "Meta Ads",     abbr: "FB", color: "#1877F2" },
  { name: "Salesforce",   abbr: "SF", color: "#00A1E0" },
  { name: "BigQuery",     abbr: "BQ", color: "#4285F4" },
  { name: "Snowflake",    abbr: "SN", color: "#29B5E8" },
  { name: "PostgreSQL",   abbr: "PG", color: "#336791" },
  { name: "Amazon",       abbr: "AM", color: "#FF9900" },
  { name: "WooCommerce",  abbr: "WC", color: "#7F54B3" },
  { name: "Zendesk",      abbr: "ZD", color: "#03363D" },
  { name: "Klaviyo",      abbr: "KL", color: "#1A1A1A" },
  { name: "Intercom",     abbr: "IC", color: "#1F8DED" },
  { name: "MySQL",        abbr: "MY", color: "#00758F" },
  { name: "Redshift",     abbr: "RS", color: "#8C4FFF" },
  { name: "TikTok Ads",   abbr: "TT", color: "#010101" },
  { name: "LinkedIn Ads", abbr: "LI", color: "#0A66C2" },
  { name: "Mixpanel",     abbr: "MX", color: "#7856FF" },
  { name: "Segment",      abbr: "SG", color: "#52BD95" },
  { name: "Instantly",    abbr: "IN", color: "#6366F1" },
];

const FEATURES = [
  { icon: Zap,       title: "Live in under 3 minutes",   description: "Pick a source, choose a destination, set your schedule. CrossTecch handles authentication, schema mapping, and the first sync automatically." },
  { icon: GitBranch, title: "Automated data flows",      description: "One flow connects a source to a destination. No pipelines to configure, no scripts to maintain — just data moving reliably." },
  { icon: RefreshCw, title: "Full sync visibility",      description: "See every sync run, row count, duration, and error in one place. Failed syncs surface immediately with inline logs." },
  { icon: Database,  title: "Any destination",           description: "Land data in BigQuery, Snowflake, PostgreSQL, Redshift, S3, MySQL, Google Sheets, or export as CSV." },
  { icon: Shield,    title: "Enterprise ready",          description: "SOC 2 compliant, end-to-end encryption, incremental syncs, and automatic retries on failure — built in from day one." },
  { icon: Clock,     title: "Flexible scheduling",       description: "Sync every 15 minutes, hourly, every 6 hours, daily, or trigger manually at any time from the dashboard." },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Choose your source",      description: "Pick from 40+ pre-built connectors — ecommerce, advertising, CRM, and databases." },
  { step: "02", title: "Choose a destination",    description: "Select where your data lands: BigQuery, Snowflake, PostgreSQL, Redshift, and more." },
  { step: "03", title: "Set your schedule",       description: "Choose a sync frequency — every 15 minutes to once a day. CrossTecch does the rest." },
  { step: "04", title: "Watch your data flow",    description: "Monitor every sync in real time. Errors surface immediately with full context so you can fix them fast." },
];

const REASONS = [
  "No engineering team required",
  "Works in minutes, not days",
  "Built for modern data stacks",
  "Full visibility into every sync",
  "Demo mode — try before you connect",
  "Transparent, honest pricing",
];

export default function LandingPage() {
  const router = useRouter();
  const { enterDemoMode } = useAuthStore();
  const { markDemoEntered } = useDemoStore();

  function openDemo() {
    enterDemoMode();
    markDemoEntered();
    router.push(ROUTES.DASHBOARD);
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#080910] text-foreground">

      {/* Nav */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/50 bg-white/80 dark:bg-[#080910]/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600">
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-[15px] font-bold tracking-tight">CrossTecch</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features"      className="hover:text-foreground transition-colors">Features</a>
            <a href="#connectors"    className="hover:text-foreground transition-colors">Connectors</a>
            <a href="#how-it-works"  className="hover:text-foreground transition-colors">How it works</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden sm:block text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={openDemo}>
              Get started <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 flex justify-center">
          <div className="h-[500px] w-[900px] rounded-full bg-brand-500/5 blur-[120px] mt-16" />
        </div>
        <div className="relative mx-auto max-w-4xl text-center">
          <motion.div {...fadeUp(0)}>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/30 px-3.5 py-1 text-xs font-medium text-brand-700 dark:text-brand-400 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
              Demo Mode — try it without connecting anything
            </span>
          </motion.div>

          <motion.h1 {...fadeUp(0.05)} className="text-[44px] sm:text-[56px] md:text-[68px] font-bold leading-[1.08] tracking-tight">
            Connect all your{" "}
            <span className="text-brand-600">business data</span>
            <br />in minutes.
          </motion.h1>

          <motion.p {...fadeUp(0.1)} className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground leading-relaxed">
            CrossTecch syncs data from your ecommerce stores, ad platforms, CRMs and databases
            into the destination of your choice — automatically, reliably, and without code.
          </motion.p>

          <motion.div {...fadeUp(0.15)} className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" className="gap-2 h-11 px-6 text-sm font-semibold" onClick={openDemo}>
              Start for free <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" className="gap-2 h-11 px-6 text-sm" onClick={openDemo}>
              <Play className="h-3.5 w-3.5" /> Explore the demo
            </Button>
          </motion.div>

          <motion.p {...fadeUp(0.2)} className="mt-4 text-xs text-muted-foreground">
            No credit card required. Demo available instantly.
          </motion.p>
        </div>

        {/* Dashboard preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="mx-auto mt-16 max-w-5xl"
        >
          <div className="rounded-2xl border border-border bg-white dark:bg-[#0e0f1a] shadow-2xl shadow-black/10 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-[#f5f5f5] dark:bg-[#0a0b12]">
              <span className="h-3 w-3 rounded-full bg-rose-400/80" />
              <span className="h-3 w-3 rounded-full bg-amber-400/80" />
              <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
              <div className="flex-1 mx-3">
                <div className="h-5 w-52 rounded bg-border/60 flex items-center px-2">
                  <span className="text-[10px] text-muted-foreground">app.crosstecch.io/dashboard</span>
                </div>
              </div>
            </div>
            <div className="p-6 bg-[#f8f9fc] dark:bg-[#080910]">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[
                  { label: "Connections", value: "12", cls: "text-brand-600" },
                  { label: "Synced Today", value: "2.4M rows", cls: "text-emerald-600" },
                  { label: "Running", value: "3", cls: "text-blue-600" },
                  { label: "Failed", value: "1", cls: "text-rose-600" },
                ].map((c) => (
                  <div key={c.label} className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-3">
                    <p className="text-[11px] text-muted-foreground mb-1">{c.label}</p>
                    <p className={cn("text-lg font-bold", c.cls)}>{c.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-4 h-28">
                  <p className="text-[11px] font-medium text-muted-foreground mb-3">Sync Activity</p>
                  <div className="flex items-end gap-1 h-14">
                    {[40, 65, 50, 80, 70, 90, 75, 85, 60, 95, 80, 100].map((h, i) => (
                      <div key={i} className="flex-1 rounded-sm bg-brand-200 dark:bg-brand-800/40" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-4 h-28">
                  <p className="text-[11px] font-medium text-muted-foreground mb-2">Health</p>
                  <div className="flex flex-col gap-1.5 mt-1">
                    {[["Healthy", "8", "text-emerald-600"], ["Warning", "2", "text-amber-600"], ["Failed", "1", "text-rose-600"]].map(([l, v, c]) => (
                      <div key={l} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{l}</span>
                        <span className={cn("font-semibold", c)}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Connectors */}
      <section id="connectors" className="py-20 px-6 bg-[#fafafa] dark:bg-[#0a0b12]">
        <div className="mx-auto max-w-5xl">
          <motion.div {...fadeUp()} className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600 mb-3">40+ Connectors</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Connect any data source</h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              Ecommerce, advertising, CRM, databases, and everything in between.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-3"
          >
            {CONNECTORS.map((c, i) => (
              <motion.div
                key={c.name}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: i * 0.02 }}
                title={c.name}
                className="aspect-square rounded-xl border border-border bg-white dark:bg-[#0e0f1a] flex flex-col items-center justify-center gap-1 hover:border-brand-300 dark:hover:border-brand-700 transition-colors cursor-default shadow-sm"
              >
                <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: c.color }}>
                  {c.abbr}
                </div>
                <span className="text-[9px] text-muted-foreground text-center leading-tight px-0.5 truncate w-full text-center">{c.name}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <motion.div {...fadeUp()} className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600 mb-3">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">From zero to syncing in 4 steps</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8">
            {HOW_IT_WORKS.map((s, i) => (
              <motion.div key={s.step} {...fadeUp(i * 0.08)}>
                <div className="text-[10px] font-bold text-brand-500 mb-3 tracking-widest">{s.step}</div>
                <h3 className="text-sm font-semibold text-foreground mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6 bg-[#fafafa] dark:bg-[#0a0b12]">
        <div className="mx-auto max-w-5xl">
          <motion.div {...fadeUp()} className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600 mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Everything you need to move data</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                {...fadeUp(i * 0.07)}
                className="rounded-2xl border border-border bg-white dark:bg-[#0e0f1a] p-6 hover:border-brand-200 dark:hover:border-brand-800 transition-colors"
              >
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/30">
                  <f.icon className="h-[18px] w-[18px] text-brand-600" />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why CrossTecch */}
      <section className="py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div {...fadeUp()}>
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-600 mb-3">Why CrossTecch</p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-6">
                Built for teams who move fast
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-8">
                Most data integration tools are built for data engineers. CrossTecch is built for
                the whole team — marketers, analysts, and operators who need their data to flow
                reliably without writing a single line of code.
              </p>
              <div className="space-y-3">
                {REASONS.map((r) => (
                  <div key={r} className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="text-sm">{r}</span>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div {...fadeUp(0.1)} className="space-y-3">
              {[
                { metric: "40+",   label: "Data source connectors" },
                { metric: "9",     label: "Destination options" },
                { metric: "<3 min",label: "Average time to first sync" },
                { metric: "99.9%", label: "Uptime SLA" },
              ].map((m) => (
                <div key={m.label} className="flex items-center gap-4 rounded-xl border border-border bg-white dark:bg-[#0e0f1a] p-4">
                  <div className="text-2xl font-bold text-brand-600 w-24 shrink-0">{m.metric}</div>
                  <div className="text-sm text-muted-foreground">{m.label}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-[#fafafa] dark:bg-[#0a0b12]">
        <motion.div
          {...fadeUp()}
          className="mx-auto max-w-2xl text-center rounded-3xl border border-border bg-white dark:bg-[#0e0f1a] p-12 shadow-xl shadow-black/5"
        >
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight mb-4">Ready to connect your data?</h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Start in minutes. No credit card. Full demo available without connecting anything.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" className="gap-2 h-11 px-8 text-sm font-semibold" onClick={openDemo}>
              Start for free <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" className="gap-2 h-11 px-8 text-sm" onClick={openDemo}>
              <Play className="h-3.5 w-3.5" /> Explore demo
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-border">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600">
              <Zap className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm font-semibold">CrossTecch</span>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 CrossTecch. All rights reserved.</p>
          <div className="flex gap-5 text-xs text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Security</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
