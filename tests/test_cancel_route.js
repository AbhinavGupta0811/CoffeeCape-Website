const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const handlers = {};
let mockConnection;
const fakeRouter = {
  post: (route, _auth, handler) => { handlers[`POST ${route}`] = handler; },
  get: () => {}
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent?.filename.endsWith("orders.routes(1).js")) {
    if (request === "express") return { Router: () => fakeRouter };
    if (request === "../db") return { getConnection: async () => mockConnection };
    if (request === "../middleware/auth.middleware") return (_req, _res, next) => next();
  }
  return originalLoad.call(this, request, parent, isMain);
};
try { require(path.resolve(__dirname, "../orders.routes(1).js")); }
finally { Module._load = originalLoad; }

async function run(order, affectedRows = 1, orderId = "ORD-123") {
  const calls = [];
  mockConnection = {
    beginTransaction: async () => calls.push("begin"),
    rollback: async () => calls.push("rollback"),
    commit: async () => calls.push("commit"),
    release: () => calls.push("release"),
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT id, status")) return [[order]];
      if (sql.includes("UPDATE orders")) return [{ affectedRows }];
      throw new Error("Unexpected query");
    }
  };
  const req = { params: { id: orderId }, session: { user: { id: 7 } }, user: { id: 7 } };
  const res = {
    code: 200, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await handlers["POST /:id/cancel"](req, res);
  return { res, calls };
}

(async () => {
  const missing = await run(undefined);
  assert.equal(missing.res.code, 404);
  assert(!missing.calls.includes("commit"));
  const old = await run({ id: 1, status: "pending", within_cancel_window: 0 });
  assert.equal(old.res.code, 409);
  const delivered = await run({ id: 1, status: "delivered", within_cancel_window: 1 });
  assert.equal(delivered.res.code, 409);
  const cod = await run({ id: 1, status: "confirmed", within_cancel_window: 1,
                          payment_method: "cod", payment_status: "unpaid" });
  assert.equal(cod.res.body.payment_status, "cancelled");
  assert(cod.calls.includes("commit"));
  assert(cod.calls.find(x => x.sql?.includes("UPDATE orders")).sql.includes("user_id=?"));
  const prepaid = await run({ id: 1, status: "pending", within_cancel_window: 1,
                              payment_method: "upi", payment_status: "paid" });
  assert.equal(prepaid.res.body.payment_status, "paid");
  assert.match(prepaid.res.body.payment_note, /refund must be processed separately/);
  const conflict = await run({ id: 1, status: "pending", within_cancel_window: 1 }, 0);
  assert.equal(conflict.res.code, 409);
  assert(!conflict.calls.includes("commit"));
  console.log("Cancellation route checks passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
