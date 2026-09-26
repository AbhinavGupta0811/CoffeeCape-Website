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
import os
import re
from datetime import datetime, date
from zoneinfo import ZoneInfo
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

try:
    import spacy
    from spacy.matcher import PhraseMatcher
except ImportError:
    spacy = None
    PhraseMatcher = None

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

# ─── SPACY ENTITY EXTRACTION ───────────────────────────────────────────────────
if spacy:
    try:
        _SPACY_NLP = spacy.load("en_core_web_sm")
    except Exception as error:
        print(f"BrewBot spaCy model load failed: {error}")
        _SPACY_NLP = None
else:
    _SPACY_NLP = None

# CoffeeCape event vocabulary used by the custom entity matcher.
EVENT_ALIASES = {
    "dinner": {"dinner", "dinner night", "dinner nights", "friday dinner", "live music dinner"},
    "get_together": {"get together", "get-together", "gathering", "hangout", "group booking", "team outing"},
    "karaoke": {"karaoke", "karaoke night", "singing night", "song night"},
    "open_mic": {"open mic", "open mic night", "mic night", "poetry night", "comedy night", "stand up", "storytelling"},
    "tasting": {"tasting", "tasting event", "coffee tasting", "brew tasting"},
    "private": {"private celebration", "private event", "private party", "birthday party", "anniversary", "book the venue", "rent the space"}
}


# spaCy is used for entity extraction. The existing NLTK/Tf-IDF logic remains
# unchanged so entity extraction enhances, rather than replaces, the chatbot.
if spacy:
    try:
        _spacy_nlp = spacy.load("en_core_web_sm")
    except Exception as error:
        print(f"BrewBot spaCy model load failed: {error}")
        _spacy_nlp = None
else:
    _spacy_nlp = None


def _build_phrase_matcher(label: str, phrases):
    """Build a spaCy PhraseMatcher for CoffeeCape-specific entities."""
    if not _spacy_nlp or not PhraseMatcher:
        return None

    clean_phrases = [
        str(phrase).strip()
        for phrase in phrases
        if isinstance(phrase, str) and phrase.strip()
    ]

    if not clean_phrases:
        return None

    matcher = PhraseMatcher(_spacy_nlp.vocab, attr="LOWER")
    matcher.add(label, [_spacy_nlp.make_doc(phrase) for phrase in clean_phrases])
    return matcher


def extract_entities(text: str):
    """
    Extract standard spaCy entities plus CoffeeCape-specific entities.

    CoffeeCape MENU_ITEM and EVENT entities have priority over generic
    spaCy entities such as NORP, ORG, or PERSON.
    """
    if not isinstance(text, str) or not text.strip():
        return []

    entities = []
    occupied_spans = []

    def overlaps(start, end):
        return any(
            not (end <= existing_start or start >= existing_end)
            for existing_start, existing_end in occupied_spans
        )

    def add_entity(start, end, label, source):
        if overlaps(start, end):
            return False

        entities.append({
            "text": text[start:end],
            "label": label,
            "start": start,
            "end": end,
            "source": source
        })

        occupied_spans.append((start, end))
        return True

    # ── 1. CoffeeCape MENU_ITEM detection ───────────────────────────────────
    #
    # Use the live menu returned by the database. We deliberately perform
    # custom matching before spaCy so names such as "Cappuccino" cannot
    # incorrectly remain classified as NORP.
    #
    menu_items = _all_menu_items()

    menu_candidates = []

    for item in menu_items:
        if not isinstance(item, dict):
            continue

        if not _product_is_available(item):
            continue

        name = str(item.get("name", "")).strip()

        if not name:
            continue

        aliases = _build_product_aliases(name)

        for alias in aliases:
            alias = str(alias).strip()

            if not alias:
                continue

            pattern = re.compile(
                rf"(?<!\w){re.escape(alias)}(?!\w)",
                flags=re.IGNORECASE | re.UNICODE
            )

            for match in pattern.finditer(text):
                menu_candidates.append(
                    (
                        match.end() - match.start(),
                        match.start(),
                        match.end(),
                        match.group()
                    )
                )

    # Prefer the longest menu match.
    menu_candidates.sort(
        key=lambda value: (
            value[0],
            -value[1]
        ),
        reverse=True
    )

    for _, start, end, _ in menu_candidates:
        add_entity(
            start,
            end,
            "MENU_ITEM",
            "custom_phrase_matcher"
        )

    # ── 2. CoffeeCape EVENT detection ───────────────────────────────────────
    event_aliases = {
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

    event_candidates = []

    for aliases in event_aliases.values():
        for alias in aliases:
            pattern = re.compile(
                rf"(?<!\w){re.escape(alias)}(?!\w)",
                flags=re.IGNORECASE | re.UNICODE
            )

            for match in pattern.finditer(text):
                event_candidates.append(
                    (
                        match.end() - match.start(),
                        match.start(),
                        match.end()
                    )
                )

    event_candidates.sort(
        key=lambda value: (
            value[0],
            -value[1]
        ),
        reverse=True
    )

    for _, start, end in event_candidates:
        add_entity(
            start,
            end,
            "EVENT",
            "custom_phrase_matcher"
        )

    # ── 3. Standard spaCy entities ──────────────────────────────────────────
    #
    # Run spaCy after custom matching. If spaCy sees "Cappuccino" as NORP,
    # that span is ignored because MENU_ITEM already owns the span.
    if _SPACY_NLP:
        try:
            doc = _SPACY_NLP(text)

            for ent in doc.ents:
                add_entity(
                    ent.start_char,
                    ent.end_char,
                    ent.label_,
                    "spacy"
                )

        except Exception as error:
            print(
                f"BrewBot spaCy entity extraction failed: {error}"
            )

    # ── 4. Return entities in their original text order ─────────────────────
    entities.sort(
        key=lambda entity: (
            entity["start"],
            -(entity["end"] - entity["start"])
        )
    )

    return entities

def _entity_intent_hint(user_input: str, entities=None):
    """
    Use extracted entities and question wording to improve intent detection.

    Returns:
        (intent_tag, confidence) or (None, 0.0)
    """
    if not isinstance(user_input, str):
        return None, 0.0

    text = _normalize_for_matching(user_input)

    if entities is None:
        entities = extract_entities(user_input)

    labels = {
        entity.get("label")
        for entity in entities
        if isinstance(entity, dict)
    }

    has_menu_item = "MENU_ITEM" in labels
    has_event = "EVENT" in labels
    has_date = "DATE" in labels
    has_time = "TIME" in labels
    has_money = "MONEY" in labels

    # ── Product-specific questions ──────────────────────────────────────────
    if has_menu_item:
        if any(term in text for term in [
            "price",
            "cost",
            "how much",
            "rate",
            "₹",
            "rs "
        ]):
            return "price", 0.99

        if any(term in text for term in [
            "available",
            "availability",
            "in stock",
            "stock",
            "have",
            "offer"
        ]):
            return "menu", 0.96

        if any(term in text for term in [
            "what is",
            "what's",
            "tell me about",
            "details",
            "describe",
            "ingredients",
            "contain"
        ]):
            return "menu", 0.96

        return "menu", 0.90

    # ── Event-specific questions ────────────────────────────────────────────
    if has_event:
        negative_booking_patterns = [
            r"\b(i|we) do not want to (book|reserve|get|have|join|attend)\b",
            r"\b(i|we) don't want to (book|reserve|get|have|join|attend)\b",
            r"\b(i|we) do not need (a |any )?(seat|seats|spot|spots|place|places|ticket|tickets)\b",
            r"\b(i|we) don't need (a |any )?(seat|seats|spot|spots|place|places|ticket|tickets)\b",
            r"\b(i|we) am not looking to (book|reserve|join|attend)\b",
            r"\b(i|we)('m| am| are|re) not interested in (booking|reserving|attending|joining)\b",
            r"\b(no|not) booking\b"
        ]

        if any(
            re.search(pattern, text)
            for pattern in negative_booking_patterns
        ):
            return "events", 0.90
        
        booking_request_patterns = [
            r"\bcan i (book|reserve|get|have|join|attend)\b",
            r"\b(i|we) (want|need|would like|wish) to (book|reserve|get|have|join|attend)\b",
            r"\b(i|we)('d| would) like to (book|reserve|get|join|attend)\b",
            r"\b(can|could|would) you (book|reserve|get|save|hold)\b",
            r"\b(save|hold|keep|reserve) (me )?(a |some )?(seat|seats|spot|spots|place|places)\b",
            r"\b(get|give|find|save|reserve|hold) me (a |some )?(seat|seats|spot|spots|place|places)\b",
            r"\b(i|we)('m| am| are|re) interested in (attending|joining|going)\b",
            r"\b(i|we) (want|would like|need) to (attend|join|go)\b",
            r"\bput me down for\b",
            r"\bcount me in\b",
            r"\bi('d| would) like to come\b",
            r"\bi want to come\b",
            r"\bi want in\b",
            r"\b(i|we) want (a |some |one |two |three |four )?(seat|seats|spot|spots|place|places|ticket|tickets)\b",
            r"\b(i|we) need (a |some |one |two |three |four )?(seat|seats|spot|spots|place|places|ticket|tickets)\b",
            r"\b(i|we) would like (a |some |one |two |three |four )?(seat|seats|spot|spots|place|places|ticket|tickets)\b",
            r"\b(i|we)('d| would) like (a |some |one |two |three |four )?(seat|seats|spot|spots|place|places|ticket|tickets)\b",
            r"\b(i|we) need a place\b",
            r"\b(i|we) want a place\b",
            r"\b(i|we) need a spot\b",
            r"\b(i|we) want a spot\b",
            r"\b(i|we) need a ticket\b",
            r"\b(i|we) want a ticket\b",
            r"\b(i|we) need tickets\b",
            r"\b(i|we) want tickets\b",
            r"\b(sign|sign me) (me )?up\b",
            r"\bregister me\b",
            r"\badd me to the (guest list|list)\b",
            r"\bput me on the (guest list|list)\b",
            r"\binclude me\b",
            r"\bbook (me )?(a |some )?(seat|seats|spot|spots|place|places|ticket|tickets)\b",
            r"\breserve (me )?(a |some )?(seat|seats|spot|spots|place|places|ticket|tickets)\b",
            r"\bhow do i (book|get|reserve|join|register)\b",
            r"\bhow can i (book|get|reserve|join|register|attend)\b",
            r"\b(i|we)('d| would) love to (attend|join|go|come)\b",
            r"\b(i|we) would love (to )?(book|reserve|attend|join)\b",
            r"\b(book|reserve) (me )?\d+ (seat|seats|spot|spots|place|places|ticket|tickets)\b",
            r"\b(save|hold|keep|reserve) (me )?\d+ (seat|seats|spot|spots|place|places|ticket|tickets)\b",
            r"\b(i|we) (want|need|would like) \d+ (seat|seats|spot|spots|place|places|ticket|tickets)\b",
            r"\b(i|we)('d| would) like \d+ (seat|seats|spot|spots|place|places|ticket|tickets)\b",
            r"\b\d+ (seat|seats|spot|spots|place|places|ticket|tickets) for (Open Mic|Karaoke|Tasting)\b",
            r"\b(i|we)('d| would) love (a |some )?(seat|seats|spot|spots|place|places|ticket|tickets)\b"
        ]

        availability_patterns = [
            r"\bare .* (seat|seats|spot|spots|place|places) available\b",
            r"\bis .* (seat|seats|spot|spots|place|places) available\b",
            r"\b(is|are) there (any )?(seat|seats|spot|spots|place|places)\b",
            r"\bdo you (still )?have (any )?(seat|seats|spot|spots|place|places)\b",
            r"\bare there (any )?(seat|seats|spot|spots|place|places) (for|at)\b",
            r"\bhow many (seat|seats|spot|spots|place|places) (are )?(available|left)\b",
            r"\bhow much space\b",
            r"\b(available|availability)\b",
            r"\bcapacity\b"
        ]

        if any(re.search(pattern, text) for pattern in booking_request_patterns):
            return "booking", 0.99

        if any(re.search(pattern, text) for pattern in availability_patterns):
            return "availability", 0.97

        if any(term in text for term in [
            "seat",
            "seats",
            "spot",
            "spots",
            "place",
            "places",
            "space"
        ]):
            return "events", 0.97

        if has_date or has_time:
            return "events", 0.96

        return "events", 0.93

    # ── Money without a specific product/event ──────────────────────────────
    if has_money:
        if any(term in text for term in [
            "price",
            "cost",
            "pay",
            "charge",
            "ticket",
            "₹",
            "rs "
        ]):
            return "price", 0.88

    return None, 0.0

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
        f"{subcategory} {category}"
    )

    if any(term in value for term in [
        "cold beverage", "cold drink", "iced", "frappe", "smoothie", "shake"
    ]):
        return "cold_beverages"

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

    return _static_menu_items() if os.getenv("CHATBOT_USE_SAMPLE_DATA") == "1" else []

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

    items = _all_menu_items()
    for item in items:
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

    # Fuzzy matching compares short noun phrases, never the whole question.
    # Require a strong match so unknown products cannot turn into a nearby item.
    tokens = normalized_input.split()
    best_item, best_score = None, 0.0
    for item in items:
        name = _normalize_for_matching(item.get("name", ""))
        size = len(name.split())
        if not size:
            continue
        for width in range(max(1, size - 1), size + 2):
            for offset in range(len(tokens) - width + 1):
                candidate = " ".join(tokens[offset:offset + width])
                if len(candidate) < 4:
                    continue
                score = _similarity(candidate, name)
                if score > best_score:
                    best_item, best_score = item, score
    return best_item if best_score >= 0.90 else None


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

    if not _product_is_available(item):
        return f"**{name}** is currently unavailable."

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

    if os.getenv("CHATBOT_USE_SAMPLE_DATA") != "1":
        if _database_menu_items():
            return "There are no available items in that category in the current menu."
        return "I can’t confirm items in that category right now. Please check the current menu or contact the café."

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
        if os.getenv("CHATBOT_USE_SAMPLE_DATA") != "1":
            return "I can’t access the current menu right now. Please try again later or contact the café."
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
        return _static_recommendations_response() if os.getenv("CHATBOT_USE_SAMPLE_DATA") == "1" else "I can’t confirm current recommendations until the menu is available."

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
        return _static_price_overview() if os.getenv("CHATBOT_USE_SAMPLE_DATA") == "1" else "I can’t confirm current menu prices right now."

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
        return _static_price_overview() if os.getenv("CHATBOT_USE_SAMPLE_DATA") == "1" else "I can’t confirm current menu prices right now."

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

        today = datetime.now(ZoneInfo(os.getenv("CAFE_TIMEZONE", "Asia/Kolkata"))).date()
        def upcoming(item):
            try:
                value = item.get("event_date")
                event_date = value.date() if isinstance(value, datetime) else (
                    value if isinstance(value, date) else date.fromisoformat(str(value)[:10])
                )
                return event_date >= today and str(item.get("status", "")).lower() not in {"cancelled", "completed"}
            except (TypeError, ValueError):
                return False
        return [item for item in settings if isinstance(item, dict)
                and item.get("booking_id") is not None and upcoming(item)]
    except Exception as error:
        print(f"BrewBot event settings database read failed: {error}")
        return []

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

    if best_score >= max(threshold, 0.60) and (len(input_tokens) <= 3 or best_score >= 0.83):
        return (
            tfidf_tag,
            min(best_score, 0.99)
        )

    return "unknown", best_score

# ─── EVENT RESPONSE BUILDERS ─────────────────────────────────────────────────
def _event_type_matches(event_key: str, event_type) -> bool:
    """Check whether a database event type matches the detected event key."""
    if not event_type:
        return False

    normalized_type = _normalize_for_matching(
        str(event_type)
    )

    aliases = {
        "open_mic": {
            "openmic",
            "open mic",
            "open mic night"
        },
        "karaoke": {
            "karaoke",
            "karaoke night"
        },
        "tasting": {
            "tasting",
            "tasting event",
            "coffee tasting",
            "brew tasting"
        },
        "dinner": {
            "dinner",
            "dinner night",
            "dinner event"
        },
        "get_together": {
            "get together",
            "gathering",
            "hangout",
            "group booking",
            "team outing"
        },
        "private": {
            "private",
            "private event",
            "private party",
            "private celebration"
        }
    }

    return normalized_type in {
        _normalize_for_matching(alias)
        for alias in aliases.get(event_key, set())
    }


def _event_date_matches_day(event_date, requested_day: str) -> bool:
    """Check whether a database event date falls on the requested weekday."""
    if not event_date or not requested_day:
        return False

    requested_day = requested_day.lower().strip()

    try:
        if hasattr(event_date, "weekday"):
            actual_day = event_date.strftime("%A").lower()
        else:
            parsed_date = datetime.fromisoformat(
                str(event_date).split(" ")[0]
            )
            actual_day = parsed_date.strftime("%A").lower()

    except (TypeError, ValueError):
        return False

    return actual_day == requested_day


def _format_event_setting(item):
    """Format one live audience-event settings record."""
    event_type = item.get("event_type")
    event_date = item.get("event_date")
    event_time = item.get("event_time")
    enabled = item.get("audience_booking_enabled")
    price = _safe_number(
        item.get("audience_ticket_price"),
        0
    )
    capacity = item.get("audience_capacity")
    booked = item.get("audience_booked")

    lines = [
        "**Scheduled audience event**"
    ]

    if event_type:
        lines.append(
            f"**Event:** {event_type}"
        )

    if event_date:
        lines.append(
            f"**Date:** {event_date}"
        )

    if event_time:
        lines.append(
            f"**Time:** {event_time}"
        )

    if enabled is not None:
        status = "Open" if bool(enabled) else "Closed"
        lines.append(
            f"**Audience booking:** {status}"
        )

    if price > 0:
        lines.append(
            f"**Ticket price:** ₹{price:g}"
        )
    elif item.get("audience_ticket_price") is not None:
        lines.append(
            "**Ticket price:** ₹0"
        )

    if capacity is not None:
        lines.append(
            f"**Capacity:** {capacity}"
        )

    if booked is not None:
        lines.append(
            f"**Booked:** {booked}"
        )

    if capacity is not None and booked is not None:
        try:
            remaining = max(
                int(capacity) - int(booked),
                0
            )
            lines.append(
                f"**Seats remaining:** {remaining}"
            )
        except (TypeError, ValueError):
            pass

    return "\n".join(lines)


def _live_events_response(
    event_key=None,
    requested_day=None
):
    """Return live scheduled audience events, optionally filtered."""
    settings = _database_event_settings()

    if not settings:
        return "I can’t confirm any upcoming events right now. Please contact the café for the current schedule."

    filtered_settings = settings

    if event_key:
        filtered_settings = [
            item
            for item in filtered_settings
            if _event_type_matches(
                event_key,
                item.get("event_type")
            )
        ]

    if requested_day:
        filtered_settings = [
            item
            for item in filtered_settings
            if _event_date_matches_day(
                item.get("event_date"),
                requested_day
            )
        ]

    if not filtered_settings:
        if event_key and requested_day:
            event = EVENTS.get(event_key)
            event_name = (
                event.get("name")
                if event
                else event_key.replace("_", " ").title()
            )

            return (
                f"I couldn't find a scheduled **{event_name}** "
                f"event for **{requested_day.capitalize()}** "
                f"in the live event schedule."
            )

        if event_key:
            event = EVENTS.get(event_key)
            event_name = (
                event.get("name")
                if event
                else event_key.replace("_", " ").title()
            )

            return (
                f"There is currently no scheduled **{event_name}** "
                f"event in the live audience-event schedule."
            )

        return (
            "There are currently no matching scheduled "
            "audience events at CoffeeCape."
        )

    lines = [
        "**Live CoffeeCape Event Settings**\n"
    ]

    for item in filtered_settings:
        lines.append(
            _format_event_setting(item)
        )
        lines.append("")

    return "\n".join(lines).strip()


def _event_response(event_key: str, requested_day=None) -> str:
    """Return detailed information for one event."""
    live_settings = _database_event_settings()

    return _live_events_response(event_key=event_key, requested_day=requested_day)


def _all_events_response() -> str:
    """Return all currently scheduled audience events."""
    return _live_events_response()

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

    weekday = datetime.now(ZoneInfo(os.getenv("CAFE_TIMEZONE", "Asia/Kolkata"))).weekday()

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
def _booking_response(event_key=None, requested_day=None) -> str:
    """Return booking options for the requested live event."""
    settings = _database_event_settings()

    if not settings:
        return "I can’t confirm upcoming event bookings right now. Please contact the café for the current schedule."

    filtered_settings = settings

    if event_key:
        filtered_settings = [
            item
            for item in filtered_settings
            if _event_type_matches(
                event_key,
                item.get("event_type")
            )
        ]

    if requested_day:
        filtered_settings = [
            item
            for item in filtered_settings
            if _event_date_matches_day(
                item.get("event_date"),
                requested_day
            )
        ]

    if not filtered_settings:
        event = EVENTS.get(event_key) if event_key else None
        event_name = (
            event.get("name")
            if event
            else (
                event_key.replace("_", " ").title()
                if event_key
                else "event"
            )
        )

        if requested_day:
            return (
                f"I couldn't find a scheduled **{event_name}** "
                f"event for **{requested_day.capitalize()}** "
                f"in the live event schedule."
            )

        return (
            f"There is currently no scheduled **{event_name}** "
            f"event available for booking."
        )

    lines = [
        "**How to Book at CoffeeCape**\n",
        "The following audience-event booking settings are currently live:\n"
    ]

    for item in filtered_settings:
        lines.append(_format_event_setting(item))
        lines.append("")

    phone = CAFE_INFO.get("phone")
    email = CAFE_INFO.get("email")

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
    location = CAFE_INFO.get("location")

    phone = CAFE_INFO.get(
        "phone"
    )

    lines = [
        "**CoffeeCape Location**\n",
        f"CoffeeCape is located in **{location}**." if location else "The café address hasn’t been configured yet."
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
    if not any((phone, email, website)):
        lines.append("Contact details haven’t been configured yet.")

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

    normalized = _normalize_for_matching(user_input)
    def answer(reply, tag, confidence=0.98):
        return {"reply": reply, "intent": tag, "confidence": confidence}

    if any(_contains_phrase(normalized, x) for x in ("refund", "cancel order", "order status", "track order", "delivery status")):
        return answer("I can’t access orders or process refunds here. Please contact the café directly for help with your order.", "support")
    if any(_contains_phrase(normalized, x) for x in ("wifi", "wi fi", "parking", "upi", "payment", "cash", "card")):
        value = _amenities_response()
        if len(value.splitlines()) < 3:
            value = "I don’t have confirmed facility or payment details yet. Please contact the café to check."
        return answer(value, "amenities")
    if any(_contains_phrase(normalized, x) for x in ("phone", "contact", "email", "call you")):
        return answer(_contact_response(), "contact")
    if _is_hours_question(user_input) and not _is_event_question(user_input) and not _find_event(user_input):
        requested_day = _extract_requested_day(user_input)
        if _is_today_question(user_input):
            return answer(_today_hours_response(), "hours")
        if requested_day:
            return answer(_day_hours_response(requested_day), "hours")
        return answer(_hours_response(), "hours")
    if _contains_phrase(normalized, "book a table") or _contains_phrase(normalized, "table booking") or _contains_phrase(normalized, "reserve a table"):
        reservations = CAFE_INFO.get("reservations")
        return answer(reservations or "For table reservations, please contact the café directly.", "booking")

    # ── 1. Specific product detection ──────────────────────

    product = find_product(
        user_input
    )

    if product and not any(_contains_phrase(normalized, term) for term in ("all", "menu", "options", "recommend", "suggest")):
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

    if not product and any(_contains_phrase(normalized, x) for x in ("do you have", "is there", "can i order", "is available")) and not _find_event(user_input):
        return answer("I can’t confirm that item from the current menu. Please check the menu or contact the café.", "menu", 0.70)

    if not product and _is_price_question(user_input) and any(
        _contains_phrase(normalized, phrase) for phrase in ("how much is", "price of", "cost of", "how much for")
    ):
        return answer("I can’t find that item in the current menu, so I can’t confirm its price. Please check the menu or contact the café.", "unknown", 0.55)

    # ── 2. Specific event detection ───────────────────────────────────────────
    event_key = _find_event(
        user_input
    )

    if event_key:
        requested_day = _extract_requested_day(
            user_input
        )

        entity_intent, entity_confidence = _entity_intent_hint(
            user_input
        )

        if entity_intent == "booking":
            return {
                "reply": _booking_response(
                    event_key,
                    requested_day
                ),
                "intent": "booking",
                "confidence": entity_confidence
            }

        if entity_intent == "availability":
            return {
                "reply": _event_response(
                    event_key,
                    requested_day
                ),
                "intent": "availability",
                "confidence": entity_confidence
            }

        return {
            "reply": _event_response(
                event_key,
                requested_day
            ),
            "intent": f"{event_key}_event",
            "confidence": 0.97
        }

    # ── 3. Day-specific hours ─────────────────────────────────────────────────
    if _is_hours_question(user_input):
        if _is_today_question(user_input):
            return {
                "reply": _today_hours_response(),
                "intent": "hours",
                "confidence": 0.98
            }

        requested_day = _extract_requested_day(user_input)

        if requested_day:
            return {
                "reply": _day_hours_response(requested_day),
                "intent": "hours",
                "confidence": 0.98
            }

    # ── 4. Intent classification ────────────────────────────
    entities = extract_entities(user_input)

    entity_tag, entity_score = _entity_intent_hint(
        user_input,
        entities
    )

    if entity_tag:
        tag = entity_tag
        score = entity_score
    else:
        tag, score = classify_intent(user_input)

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