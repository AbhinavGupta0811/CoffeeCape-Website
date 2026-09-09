"""
nlp_engine.py — BrewBot NLP intent classifier and response generator.

Architecture:
    User message
        ↓
    Live Product detection
        ↓
    Product/Event detection
        ↓
    Intent classification
        ↓
    Response generation
        ↓
    Flask /chat API

Live product information is loaded from the existing MySQL database through
database.py. Static MENU data remains available as a safe fallback.
"""

import random
import re
from datetime import datetime
from difflib import SequenceMatcher

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

try:
    import nltk
    from nltk.corpus import stopwords
    from nltk.stem import WordNetLemmatizer
except ImportError:
    nltk = None
    stopwords = None
    WordNetLemmatizer = None

from knowledge_base import CAFE_INFO, EVENTS, INTENTS, MENU

try:
    from database import get_products, get_event_settings
except ImportError:
    get_products = None
    get_event_settings = None


# ─── NLP SETUP ────────────────────────────────────────────────────────────────

if WordNetLemmatizer:
    _lemmatizer = WordNetLemmatizer()
else:
    _lemmatizer = None

try:
    STOP_WORDS = set(stopwords.words("english")) if stopwords else set()
except Exception:
    STOP_WORDS = set()


def _safe_lemmatize(token: str) -> str:
    """Lemmatize a token without allowing missing NLTK data to break the API."""
    if not _lemmatizer:
        return token

    try:
        return _lemmatizer.lemmatize(token)
    except Exception:
        return token


def preprocess(text: str) -> str:
    """
    Normalize text for intent classification.

    Unicode letters are preserved so the engine does not unnecessarily
    destroy Hindi/Hinglish text before classification.
    """
    if not isinstance(text, str):
        return ""

    text = text.lower().strip()
    text = re.sub(r"[^\w\s₹]", " ", text, flags=re.UNICODE)

    tokens = []
    for token in text.split():
        if token in STOP_WORDS:
            continue
        tokens.append(_safe_lemmatize(token))

    return " ".join(tokens)


# ─── BUILD TF-IDF MODEL ───────────────────────────────────────────────────────


def _build_corpus():
    """Flatten intent patterns into a TF-IDF training corpus."""
    corpus = []
    tags = []

    for intent in INTENTS:
        tag = intent.get("tag", "")

        for pattern in intent.get("patterns", []):
            processed = preprocess(pattern)

            if processed:
                corpus.append(processed)
                tags.append(tag)

    return corpus, tags


_corpus, _tags = _build_corpus()

_vectorizer = TfidfVectorizer(
    ngram_range=(1, 2),
    analyzer="word",
    lowercase=False
)

_tfidf_matrix = _vectorizer.fit_transform(_corpus) if _corpus else None


# ─── NORMALIZATION HELPERS ────────────────────────────────────────────────────


def _normalize_for_matching(text: str) -> str:
    """Create a simple normalized representation for direct matching."""
    if not isinstance(text, str):
        return ""

    text = text.lower()
    text = text.replace("₹", " rs ")
    text = text.replace("&", " and ")
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)

    return re.sub(r"\s+", " ", text).strip()


def _compact_text(text: str) -> str:
    """Remove spaces for compact alias comparisons."""
    return re.sub(r"\s+", "", _normalize_for_matching(text))


def _contains_phrase(text: str, phrase: str) -> bool:
    """Check whether a phrase exists as a complete word sequence."""
    normalized_text = _normalize_for_matching(text)
    normalized_phrase = _normalize_for_matching(phrase)

    if not normalized_text or not normalized_phrase:
        return False

    pattern = rf"(?<!\w){re.escape(normalized_phrase)}(?!\w)"

    return bool(re.search(pattern, normalized_text, flags=re.UNICODE))


def _similarity(left: str, right: str) -> float:
    """Return a lightweight fuzzy similarity score."""
    left = _compact_text(left)
    right = _compact_text(right)

    if not left or not right:
        return 0.0

    return SequenceMatcher(None, left, right).ratio()


def _safe_number(value, default=0):
    """Convert database numeric values safely."""
    try:
        if value is None:
            return default

        return float(value)
    except (TypeError, ValueError):
        return default


# ─── PRODUCT DATA HELPERS ─────────────────────────────────────────────────────


_CATEGORY_PAGE_MAP = {
    "hot_beverages": "/menu.html#hot-beverages",
    "cold_beverages": "/menu.html#cold-beverages",
    "refreshments": "/menu.html#refreshments",
    "special_combos": "/menu.html#special-combos",
    "desserts": "/menu.html#desserts",
    "burgers_fries": "/menu.html#burgers-fries"
}


def _static_menu_items():
    """Return normalized static menu items."""
    items = []

    for category_key, category in MENU.items():
        for item in category.get("items", []):
            items.append({
                "id": item.get("id"),
                "product_id": item.get("product_id"),
                "category_key": category_key,
                "category": category.get("label", category_key),
                "subcategory": item.get("subcategory", ""),
                "page": category.get("page", ""),
                "emoji": category.get("emoji", ""),
                "name": item.get("name", ""),
                "price": item.get("price", 0),
                "offer_price": item.get("offer_price"),
                "description": item.get(
                    "description",
                    item.get("desc", "")
                ),
                "desc": item.get(
                    "description",
                    item.get("desc", "")
                ),
                "stock_qty": item.get("stock_qty"),
                "availability": item.get("availability", "in_stock"),
                "badge": item.get("badge", ""),
                "prep_time": item.get("prep_time"),
                "rating": item.get("rating"),
                "is_featured": item.get("is_featured", False),
                "is_active": item.get("is_active", True)
            })

    return items


def _database_menu_items():
    """
    Load active products from the existing MySQL database.

    database.py owns the actual SQL query. This NLP layer only consumes
    normalized product dictionaries.
    """
    if not get_products:
        return []

    try:
        products = get_products()

        if not products:
            return []

        normalized_items = []

        for product in products:
            if not isinstance(product, dict):
                continue

            name = str(product.get("name", "") or "").strip()

            if not name:
                continue

            category = str(
                product.get("category", "") or "Menu"
            ).strip()

            subcategory = str(
                product.get("subcategory", "") or ""
            ).strip()

            description = str(
                product.get(
                    "description",
                    product.get("desc", "")
                ) or ""
            ).strip()

            price = _safe_number(
                product.get("price"),
                0
            )

            offer_price_value = product.get("offer_price")

            if offer_price_value in (None, ""):
                offer_price = None
            else:
                offer_price = _safe_number(
                    offer_price_value,
                    0
                )

            category_key = _normalize_category_key(
                category,
                subcategory
            )

            page = (
                product.get("page")
                or product.get("menu_page")
                or _CATEGORY_PAGE_MAP.get(category_key, "")
            )

            normalized_items.append({
                "id": product.get("id"),
                "product_id": product.get("product_id"),
                "category_key": category_key,
                "category": category,
                "subcategory": subcategory,
                "page": page,
                "emoji": "",
                "name": name,
                "price": price,
                "offer_price": offer_price,
                "description": description,
                "desc": description,
                "stock_qty": product.get("stock_qty"),
                "availability": str(
                    product.get("availability", "in_stock") or "in_stock"
                ).lower(),
                "badge": product.get("badge", ""),
                "prep_time": product.get("prep_time"),
                "rating": product.get("rating"),
                "is_featured": product.get("is_featured", False),
                "is_active": product.get("is_active", True)
            })

        return normalized_items

    except Exception as error:
        print(f"BrewBot product database read failed: {error}")
        return []


def _normalize_category_key(category: str, subcategory: str = "") -> str:
    """Convert database category values into useful internal keys."""
    value = _normalize_for_matching(
        f"{category} {subcategory}"
    )

    if any(term in value for term in [
        "hot beverage",
        "hot beverages",
        "coffee",
        "tea"
    ]):
        return "hot_beverages"

    if any(term in value for term in [
        "cold beverage",
        "cold beverages",
        "cold drink",
        "cold drinks",
        "shake",
        "smoothie"
    ]):
        return "cold_beverages"

    if any(term in value for term in [
        "refreshment",
        "refreshments",
        "snack"
    ]):
        return "refreshments"

    if any(term in value for term in [
        "combo",
        "combos",
        "special"
    ]):
        return "special_combos"

    if any(term in value for term in [
        "dessert",
        "desserts",
        "sweet"
    ]):
        return "desserts"

    if any(term in value for term in [
        "burger",
        "fries",
        "burger fries"
    ]):
        return "burgers_fries"

    return _compact_text(category)


def _product_is_available(item) -> bool:
    """Determine whether a product should be presented as available."""
    availability = str(
        item.get("availability", "in_stock") or ""
    ).strip().lower()

    if availability in {
        "out_of_stock",
        "out of stock",
        "unavailable",
        "disabled",
        "inactive"
    }:
        return False

    stock_qty = item.get("stock_qty")

    if stock_qty is not None:
        try:
            if float(stock_qty) <= 0:
                return False
        except (TypeError, ValueError):
            pass

    return True


def _all_menu_items():
    """
    Return live database products when available.

    Static MENU remains the fallback if the database cannot be read.
    """
    live_items = _database_menu_items()

    if live_items:
        return live_items

    return _static_menu_items()


def _build_product_aliases(name: str):
    """
    Generate useful aliases for a menu item without maintaining a second
    hardcoded product database.
    """
    if not name:
        return set()

    aliases = {name}

    normalized = _normalize_for_matching(name)

    replacements = {
        "café": "cafe",
        "coffee": "",
        "classic": "",
        "regular": ""
    }

    simplified = normalized

    for old, new in replacements.items():
        simplified = simplified.replace(old, new)

    simplified = re.sub(
        r"\s+",
        " ",
        simplified
    ).strip()

    if simplified:
        aliases.add(simplified)

    lower_name = name.lower()

    if lower_name.endswith(" coffee"):
        aliases.add(name[:-7])

    if lower_name.endswith(" fries"):
        aliases.add(name[:-6])

    return {
        alias
        for alias in aliases
        if alias
    }


def find_product(user_input: str):
    """
    Find an exact or strong fuzzy menu-item match.

    Exact phrase matches are preferred over fuzzy matches.
    Live database products are searched first.
    """
    if not isinstance(user_input, str) or not user_input.strip():
        return None

    normalized_input = _normalize_for_matching(user_input)
    compact_input = _compact_text(user_input)

    exact_matches = []

    for item in _all_menu_items():
        if not _product_is_available(item):
            continue

        aliases = _build_product_aliases(
            item.get("name", "")
        )

        for alias in aliases:
            normalized_alias = _normalize_for_matching(alias)

            if not normalized_alias:
                continue

            if _contains_phrase(
                normalized_input,
                normalized_alias
            ):
                exact_matches.append(
                    (
                        len(normalized_alias),
                        item
                    )
                )
                break

    if exact_matches:
        exact_matches.sort(
            key=lambda value: value[0],
            reverse=True
        )

        return exact_matches[0][1]

    best_item = None
    best_score = 0.0

    for item in _all_menu_items():
        if not _product_is_available(item):
            continue

        name_score = _similarity(
            compact_input,
            item.get("name", "")
        )

        if name_score > best_score:
            best_score = name_score
            best_item = item

    if best_score >= 0.88:
        return best_item

    return None


def _product_question_type(user_input: str) -> str:
    """Determine what the user wants to know about a product."""
    text = _normalize_for_matching(user_input)

    price_words = (
        "price",
        "prices",
        "cost",
        "how much",
        "rate",
        "charge",
        "worth",
        "rupee",
        "rs"
    )

    detail_words = (
        "what is",
        "what's",
        "tell me about",
        "details",
        "detail",
        "description",
        "ingredients",
        "contains",
        "about"
    )

    category_words = (
        "category",
        "categories",
        "all",
        "menu",
        "options",
        "items"
    )

    if any(
        _contains_phrase(text, word)
        for word in price_words
    ):
        return "price"

    if any(
        _contains_phrase(text, word)
        for word in detail_words
    ):
        return "details"

    if any(
        _contains_phrase(text, word)
        for word in category_words
    ):
        return "category"

    return "details"


def _display_product_price(item) -> str:
    """Return the effective product price."""
    price = _safe_number(
        item.get("price"),
        0
    )

    offer_price = item.get("offer_price")

    if offer_price not in (None, ""):
        offer_price = _safe_number(
            offer_price,
            0
        )

        if 0 < offer_price < price:
            return (
                f"₹{offer_price:g} "
                f"(regularly ₹{price:g})"
            )

    return f"₹{price:g}"


def _product_response(item, question_type="details") -> str:
    """Generate a response for one specific menu item."""
    name = item.get("name", "This item")
    description = item.get(
        "description",
        item.get("desc", "")
    )
    category = item.get(
        "category",
        "Menu"
    )
    page = item.get("page", "")

    price_text = _display_product_price(item)

    lines = []

    if question_type == "price":
        lines.append(
            f"**{name}** is **{price_text}**."
        )

        if description:
            lines.append(f"\n{description}")
    else:
        lines.append(
            f"**{name}** — **{price_text}**"
        )

        if description:
            lines.append(f"\n{description}")

    if category:
        lines.append(
            f"\nCategory: **{category}**"
        )

    availability = str(
        item.get("availability", "") or ""
    ).strip().lower()

    if availability in {
        "in_stock",
        "available",
        "active"
    }:
        lines.append(
            "\n**Availability:** Available"
        )

    prep_time = item.get("prep_time")

    if prep_time not in (None, ""):
        lines.append(
            f"**Preparation time:** {prep_time}"
        )

    rating = item.get("rating")

    if rating not in (None, ""):
        lines.append(
            f"**Rating:** {rating}"
        )

    if page:
        lines.append(
            f"\n[View the category menu]({page})"
        )

    return "\n".join(lines)


# ─── LIVE MENU RESPONSE BUILDERS ─────────────────────────────────────────────


def _category_matches(item, cat_key):
    """Check whether a database product belongs to a category."""
    item_key = item.get("category_key", "")

    if item_key == cat_key:
        return True

    category = _normalize_for_matching(
        item.get("category", "")
    )

    subcategory = _normalize_for_matching(
        item.get("subcategory", "")
    )

    combined = f"{category} {subcategory}"

    category_terms = {
        "hot_beverages": (
            "hot beverage",
            "hot beverages",
            "coffee",
            "tea"
        ),
        "cold_beverages": (
            "cold beverage",
            "cold beverages",
            "cold drink",
            "cold drinks",
            "shake",
            "smoothie"
        ),
        "refreshments": (
            "refreshment",
            "refreshments",
            "snack"
        ),
        "special_combos": (
            "combo",
            "combos",
            "special"
        ),
        "desserts": (
            "dessert",
            "desserts",
            "sweet"
        ),
        "burgers_fries": (
            "burger",
            "fries"
        )
    }

    return any(
        _contains_phrase(combined, term)
        for term in category_terms.get(cat_key, ())
    )


def _live_category_items(cat_key):
    """Return available live products for one menu category."""
    live_items = _database_menu_items()

    if not live_items:
        return []

    return [
        item
        for item in live_items
        if _product_is_available(item)
        and _category_matches(item, cat_key)
    ]


def _menu_category_response(cat_key: str) -> str:
    """Return menu items for a specific category."""
    live_items = _live_category_items(cat_key)

    if live_items:
        label = cat_key.replace("_", " ").title()

        lines = [
            f"**{label}**\n"
        ]

        for item in live_items:
            lines.append(
                f"• **{item['name']}** — "
                f"{_display_product_price(item)}\n"
                f"  _{item.get('description', '')}_"
            )

        page = _CATEGORY_PAGE_MAP.get(
            cat_key,
            ""
        )

        if page:
            lines.append(
                f"\n[View the full {label} menu]({page})"
            )

        return "\n".join(lines)

    cat = MENU.get(cat_key)

    if not cat:
        return "I couldn't find that menu category right now."

    lines = [
        f"**{cat['label']}**\n"
    ]

    for item in cat.get("items", []):
        lines.append(
            f"• **{item['name']}** — ₹{item['price']}\n"
            f"  _{item.get('desc', '')}_"
        )

    page = cat.get("page")

    if page:
        lines.append(
            f"\n[View the full {cat['label']} menu]({page})"
        )

    return "\n".join(lines)


def _full_menu_overview() -> str:
    """Return the current live menu with category grouping."""
    live_items = _database_menu_items()

    if not live_items:
        lines = [
            "**CoffeeCape Menu**\n"
        ]

        for category in MENU.values():
            item_names = ", ".join(
                item["name"]
                for item in category.get("items", [])[:3]
            )

            lines.append(
                f"**{category['label']}** — {item_names}"
            )

            if category.get("page"):
                lines.append(
                    f"[View full {category['label']} menu]"
                    f"({category['page']})"
                )

            lines.append("")

        lines.append(
            "Ask me about any category or a specific item "
            "for its price and details."
        )

        return "\n".join(lines)

    grouped = {}

    for item in live_items:
        if not _product_is_available(item):
            continue

        category = item.get(
            "category",
            "Other"
        )

        grouped.setdefault(
            category,
            []
        ).append(item)

    if not grouped:
        return (
            "The menu is currently unavailable. "
            "Please try again shortly."
        )

    lines = [
        "**CoffeeCape Menu**\n"
    ]

    for category, items in grouped.items():
        names = ", ".join(
            item["name"]
            for item in items[:5]
        )

        lines.append(
            f"**{category}** — {names}"
        )

        lines.append("")

    lines.append(
        "Ask me about any specific item for its "
        "current price and details."
    )

    return "\n".join(lines)


def _recommendations_response() -> str:
    """Generate recommendations from the live menu."""
    live_items = [
        item
        for item in _database_menu_items()
        if _product_is_available(item)
    ]

    if not live_items:
        return _static_recommendations_response()

    featured = [
        item
        for item in live_items
        if item.get("is_featured")
    ]

    rated = [
        item
        for item in live_items
        if item.get("rating") not in (None, "")
    ]

    if featured:
        candidates = featured
    elif rated:
        candidates = sorted(
            rated,
            key=lambda item: _safe_number(
                item.get("rating"),
                0
            ),
            reverse=True
        )
    else:
        candidates = live_items

    picks = candidates[:5]

    if not picks:
        return (
            "I don't have enough menu information "
            "to make recommendations right now."
        )

    lines = [
        "**Some CoffeeCape Picks**\n"
    ]

    for item in picks:
        description = item.get(
            "description",
            ""
        )

        lines.append(
            f"• **{item['name']}** — "
            f"{_display_product_price(item)}"
        )

        if description:
            lines.append(
                f"  _{description}_"
            )

    lines.append(
        "\nTell me what you prefer — coffee, cold drinks, "
        "food, dessert, or a combo — and I can narrow "
        "the choices down."
    )

    return "\n".join(lines)


def _static_recommendations_response() -> str:
    """Static recommendation fallback."""
    preferred_categories = [
        "hot_beverages",
        "cold_beverages",
        "desserts",
        "burgers_fries",
        "special_combos"
    ]

    picks = []

    for category_key in preferred_categories:
        category = MENU.get(category_key)

        if not category or not category.get("items"):
            continue

        item = category["items"][0]

        picks.append({
            "name": item["name"],
            "price": item["price"],
            "category": category["label"],
            "desc": item.get("desc", "")
        })

    if not picks:
        return (
            "I don't have enough menu information "
            "to make recommendations right now."
        )

    lines = [
        "**Some CoffeeCape Picks**\n"
    ]

    for pick in picks:
        lines.append(
            f"• **{pick['name']}** — ₹{pick['price']}\n"
            f"  _{pick['desc']}_"
        )

    lines.append(
        "\nTell me what you prefer — coffee, cold drinks, "
        "food, dessert, or a combo — and I can narrow "
        "the choices down."
    )

    return "\n".join(lines)


def _price_overview() -> str:
    """Return price ranges calculated from live products."""
    live_items = [
        item
        for item in _database_menu_items()
        if _product_is_available(item)
    ]

    if not live_items:
        return _static_price_overview()

    grouped = {}

    for item in live_items:
        category = item.get(
            "category",
            "Menu"
        )

        price = _safe_number(
            item.get("offer_price")
            if item.get("offer_price") not in (None, "")
            else item.get("price"),
            0
        )

        if price <= 0:
            continue

        grouped.setdefault(
            category,
            []
        ).append(price)

    if not grouped:
        return _static_price_overview()

    lines = [
        "**CoffeeCape Price Overview**\n"
    ]

    for category, prices in grouped.items():
        lines.append(
            f"• **{category}:** "
            f"₹{min(prices):g} – ₹{max(prices):g}"
        )

    payment = CAFE_INFO.get("payment")

    if payment:
        lines.append(
            f"\n**Payment:** {payment}"
        )

    lines.append(
        "\nAsk me for a specific item if you want "
        "its exact current price."
    )

    return "\n".join(lines)


def _static_price_overview() -> str:
    """Static price overview fallback."""
    lines = [
        "**CoffeeCape Price Overview**\n"
    ]

    for category in MENU.values():
        prices = [
            item.get("price", 0)
            for item in category.get("items", [])
            if isinstance(
                item.get("price", 0),
                (int, float)
            )
        ]

        if not prices:
            continue

        lines.append(
            f"• **{category['label']}:** "
            f"₹{min(prices)} – ₹{max(prices)}"
        )

    payment = CAFE_INFO.get("payment")

    if payment:
        lines.append(
            f"\n**Payment:** {payment}"
        )

    lines.append(
        "\nAsk me for a specific item if you want "
        "its exact price."
    )

    return "\n".join(lines)


# ─── EVENT HELPERS ────────────────────────────────────────────────────────────


def _database_event_settings():
    """Load audience event settings from the existing MySQL database."""
    if not get_event_settings:
        return []

    try:
        settings = get_event_settings()
        if not settings:
            return []

        return [
            item for item in settings
            if isinstance(item, dict) and item.get("booking_id") is not None
        ]
    except Exception as error:
        print(f"BrewBot event settings database read failed: {error}")
        return []


def _format_event_setting(item):
    """Format one live audience-event settings record."""
    booking_id = item.get("booking_id")
    enabled = item.get("audience_booking_enabled")
    price = _safe_number(item.get("audience_ticket_price"), 0)
    capacity = item.get("audience_capacity")
    booked = item.get("audience_booked")

    lines = [f"**Audience Event — Booking #{booking_id}**"]

    if enabled is not None:
        status = "Open" if bool(enabled) else "Closed"
        lines.append(f"**Audience booking:** {status}")

    if price > 0:
        lines.append(f"**Ticket price:** ₹{price:g}")
    elif item.get("audience_ticket_price") is not None:
        lines.append(f"**Ticket price:** ₹0")

    if capacity is not None:
        lines.append(f"**Capacity:** {capacity}")

    if booked is not None:
        lines.append(f"**Booked:** {booked}")

    if capacity is not None and booked is not None:
        try:
            remaining = max(int(capacity) - int(booked), 0)
            lines.append(f"**Seats remaining:** {remaining}")
        except (TypeError, ValueError):
            pass

    return "\n".join(lines)


def _live_events_response():
    """Return audience event availability from live event_settings data."""
    settings = _database_event_settings()

    if not settings:
        return (
            "There are currently **no scheduled audience events** at "
            "CoffeeCape. Once an event is scheduled by the admin, "
            "I'll be able to show its live ticket price, capacity, "
            "booking status, and available seats."
        )

    lines = ["**Live CoffeeCape Event Settings**\n"]
    for item in settings:
        lines.append(_format_event_setting(item))
        lines.append("")

    return "\n".join(lines).strip()


def _find_event(user_input: str):
    """Find a specific event from the user's message."""
    if not isinstance(user_input, str):
        return None

    normalized_input = _normalize_for_matching(
        user_input
    )

    aliases = {
        "dinner": [
            "dinner",
            "dinner night",
            "dinner nights",
            "friday dinner",
            "live music dinner"
        ],
        "get_together": [
            "get together",
            "get-together",
            "gathering",
            "hangout",
            "group booking",
            "team outing"
        ],
        "karaoke": [
            "karaoke",
            "karaoke night",
            "singing night",
            "song night"
        ],
        "open_mic": [
            "open mic",
            "open mic night",
            "mic night",
            "poetry night",
            "comedy night",
            "stand up",
            "storytelling"
        ],
        "tasting": [
            "tasting",
            "tasting event",
            "coffee tasting",
            "brew tasting"
        ],
        "private": [
            "private celebration",
            "private event",
            "private party",
            "birthday party",
            "anniversary",
            "book the venue",
            "rent the space"
        ]
    }

    matches = []

    for event_key, event_aliases in aliases.items():
        for alias in event_aliases:
            if _contains_phrase(
                normalized_input,
                alias
            ):
                matches.append(
                    (
                        len(alias),
                        event_key
                    )
                )
                break

    if matches:
        matches.sort(reverse=True)
        return matches[0][1]

    return None


# ─── INTENT CLASSIFICATION ────────────────────────────────────────────────────


def classify_intent(
    user_input: str,
    threshold: float = 0.20
):
    """
    Return (intent_tag, confidence).

    Classification uses:
    1. Strong multi-word phrase matching.
    2. TF-IDF similarity.
    3. Single-word keyword matching.

    Product and event detection are handled separately by
    get_response().
    """
    if not isinstance(user_input, str):
        return "unknown", 0.0

    processed = preprocess(user_input)

    if not processed:
        return "unknown", 0.0

    normalized_input = _normalize_for_matching(
        user_input
    )

    best_kw_tag = None
    best_kw_score = 0.0
    best_kw_len = 0

    for intent in sorted(
        INTENTS,
        key=lambda value: -value.get("priority", 5)
    ):
        priority = intent.get(
            "priority",
            5
        )

        for pattern in intent.get(
            "patterns",
            []
        ):
            normalized_pattern = _normalize_for_matching(
                pattern
            )

            if len(
                normalized_pattern.split()
            ) < 2:
                continue

            if not _contains_phrase(
                normalized_input,
                normalized_pattern
            ):
                continue

            score = (
                0.80
                + (priority / 100)
                + min(
                    len(normalized_pattern),
                    40
                ) * 0.001
            )

            if (
                score > best_kw_score
                or (
                    score == best_kw_score
                    and len(normalized_pattern)
                    > best_kw_len
                )
            ):
                best_kw_score = score
                best_kw_tag = intent["tag"]
                best_kw_len = len(
                    normalized_pattern
                )

    if best_kw_tag:
        return (
            best_kw_tag,
            min(best_kw_score, 0.99)
        )

    best_score = 0.0
    tfidf_tag = "unknown"

    if _tfidf_matrix is not None:
        try:
            vector = _vectorizer.transform(
                [processed]
            )

            similarities = cosine_similarity(
                vector,
                _tfidf_matrix
            ).flatten()

            if len(similarities):
                best_index = int(
                    np.argmax(similarities)
                )

                best_score = float(
                    similarities[best_index]
                )

                tfidf_tag = _tags[
                    best_index
                ]

        except Exception:
            best_score = 0.0
            tfidf_tag = "unknown"

    input_tokens = set(
        normalized_input.split()
    )

    for intent in sorted(
        INTENTS,
        key=lambda value: -value.get("priority", 5)
    ):
        priority = intent.get(
            "priority",
            5
        )

        for pattern in intent.get(
            "patterns",
            []
        ):
            normalized_pattern = _normalize_for_matching(
                pattern
            )

            if len(
                normalized_pattern.split()
            ) != 1:
                continue

            if normalized_pattern not in input_tokens:
                continue

            keyword_score = (
                0.70
                + (priority / 100)
            )

            if keyword_score > best_score:
                best_score = keyword_score
                tfidf_tag = intent["tag"]

    if best_score >= threshold:
        return (
            tfidf_tag,
            min(best_score, 0.99)
        )

    return "unknown", best_score


# ─── EVENT RESPONSE BUILDERS ─────────────────────────────────────────────────


def _event_response(event_key: str) -> str:
    """Return detailed information for one event."""
    live_settings = _database_event_settings()

    if live_settings:
        return _live_events_response()

    event = EVENTS.get(event_key)

    if not event:
        return (
            "I couldn't find details for that event right now."
        )

    booking_url = event.get(
        "booking_url",
        ""
    )

    response = (
        f"**{event['name']}**\n\n"
        f"**Schedule:** {event['schedule']}\n"
        f"**Details:** {event['desc']}\n"
        f"**Capacity:** {event['capacity']}\n"
        f"**Price:** {event['price_range']}"
    )

    if booking_url:
        response += (
            f"\n\n[Book this event]({booking_url})"
        )

    return response


def _all_events_response() -> str:
    """Return live scheduled audience events when available."""
    return _live_events_response()

    for event in EVENTS.values():
        lines.append(
            f"**{event['name']}** — "
            f"{event['schedule']}\n"
            f"{event['desc']}"
        )

        if event.get("booking_url"):
            lines.append(
                f"[View / Book Event]"
                f"({event['booking_url']})"
            )

        lines.append("")

    return "\n".join(lines).strip()


# ─── HOURS RESPONSE BUILDERS ──────────────────────────────────────────────────


def _hours_response() -> str:
    """Return all café opening hours."""
    hours = CAFE_INFO.get(
        "hours",
        {}
    )

    if not hours:
        return (
            "Opening-hour information is "
            "currently unavailable."
        )

    lines = [
        "**CoffeeCape Opening Hours**\n"
    ]

    for day, time in hours.items():
        lines.append(
            f"• **{day}:** {time}"
        )

    return "\n".join(lines)


def _today_hours_response() -> str:
    """Return opening information for the current day."""
    hours = CAFE_INFO.get(
        "hours",
        {}
    )

    if not hours:
        return (
            "Today's opening-hour information "
            "is currently unavailable."
        )

    weekday = datetime.now().weekday()

    day_map = {
        0: "Mon–Fri",
        1: "Mon–Fri",
        2: "Mon–Fri",
        3: "Mon–Fri",
        4: "Mon–Fri",
        5: "Saturday",
        6: "Sunday"
    }

    day_name = day_map[weekday]
    today_hours = hours.get(day_name)

    if not today_hours:
        return _hours_response()

    if today_hours.lower() == "closed":
        return (
            "**Today:** CoffeeCape is **closed**."
        )

    return (
        f"**Today:** CoffeeCape is open "
        f"**{today_hours}**."
    )


def _day_hours_response(day: str) -> str:
    """Return opening hours for a requested weekday."""
    hours = CAFE_INFO.get(
        "hours",
        {}
    )

    day = day.lower().strip()

    if day in {
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday"
    }:
        value = hours.get(
            "Mon–Fri"
        )
        label = day.capitalize()

    elif day in {
        "saturday",
        "sat"
    }:
        value = hours.get(
            "Saturday"
        )
        label = "Saturday"

    elif day in {
        "sunday",
        "sun"
    }:
        value = hours.get(
            "Sunday"
        )
        label = "Sunday"

    else:
        return _hours_response()

    if not value:
        return (
            f"I don't have opening hours "
            f"available for {label}."
        )

    return f"**{label}:** {value}"


def _extract_requested_day(user_input: str):
    """Extract a weekday from a user question."""
    normalized = _normalize_for_matching(
        user_input
    )

    days = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday"
    ]

    for day in days:
        if _contains_phrase(
            normalized,
            day
        ):
            return day

    return None


# ─── BOOKING RESPONSE ─────────────────────────────────────────────────────────


def _booking_response() -> str:
    """Return booking options based on live scheduled events."""
    settings = _database_event_settings()

    if not settings:
        return (
            "**Event Booking**\n\n"
            "There are currently **no scheduled audience events** "
            "available for booking. Please check again after the admin "
            "schedules an event."
        )

    lines = [
        "**How to Book at CoffeeCape**\n",
        "The following audience-event booking settings are currently live:\n"
    ]

    for item in settings:
        lines.append(_format_event_setting(item))
        lines.append("")
        booking_url = item.get(
            "booking_url"
        )

        if booking_url:
            lines.append(
                f"• [{item['name']}]"
                f"({booking_url})"
            )
 
    phone = CAFE_INFO.get("phone")
    email = CAFE_INFO.get("email")

    lines.append("")

    if phone:
        lines.append(
            f"**Phone:** {phone}"
        )

    if email:
        lines.append(
            f"**Email:** {email}"
        )

    reservations = CAFE_INFO.get(
        "reservations"
    )

    if reservations:
        lines.append(
            f"\n{reservations}"
        )

    return "\n".join(lines)


# ─── CAFÉ INFORMATION ─────────────────────────────────────────────────────────


def _website_value() -> str:
    """Return a website only when one has actually been configured."""
    website = str(
        CAFE_INFO.get(
            "website",
            ""
        ) or ""
    ).strip()

    if not website:
        return ""

    return website


def _about_response() -> str:
    """Return café information."""
    lines = [
        f"**About "
        f"{CAFE_INFO.get('name', 'CoffeeCape')}**\n",
        CAFE_INFO.get(
            "about",
            "CoffeeCape café information "
            "is currently unavailable."
        )
    ]

    location = CAFE_INFO.get(
        "location"
    )

    if location:
        lines.append(
            f"\n**Location:** {location}"
        )

    website = _website_value()

    if website:
        lines.append(
            f"**Website:** {website}"
        )

    return "\n".join(lines)


def _location_response() -> str:
    """Return location and contact information."""
    location = CAFE_INFO.get(
        "location",
        "Location unavailable."
    )

    phone = CAFE_INFO.get(
        "phone"
    )

    lines = [
        "**CoffeeCape Location**\n",
        f"CoffeeCape is located in "
        f"**{location}**."
    ]

    parking = CAFE_INFO.get(
        "parking"
    )

    if parking:
        lines.append(
            f"\n**Parking:** {parking}"
        )

    if phone:
        lines.append(
            f"**Phone:** {phone}"
        )

    website = _website_value()

    if website:
        lines.append(
            f"**Website:** {website}"
        )

    return "\n".join(lines)


def _contact_response() -> str:
    """Return contact information."""
    lines = [
        "**Contact CoffeeCape**\n"
    ]

    phone = CAFE_INFO.get(
        "phone"
    )

    email = CAFE_INFO.get(
        "email"
    )

    website = _website_value()

    if phone:
        lines.append(
            f"**Phone:** {phone}"
        )

    if email:
        lines.append(
            f"**Email:** {email}"
        )

    if website:
        lines.append(
            f"**Website:** {website}"
        )

    hours = CAFE_INFO.get(
        "hours",
        {}
    )

    if hours:
        lines.append(
            "\n**Opening Hours:**"
        )

        for day, time in hours.items():
            lines.append(
                f"• {day}: {time}"
            )

    return "\n".join(lines)


def _amenities_response() -> str:
    """Return café facilities and policies."""
    lines = [
        "**CoffeeCape Facilities**\n"
    ]

    fields = [
        ("WiFi", "wifi"),
        ("Parking", "parking"),
        ("Payment", "payment"),
        ("Reservations", "reservations")
    ]

    for label, key in fields:
        value = CAFE_INFO.get(
            key
        )

        if value:
            lines.append(
                f"• **{label}:** {value}"
            )

    return "\n".join(lines)


# ─── SPECIAL QUESTION DETECTION ──────────────────────────────────────────────


def _is_today_question(user_input: str) -> bool:
    text = _normalize_for_matching(
        user_input
    )

    return (
        _contains_phrase(text, "today")
        or _contains_phrase(text, "right now")
        or _contains_phrase(text, "currently")
    )


def _is_hours_question(user_input: str) -> bool:
    text = _normalize_for_matching(
        user_input
    )

    hour_terms = [
        "opening hours",
        "opening time",
        "closing time",
        "timing",
        "timings",
        "hours",
        "open",
        "close",
        "when do you open",
        "what time",
        "working hours",
        "operating hours"
    ]

    return any(
        _contains_phrase(text, term)
        for term in hour_terms
    )


def _is_price_question(user_input: str) -> bool:
    text = _normalize_for_matching(
        user_input
    )

    price_terms = [
        "price",
        "prices",
        "cost",
        "how much",
        "rate",
        "charges",
        "pricing",
        "cheap",
        "expensive",
        "affordable",
        "budget"
    ]

    return any(
        _contains_phrase(text, term)
        for term in price_terms
    )


def _is_menu_question(user_input: str) -> bool:
    text = _normalize_for_matching(
        user_input
    )

    menu_terms = [
        "menu",
        "what do you serve",
        "what do you have",
        "what can i order",
        "food menu",
        "drink menu",
        "show me menu",
        "items",
        "offerings"
    ]

    return any(
        _contains_phrase(text, term)
        for term in menu_terms
    )


def _is_event_question(user_input: str) -> bool:
    text = _normalize_for_matching(
        user_input
    )

    event_terms = [
        "event",
        "events",
        "activity",
        "activities",
        "what's happening",
        "whats happening",
        "things to do",
        "entertainment",
        "upcoming"
    ]

    return any(
        _contains_phrase(text, term)
        for term in event_terms
    )


# ─── RESPONSE MAP ─────────────────────────────────────────────────────────────


_RESPONSES = {
    "greeting": lambda _: random.choice([
        f"Hey there! Welcome to "
        f"**{CAFE_INFO.get('name', 'CoffeeCape')}**!\n\n"
        "I'm BrewBot, your café guide. I can help "
        "with the menu, events, bookings, opening hours, "
        "location, prices, and more.\n\n"
        "What would you like to know?",

        f"Hello! Great to see you at "
        f"**{CAFE_INFO.get('name', 'CoffeeCape')}**.\n\n"
        "What can I help you with today? Ask me about "
        "our coffee, food, events, bookings, or café information.",

        "Namaste! Welcome to **CoffeeCape**.\n\n"
        "I'm BrewBot. I can help you explore our menu, "
        "events, prices, opening hours, and more."
    ]),

    "goodbye": lambda _: random.choice([
        "Goodbye! Hope to see you soon at CoffeeCape. "
        "Have a wonderful day!",
        "See you soon! Take care and enjoy your day!",
        "Bye! Feel free to come back whenever you need help."
    ]),

    "thanks": lambda _: random.choice([
        "You're welcome! Feel free to ask me anything else.",
        "Happy to help! Is there anything else you'd like to know?",
        "Anytime! I'm here if you need anything else."
    ]),

    "help": lambda _: (
        "**Here's what I can help you with:**\n\n"
        "• **Menu** — Hot drinks, cold drinks, food, desserts, "
        "combos, burgers and fries\n"
        "• **Specific items** — Current prices and item details\n"
        "• **Events** — Dinner Nights, Karaoke, Open Mic, "
        "Tasting and private celebrations\n"
        "• **Bookings** — Event booking information\n"
        "• **Hours** — Daily and weekly opening times\n"
        "• **Location & Contact** — Address, phone and email\n"
        "• **Facilities** — WiFi, parking, payment and reservations\n"
        "• **Recommendations** — Suggestions from the current menu\n"
        "• **Pricing** — Current menu price ranges"
    ),

    "about": lambda _: _about_response(),
    "menu": lambda _: _full_menu_overview(),

    "hot_beverages": lambda _: _menu_category_response(
        "hot_beverages"
    ),
    "cold_beverages": lambda _: _menu_category_response(
        "cold_beverages"
    ),
    "refreshments": lambda _: _menu_category_response(
        "refreshments"
    ),
    "special_combos": lambda _: _menu_category_response(
        "special_combos"
    ),
    "desserts": lambda _: _menu_category_response(
        "desserts"
    ),
    "burgers_fries": lambda _: _menu_category_response(
        "burgers_fries"
    ),

    "events": lambda _: _all_events_response(),
    "dinner_event": lambda _: _event_response(
        "dinner"
    ),
    "karaoke_event": lambda _: _event_response(
        "karaoke"
    ),
    "open_mic_event": lambda _: _event_response(
        "open_mic"
    ),
    "tasting_event": lambda _: _event_response(
        "tasting"
    ),
    "private_event": lambda _: _event_response(
        "private"
    ),
    "get_together_event": lambda _: _event_response(
        "get_together"
    ),

    "booking": lambda _: _booking_response(),
    "location": lambda _: _location_response(),
    "hours": lambda _: _hours_response(),
    "contact": lambda _: _contact_response(),
    "amenities": lambda _: _amenities_response(),
    "price": lambda _: _price_overview(),
    "recommendation": lambda _: _recommendations_response(),

    "unknown": lambda _: (
        "I want to make sure I give you the right answer.\n\n"
        "You can ask me about the **menu, a specific item, "
        "prices, events, bookings, opening hours, location, "
        "contact details, facilities, or recommendations**.\n\n"
        "For example: **How much is a Cappuccino?**"
    )
}


# ─── MAIN RESPONSE FUNCTION ───────────────────────────────────────────────────


def get_response(user_input: str) -> dict:
    """
    Main BrewBot entry point.

    Returns:
        {
            "reply": str,
            "intent": str,
            "confidence": float
        }
    """
    if not isinstance(user_input, str):
        return {
            "reply": (
                "Please send your question as text "
                "so I can help you."
            ),
            "intent": "invalid",
            "confidence": 0.0
        }

    user_input = user_input.strip()

    if not user_input:
        return {
            "reply": (
                "Please type something "
                "so I can help you."
            ),
            "intent": "empty",
            "confidence": 0.0
        }

    if len(user_input) > 500:
        return {
            "reply": (
                "Please keep your message "
                "under 500 characters."
            ),
            "intent": "invalid",
            "confidence": 0.0
        }

    # ── 1. Specific product detection ──────────────────────

    product = find_product(
        user_input
    )

    if product:
        question_type = _product_question_type(
            user_input
        )

        if question_type != "category":
            return {
                "reply": _product_response(
                    product,
                    question_type
                ),
                "intent": "product",
                "confidence": 0.98
            }

    # ── 2. Day-specific hours ───────────────────────────────

    if _is_hours_question(
        user_input
    ):
        if _is_today_question(
            user_input
        ):
            return {
                "reply": _today_hours_response(),
                "intent": "hours",
                "confidence": 0.98
            }

        requested_day = _extract_requested_day(
            user_input
        )

        if requested_day:
            return {
                "reply": _day_hours_response(
                    requested_day
                ),
                "intent": "hours",
                "confidence": 0.98
            }

    # ── 3. Specific event detection ─────────────────────────

    event_key = _find_event(
        user_input
    )

    if event_key:
        return {
            "reply": _event_response(
                event_key
            ),
            "intent": f"{event_key}_event",
            "confidence": 0.97
        }

    # ── 4. Intent classification ────────────────────────────

    tag, score = classify_intent(
        user_input
    )

    # ── 5. Special fallback rules ────────────────────────────

    if tag == "unknown":
        if _is_price_question(
            user_input
        ):
            tag = "price"
            score = max(
                score,
                0.78
            )

        elif _is_menu_question(
            user_input
        ):
            tag = "menu"
            score = max(
                score,
                0.78
            )

        elif _is_event_question(
            user_input
        ):
            tag = "events"
            score = max(
                score,
                0.78
            )

    # ── 6. Generate response ────────────────────────────────

    handler = _RESPONSES.get(
        tag,
        _RESPONSES["unknown"]
    )

    try:
        reply = handler(
            user_input
        )

    except Exception as error:
        print(
            f"BrewBot response generation error: {error}"
        )

        reply = (
            "Sorry, I couldn't prepare that answer "
            "right now. Please try asking in another way."
        )

        tag = "error"

    return {
        "reply": reply,
        "intent": tag,
        "confidence": round(
            min(
                max(
                    float(score),
                    0.0
                ),
                0.99
            ),
            3
        )
    }