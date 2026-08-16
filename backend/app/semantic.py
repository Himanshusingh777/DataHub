"""
Direct port of src/lib/engine/semantic.ts — universal column classification.
Given a column name, declared type, and sample values, classifies the column
into a semantic class + role. NAME_RULES order is preserved exactly
(first-match-wins); do not reorder without also reordering the TS source.
"""

import re
from dataclasses import dataclass, field
from typing import Optional

SemanticClass = str  # 60+ string literals in the TS source; kept as str here
SemanticRole = str  # "metric" | "dimension" | "time" | "identifier" | "detail"
Concept = str


@dataclass
class ClassifiedColumn:
    name: str
    declared_type: str
    semantic_class: SemanticClass
    role: SemanticRole
    label: str
    is_primary_key: Optional[bool] = None
    is_foreign_key: Optional[bool] = None


# ── Name-pattern rules (checked in order — first match wins) ─────────────────

_F = re.IGNORECASE

NAME_RULES: list[tuple[re.Pattern, SemanticClass]] = [
    (re.compile(r"(^|_)roas($|_)|return_on_ad|return_on_spend", _F), "roas"),
    (re.compile(r"(^|_)ctr($|_)|click_?through", _F), "ctr"),
    (re.compile(r"(^|_)cpc($|_)|cost_per_click", _F), "cpc"),
    (re.compile(r"(^|_)cpm($|_)|cost_per_(mille|thousand)", _F), "cpm"),
    (re.compile(r"(^|_)(ad_?spend|spend|spent|budget_spent)($|_)", _F), "spend"),
    (re.compile(r"impression", _F), "impression"),
    (re.compile(r"(^|_)(gross_?profit|net_?profit|profit|earnings)($|_)", _F), "profit"),
    (re.compile(r"margin", _F), "margin"),
    (re.compile(r"discount|coupon", _F), "discount"),
    (re.compile(r"(^|_)(tax|vat|gst)($|_)", _F), "tax"),
    (re.compile(r"conversion|converted|cvr($|_)", _F), "conversion"),
    (re.compile(r"subscription|plan_?name|billing_?cycle|mrr|arr", _F), "subscription"),
    (re.compile(r"opportunit(y|ies)|pipeline_?value", _F), "opportunity"),
    (re.compile(r"(deal|opp)_?stage|sales_?stage", _F), "deal_stage"),
    (re.compile(r"page_?views?|screen_?views?", _F), "pageview"),
    (re.compile(r"(^|_)(traffic|visits?|visitors?)($|_)", _F), "traffic"),
    (re.compile(r"(^|_)(user|users|user_?id|account_?id)($|_)", _F), "user"),
    (re.compile(r"(^|_)(utm_\w+)($|_)|^utm_", _F), "utm"),
    (re.compile(r"referrer|referer|referral", _F), "referrer"),
    (re.compile(r"(^|_)(os|operating_?system)($|_)", _F), "os"),
    (re.compile(r"(^|_)(qty|quantity|units?)($|_)", _F), "quantity"),
    # ── original v1 rules (unchanged) ─────────────────────────────────────
    (re.compile(r"(^|_)(lat|latitude)($|_)", _F), "latitude"),
    (re.compile(r"(^|_)(lng|lon|longitude)($|_)", _F), "longitude"),
    (re.compile(r"revenue|gmv|turnover", _F), "revenue"),
    (re.compile(r"(total|sub)?_?(price|amount|cost|spend|budget|fee|charge)", _F), "amount"),
    (re.compile(r"currency", _F), "currency"),
    (re.compile(r"_rate$|rate_|percent|pct|ratio", _F), "percentage"),
    (re.compile(r"(^|_)(count|qty|quantity)($|_)|(^|_)num_|total_\w+s$", _F), "count"),
    (re.compile(r"unsubscribe", _F), "unsubscribe"),
    (re.compile(r"bounce", _F), "bounce"),
    (re.compile(r"(^|_)open(ed|s)?($|_)", _F), "open"),
    (re.compile(r"click", _F), "click"),
    (re.compile(r"repl(y|ies|ied)", _F), "reply"),
    (re.compile(r"refund", _F), "refund"),
    (re.compile(r"purchase", _F), "purchase"),
    (re.compile(r"invoice", _F), "invoice"),
    (re.compile(r"order", _F), "order"),
    (re.compile(r"campaign", _F), "campaign"),
    (re.compile(r"(^|_)lead", _F), "lead"),
    (re.compile(r"customer|client|buyer", _F), "customer"),
    (re.compile(r"(^|_)sku($|_)", _F), "sku"),
    (re.compile(r"product|item_name|catalog", _F), "product"),
    (re.compile(r"warehouse", _F), "warehouse"),
    (re.compile(r"inventory|stock", _F), "inventory"),
    (re.compile(r"shipment|shipping|tracking", _F), "shipment"),
    (re.compile(r"email|e_mail", _F), "email"),
    (re.compile(r"phone|mobile|tel($|_)", _F), "phone"),
    (re.compile(r"(^|_)url|link|website|domain", _F), "url"),
    (re.compile(r"country", _F), "country"),
    (re.compile(r"(^|_)city($|_)", _F), "city"),
    (re.compile(r"region|state|province", _F), "region"),
    (re.compile(r"address|location", _F), "location"),
    (re.compile(r"status|state$|health", _F), "status"),
    (re.compile(r"category|type$|kind|group", _F), "category"),
    (re.compile(r"(^|_)tags?($|_)", _F), "tag"),
    (re.compile(r"device", _F), "device"),
    (re.compile(r"browser", _F), "browser"),
    (re.compile(r"language|locale", _F), "language"),
    (re.compile(r"platform|source$|channel|medium", _F), "platform"),
    (re.compile(r"workspace|tenant", _F), "workspace"),
    (re.compile(r"team|department", _F), "team"),
    (re.compile(r"session", _F), "session"),
    (re.compile(r"duration|elapsed|runtime|latency", _F), "duration"),
    (re.compile(r"transaction|txn", _F), "transaction"),
    (re.compile(r"(^|_)(id|uuid|guid|key)$|_id$", _F), "identifier"),
    (re.compile(r"(^|_)name$|title", _F), "name"),
    (re.compile(r"description|notes?$|body|message", _F), "description"),
    (
        re.compile(
            r"(created|updated|deleted|sent|occurred|replied|opened|synced|started|ended|completed)_?(at|on|date|time)|timestamp|_ts$|^date$|_date$",
            _F,
        ),
        "timestamp",
    ),
]

# ── Value-based detection (used when name is ambiguous) ──────────────────────

_RE_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$")
_RE_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_RE_URL = re.compile(r"^https?://")
_RE_PHONE = re.compile(r"^\+?[\d\s\-()]{7,16}$")
_RE_CURRENCY = re.compile(r"^[$€£₹]\s?[\d,.]+$|^[\d,.]+\s?(USD|EUR|GBP|INR)$", re.IGNORECASE)
_RE_PCT = re.compile(r"^[\d.]+\s?%$")


def _is_number(v) -> bool:
    if isinstance(v, bool):
        return True  # bool is a number in JS's Number() coercion sense too
    try:
        float(str(v))
        return True
    except (ValueError, TypeError):
        return False


def _classify_by_values(samples: list) -> Optional[SemanticClass]:
    vals = [v for v in samples if v is not None and v != ""][:20]
    if not vals:
        return None
    strs = [str(v) for v in vals]

    def all_match(pattern: re.Pattern) -> bool:
        return all(pattern.match(s.strip()) for s in strs)

    if all_match(_RE_ISO_DATE):
        return "timestamp"
    if all_match(_RE_EMAIL):
        return "email"
    if all_match(_RE_URL):
        return "url"
    if all_match(_RE_CURRENCY):
        return "currency"
    if all_match(_RE_PCT):
        return "percentage"
    if all_match(_RE_PHONE) and any(("+" in s or len(s) >= 10) for s in strs):
        return "phone"
    if all(isinstance(v, bool) or str(v).lower() in ("true", "false", "yes", "no") for v in vals):
        return "boolean"
    if all(_is_number(v) for v in vals):
        return "number"
    unique = {s.lower() for s in strs}
    if len(unique) <= max(2, len(strs) * 0.4) and all(len(s) < 32 for s in unique):
        return "category"
    return None


# ── Role mapping ──────────────────────────────────────────────────────────────

METRIC_CLASSES = {
    "currency", "revenue", "amount", "count", "percentage", "rate", "number", "duration",
    "reply", "click", "open", "bounce", "unsubscribe",
    "spend", "impression", "ctr", "roas", "cpc", "cpm", "conversion",
    "profit", "margin", "discount", "tax", "quantity", "traffic", "pageview", "session",
}
TIME_CLASSES = {"date", "timestamp"}
ID_CLASSES = {"identifier"}
DIMENSION_CLASSES = {
    "country", "city", "region", "location", "status", "category", "tag", "campaign",
    "device", "browser", "language", "platform", "workspace", "team", "currency",
    "product", "sku", "warehouse", "boolean", "name",
    "subscription", "opportunity", "deal_stage", "channel", "os", "referrer", "utm", "user",
}
ALWAYS_METRIC = {
    "revenue", "amount", "spend", "profit", "margin", "discount", "tax",
    "roas", "ctr", "cpc", "cpm", "impression", "conversion", "quantity",
    "traffic", "pageview", "percentage", "rate", "count",
}


def _role_for(cls: SemanticClass, declared_type: str) -> SemanticRole:
    if cls in TIME_CLASSES:
        return "time"
    if cls in ID_CLASSES:
        return "identifier"
    if cls in ALWAYS_METRIC:
        return "metric"
    if cls in METRIC_CLASSES and declared_type in ("number", "integer", "float"):
        return "metric"
    if cls in METRIC_CLASSES and cls != "number":
        return "metric" if declared_type == "number" else "dimension"
    if cls in DIMENSION_CLASSES:
        return "dimension"
    if cls == "number":
        return "metric"
    return "detail"


# ── Public API ────────────────────────────────────────────────────────────────


def human_label(name: str) -> str:
    s = re.sub(r"[_-]+", " ", name)
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", s)
    s = re.sub(r"\b\w", lambda m: m.group(0).upper(), s)
    return s.strip()


def role_for_class(cls: SemanticClass, declared_type: str = "string") -> SemanticRole:
    return _role_for(cls, declared_type)


def classify_column(
    name: str,
    declared_type: str,
    samples: Optional[list] = None,
    is_primary_key: Optional[bool] = None,
    is_foreign_key: Optional[bool] = None,
) -> ClassifiedColumn:
    samples = samples or []
    cls: Optional[SemanticClass] = None

    if declared_type == "timestamp":
        cls = "timestamp"
    elif declared_type == "boolean":
        cls = "boolean"
    elif declared_type == "json":
        cls = "json"
    elif declared_type == "array":
        cls = "array"
    elif declared_type == "uuid":
        cls = "identifier"

    if cls is None:
        for pattern, c in NAME_RULES:
            if pattern.search(name):
                cls = c
                break

    if cls is None:
        cls = _classify_by_values(samples)
    if cls is None:
        cls = "number" if declared_type == "number" else "text" if declared_type == "string" else "unknown"

    role = "identifier" if (is_primary_key or is_foreign_key) else _role_for(cls, declared_type)

    return ClassifiedColumn(
        name=name,
        declared_type=declared_type,
        semantic_class=cls,
        role=role,
        label=human_label(name),
        is_primary_key=is_primary_key,
        is_foreign_key=is_foreign_key,
    )


def classify_schema(fields: list[dict], records: Optional[list[dict]] = None) -> list[ClassifiedColumn]:
    records = records or []
    return [
        classify_column(
            f["name"],
            f["type"],
            [r.get(f["name"]) for r in records],
            f.get("isPrimaryKey"),
            f.get("isForeignKey"),
        )
        for f in fields
    ]


# ── Concept vocabulary ────────────────────────────────────────────────────────

CONCEPT_MAP: dict[Concept, list[SemanticClass]] = {
    "revenue": ["revenue", "amount", "currency", "purchase", "transaction"],
    "spend": ["spend", "cpc", "cpm"],
    "profit": ["profit", "margin"],
    "orders": ["order", "quantity"],
    "customers": ["customer", "user"],
    "leads": ["lead"],
    "campaigns": ["campaign"],
    "clicks": ["click", "ctr"],
    "impressions": ["impression"],
    "engagement": ["open", "reply", "bounce", "unsubscribe", "conversion"],
    "products": ["product", "sku"],
    "inventory": ["inventory", "warehouse", "shipment"],
    "location": ["country", "city", "region", "location", "latitude", "longitude"],
    "email": ["email"],
    "time": ["date", "timestamp"],
    "sessions": ["session", "duration"],
    "traffic": ["traffic", "pageview", "referrer", "utm", "platform", "channel"],
    "device": ["device", "browser", "os", "language"],
    "subscriptions": ["subscription"],
    "invoices": ["invoice", "tax", "discount"],
    "opportunities": ["opportunity", "deal_stage"],
}


def detect_concepts(columns: list[ClassifiedColumn]) -> list[Concept]:
    present = {c.semantic_class for c in columns}
    return [concept for concept, classes in CONCEPT_MAP.items() if any(c in present for c in classes)]


def columns_for_concept(columns: list[ClassifiedColumn], concept: Concept) -> list[ClassifiedColumn]:
    classes = CONCEPT_MAP[concept]
    return [c for c in columns if c.semantic_class in classes]


def find_column(columns: list[ClassifiedColumn], *classes: SemanticClass) -> Optional[ClassifiedColumn]:
    for cls in classes:
        for c in columns:
            if c.semantic_class == cls:
                return c
    return None


_MONETARY = {"revenue", "amount", "currency", "spend", "profit", "discount", "tax", "cpc", "cpm"}
_RATIO = {"percentage", "rate", "ctr", "margin", "conversion"}
_INVERSE = {"bounce", "unsubscribe", "cpc", "cpm", "refund"}


def is_monetary(cls: SemanticClass) -> bool:
    return cls in _MONETARY


def is_ratio(cls: SemanticClass) -> bool:
    return cls in _RATIO


def is_inverse_metric(cls: SemanticClass) -> bool:
    return cls in _INVERSE
