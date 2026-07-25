/**
 * CrossTecch Visualization Recommender
 *
 * Analyzes a Semantic Model's schema (column names + types) and returns an
 * ordered list of chart-type recommendations, each with a score (0–100) and
 * the suggested field-to-axis mapping.
 *
 * Rules:
 *  - Pure server-safe (no DOM, no React)
 *  - Never mutates the input schema
 *  - Returns up to MAX_RECS recommendations, sorted by score DESC
 */

import type {
  SchemaColumn,
  ColumnProfile,
  ColumnKind,
  ColumnDataType,
  VizRecommendation,
  ChartType,
} from "@/lib/models-data";

const MAX_RECS = 6;

// ─── Column kind classification ────────────────────────────────────────────

const NUMERIC_TYPES: Set<ColumnDataType> = new Set([
  "INTEGER", "FLOAT64", "NUMERIC", "BIGNUMERIC",
]);

const TEMPORAL_TYPES: Set<ColumnDataType> = new Set([
  "TIMESTAMP", "DATE", "DATETIME", "TIME",
]);

const GEO_NAMES = /^(lat|lng|latitude|longitude|country|region|city|state|zip|zipcode|geoid)$/i;
const DATE_NAMES = /^(date|day|month|year|week|quarter|period|time|timestamp|created_at|updated_at)$/i;

function classifyKind(col: SchemaColumn): ColumnKind {
  if (NUMERIC_TYPES.has(col.type))  return "numeric";
  if (TEMPORAL_TYPES.has(col.type)) return "temporal";
  if (GEO_NAMES.test(col.name))     return "geo";
  if (col.type === "BOOLEAN")       return "categorical";
  return col.type === "STRING" ? "categorical" : "unknown";
}

function profileColumns(schema: SchemaColumn[]): ColumnProfile[] {
  return schema.map((col) => ({
    name: col.name,
    type: col.type,
    kind: classifyKind(col),
  }));
}

// ─── Heuristic helpers ─────────────────────────────────────────────────────

function pickFirst(cols: ColumnProfile[], kind: ColumnKind): string | undefined {
  return cols.find((c) => c.kind === kind)?.name;
}

function pickAll(cols: ColumnProfile[], kind: ColumnKind): ColumnProfile[] {
  return cols.filter((c) => c.kind === kind);
}

// Simple name-based preference: columns with "name", "label", "category",
// "type", "status", "segment" score higher as the X/label axis
const LABEL_NAMES = /^(name|label|category|type|status|segment|group|tag|product|channel|source|region|country|city)$/i;

function bestCategorical(cols: ColumnProfile[]): string | undefined {
  const cats = pickAll(cols, "categorical");
  const preferred = cats.find((c) => LABEL_NAMES.test(c.name));
  return (preferred ?? cats[0])?.name;
}

function bestTemporal(cols: ColumnProfile[]): string | undefined {
  const temps = pickAll(cols, "temporal");
  // Prefer columns whose names suggest a date dimension
  const preferred = temps.find((c) => DATE_NAMES.test(c.name));
  return (preferred ?? temps[0])?.name;
}

// ─── Main recommender ──────────────────────────────────────────────────────

export function recommendViz(schema: SchemaColumn[]): VizRecommendation[] {
  if (!schema || schema.length === 0) {
    return [{
      chartType: "table",
      score: 100,
      reason: "No schema available — table view shows all columns.",
    }];
  }

  const cols     = profileColumns(schema);
  const numerics = pickAll(cols, "numeric");
  const cats     = pickAll(cols, "categorical");
  const temps    = pickAll(cols, "temporal");
  const geos     = pickAll(cols, "geo");

  const nNum  = numerics.length;
  const nCat  = cats.length;
  const nTemp = temps.length;
  const nGeo  = geos.length;
  const total = cols.length;

  const recs: VizRecommendation[] = [];

  const yField       = numerics[0]?.name;
  const catField     = bestCategorical(cols);
  const timeField    = bestTemporal(cols);
  const secondNum    = numerics[1]?.name;
  const thirdNum     = numerics[2]?.name;

  // ── Table is always a valid fallback ──────────────────────────────────
  recs.push({
    chartType: "table",
    score: total > 0 ? 40 : 100,
    reason: "Raw data table — works for any schema.",
  });

  // ── Time-series patterns ─────────────────────────────────────────────
  if (nTemp >= 1 && nNum >= 1) {
    recs.push({
      chartType: "line",
      score: 92,
      reason: "Temporal column with numeric metric — classic time-series.",
      xField: timeField,
      yField,
      colorField: nCat >= 1 ? catField : undefined,
    });
    recs.push({
      chartType: "area",
      score: 80,
      reason: "Filled area emphasises cumulative trend over time.",
      xField: timeField,
      yField,
    });
    if (nNum >= 2) {
      recs.push({
        chartType: "area_stacked",
        score: 74,
        reason: "Multiple metrics stacked over time.",
        xField: timeField,
        yField,
      });
    }
  }

  // ── Category + numeric patterns ──────────────────────────────────────
  if (nCat >= 1 && nNum >= 1) {
    // How many distinct categories matters; use score heuristics
    recs.push({
      chartType: "bar",
      score: nTemp === 0 ? 90 : 72,
      reason: "Category vs numeric — bar chart is the default comparison.",
      xField: catField,
      yField,
    });

    recs.push({
      chartType: "bar_horizontal",
      score: nTemp === 0 ? 78 : 60,
      reason: "Horizontal bars are easier to read with long category labels.",
      xField: catField,
      yField,
    });

    if (nNum === 1 && nCat === 1) {
      recs.push({
        chartType: "pie",
        score: 68,
        reason: "One category + one numeric — good for part-to-whole view (use < 8 slices).",
        xField: catField,
        yField,
      });
      recs.push({
        chartType: "donut",
        score: 65,
        reason: "Donut variant of pie — cleaner with a central KPI metric.",
        xField: catField,
        yField,
      });
      recs.push({
        chartType: "funnel",
        score: 60,
        reason: "Funnel shows sequential drop-off between category stages.",
        xField: catField,
        yField,
      });
    }

    if (nNum >= 2 && nCat >= 1) {
      recs.push({
        chartType: "bar_stacked",
        score: 75,
        reason: "Multiple numeric columns stacked per category.",
        xField: catField,
        yField,
        colorField: catField,
      });
    }

    if (nNum >= 3) {
      recs.push({
        chartType: "radar",
        score: 62,
        reason: "3+ numeric columns — radar shows multi-dimensional profile.",
        xField: catField,
        yField,
      });
    }
  }

  // ── Two-numeric (scatter / bubble) ───────────────────────────────────
  if (nNum >= 2) {
    recs.push({
      chartType: "scatter",
      score: nCat === 0 && nTemp === 0 ? 85 : 58,
      reason: "Two numeric axes — scatter reveals correlation.",
      xField: numerics[0]?.name,
      yField: secondNum,
      colorField: catField,
    });
    if (nNum >= 3) {
      recs.push({
        chartType: "bubble",
        score: 70,
        reason: "Three numeric dimensions encoded as X, Y, and bubble size.",
        xField: numerics[0]?.name,
        yField: secondNum,
        sizeField: thirdNum,
        colorField: catField,
      });
    }
  }

  // ── Single KPI (1 numeric, no categories) ────────────────────────────
  if (nNum === 1 && nCat === 0 && nTemp === 0) {
    recs.push({
      chartType: "kpi_card",
      score: 95,
      reason: "Single numeric value — KPI card gives immediate impact.",
      yField,
    });
    recs.push({
      chartType: "number_card",
      score: 88,
      reason: "Large number display, ideal for dashboards.",
      yField,
    });
    recs.push({
      chartType: "gauge",
      score: 72,
      reason: "Gauge shows progress toward a target value.",
      yField,
    });
  }

  // ── Geo patterns ──────────────────────────────────────────────────────
  if (nGeo >= 2) {
    const latCol = geos.find((c) => /lat/i.test(c.name))?.name;
    const lngCol = geos.find((c) => /lng|lon/i.test(c.name))?.name;
    recs.push({
      chartType: "geo_map",
      score: 88,
      reason: "Latitude + longitude columns — geographic map.",
      xField: lngCol,
      yField: latCol,
      colorField: yField,
    } as VizRecommendation);
  } else if (nGeo === 1) {
    // country/city name — still map-able
    recs.push({
      chartType: "geo_map",
      score: 75,
      reason: "Geographic name column — map by country/region.",
      xField: geos[0]?.name,
      yField,
    });
  }

  // ── Treemap: category hierarchy + numeric ────────────────────────────
  if (nCat >= 2 && nNum >= 1) {
    recs.push({
      chartType: "treemap",
      score: 70,
      reason: "Nested categories with size encoding — great for hierarchical breakdowns.",
      xField: catField,
      yField,
    });
    recs.push({
      chartType: "sunburst",
      score: 60,
      reason: "Radial alternative to treemap for 2–3 level hierarchies.",
      xField: catField,
      yField,
    });
  }

  // ── Heatmap: two categoricals + one numeric ────────────────────────
  if (nCat >= 2 && nNum >= 1) {
    recs.push({
      chartType: "heatmap",
      score: 65,
      reason: "Two category axes with numeric intensity — spot density patterns.",
      xField: catField,
      yField: cats[1]?.name,
      colorField: numerics[0]?.name,
    });
  }

  // ── Waterfall: temporal or category + numeric ─────────────────────
  if ((nTemp >= 1 || nCat >= 1) && nNum === 1) {
    recs.push({
      chartType: "waterfall",
      score: 58,
      reason: "Shows cumulative effect of sequential positive/negative values.",
      xField: timeField ?? catField,
      yField,
    });
  }

  // ── Sankey: source → target → value ──────────────────────────────
  if (nCat >= 2 && nNum >= 1) {
    recs.push({
      chartType: "sankey",
      score: 62,
      reason: "Two categorical + flow value — Sankey shows how quantities move between nodes.",
      xField: cats[0]?.name,    // sourceField
      yField: cats[1]?.name,    // targetField
      colorField: numerics[0]?.name, // valueField
    });
  }

  // ── Sort, deduplicate, cap ────────────────────────────────────────
  const seen = new Set<ChartType>();
  return recs
    .sort((a, b) => b.score - a.score)
    .filter((r) => {
      if (seen.has(r.chartType)) return false;
      seen.add(r.chartType);
      return true;
    })
    .slice(0, MAX_RECS);
}

/**
 * Single-chart confidence: given a schema and a specific chartType, return
 * a score 0–100 and whether the chart is a reasonable choice.
 */
export function scoreChartType(
  schema: SchemaColumn[],
  chartType: ChartType,
): { score: number; suitable: boolean; reason: string } {
  const recs = recommendViz(schema);
  const match = recs.find((r) => r.chartType === chartType);
  if (match) {
    return { score: match.score, suitable: match.score >= 50, reason: match.reason };
  }
  return {
    score: 20,
    suitable: false,
    reason: `"${chartType}" is not a strong fit for this schema — consider: ${recs[0]?.chartType ?? "table"}.`,
  };
}
