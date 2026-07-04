"""
nlp_engine.py — NLP intent classifier + response generator
Uses TF-IDF cosine similarity + keyword matching. Zero external API.
"""

import re
import random
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import nltk
from nltk.stem import WordNetLemmatizer
from nltk.corpus import stopwords

from knowledge_base import INTENTS, MENU, EVENTS, CAFE_INFO

# ─── NLP SETUP ────────────────────────────────────────────────────────────────
lemmatizer = WordNetLemmatizer()
try:
    STOP_WORDS = set(stopwords.words("english"))
except Exception:
    STOP_WORDS = set()

def preprocess(text: str) -> str:
    """Lowercase, remove punctuation, lemmatize, remove stopwords."""
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = text.split()
    tokens = [lemmatizer.lemmatize(t) for t in tokens if t not in STOP_WORDS]
    return " ".join(tokens) if tokens else text

# ─── BUILD TFIDF MODEL ────────────────────────────────────────────────────────

def _build_corpus():
    """Flatten all patterns with their intent tag for vectorisation."""
    corpus = []
    tags = []
    for intent in INTENTS:
        for pattern in intent["patterns"]:
            corpus.append(preprocess(pattern))
            tags.append(intent["tag"])
    return corpus, tags


_corpus, _tags = _build_corpus()
_vectorizer = TfidfVectorizer(ngram_range=(1, 2), analyzer="word")
_tfidf_matrix = _vectorizer.fit_transform(_corpus)

# ─── CLASSIFY INTENT ──────────────────────────────────────────────────────────

def classify_intent(user_input: str, threshold: float = 0.20):
    """
    Returns (tag, score). Falls back to 'unknown' if below threshold.
    Combines TF-IDF cosine similarity with direct substring matching.
    """
    processed = preprocess(user_input)
    if not processed:
        return "unknown", 0.0

    lower_input = user_input.lower()

    # Phase 1: Multi-word keyword matching (highest fidelity)
    best_kw_tag = None
    best_kw_score = 0.0
    best_kw_len = 0
    for intent in sorted(INTENTS, key=lambda x: -x.get("priority", 5)):
        for pattern in intent["patterns"]:
            if len(pattern.split()) >= 2 and pattern in lower_input:
                score = 0.80 + (intent.get("priority", 5) / 100) + len(pattern) * 0.001
                if score > best_kw_score or (score == best_kw_score and len(pattern) > best_kw_len):
                    best_kw_score = score
                    best_kw_tag = intent["tag"]
                    best_kw_len = len(pattern)

    if best_kw_tag:
        return best_kw_tag, best_kw_score

    # Phase 2: TF-IDF cosine similarity
    vec = _vectorizer.transform([processed])
    sims = cosine_similarity(vec, _tfidf_matrix).flatten()
    best_idx = int(np.argmax(sims))
    best_score = float(sims[best_idx])
    tfidf_tag = _tags[best_idx]

    # Phase 3: Single-word keyword boost (lower confidence)
    for intent in sorted(INTENTS, key=lambda x: -x.get("priority", 5)):
        for pattern in intent["patterns"]:
            if len(pattern.split()) == 1 and pattern in lower_input.split():
                keyword_score = 0.70 + (intent.get("priority", 5) / 100)
                if keyword_score > best_score:
                    best_score = keyword_score
                    tfidf_tag = intent["tag"]

    if best_score >= threshold:
        return tfidf_tag, best_score
    return "unknown", best_score

# ─── RESPONSE BUILDERS ────────────────────────────────────────────────────────

def _menu_category_response(cat_key: str) -> str:
    cat = MENU[cat_key]
    lines = [f"{cat['emoji']} **{cat['label']}**\n"]
    for item in cat["items"][:6]:  # show up to 6 items
        lines.append(f"• {item['name']} — ₹{item['price']}\n  _{item['desc']}_")
    lines.append(f"\n👉 See full menu at `{cat['page']}`")
    return "\n".join(lines)

def _event_response(event_key: str) -> str:
    ev = EVENTS[event_key]
    return (
        f"{ev['emoji']} **{ev['name']}**\n\n"
        f"📅 {ev['schedule']}\n"
        f"📝 {ev['desc']}\n"
        f"👥 Capacity: {ev['capacity']}\n"
        f"💰 {ev['price_range']}\n\n"
        f"👉 [Book Now]({ev['booking_url']})"
    )

def _hours_response() -> str:
    h = CAFE_INFO["hours"]
    lines = ["🕐 **Opening Hours**\n"]
    for day, time in h.items():
        lines.append(f"• {day}: {time}")
    return "\n".join(lines)

def _all_events_response() -> str:
    lines = ["🎉 **Events & Activities at CoffeeCape**\n"]
    for ev in EVENTS.values():
        lines.append(f"{ev['emoji']} **{ev['name']}** — {ev['schedule']}")
        lines.append(f"   {ev['desc'][:70]}...")
        lines.append(f"   [Book →]({ev['booking_url']})\n")
    return "\n".join(lines)

def _full_menu_overview() -> str:
    lines = ["☕ **CoffeeCape Menu Categories**\n"]
    for cat in MENU.values():
        item_names = ", ".join(i["name"] for i in cat["items"][:3])
        lines.append(f"{cat['emoji']} **{cat['label']}** — e.g. {item_names}")
        lines.append(f"   View full list: `{cat['page']}`\n")
    lines.append("Just ask about any category for detailed items and prices!")
    return "\n".join(lines)

def _recommendations_response() -> str:
    picks = [
        ("☕", "Cappuccino", "hot_beverages", 150, "The all-time crowd favourite"),
        ("🧋", "Cold Brew Coffee", "cold_beverages", 180, "Smooth and incredibly refreshing"),
        ("🍰", "Chocolate Lava Cake", "desserts", 180, "A must-try warm dessert"),
        ("🍔", "Paneer Burger", "burgers_fries", 200, "Our chef's special"),
        ("🎁", "Work-From-Café Combo", "special_combos", 320, "Best value deal"),
    ]
    lines = ["⭐ **Top Picks at CoffeeCape**\n"]
    for emoji, name, cat, price, note in picks:
        lines.append(f"{emoji} **{name}** — ₹{price}\n   _{note}_")
    lines.append("\nWant more details on any of these? Just ask! 😊")
    return "\n".join(lines)

def _price_overview() -> str:
    lines = ["💰 **Price Range at CoffeeCape**\n"]
    for cat in MENU.values():
        prices = [i["price"] for i in cat["items"]]
        lines.append(
            f"{cat['emoji']} {cat['label']}: ₹{min(prices)} – ₹{max(prices)}"
        )
    lines.append(
        "\nWe accept Cash, UPI, Credit/Debit cards.\n"
        "Ask about specific items for exact prices!"
    )
    return "\n".join(lines)

def _booking_response() -> str:
    lines = [
        "📅 **How to Book at CoffeeCape**\n",
        "You can book for any of our events directly from the website:",
        "",
    ]
    for ev in EVENTS.values():
        lines.append(f"{ev['emoji']} [{ev['name']}]({ev['booking_url']})")
    lines += [
        "",
        "For private celebrations or large group bookings:",
        f"📞 Call: {CAFE_INFO['phone']}",
        f"📧 Email: {CAFE_INFO['email']}",
        "",
        "Walk-ins are also always welcome! 😊"
    ]
    return "\n".join(lines)

# ─── MAIN RESPONSE FUNCTION ───────────────────────────────────────────────────

# Tag → handler map
_RESPONSES = {
    "greeting": lambda _: random.choice([
        f"Hey there! ☕ Welcome to **{CAFE_INFO['name']}**!\n\nI'm BrewBot, your café guide. I can help you with our menu, events, hours, location, and more.\n\nWhat would you like to know?",
        f"Hello! Great to see you at **{CAFE_INFO['name']}** ☕\n\nHow can I help you today? You can ask me about our menu, events, or anything about the café!",
        f"Namaste! 🙏 Welcome to **CoffeeCape**!\n\nI'm BrewBot — here to make your visit perfect. Ask me about our coffee, food, events or anything else!",
    ]),

    "goodbye": lambda _: random.choice([
        "Goodbye! ☕ Hope to see you soon at CoffeeCape! Have a wonderful day!",
        "See you soon! Don't forget to try our Cappuccino next time ☕ Take care!",
        "Bye bye! Come visit us again — we'd love to brew your next favourite cup! 🌟",
    ]),

    "thanks": lambda _: random.choice([
        "You're welcome! ☕ Feel free to ask anything else!",
        "Happy to help! Is there anything else you'd like to know about CoffeeCape?",
        "Anytime! That's what I'm here for 😊 Anything else?",
    ]),

    "help": lambda _: (
        "☕ **Here's what I can help you with:**\n\n"
        "🍽️ **Menu** — Hot/Cold beverages, Food, Desserts, Combos, Burgers\n"
        "🎉 **Events** — Dinner Nights, Karaoke, Open Mic, Tasting, Private parties\n"
        "📅 **Bookings** — How to reserve a table or event slot\n"
        "🕐 **Hours** — Opening and closing times\n"
        "📍 **Location** — Where to find us\n"
        "📞 **Contact** — Phone, email, website\n"
        "💰 **Prices** — Menu pricing overview\n\n"
        "Just type your question naturally — I'll understand! 😊"
    ),

    "about": lambda _: (
        f"☕ **About {CAFE_INFO['name']}**\n\n"
        f"{CAFE_INFO['about']}\n\n"
        f"📍 Located in {CAFE_INFO['location']}\n"
        f"🌐 {CAFE_INFO['website']}"
    ),

    "menu":           lambda _: _full_menu_overview(),
    "hot_beverages":  lambda _: _menu_category_response("hot_beverages"),
    "cold_beverages": lambda _: _menu_category_response("cold_beverages"),
    "refreshments":   lambda _: _menu_category_response("refreshments"),
    "special_combos": lambda _: _menu_category_response("special_combos"),
    "desserts":       lambda _: _menu_category_response("desserts"),
    "burgers_fries":  lambda _: _menu_category_response("burgers_fries"),

    "events":           lambda _: _all_events_response(),
    "dinner_event":     lambda _: _event_response("dinner"),
    "karaoke_event":    lambda _: _event_response("karaoke"),
    "open_mic_event":   lambda _: _event_response("open_mic"),
    "tasting_event":    lambda _: _event_response("tasting"),
    "private_event":    lambda _: _event_response("private"),
    "get_together_event": lambda _: _event_response("get_together"),

    "booking": lambda _: _booking_response(),

    "location": lambda _: (
        f"📍 **Our Location**\n\n"
        f"CoffeeCape is located in **{CAFE_INFO['location']}**.\n\n"
        f"🚗 Street parking available nearby\n"
        f"📞 Need directions? Call us: {CAFE_INFO['phone']}\n"
        f"🌐 {CAFE_INFO['website']}"
    ),

    "hours": lambda _: _hours_response(),

    "contact": lambda _: (
        f"📞 **Contact CoffeeCape**\n\n"
        f"📱 Phone: {CAFE_INFO['phone']}\n"
        f"📧 Email: {CAFE_INFO['email']}\n"
        f"🌐 Website: {CAFE_INFO['website']}\n\n"
        f"🕐 We're available:\n"
        + "\n".join(f"   • {d}: {t}" for d, t in CAFE_INFO['hours'].items())
    ),

    "amenities": lambda _: (
        f"✨ **Facilities at CoffeeCape**\n\n"
        f"📶 {CAFE_INFO['wifi']}\n"
        f"🚗 {CAFE_INFO['parking']}\n"
        f"💳 {CAFE_INFO['payment']}\n"
        f"🪑 {CAFE_INFO['reservations']}"
    ),

    "price":          lambda _: _price_overview(),
    "recommendation": lambda _: _recommendations_response(),

    "unknown": lambda user_input: (
        "Hmm, I didn't quite catch that! ☕\n\n"
        "I can help you with:\n"
        "• **Menu** (hot/cold drinks, food, desserts)\n"
        "• **Events** (karaoke, dinner nights, open mic…)\n"
        "• **Booking** a table or event\n"
        "• **Hours, Location, Contact**\n\n"
        "Try rephrasing, or type **help** to see all options!"
    ),
}

def get_response(user_input: str) -> dict:
    """
    Main entry point. Returns:
      { "reply": str, "intent": str, "confidence": float }
    """
    if not user_input or not user_input.strip():
        return {
            "reply": "Please type something so I can help you! ☕",
            "intent": "empty",
            "confidence": 0.0
        }

    tag, score = classify_intent(user_input)
    handler = _RESPONSES.get(tag, _RESPONSES["unknown"])
    reply = handler(user_input)

    return {
        "reply": reply,
        "intent": tag,
        "confidence": round(score, 3)
    }