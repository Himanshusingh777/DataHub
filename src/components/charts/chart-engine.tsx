"use client";

/**
 * CrossTecch Chart Engine
 *
 * Unified renderer for all 35+ chart types.
 * - Recharts handles: bar, line, area, pie, scatter, bubble, radar, composed, table
 * - ECharts (via echarts-for-react) handles: treemap, sunburst, sankey, funnel,
 *   heatmap, calendar_heatmap, geo_map, boxplot, candlestick, gauge, waterfall,
 *   parallel, theme_river, graph, word_cloud
 * - Native React handles: kpi_card, number_card, progress_bar, sparkline, metric_delta
 *
 * Props:
 *   chartType  — ChartType string
 *   data       — Row array from /api/widgets/[id]/data
 *   config     — WidgetConfig (axis mappings, colors, labels, etc.)
 *   width      — optional pixel width (default: 100%)
 *   height     — optional pixel height (default: 320)
 *   theme      — "light" | "dark" (default: "light")
 *   loading    — show skeleton if true
 *   error      — display error state
 */

import React, { useMemo, Suspense, lazy } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { ChartType, WidgetConfig } from "@/lib/models-data";

// ─── ECharts: loaded lazily so bundle only pays if actually used ──────────
const EChartsReact = lazy(() => import("echarts-for-react"));

// ─── Default palette ──────────────────────────────────────────────────────
const DEFAULT_PALETTE = [
  "#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmt(value: unknown, prefix = "", suffix = "", decimals = 2, compact = false): string {
  if (value == null) return "—";
  const n = Number(value);
  if (isNaN(n)) return String(value);
  let s: string;
  if (compact && Math.abs(n) >= 1_000_000) s = `${(n / 1_000_000).toFixed(1)}M`;
  else if (compact && Math.abs(n) >= 1_000) s = `${(n / 1_000).toFixed(1)}K`;
  else s = n.toFixed(decimals ?? 2);
  return `${prefix}${s}${suffix}`;
}

function palette(config: WidgetConfig): string[] {
  return config.colorPalette?.length ? config.colorPalette : DEFAULT_PALETTE;
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface ChartEngineProps {
  chartType: ChartType;
  data:      Record<string, unknown>[];
  config:    WidgetConfig;
  width?:    number | string;
  height?:   number;
  theme?:    "light" | "dark";
  loading?:  boolean;
  error?:    string | null;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────

function ChartSkeleton({ height = 320 }: { height?: number }) {
  return (
    <div
      className="animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
      style={{ height }}
      aria-hidden
    />
  );
}

// ─── Error state ─────────────────────────────────────────────────────────

function ChartError({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-red-300 bg-red-50 p-4 text-center text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
      <span>⚠ {message}</span>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────

function ChartEmpty() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-gray-400">
      No data to display
    </div>
  );
}

// ─── Table renderer ───────────────────────────────────────────────────────

function TableChart({ data, config }: { data: Record<string, unknown>[]; config: WidgetConfig }) {
  const cols = config.columns?.length
    ? config.columns
    : data.length > 0 ? Object.keys(data[0]!) : [];
  const pageSize = config.pageSize ?? 25;
  const [page, setPage] = React.useState(0);
  const slice = data.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(data.length / pageSize);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
            <tr>
              {cols.map((c) => (
                <th
                  key={c}
                  className="whitespace-nowrap px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300"
                >
                  {config.columnLabels?.[c] ?? c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, i) => (
              <tr
                key={i}
                className={i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-850"}
              >
                {cols.map((c) => (
                  <td key={c} className="whitespace-nowrap px-3 py-1.5 text-gray-700 dark:text-gray-300">
                    {row[c] == null ? <span className="text-gray-300">—</span> : String(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 px-3 py-1.5 text-xs text-gray-500 dark:border-gray-700">
          <span>{data.length.toLocaleString()} rows</span>
          <div className="flex gap-1">
            <button
              className="rounded px-2 py-0.5 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-700"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >‹</button>
            <span>{page + 1}/{totalPages}</span>
            <button
              className="rounded px-2 py-0.5 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-700"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >›</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KPI / metric card renderers ─────────────────────────────────────────

function KpiCard({ data, config }: { data: Record<string, unknown>[]; config: WidgetConfig }) {
  const field = config.metricField ?? config.yField ?? Object.keys(data[0] ?? {})[0] ?? "";
  const value = data[0]?.[field];
  const display = fmt(value, config.prefix, config.suffix, config.decimals, config.compact);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-4">
      {config.title && <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{config.title}</p>}
      <p className="text-5xl font-bold tracking-tight text-gray-900 dark:text-white">{display}</p>
      {config.subtitle && <p className="text-xs text-gray-400">{config.subtitle}</p>}
    </div>
  );
}

function NumberCard({ data, config }: { data: Record<string, unknown>[]; config: WidgetConfig }) {
  const field = config.metricField ?? config.yField ?? Object.keys(data[0] ?? {})[0] ?? "";
  const value = data[0]?.[field];
  const display = fmt(value, config.prefix, config.suffix, config.decimals, config.compact);
  const prev = config.compareField ? data[0]?.[config.compareField] : undefined;
  const delta = prev != null && value != null ? Number(value) - Number(prev) : null;

  return (
    <div className="flex h-full flex-col justify-center gap-0.5 p-4">
      {config.title && <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{config.title}</p>}
      <p className="text-4xl font-bold text-gray-900 dark:text-white">{display}</p>
      {delta != null && (
        <p className={`text-sm font-medium ${delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {delta >= 0 ? "▲" : "▼"} {fmt(Math.abs(delta), config.prefix, config.suffix, config.decimals, config.compact)}
        </p>
      )}
    </div>
  );
}

function MetricDelta({ data, config }: { data: Record<string, unknown>[]; config: WidgetConfig }) {
  const current  = config.metricField  ? data[0]?.[config.metricField]  : undefined;
  const previous = config.compareField ? data[0]?.[config.compareField] : undefined;
  const delta    = current != null && previous != null ? ((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100 : null;
  const up       = delta != null && delta >= 0;

  return (
    <div className="flex h-full items-center gap-4 p-4">
      <div>
        {config.title && <p className="text-xs text-gray-400">{config.title}</p>}
        <p className="text-3xl font-bold text-gray-900 dark:text-white">
          {fmt(current, config.prefix, config.suffix, config.decimals, config.compact)}
        </p>
        {previous != null && (
          <p className="text-xs text-gray-400">
            vs {fmt(previous, config.prefix, config.suffix, config.decimals, config.compact)}
          </p>
        )}
      </div>
      {delta != null && (
        <div className={`ml-auto rounded-full px-3 py-1.5 text-sm font-bold ${up ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
          {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function ProgressBar({ data, config }: { data: Record<string, unknown>[]; config: WidgetConfig }) {
  const field  = config.metricField ?? config.yField ?? "";
  const value  = Number(data[0]?.[field] ?? 0);
  const max    = 100;
  const pct    = Math.min(100, Math.max(0, (value / max) * 100));
  const colors = palette(config);

  return (
    <div className="flex h-full flex-col justify-center gap-2 p-4">
      {config.title && <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{config.title}</p>}
      <div className="flex items-center gap-2">
        <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: colors[0] }}
          />
        </div>
        <span className="w-12 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
          {fmt(value, config.prefix, config.suffix, 0, config.compact)}
        </span>
      </div>
    </div>
  );
}

// A tiny sparkline (no axes, no labels)
function Sparkline({ data, config }: { data: Record<string, unknown>[]; config: WidgetConfig }) {
  const field = config.yField ?? config.trendField ?? Object.keys(data[0] ?? {})[0] ?? "";
  const colors = palette(config);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Line
          type="monotone"
          dataKey={field}
          stroke={colors[0]}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Gauge renderer (ECharts) ─────────────────────────────────────────────

function buildGaugeOption(data: Record<string, unknown>[], config: WidgetConfig, colors: string[]) {
  const field = config.yField ?? config.metricField ?? Object.keys(data[0] ?? {})[0] ?? "";
  const value = Number(data[0]?.[field] ?? 0);
  return {
    series: [{
      type: "gauge",
      detail: { formatter: `{value}${config.suffix ?? ""}`, fontSize: 20 },
      data: [{ value, name: config.title ?? field }],
      axisLine: { lineStyle: { color: [[0.3, "#ef4444"], [0.7, "#f59e0b"], [1, colors[0]]], width: 18 } },
    }],
  };
}

// ─── ECharts option builders ─────────────────────────────────────────────

function buildTreemapOption(data: Record<string, unknown>[], config: WidgetConfig) {
  const nameField  = config.xField ?? config.colorField ?? "";
  const valueField = config.yField ?? "";
  return {
    series: [{
      type: "treemap",
      data: data.map((r) => ({ name: String(r[nameField] ?? ""), value: Number(r[valueField] ?? 0) })),
      label: { show: true, formatter: "{b}" },
    }],
  };
}

function buildSunburstOption(data: Record<string, unknown>[], config: WidgetConfig) {
  const nameField  = config.xField ?? "";
  const valueField = config.yField ?? "";
  return {
    series: [{
      type: "sunburst",
      data: data.map((r) => ({ name: String(r[nameField] ?? ""), value: Number(r[valueField] ?? 0) })),
      radius: ["15%", "80%"],
      label: { rotate: "radial" },
    }],
  };
}

function buildSankeyOption(data: Record<string, unknown>[], config: WidgetConfig) {
  const src   = config.xField ?? config.sourceField ?? "";
  const tgt   = config.yField ?? config.targetField ?? "";
  const val   = config.colorField ?? config.valueField ?? config.sizeField ?? "";
  const nodeSet = new Set<string>();
  data.forEach((r) => { nodeSet.add(String(r[src] ?? "")); nodeSet.add(String(r[tgt] ?? "")); });
  return {
    series: [{
      type: "sankey",
      data: Array.from(nodeSet).map((n) => ({ name: n })),
      links: data.map((r) => ({
        source: String(r[src] ?? ""),
        target: String(r[tgt] ?? ""),
        value:  Number(r[val] ?? 1),
      })),
      emphasis: { focus: "adjacency" },
    }],
  };
}

function buildFunnelOption(data: Record<string, unknown>[], config: WidgetConfig, colors: string[]) {
  const nameField  = config.xField ?? "";
  const valueField = config.yField ?? "";
  return {
    color: colors,
    series: [{
      type: "funnel",
      data: data.map((r) => ({ name: String(r[nameField] ?? ""), value: Number(r[valueField] ?? 0) })),
      label: { show: true, position: "inside" },
    }],
  };
}

function buildHeatmapOption(data: Record<string, unknown>[], config: WidgetConfig) {
  const xField   = config.xField ?? "";
  const yField   = config.yField ?? "";
  const valField = config.colorField ?? "";
  const xs = Array.from(new Set(data.map((r) => String(r[xField] ?? ""))));
  const ys = Array.from(new Set(data.map((r) => String(r[yField] ?? ""))));
  return {
    xAxis:     { type: "category", data: xs },
    yAxis:     { type: "category", data: ys },
    visualMap: { calculable: true, orient: "horizontal", left: "center", bottom: 0 },
    series: [{
      type: "heatmap",
      data: data.map((r) => [
        xs.indexOf(String(r[xField] ?? "")),
        ys.indexOf(String(r[yField] ?? "")),
        Number(r[valField] ?? 0),
      ]),
      emphasis: { itemStyle: { shadowBlur: 10 } },
    }],
  };
}

function buildCalendarHeatmapOption(data: Record<string, unknown>[], config: WidgetConfig) {
  const dateField = config.xField ?? "";
  const valField  = config.yField ?? "";
  const year = data[0] ? new Date(String(data[0][dateField])).getFullYear() : new Date().getFullYear();
  return {
    calendar: [{ range: String(year), cellSize: ["auto", 13] }],
    visualMap: { show: false, min: 0 },
    series: [{
      type: "heatmap",
      coordinateSystem: "calendar",
      data: data.map((r) => [String(r[dateField] ?? ""), Number(r[valField] ?? 0)]),
    }],
  };
}

function buildBoxplotOption(data: Record<string, unknown>[], config: WidgetConfig) {
  const catField = config.xField ?? "";
  const valField = config.yField ?? "";
  const groups: Record<string, number[]> = {};
  data.forEach((r) => {
    const key = String(r[catField] ?? "all");
    if (!groups[key]) groups[key] = [];
    groups[key]!.push(Number(r[valField] ?? 0));
  });
  const cats = Object.keys(groups);
  const boxData = cats.map((k) => {
    const sorted = [...(groups[k] ?? [])].sort((a, b) => a - b);
    const q = (pct: number) => sorted[Math.floor(sorted.length * pct)] ?? 0;
    return [q(0), q(0.25), q(0.5), q(0.75), q(1)];
  });
  return {
    xAxis:  { type: "category", data: cats },
    yAxis:  { type: "value" },
    series: [{ type: "boxplot", data: boxData }],
  };
}

function buildCandlestickOption(data: Record<string, unknown>[], config: WidgetConfig) {
  const dateField  = config.xField ?? "";
  const openField  = config.colorField ?? "open";
  const closeField = config.yField ?? "close";
  const lowField   = config.sizeField ?? "low";
  const highField  = config.labelField ?? "high";
  return {
    xAxis:  { type: "category", data: data.map((r) => String(r[dateField] ?? "")) },
    yAxis:  { type: "value" },
    series: [{
      type: "candlestick",
      data: data.map((r) => [
        Number(r[openField] ?? 0),
        Number(r[closeField] ?? 0),
        Number(r[lowField] ?? 0),
        Number(r[highField] ?? 0),
      ]),
    }],
  };
}

function buildWaterfallOption(data: Record<string, unknown>[], config: WidgetConfig, colors: string[]) {
  const catField = config.xField ?? "";
  const valField = config.yField ?? "";
  const cats     = data.map((r) => String(r[catField] ?? ""));
  const vals     = data.map((r) => Number(r[valField] ?? 0));
  let running = 0;
  const positive: (number | string)[] = [];
  const negative: (number | string)[] = [];
  const invisible: number[] = [];
  vals.forEach((v) => {
    if (v >= 0) { invisible.push(running); positive.push(v); negative.push("-"); }
    else        { invisible.push(running + v); positive.push("-"); negative.push(Math.abs(v)); }
    running += v;
  });
  return {
    xAxis: { type: "category", data: cats },
    yAxis: { type: "value" },
    series: [
      { type: "bar", stack: "wf", itemStyle: { color: "transparent", borderColor: "transparent" }, data: invisible },
      { type: "bar", stack: "wf", itemStyle: { color: colors[2] ?? "#10b981" }, data: positive },
      { type: "bar", stack: "wf", itemStyle: { color: colors[4] ?? "#ef4444" }, data: negative },
    ],
  };
}

function buildParallelOption(data: Record<string, unknown>[], config: WidgetConfig) {
  const cols  = Object.keys(data[0] ?? {});
  const numCols = cols.filter((c) => typeof data[0]?.[c] === "number");
  return {
    parallelAxis: numCols.map((c, i) => ({ dim: i, name: c })),
    series: [{ type: "parallel", data: data.map((r) => numCols.map((c) => Number(r[c] ?? 0))) }],
  };
}

function buildWordCloudOption(data: Record<string, unknown>[], config: WidgetConfig, colors: string[]) {
  const nameField = config.xField ?? config.labelField ?? "";
  const valField  = config.yField ?? "";
  return {
    series: [{
      type: "wordCloud",
      data: data.map((r) => ({ name: String(r[nameField] ?? ""), value: Number(r[valField] ?? 1) })),
      textStyle: { color: () => colors[Math.floor(Math.random() * colors.length)] },
      gridSize: 8,
      sizeRange: [12, 60],
    }],
  };
}

function buildThemeRiverOption(data: Record<string, unknown>[], config: WidgetConfig) {
  const timeField = config.xField ?? "";
  const valField  = config.yField ?? "";
  const catField  = config.colorField ?? "";
  return {
    tooltip: { trigger: "axis" },
    singleAxis: { type: "time", bottom: 30 },
    series: [{
      type: "themeRiver",
      data: data.map((r) => [String(r[timeField] ?? ""), Number(r[valField] ?? 0), String(r[catField] ?? "")]),
    }],
  };
}

function buildGraphOption(data: Record<string, unknown>[], config: WidgetConfig, colors: string[]) {
  const nodeField  = config.xField ?? config.labelField ?? "";
  const valueField = config.yField ?? "";
  const srcField   = config.sourceField ?? "";
  const tgtField   = config.targetField ?? "";
  const nodes: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  data.forEach((r) => {
    [srcField, tgtField, nodeField].forEach((f) => {
      const v = String(r[f] ?? "");
      if (v && !seen.has(v)) { seen.add(v); nodes.push({ id: v, name: v, value: Number(r[valueField] ?? 1), symbolSize: 20, itemStyle: { color: colors[nodes.length % colors.length] } }); }
    });
  });
  return {
    series: [{
      type: "graph",
      layout: "force",
      data: nodes,
      edges: data.map((r) => ({ source: String(r[srcField] ?? ""), target: String(r[tgtField] ?? "") })),
      roam: true,
      label: { show: true, position: "right" },
      force: { repulsion: 100 },
    }],
  };
}

// ─── ECharts wrapper ─────────────────────────────────────────────────────

function EChart({
  option, height, theme,
}: {
  option: Record<string, unknown>;
  height: number;
  theme: "light" | "dark";
}) {
  return (
    <Suspense fallback={<ChartSkeleton height={height} />}>
      <EChartsReact
        option={option}
        theme={theme === "dark" ? "dark" : undefined}
        style={{ height, width: "100%" }}
        notMerge
        lazyUpdate
      />
    </Suspense>
  );
}

// ─── Main ChartEngine ─────────────────────────────────────────────────────

export function ChartEngine({
  chartType,
  data,
  config,
  width  = "100%",
  height = 320,
  theme  = "light",
  loading,
  error,
}: ChartEngineProps) {
  const colors = useMemo(() => palette(config), [config]);

  if (loading) return <ChartSkeleton height={height} />;
  if (error)   return <ChartError message={error} />;
  if (!data || data.length === 0) return <ChartEmpty />;

  // ── Native card / metric types (no chart library needed) ───────────────
  if (chartType === "kpi_card")     return <KpiCard     data={data} config={config} />;
  if (chartType === "number_card")  return <NumberCard  data={data} config={config} />;
  if (chartType === "metric_delta") return <MetricDelta data={data} config={config} />;
  if (chartType === "progress_bar") return <ProgressBar data={data} config={config} />;
  if (chartType === "sparkline")    return <div style={{ width, height }}><Sparkline data={data} config={config} /></div>;
  if (chartType === "table")        return <div style={{ width, height: height + 80, minHeight: 200 }}><TableChart data={data} config={config} /></div>;

  // ── ECharts types ──────────────────────────────────────────────────────
  const echartsMap: Partial<Record<string, () => Record<string, unknown>>> = {
    treemap:          () => buildTreemapOption(data, config),
    sunburst:         () => buildSunburstOption(data, config),
    sankey:           () => buildSankeyOption(data, config),
    funnel:           () => buildFunnelOption(data, config, colors),
    heatmap:          () => buildHeatmapOption(data, config),
    calendar_heatmap: () => buildCalendarHeatmapOption(data, config),
    boxplot:          () => buildBoxplotOption(data, config),
    candlestick:      () => buildCandlestickOption(data, config),
    waterfall:        () => buildWaterfallOption(data, config, colors),
    parallel:         () => buildParallelOption(data, config),
    word_cloud:       () => buildWordCloudOption(data, config, colors),
    theme_river:      () => buildThemeRiverOption(data, config),
    graph:            () => buildGraphOption(data, config, colors),
    gauge:            () => buildGaugeOption(data, config, colors),
    geo_map:          () => ({
      geo: { map: "world", roam: true },
      series: [{ type: "scatter", coordinateSystem: "geo", data: data.map((r) => ({ value: [Number(r[config.xField ?? ""] ?? 0), Number(r[config.yField ?? ""] ?? 0)], name: String(r[config.labelField ?? ""] ?? "") })) }],
    }),
  };

  if (echartsMap[chartType]) {
    return (
      <EChart
        option={echartsMap[chartType]!()}
        height={height}
        theme={theme}
      />
    );
  }

  // ── Recharts types ─────────────────────────────────────────────────────
  const xKey    = config.xField ?? Object.keys(data[0]!)[0] ?? "";
  const yKey    = config.yField ?? Object.keys(data[0]!)[1] ?? "";
  const yKeys   = config.yFields ?? [yKey];
  const catKey  = config.colorField;

  const commonProps = {
    data,
    margin: { top: 8, right: 16, left: 8, bottom: 8 },
  };

  // Helper: build one <Bar>, <Line>, or <Area> per yKey
  function seriesBars(ChartComp: typeof Bar) {
    return yKeys.map((k, i) => (
      <ChartComp key={k} dataKey={k} name={config.series?.[i]?.label ?? k} fill={colors[i % colors.length]} />
    ));
  }
  function seriesLines(type: "monotone" | "linear" = "linear") {
    return yKeys.map((k, i) => (
      <Line key={k} type={type} dataKey={k} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
    ));
  }
  function seriesAreas(type: "monotone" | "linear" = "linear", stacked = false) {
    return yKeys.map((k, i) => (
      <Area
        key={k}
        type={type}
        dataKey={k}
        stroke={colors[i % colors.length]}
        fill={colors[i % colors.length]}
        fillOpacity={0.2}
        stackId={stacked ? "s" : undefined}
        strokeWidth={2}
      />
    ));
  }

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={theme === "dark" ? "#374151" : "#e5e7eb"} />
      <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} />
      <Tooltip formatter={(v: unknown) => fmt(v, config.prefix, config.suffix, config.decimals, config.compact)} />
      {config.showLegend !== false && <Legend />}
    </>
  );

  switch (chartType) {
    case "bar":
      return (
        <ResponsiveContainer width={width} height={height}>
          <BarChart {...commonProps}>{axes}{seriesBars(Bar)}</BarChart>
        </ResponsiveContainer>
      );

    case "bar_stacked":
      return (
        <ResponsiveContainer width={width} height={height}>
          <BarChart {...commonProps}>
            {axes}
            {yKeys.map((k, i) => (
              <Bar key={k} dataKey={k} stackId="s" fill={colors[i % colors.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );

    case "bar_horizontal":
      return (
        <ResponsiveContainer width={width} height={height}>
          <BarChart {...commonProps} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis dataKey={xKey} type="category" tick={{ fontSize: 11 }} width={80} />
            <Tooltip />
            {config.showLegend !== false && <Legend />}
            {seriesBars(Bar)}
          </BarChart>
        </ResponsiveContainer>
      );

    case "bar_horizontal_stacked":
      return (
        <ResponsiveContainer width={width} height={height}>
          <BarChart {...commonProps} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis dataKey={xKey} type="category" tick={{ fontSize: 11 }} width={80} />
            <Tooltip />
            {config.showLegend !== false && <Legend />}
            {yKeys.map((k, i) => (
              <Bar key={k} dataKey={k} stackId="s" fill={colors[i % colors.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );

    case "line":
      return (
        <ResponsiveContainer width={width} height={height}>
          <LineChart {...commonProps}>{axes}{seriesLines("linear")}</LineChart>
        </ResponsiveContainer>
      );

    case "line_smooth":
      return (
        <ResponsiveContainer width={width} height={height}>
          <LineChart {...commonProps}>{axes}{seriesLines("monotone")}</LineChart>
        </ResponsiveContainer>
      );

    case "area":
      return (
        <ResponsiveContainer width={width} height={height}>
          <AreaChart {...commonProps}>{axes}{seriesAreas("monotone")}</AreaChart>
        </ResponsiveContainer>
      );

    case "area_stacked":
      return (
        <ResponsiveContainer width={width} height={height}>
          <AreaChart {...commonProps}>{axes}{seriesAreas("monotone", true)}</AreaChart>
        </ResponsiveContainer>
      );

    case "pie":
    case "donut": {
      const inner = chartType === "donut" ? "55%" : "0%";
      return (
        <ResponsiveContainer width={width} height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey={yKey}
              nameKey={xKey}
              cx="50%" cy="50%"
              outerRadius="70%"
              innerRadius={inner}
              label={config.showLabels !== false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip />
            {config.showLegend !== false && <Legend />}
          </PieChart>
        </ResponsiveContainer>
      );
    }

    case "scatter":
    case "bubble": {
      const sizeKey = config.sizeField ?? undefined;
      const colorKey = catKey;
      // If colorField groups the data, split into separate Scatter series
      if (colorKey) {
        const groups: Record<string, Record<string, unknown>[]> = {};
        data.forEach((r) => {
          const g = String(r[colorKey] ?? "");
          if (!groups[g]) groups[g] = [];
          groups[g]!.push(r);
        });
        return (
          <ResponsiveContainer width={width} height={height}>
            <ScatterChart {...commonProps}>
              {axes}
              {sizeKey && <ZAxis dataKey={sizeKey} range={[40, 400]} />}
              {Object.entries(groups).map(([name, rows], i) => (
                <Scatter key={name} name={name} data={rows} fill={colors[i % colors.length]} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        );
      }
      return (
        <ResponsiveContainer width={width} height={height}>
          <ScatterChart {...commonProps}>
            {axes}
            {sizeKey && <ZAxis dataKey={sizeKey} range={[40, 400]} />}
            <Scatter data={data} fill={colors[0]} />
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    case "radar": {
      const numKeys = Object.keys(data[0] ?? {}).filter((k) => k !== xKey && typeof data[0]?.[k] === "number");
      return (
        <ResponsiveContainer width={width} height={height}>
          <RadarChart data={data} cx="50%" cy="50%">
            <PolarGrid />
            <PolarAngleAxis dataKey={xKey} />
            <PolarRadiusAxis />
            <Tooltip />
            {config.showLegend !== false && <Legend />}
            {numKeys.map((k, i) => (
              <Radar key={k} name={k} dataKey={k} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.2} />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      );
    }

    case "composed": {
      const numKeys2 = yKeys;
      return (
        <ResponsiveContainer width={width} height={height}>
          <ComposedChart {...commonProps}>
            {axes}
            {numKeys2.map((k, i) =>
              i === 0
                ? <Bar   key={k} dataKey={k} fill={colors[i % colors.length]} />
                : <Line  key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />,
            )}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    default:
      return <ChartError message={`Unsupported chart type: "${chartType}"`} />;
  }
}

export default ChartEngine;
