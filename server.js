require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const server = http.createServer(app);

/* ================================
   SOCKET.IO
================================ */
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true
  }
});

app.set("io", io);

/* ================================
   SOCKET EVENTS
================================ */
io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id);

  socket.on("joinUserRoom", (userId) => {
    if (!userId) return;
    socket.join(`user_${userId}`);
    console.log(`👤 User joined room: user_${userId}`);
  });

  socket.on("joinAdminRoom", () => {
    socket.join("admin_room");
    console.log("👨‍💼 Admin joined admin_room");
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
});

/* ================================
   START SERVER
================================ */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});