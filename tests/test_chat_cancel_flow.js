const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.resolve(__dirname, "../chatbot-cancel-flow.js"), "utf8");

async function scenario({ confirm = true, signedIn = true } = {}) {
  const requests = [];
  const messages = [];
  const window = {
    prompt: () => "1",
    confirm: () => confirm
  };
  const fetch = async (url, options) => {
    requests.push({ url, options });
    if (!signedIn) return { ok: false, status: 401, json: async () => ({ message: "Sign in" }) };
    if (!options.method) return { ok: true, json: async () => ({ orders: [
      { order_id: "ORD-123", status: "pending", total: 180 }
    ] }) };
    return { ok: true, json: async () => ({ order_id: "ORD-123", payment_note: "Refund separately" }) };
  };
  vm.runInNewContext(source, { window, fetch, console });
  const result = await window.CoffeeCapeCancelFlow.start({ addBotMessage: message => messages.push(message) });
  return { result, requests, messages };
}

(async () => {
  const dismissed = await scenario({ confirm: false });
  assert.equal(dismissed.result.status, "dismissed");
  assert.equal(dismissed.requests.length, 1);
  const cancelled = await scenario();
  assert.equal(cancelled.result.status, "cancelled");
  assert.equal(cancelled.requests.length, 2);
  assert.equal(cancelled.requests[1].options.method, "POST");
  assert.equal(cancelled.requests[1].url, "/api/orders/ORD-123/cancel");
  assert.equal(cancelled.requests[1].options.credentials, "include");
  const unauthenticated = await scenario({ signedIn: false });
  assert.equal(unauthenticated.requests.length, 1);
  assert.match(unauthenticated.messages[0], /sign in/i);
  console.log("Chat cancellation flow checks passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
