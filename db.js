const mysql = require("mysql2/promise");

/* =====================================================
   ENVIRONMENT VALIDATION
   Fail fast — crash on startup if critical vars missing
===================================================== */
const REQUIRED_VARS = ["DB_HOST", "DB_USER", "DB_PASS", "DB_NAME"];
const missingVars = REQUIRED_VARS.filter(v => !process.env[v]);

if (missingVars.length) {
  console.error(
    `❌ Missing required environment variables: ${missingVars.join(", ")}`
  );
  process.exit(1);
}

/* =====================================================
   CONNECTION POOL
===================================================== */
const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,

  // Unicode support — handles emojis and multilingual text safely
  charset: "utf8mb4",

  // Connection behaviour
  waitForConnections: true,
  connectionLimit:    10,

  // Prevent memory exhaustion under heavy load
  // Requests beyond this limit are rejected immediately instead of queuing forever
  queueLimit: 100,

  // Prevent hanging connections to an unreachable DB host
  connectTimeout: 10000, // 10 seconds
});

/* =====================================================
   STARTUP VERIFICATION
   Confirms credentials and network reachability at boot
===================================================== */
(async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query("SELECT 1"); // lightweight health ping
    console.log("✅ Database connected successfully");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    // Don't exit here — allow the app to start and surface the error via health checks
  } finally {
    if (connection) connection.release();
  }
})();

/* =====================================================
   HEALTH CHECK HELPER
   Call this from a /health or /status route to verify
   the database is still reachable at runtime
===================================================== */
async function checkDbHealth() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query("SELECT 1");
    return { healthy: true };
  } catch (err) {
    console.error("❌ DB health check failed:", err.message);
    return { healthy: false, error: err.message };
  } finally {
    if (connection) connection.release();
  }
}

/* =====================================================
   POOL MONITORING
   Logs pool state on every connection error.
   In production, pipe these to your metrics/logging system.
===================================================== */
pool.on("connection", (conn) => {
  console.log(`🔗 New DB connection: threadId=${conn.threadId}`);
});

pool.on("acquire", (conn) => {
  // Uncomment for verbose debugging:
  // console.log(`🔒 Connection acquired: threadId=${conn.threadId}`);
});

pool.on("release", (conn) => {
  // Uncomment for verbose debugging:
  // console.log(`🔓 Connection released: threadId=${conn.threadId}`);
});

pool.on("enqueue", () => {
  console.warn("⏳ All DB connections busy — request queued");
});

/* =====================================================
   GRACEFUL SHUTDOWN
   Drains the pool cleanly on process exit.
   Prevents "Connection closed" errors on in-flight queries.
===================================================== */
async function gracefulShutdown(signal) {
  console.log(`\n⚠️  ${signal} received — closing DB pool...`);
  try {
    await pool.end();
    console.log("✅ DB pool closed cleanly");
  } catch (err) {
    console.error("❌ Error closing DB pool:", err.message);
  }
  process.exit(0);
}

process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

/* =====================================================
   EXPORTS
===================================================== */
module.exports = pool;
module.exports.checkDbHealth = checkDbHealth;