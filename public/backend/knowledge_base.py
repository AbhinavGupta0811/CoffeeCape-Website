"""
knowledge_base.py — CoffeeCape complete knowledge base
All intents, patterns, responses, and structured data live here.
No external API needed.
"""

# ─── MENU DATA ────────────────────────────────────────────────────────────────

MENU = {
    "hot_beverages": {
        "label": "Hot Beverages",
        "emoji": "☕",
        "page": "hot-beverages.html",
        "items": [
            {"name": "Classic Espresso",        "price": 120, "desc": "Rich, bold single shot espresso"},
            {"name": "Cappuccino",               "price": 150, "desc": "Espresso with steamed milk foam"},
            {"name": "Café Latte",               "price": 160, "desc": "Smooth espresso with lots of steamed milk"},
            {"name": "Americano",                "price": 130, "desc": "Espresso diluted with hot water"},
            {"name": "Flat White",               "price": 155, "desc": "Velvety micro-foam espresso"},
            {"name": "Mocha",                    "price": 170, "desc": "Espresso with chocolate and steamed milk"},
            {"name": "French Press Coffee",      "price": 140, "desc": "Full-bodied, rich brew"},
            {"name": "Masala Chai",              "price": 80,  "desc": "Spiced Indian tea with milk"},
            {"name": "Green Tea",                "price": 90,  "desc": "Refreshing and light antioxidant tea"},
            {"name": "Hot Chocolate",            "price": 150, "desc": "Creamy rich cocoa delight"},
        ]
    },
    "cold_beverages": {
        "label": "Cold Beverages",
        "emoji": "🧋",
        "page": "cold-beverages.html",
        "items": [
            {"name": "Cold Brew Coffee",         "price": 180, "desc": "Slow-brewed, smooth and strong"},
            {"name": "Iced Latte",               "price": 170, "desc": "Espresso over ice with cold milk"},
            {"name": "Frappuccino",              "price": 200, "desc": "Blended iced coffee with cream"},
            {"name": "Iced Mocha",               "price": 190, "desc": "Chocolate espresso on ice"},
            {"name": "Cold Coffee Shake",        "price": 160, "desc": "Thick creamy cold coffee"},
            {"name": "Mint Mojito",              "price": 140, "desc": "Refreshing mint and lime mocktail"},
            {"name": "Mango Smoothie",           "price": 150, "desc": "Fresh mango blended smooth"},
            {"name": "Blue Lagoon",              "price": 145, "desc": "Citrus blue curacao mocktail"},
        ]
    },
    "refreshments": {
        "label": "Refreshments",
        "emoji": "🥪",
        "page": "refreshment.html",
        "items": [
            {"name": "Club Sandwich",            "price": 220, "desc": "Layered toasted sandwich with veggies"},
            {"name": "Paneer Tikka Wrap",        "price": 200, "desc": "Grilled paneer in a soft wrap"},
            {"name": "Veggie Spring Rolls",      "price": 150, "desc": "Crispy fried rolls with dip"},
            {"name": "Garlic Bread",             "price": 100, "desc": "Toasted bread with garlic butter"},
            {"name": "Bruschetta",               "price": 160, "desc": "Italian toasted bread with tomato topping"},
            {"name": "Nachos with Salsa",        "price": 180, "desc": "Crunchy nachos with fresh salsa and cheese"},
        ]
    },
    "special_combos": {
        "label": "Special Combos",
        "emoji": "🎁",
        "page": "special-combo.html",
        "items": [
            {"name": "Morning Kickstart",        "price": 250, "desc": "Cappuccino + Garlic Bread + Fruit Bowl"},
            {"name": "Work-From-Café Combo",     "price": 320, "desc": "Cold Brew + Club Sandwich + Cookie"},
            {"name": "Date Night Special",       "price": 480, "desc": "2 Mochas + Bruschetta + Dessert"},
            {"name": "Bestseller Trio",          "price": 400, "desc": "Frappuccino + Burger + Fries"},
            {"name": "Family Feast",             "price": 900, "desc": "4 beverages + 2 mains + 2 desserts"},
        ]
    },
    "desserts": {
        "label": "Desserts",
        "emoji": "🍰",
        "page": "desserts.html",
        "items": [
            {"name": "Chocolate Lava Cake",      "price": 180, "desc": "Warm cake with molten chocolate center"},
            {"name": "New York Cheesecake",      "price": 200, "desc": "Classic creamy baked cheesecake"},
            {"name": "Tiramisu",                 "price": 210, "desc": "Italian coffee-flavored dessert"},
            {"name": "Belgian Waffle",           "price": 170, "desc": "Crispy waffle with toppings"},
            {"name": "Brownie Sundae",           "price": 190, "desc": "Warm brownie with vanilla ice cream"},
            {"name": "Gulab Jamun",              "price": 100, "desc": "Classic Indian sweet in sugar syrup"},
            {"name": "Mango Panna Cotta",        "price": 160, "desc": "Silky Italian dessert with mango"},
        ]
    },
    "burgers_fries": {
        "label": "Burgers & French Fries",
        "emoji": "🍔",
        "page": "burger-frenchfries.html",
        "items": [
            {"name": "Classic Veg Burger",       "price": 180, "desc": "Crispy patty with lettuce and sauce"},
            {"name": "Paneer Burger",            "price": 200, "desc": "Spiced paneer patty with coleslaw"},
            {"name": "Mushroom Swiss Burger",    "price": 220, "desc": "Sautéed mushrooms with Swiss cheese"},
            {"name": "Regular French Fries",     "price": 100, "desc": "Classic crispy salted fries"},
            {"name": "Peri Peri Fries",          "price": 120, "desc": "Spicy peri peri seasoned fries"},
            {"name": "Cheese Fries",             "price": 140, "desc": "Fries loaded with melted cheese sauce"},
            {"name": "Loaded Fries",             "price": 160, "desc": "Fries with cheese, jalapeños and sour cream"},
        ]
    }
}

# ─── EVENTS DATA ──────────────────────────────────────────────────────────────

EVENTS = {
    "dinner": {
        "name": "Dinner Nights",
        "emoji": "🍽️",
        "schedule": "Every Friday evening",
        "desc": "Fine dining with live acoustic music. Romantic atmosphere, curated menu.",
        "booking_url": "booking.html?event=dinner",
        "capacity": "Up to 40 guests",
        "price_range": "₹600–₹1200 per person"
    },
    "get_together": {
        "name": "Friendly Get-Togethers",
        "emoji": "👫",
        "schedule": "Any day by booking",
        "desc": "Bring your crew and hang out over your favorite brews. Group discounts available.",
        "booking_url": "booking.html?event=get",
        "capacity": "5–20 guests",
        "price_range": "₹200–₹500 per person"
    },
    "karaoke": {
        "name": "Karaoke Nights",
        "emoji": "🎤",
        "schedule": "Every Saturday night",
        "desc": "Sing your heart out! Song catalogue of 500+ Bollywood and English hits.",
        "booking_url": "booking.html?event=karaoke",
        "capacity": "Up to 60 guests",
        "price_range": "₹300 cover charge per person"
    },
    "open_mic": {
        "name": "Open Mic Nights",
        "emoji": "🎙️",
        "schedule": "Every Thursday",
        "desc": "Poetry, comedy, music or stories — the mic is yours. Register to perform!",
        "booking_url": "booking.html?event=openmic",
        "capacity": "Open seating",
        "price_range": "Free entry, min order ₹150"
    },
    "tasting": {
        "name": "Tasting Events",
        "emoji": "🍷",
        "schedule": "First Sunday of every month",
        "desc": "Sample curated brews, desserts, and seasonal specials. Expert-guided tasting.",
        "booking_url": "booking.html?event=tasting",
        "capacity": "Up to 30 guests",
        "price_range": "₹499 per person (inclusive)"
    },
    "private": {
        "name": "Private Celebrations",
        "emoji": "🎂",
        "schedule": "Available any day (advance booking required)",
        "desc": "Book our space for birthdays, anniversaries, or small parties. Décor included.",
        "booking_url": "booking.html?event=private",
        "capacity": "Up to 50 guests",
        "price_range": "Starting ₹5000 for the venue"
    }
}

# ─── CAFE INFO ────────────────────────────────────────────────────────────────

CAFE_INFO = {
    "name": "CoffeeCape",
    "tagline": "Best Coffee — Make your day great!",
    "location": "Navi Mumbai, Maharashtra, India",
    "email": "info@coffeeshopwebsite.com",
    "phone": "+91 98765 43210",
    "hours": {
        "Mon–Fri": "9:00 AM – 5:00 PM",
        "Saturday": "10:00 AM – 3:00 PM",
        "Sunday": "Closed"
    },
    "about": (
        "CoffeeCape is a cozy premium coffee house in Navi Mumbai, India. "
        "We pride ourselves on being a go-to destination for coffee lovers and conversation seekers. "
        "We serve freshly crafted coffee, snacks, desserts and host exciting events throughout the week."
    ),
    "wifi": "Free high-speed WiFi available",
    "parking": "Street parking available nearby",
    "payment": "Cash, UPI, Credit/Debit cards accepted",
    "reservations": "Walk-ins welcome. Reservations recommended for events.",
}

# ─── INTENT PATTERNS ──────────────────────────────────────────────────────────
# Each intent has: patterns (training phrases), response_key (handler), priority

INTENTS = [
    # Greetings
    {
        "tag": "greeting",
        "patterns": [
            "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
            "howdy", "sup", "what's up", "hiya", "greetings", "namaste", "yo"
        ],
        "priority": 10
    },
    # Goodbye
    {
        "tag": "goodbye",
        "patterns": [
            "bye", "goodbye", "see you", "see ya", "take care", "later", "cya",
            "good night", "goodnight", "thanks bye", "ok thanks", "okay thanks", "thank you bye"
        ],
        "priority": 10
    },
    # Thanks
    {
        "tag": "thanks",
        "patterns": [
            "thank you", "thanks", "thank u", "ty", "thx", "much appreciated",
            "great thanks", "awesome thanks", "perfect thanks", "that helps"
        ],
        "priority": 10
    },
    # Menu - general
    {
        "tag": "menu",
        "patterns": [
            "menu", "what do you serve", "what's on the menu", "food menu", "drink menu",
            "what can i order", "what do you have", "show me menu", "see menu",
            "what food", "what drinks", "items", "categories", "offerings", "what's available"
        ],
        "priority": 8
    },
    # Hot beverages
    {
        "tag": "hot_beverages",
        "patterns": [
            "hot coffee", "hot beverages", "hot drinks", "cappuccino", "espresso",
            "latte", "americano", "flat white", "mocha", "hot chocolate", "masala chai",
            "chai", "tea", "french press", "hot drink", "warm drink"
        ],
        "priority": 8
    },
    # Cold beverages
    {
        "tag": "cold_beverages",
        "patterns": [
            "cold coffee", "cold beverages", "cold drinks", "iced coffee", "frappuccino",
            "cold brew", "iced latte", "smoothie", "mojito", "mango smoothie",
            "cold drink", "chilled", "iced", "frappe", "shake", "cold shake"
        ],
        "priority": 8
    },
    # Food / Refreshments
    {
        "tag": "refreshments",
        "patterns": [
            "food", "snacks", "sandwich", "wrap", "spring rolls", "garlic bread",
            "bruschetta", "nachos", "refreshments", "light bites", "starters",
            "appetizers", "eat", "something to eat", "snack"
        ],
        "priority": 8
    },
    # Combos
    {
        "tag": "special_combos",
        "patterns": [
            "combo", "combos", "special combo", "deal", "deals", "offer", "offers",
            "package", "meal deal", "value", "bundle", "combo meal", "set meal"
        ],
        "priority": 8
    },
    # Desserts
    {
        "tag": "desserts",
        "patterns": [
            "dessert", "desserts", "sweet", "sweets", "cake", "cheesecake", "brownie",
            "tiramisu", "waffle", "lava cake", "gulab jamun", "panna cotta", "sweet dish",
            "ice cream", "sundae", "something sweet"
        ],
        "priority": 8
    },
    # Burgers & Fries
    {
        "tag": "burgers_fries",
        "patterns": [
            "burger", "burgers", "fries", "french fries", "chips", "fast food",
            "paneer burger", "veg burger", "loaded fries", "cheese fries", "peri peri"
        ],
        "priority": 8
    },
    # Events general
    {
        "tag": "events",
        "patterns": [
            "events", "activities", "what's happening", "programs", "schedule",
            "things to do", "entertainment", "event", "activity", "what events",
            "any events", "upcoming events"
        ],
        "priority": 8
    },
    # Specific events
    {
        "tag": "dinner_event",
        "patterns": [
            "dinner night", "dinner event", "friday dinner", "live music dinner",
            "acoustic music", "dinner reservation", "dinner booking"
        ],
        "priority": 9
    },
    {
        "tag": "karaoke_event",
        "patterns": [
            "karaoke", "karaoke night", "singing", "sing", "saturday night",
            "song night", "karaoke event"
        ],
        "priority": 9
    },
    {
        "tag": "open_mic_event",
        "patterns": [
            "open mic", "open mic night", "poetry", "comedy", "perform",
            "thursday", "mic night", "stand up", "storytelling"
        ],
        "priority": 9
    },
    {
        "tag": "tasting_event",
        "patterns": [
            "tasting event", "tasting", "coffee tasting", "brew tasting",
            "sample", "tasting session", "first sunday"
        ],
        "priority": 9
    },
    {
        "tag": "private_event",
        "patterns": [
            "birthday", "private party", "celebration", "anniversary", "private event",
            "book the venue", "rent the space", "birthday party", "party booking"
        ],
        "priority": 9
    },
    {
        "tag": "get_together_event",
        "patterns": [
            "get together", "gathering", "hangout", "group booking", "friends gathering",
            "group visit", "team outing"
        ],
        "priority": 9
    },
    # Booking
    {
        "tag": "booking",
        "patterns": [
            "book", "booking", "reserve", "reservation", "how to book",
            "make a booking", "table booking", "book table", "book a seat",
            "how do i book", "how to reserve"
        ],
        "priority": 9
    },
    # Location
    {
        "tag": "location",
        "patterns": [
            "where are you", "location", "address", "where is", "how to reach",
            "directions", "where located", "find you", "where can i find",
            "navi mumbai", "mumbai", "where do you", "your address"
        ],
        "priority": 8
    },
    # Hours
    {
        "tag": "hours",
        "patterns": [
            "opening hours", "timing", "timings", "hours", "open", "close",
            "when do you open", "what time", "are you open", "working hours",
            "open today", "open sunday", "open saturday", "closed", "operating hours"
        ],
        "priority": 8
    },
    # Contact
    {
        "tag": "contact",
        "patterns": [
            "contact", "phone", "call", "email", "reach you", "get in touch",
            "contact number", "phone number", "how to contact", "call you",
            "email address", "reach out"
        ],
        "priority": 8
    },
    # WiFi / Amenities
    {
        "tag": "amenities",
        "patterns": [
            "wifi", "wi-fi", "internet", "parking", "payment", "pay", "upi",
            "card", "cash", "facilities", "amenities", "seating", "outdoor"
        ],
        "priority": 7
    },
    # Price / Cost
    {
        "tag": "price",
        "patterns": [
            "price", "prices", "cost", "how much", "expensive", "cheap",
            "affordable", "budget", "rate", "charges", "pricing", "cost of"
        ],
        "priority": 7
    },
    # About
    {
        "tag": "about",
        "patterns": [
            "about", "who are you", "tell me about", "what is coffeecape",
            "about coffeecape", "your story", "history", "background", "what you do"
        ],
        "priority": 7
    },
    # Recommendation
    {
        "tag": "recommendation",
        "patterns": [
            "recommend", "suggestion", "what should i order", "best item",
            "popular", "bestseller", "most loved", "what's good", "must try",
            "favorite", "what do you suggest", "top picks", "try"
        ],
        "priority": 8
    },
    # Help
    {
        "tag": "help",
        "patterns": [
            "help", "what can you do", "how can you help", "options",
            "what do you know", "guide me", "assist", "support"
        ],
        "priority": 7
    },
]