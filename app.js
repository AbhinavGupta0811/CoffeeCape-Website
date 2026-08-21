require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const cors = require("cors");
const db = require("./db");

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