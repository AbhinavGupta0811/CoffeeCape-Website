require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const db = require("./db");

/* ================================
   ROUTES
================================ */
const authRoutes = require("./routes/auth.routes");
const bookingRoutes = require("./routes/booking.routes");
const cartRoutes = require("./routes/cart.routes");
const profileRoutes = require("./routes/profile.routes");
const passwordRoutes = require("./routes/password.routes");
const paymentRoutes = require("./routes/payment.routes");
const orderRoutes = require("./routes/orders.routes");
const adminRoutes = require("./routes/admin.routes");
const contactRoutes = require("./routes/contact.routes");
const reviewsRoute = require("./routes/reviews.route");
const adminBookingRoutes = require("./routes/admin.booking.routes");
const adminProductRoutes = require("./routes/admin.products.routes");
const productRoutes = require("./routes/products.routes");
const app = express();

/* ================================
   CREATE HTTP SERVER
================================ */
const server = http.createServer(app);

/* ================================
   SOCKET.IO SETUP
================================ */
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true
  }
});

/* Make io available in routes */
app.set("io", io);

/* ================================
   SOCKET EVENTS
================================ */
io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id);

  /* Join user-specific room */
  socket.on("joinUserRoom", (userId) => {
    if (!userId) return;
    socket.join(`user_${userId}`);
    console.log(`👤 User joined room: user_${userId}`);
  });

  /* Join admin room */
  socket.on("joinAdminRoom", () => {
    socket.join("admin_room");
    console.log("👨‍💼 Admin joined admin_room");
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
});

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

app.get("/favicon.ico", (req, res) => res.status(204));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

/* ================================
   SESSION STORE
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
      secure: false, // change to true in production (HTTPS)
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
app.use("/api/cart", cartRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/password", passwordRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/reviews", reviewsRoute);
app.use("/api/admin/bookings", adminBookingRoutes);
app.use("/api/admin/products", adminProductRoutes);
app.use("/api/products", productRoutes);

/* ================================
   GLOBAL ERROR HANDLER 
================================ */
app.use((err, req, res, next) => {
  console.error("🔥 Server Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal Server Error"
  });
});

/* ================================
   START SERVER
================================ */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});