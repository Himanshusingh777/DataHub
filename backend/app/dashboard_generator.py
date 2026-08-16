"""
Direct port of src/lib/bi/ai-dashboard-generator.ts — pure heuristic engine,
NO LLM call. Given a Semantic Model's BigQuery schema (+ optional sample rows
pulled purely for local cardinality/date-range profiling), proposes widget
candidates. layout_candidates() then assigns grid positions to the user's
selected subset.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from app.semantic import ClassifiedColumn, SemanticClass, classify_column, is_monetary, is_ratio

WidgetCategory = str  # "kpi" | "trend" | "chart" | "table"


@dataclass
class WidgetCandidate:
    id: str
    name: str
    chart_type: str
    category: WidgetCategory
    reason: str
    recommended: bool
    config: dict[str, Any]


@dataclass
class GeneratedWidgetSpec:
    name: str
    chart_type: str
    config: dict[str, Any]
    position: dict[str, int]


# ── BigQuery type → semantic engine's declared-type vocabulary ─────────────

_NUMERIC_BQ_TYPES = {"INTEGER", "FLOAT64", "NUMERIC", "BIGNUMERIC"}
_TEMPORAL_BQ_TYPES = {"TIMESTAMP", "DATE", "DATETIME", "TIME"}


def _bq_declared_type(t: str) -> str:
    if t in _NUMERIC_BQ_TYPES:
        return "number"
    if t == "BOOLEAN":
        return "boolean"
    if t in _TEMPORAL_BQ_TYPES:
        return "timestamp"
    if t in ("JSON", "RECORD"):
        return "json"
    return "string"


@dataclass
class _Col(ClassifiedColumn):
    bq_type: str = ""
    unique_count: Optional[int] = None


def _classify(schema: list[dict], sample_rows: list[dict]) -> list[_Col]:
    cols = []
    for c in schema:
        samples = [r.get(c["name"]) for r in sample_rows] if sample_rows else []
        classified = classify_column(c["name"], _bq_declared_type(c["type"]), samples)
        unique_count = None
        if sample_rows:
            unique_count = len({str(v) for v in samples if v is not None})
        cols.append(
            _Col(
                name=classified.name,
                declared_type=classified.declared_type,
                semantic_class=classified.semantic_class,
                role=classified.role,
                label=classified.label,
                is_primary_key=classified.is_primary_key,
                is_foreign_key=classified.is_foreign_key,
                bq_type=c["type"],
                unique_count=unique_count,
            )
        )
    return cols


# ── Selection heuristics ────────────────────────────────────────────────────

METRIC_PRIORITY = ["revenue", "amount", "currency", "profit", "quantity", "count", "number"]
DIMENSION_PRIORITY = ["category", "product", "country", "region", "city", "channel", "status", "platform", "campaign", "tag", "device"]


def _by_priority(order: list[str]):
    def key(c: _Col):
        idx = order.index(c.semantic_class) if c.semantic_class in order else 99
        return idx

    return key


def _pick_metrics(cols: list[_Col]) -> list[_Col]:
    return sorted((c for c in cols if c.role == "metric"), key=_by_priority(METRIC_PRIORITY))


def _pick_dimensions(cols: list[_Col]) -> list[_Col]:
    dims = [c for c in cols if c.role == "dimension"]
    dims = [c for c in dims if c.unique_count is None or c.unique_count <= 200]
    dims = [c for c in dims if c.unique_count is None or c.unique_count >= 2]
    return sorted(dims, key=_by_priority(DIMENSION_PRIORITY))


def _pick_time(cols: list[_Col]) -> list[_Col]:
    return [c for c in cols if c.role == "time"]


def _pick_entities(cols: list[_Col], classes: list[SemanticClass]) -> list[_Col]:
    return [c for c in cols if c.semantic_class in classes]


def _fmt_config(col: _Col) -> dict[str, Any]:
    if is_monetary(col.semantic_class):
        return {"prefix": "$", "decimals": 2, "compact": True}
    if is_ratio(col.semantic_class):
        return {"suffix": "%", "decimals": 1, "compact": False}
    return {"decimals": 0, "compact": True}


def _with_prefix(prefix: str, label: str) -> str:
    return label if re.match(rf"^{re.escape(prefix)}\b", label, re.IGNORECASE) else f"{prefix} {label}"


def _date_range_days(sample_rows: list[dict], field_name: str) -> Optional[float]:
    if not sample_rows:
        return None
    times = []
    for r in sample_rows:
        v = r.get(field_name)
        if v is None:
            continue
        try:
            s = str(v).replace("Z", "+00:00")
            times.append(datetime.fromisoformat(s).timestamp())
        except (ValueError, TypeError):
            continue
    if len(times) < 2:
        return None
    return (max(times) - min(times)) / 86_400


def _pick_date_bucket(sample_rows: list[dict], field_name: str) -> str:
    days = _date_range_days(sample_rows, field_name)
    if days is None:
        return "month"
    if days <= 60:
        return "day"
    if days <= 120:
        return "week"
    if days <= 900:
        return "month"
    return "quarter"


def _slug(*parts: str) -> str:
    cleaned = []
    for p in parts:
        s = re.sub(r"[^a-z0-9]+", "-", p.lower())
        s = re.sub(r"(^-|-$)", "", s)
        cleaned.append(s)
    return ":".join(cleaned)


# ── Candidate generation ────────────────────────────────────────────────────


def generate_dashboard_candidates(
    schema: list[dict], sample_rows: Optional[list[dict]] = None
) -> list[WidgetCandidate]:
    sample_rows = sample_rows or []
    if not schema:
        return []

    cols = _classify(schema, sample_rows)
    metrics = _pick_metrics(cols)
    dims = _pick_dimensions(cols)
    times = _pick_time(cols)
    candidates: list[WidgetCandidate] = []

    # ── KPI cards ───────────────────────────────────────────────────────────
    for i, metric in enumerate(metrics[:2]):
        title = _with_prefix("Total", metric.label)
        candidates.append(
            WidgetCandidate(
                id=_slug("kpi", "sum", metric.name),
                name=title,
                chart_type="kpi_card",
                category="kpi",
                reason=f"Sum of {metric.label} across all rows.",
                recommended=(i == 0),
                config={"title": title, "aggregate": {"valueField": metric.name, "fn": "sum"}, **_fmt_config(metric)},
            )
        )

    if metrics:
        title = f"Average {metrics[0].label}"
        candidates.append(
            WidgetCandidate(
                id=_slug("kpi", "avg", metrics[0].name),
                name=title,
                chart_type="kpi_card",
                category="kpi",
                reason=f"Average {metrics[0].label} per row.",
                recommended=True,
                config={"title": title, "aggregate": {"valueField": metrics[0].name, "fn": "avg"}, **_fmt_config(metrics[0])},
            )
        )

    order_cols = _pick_entities(cols, ["order", "transaction", "invoice"])
    if order_cols:
        oc = order_cols[0]
        candidates.append(
            WidgetCandidate(
                id=_slug("kpi", "orders", oc.name),
                name="Total Orders",
                chart_type="kpi_card",
                category="kpi",
                reason=f"Row count, using {oc.label} as the order marker.",
                recommended=True,
                config={
                    "title": "Total Orders",
                    "aggregate": {"valueField": oc.name, "fn": "count_distinct" if oc.role == "identifier" else "count"},
                    "decimals": 0, "compact": True,
                },
            )
        )
    elif metrics:
        candidates.append(
            WidgetCandidate(
                id=_slug("kpi", "records", metrics[0].name),
                name="Total Records",
                chart_type="kpi_card",
                category="kpi",
                reason="Total number of rows returned by this model.",
                recommended=True,
                config={"title": "Total Records", "aggregate": {"valueField": metrics[0].name, "fn": "count"}, "decimals": 0, "compact": True},
            )
        )

    customer_cols = _pick_entities(cols, ["customer", "user", "lead"])
    if customer_cols:
        cc = customer_cols[0]
        candidates.append(
            WidgetCandidate(
                id=_slug("kpi", "customers", cc.name),
                name="Total Customers",
                chart_type="kpi_card",
                category="kpi",
                reason=f"Distinct count of {cc.label}.",
                recommended=True,
                config={"title": "Total Customers", "aggregate": {"valueField": cc.name, "fn": "count_distinct"}, "decimals": 0, "compact": True},
            )
        )

    # ── Trend lines ─────────────────────────────────────────────────────────
    trend_time = None
    for t in times:
        days = _date_range_days(sample_rows, t.name)
        if days is None or days > 0:
            trend_time = t
            break

    if trend_time:
        for i, metric in enumerate(metrics[:2]):
            title = f"{metric.label} Trend"
            bucket = _pick_date_bucket(sample_rows, trend_time.name)
            candidates.append(
                WidgetCandidate(
                    id=_slug("trend", trend_time.name, metric.name),
                    name=title,
                    chart_type="line",
                    category="trend",
                    reason=f"{metric.label} summed by {trend_time.label}, bucketed by {bucket}.",
                    recommended=(i == 0),
                    config={
                        "title": title, "xField": trend_time.name, "yField": metric.name,
                        "aggregate": {"groupBy": trend_time.name, "valueField": metric.name, "fn": "sum", "dateBucket": bucket},
                        "showLegend": False, **_fmt_config(metric),
                    },
                )
            )

    primary_metric = metrics[0] if metrics else None

    if primary_metric:
        # ── Category bar charts ────────────────────────────────────────────
        for i, dim in enumerate(dims[:6]):
            title = f"{primary_metric.label} by {dim.label}"
            candidates.append(
                WidgetCandidate(
                    id=_slug("bar", dim.name, primary_metric.name),
                    name=title,
                    chart_type="bar",
                    category="chart",
                    reason=f"{primary_metric.label} summed per {dim.label}, top 10.",
                    recommended=(i < 2),
                    config={
                        "title": title, "xField": dim.name, "yField": primary_metric.name,
                        "aggregate": {"groupBy": dim.name, "valueField": primary_metric.name, "fn": "sum", "topN": 10, "sortDir": "desc"},
                        "showLegend": False, **_fmt_config(primary_metric),
                    },
                )
            )

        # ── Ranked entities ─────────────────────────────────────────────────
        rank_entities = _pick_entities(cols, ["customer", "product", "user", "sku"])
        for i, entity in enumerate(rank_entities[:3]):
            title = f"Top {entity.label}"
            candidates.append(
                WidgetCandidate(
                    id=_slug("rank", entity.name, primary_metric.name),
                    name=title,
                    chart_type="bar_horizontal",
                    category="chart",
                    reason=f"Top 10 {entity.label} ranked by {primary_metric.label}.",
                    recommended=(i == 0),
                    config={
                        "title": title, "xField": entity.name, "yField": primary_metric.name,
                        "aggregate": {"groupBy": entity.name, "valueField": primary_metric.name, "fn": "sum", "topN": 10, "sortDir": "desc"},
                        "showLegend": False, **_fmt_config(primary_metric),
                    },
                )
            )

        # ── Distribution pies ────────────────────────────────────────────────
        for i, dim in enumerate(dims[:4]):
            title = f"{dim.label} Distribution"
            candidates.append(
                WidgetCandidate(
                    id=_slug("pie", dim.name, primary_metric.name),
                    name=title,
                    chart_type="pie",
                    category="chart",
                    reason=f"Share of {primary_metric.label} by {dim.label} (top 8 slices).",
                    recommended=(i == 0),
                    config={
                        "title": title, "xField": dim.name, "yField": primary_metric.name,
                        "aggregate": {"groupBy": dim.name, "valueField": primary_metric.name, "fn": "sum", "topN": 8, "sortDir": "desc"},
                        "showLegend": True,
                    },
                )
            )

        # ── Heatmaps ─────────────────────────────────────────────────────────
        heatmap_dims = dims[:4]
        for i in range(min(len(heatmap_dims), 3)):
            d1 = heatmap_dims[i]
            if i + 1 >= len(heatmap_dims):
                break
            d2 = heatmap_dims[i + 1]
            title = f"{primary_metric.label}: {d1.label} × {d2.label}"
            candidates.append(
                WidgetCandidate(
                    id=_slug("heatmap", d1.name, d2.name),
                    name=f"{primary_metric.label} Heatmap",
                    chart_type="heatmap",
                    category="chart",
                    reason=f"{primary_metric.label} summed across {d1.label} × {d2.label}.",
                    recommended=(i == 0),
                    config={
                        "title": title, "xField": d1.name, "yField": d2.name, "colorField": primary_metric.name,
                        "aggregate": {"groupBy": d1.name, "groupBy2": d2.name, "valueField": primary_metric.name, "fn": "sum"},
                    },
                )
            )

    # ── Tables ───────────────────────────────────────────────────────────────
    table_columns = (
        ([trend_time.name] if trend_time else [])
        + [d.name for d in dims[:3]]
        + [m.name for m in metrics[:3]]
    )
    candidates.append(
        WidgetCandidate(
            id="table:top10",
            name="Top 10 Records",
            chart_type="table",
            category="table",
            reason=(f"Highest 10 rows by {primary_metric.label}." if primary_metric else "First rows returned by this model."),
            recommended=True,
            config={
                "title": "Top 10 Records",
                "columns": table_columns or None,
                "pageSize": 10,
                **({"aggregate": {"valueField": primary_metric.name, "fn": "top", "topN": 10, "sortDir": "desc"}} if primary_metric else {}),
            },
        )
    )
    candidates.append(
        WidgetCandidate(
            id="table:all",
            name="All Records",
            chart_type="table",
            category="table",
            reason="Every column, paginated — a raw data view.",
            recommended=False,
            config={"title": "All Records", "pageSize": 25},
        )
    )

    return candidates


# ── Layout ───────────────────────────────────────────────────────────────────


def layout_candidates(selected: list[dict[str, Any]]) -> list[GeneratedWidgetSpec]:
    order = ["kpi", "trend", "chart", "table"]
    specs: list[GeneratedWidgetSpec] = []
    y = 0

    for category in order:
        items = [s for s in selected if s["category"] == category]
        if not items:
            continue

        if category == "kpi":
            for i, item in enumerate(items):
                specs.append(GeneratedWidgetSpec(
                    name=item["name"], chart_type=item["chart_type"], config=item["config"],
                    position={"x": (i % 4) * 3, "y": y + (i // 4) * 2, "w": 3, "h": 2},
                ))
            y += ((len(items) + 3) // 4) * 2
        elif category == "trend":
            for item in items:
                specs.append(GeneratedWidgetSpec(
                    name=item["name"], chart_type=item["chart_type"], config=item["config"],
                    position={"x": 0, "y": y, "w": 12, "h": 4},
                ))
                y += 4
        elif category == "chart":
            for i, item in enumerate(items):
                specs.append(GeneratedWidgetSpec(
                    name=item["name"], chart_type=item["chart_type"], config=item["config"],
                    position={"x": (i % 2) * 6, "y": y + (i // 2) * 4, "w": 6, "h": 4},
                ))
            y += ((len(items) + 1) // 2) * 4
        else:
            for item in items:
                specs.append(GeneratedWidgetSpec(
                    name=item["name"], chart_type=item["chart_type"], config=item["config"],
                    position={"x": 0, "y": y, "w": 12, "h": 5},
                ))
                y += 5

    return specs
