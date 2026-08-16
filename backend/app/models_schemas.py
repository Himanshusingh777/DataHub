"""
Pydantic mirror of src/lib/models-data.ts — the ChartType vocabulary and
WidgetConfig shape shared between the API and the (unchanged) frontend
ChartEngine. Kept in sync manually with the TS source; if a chart type is
added there, add it here too.
"""

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict

RECHARTS_TYPES = (
    "bar", "bar_stacked", "bar_horizontal", "bar_horizontal_stacked",
    "line", "line_smooth", "area", "area_stacked",
    "pie", "donut",
    "scatter", "bubble",
    "composed",
    "radar",
    "table",
)

ECHARTS_TYPES = (
    "treemap", "sunburst", "sankey", "funnel", "heatmap", "calendar_heatmap",
    "geo_map", "boxplot", "candlestick", "gauge", "waterfall", "parallel",
    "theme_river", "graph", "word_cloud", "kpi_card", "number_card",
    "progress_bar", "sparkline", "metric_delta",
)

ALL_CHART_TYPES: tuple[str, ...] = RECHARTS_TYPES + ECHARTS_TYPES
CHART_TYPE_SET: set[str] = set(ALL_CHART_TYPES)

ChartType = Literal[
    "bar", "bar_stacked", "bar_horizontal", "bar_horizontal_stacked",
    "line", "line_smooth", "area", "area_stacked",
    "pie", "donut", "scatter", "bubble", "composed", "radar", "table",
    "treemap", "sunburst", "sankey", "funnel", "heatmap", "calendar_heatmap",
    "geo_map", "boxplot", "candlestick", "gauge", "waterfall", "parallel",
    "theme_river", "graph", "word_cloud", "kpi_card", "number_card",
    "progress_bar", "sparkline", "metric_delta",
]

VALID_WIDGET_CATEGORIES = {"kpi", "trend", "chart", "table"}


class SchemaColumn(BaseModel):
    name: str
    type: str
    mode: Optional[str] = None
    description: Optional[str] = None


class WidgetPosition(BaseModel):
    x: int
    y: int
    w: int
    h: int


class WidgetAggregateConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    groupBy: Optional[str] = None
    groupBy2: Optional[str] = None
    valueField: Optional[str] = None
    fn: Optional[str] = None
    dateBucket: Optional[str] = None
    topN: Optional[int] = None
    sortDir: Optional[str] = None


class WidgetConfig(BaseModel):
    """Mirrors WidgetConfig's `[key: string]: unknown` index signature via
    extra="allow" — Python has no free type erasure like TS, so unlike the
    TS interface, unrecognized keys really do get stored at runtime here."""

    model_config = ConfigDict(extra="allow")

    title: Optional[str] = None
    xField: Optional[str] = None
    yField: Optional[str] = None
    colorField: Optional[str] = None
    showLegend: Optional[bool] = None
    prefix: Optional[str] = None
    suffix: Optional[str] = None
    decimals: Optional[int] = None
    compact: Optional[bool] = None
    columns: Optional[list[str]] = None
    pageSize: Optional[int] = None
    aggregate: Optional[dict[str, Any]] = None


class WidgetCandidateIn(BaseModel):
    """What the client echoes back from the preview response — validated the
    same way isValidCandidate() does in generate-dashboard/route.ts."""

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    name: str
    chart_type: str
    category: str
    reason: Optional[str] = None
    recommended: Optional[bool] = None
    config: dict[str, Any]


class GenerateDashboardBody(BaseModel):
    candidates: list[dict[str, Any]] = []
