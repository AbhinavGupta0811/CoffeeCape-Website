require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const cors = require("cors");
const db = require("./db");

const BREWBOT_URL = process.env.BREWBOT_URL || "http://127.0.0.1:5000";
const BREWBOT_CHAT_URL = `${BREWBOT_URL}/chat`;
const BREWBOT_HEALTH_URL = `${BREWBOT_URL}/health`;

// Routes
const authRoutes = require("./routes/auth.routes");
const bookingRoutes = require("./routes/booking.routes");
const audienceRoutes = require("./routes/audience.routes");
const cartRoutes = require("./routes/cart.routes");
const profileRoutes = require("./routes/profile.routes");
const passwordRoutes = require("./routes/password.routes");
const paymentRoutes = require("./routes/payment.routes");
const orderRoutes = require("./routes/orders.routes");
const contactRoutes = require("./routes/contact.routes");
const reviewsRoute = require("./routes/reviews.route");
const productRoutes = require("./routes/products.routes");
const adminRoutes = require("./routes/admin");
const deliveryAuthRoutes = require("./routes/delivery/delivery.auth.routes");
const deliveryDashboardRoutes = require("./routes/delivery/delivery.dashboard.routes");

const app = express();

/* ================================
MIDDLEWARE
================================ */

app.use(
    cors({
        origin: "http://localhost:3000",
        credentials: true
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/favicon.ico", (req, res) => {
    res.status(204).end();
});

app.use(
    "/uploads",
    express.static(path.join(__dirname, "public/uploads"))
);

/* ================================
SESSION
================================ */

const sessionStore = new MySQLStore({}, db);

app.use(
    session({
        name: "coffeecape.sid",
        secret: process.env.SESSION_SECRET,
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);

/* ================================
BREWBOT PROXY
================================ */

app.post("/chat", async (req, res) => {
    const userMessage = req.body?.message;

    if (typeof userMessage !== "string") {
        return res.status(400).json({
            error: "'message' must be a string."
        });
    }

    const message = userMessage.trim();

    if (!message) {
        return res.status(400).json({
            error: "'message' field is required."
        });
    }

    if (message.length > 500) {
        return res.status(400).json({
            error: "Message too long. Maximum length is 500 characters."
        });
    }

    try {
        const response = await fetch(BREWBOT_CHAT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                message
            })
        });

        let data;

        try {
            data = await response.json();
        } catch {
            return res.status(502).json({
                error: "BrewBot returned an invalid response."
            });
        }

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        return res.status(200).json(data);
    } catch (error) {
        console.error("BrewBot proxy error:", error);

        return res.status(503).json({
            error: "BrewBot service is temporarily unavailable."
        });
    }
});

app.get("/health", async (req, res) => {
    try {
        const response = await fetch(BREWBOT_HEALTH_URL, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            }
        });

        let data;

        try {
            data = await response.json();
        } catch {
            return res.status(503).json({
                status: "unavailable",
                service: "CoffeeCape BrewBot",
                error: "BrewBot returned an invalid health response."
            });
        }

        return res.status(response.status).json(data);
    } catch (error) {
        console.error("BrewBot health proxy error:", error);

        return res.status(503).json({
            status: "unavailable",
            service: "CoffeeCape BrewBot",
            database: "unknown",
            nlp: "unknown",
            error: "BrewBot service is unavailable."
        });
    }
});

/* ================================
API ROUTES
================================ */

app.use("/api/auth", authRoutes);
app.use("/api/booking", bookingRoutes);
app.use("/api/audience", audienceRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/password", passwordRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/reviews", reviewsRoute);
app.use("/api/products", productRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/delivery/auth", deliveryAuthRoutes);
app.use("/api/delivery", deliveryDashboardRoutes);

/* ================================
ERROR HANDLER
================================ */

app.use((err, req, res, next) => {
    console.error("🔥 Server Error:", err);

    res.status(500).json({
        success: false,
        message: "Internal Server Error"
    });
});

module.exports = app;