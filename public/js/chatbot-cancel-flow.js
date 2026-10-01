/* Load on the same website as the authenticated /api/orders routes.
   Call CoffeeCapeCancelFlow.start when /chat returns action.type='cancel_order'.
   Pass your existing addBotMessage function; chooseOrder and confirmCancel
   may be supplied to use your site's custom modal instead of browser prompts.
*/
(function (global) {
  "use strict";

  async function start({
    addBotMessage,
    apiBase = "/api/orders",
    chooseOrder,
    confirmCancel,
    onCancelled,
    headers = {}
  } = {}) {
    if (typeof addBotMessage !== "function") {
      throw new TypeError("addBotMessage callback is required");
    }
    const base = String(apiBase).replace(/\/$/, "");
    const request = async (url, options = {}) => {
      const response = await fetch(url, {
        credentials: "include", cache: "no-store", ...options,
        headers: { ...headers, ...options.headers }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.message || "Order request failed");
        error.status = response.status;
        throw error;
      }
      return data;
    };

    try {
      const data = await request(base);
      const orders = Array.isArray(data.orders) ? data.orders : [];
      const eligible = orders.filter(order =>
        ["pending", "confirmed"].includes(order.status) && order.order_id
      );
      if (!eligible.length) {
        addBotMessage("I can't find a pending or confirmed order to cancel. Check My Orders or contact the café.");
        return { status: "no_eligible_orders" };
      }

      // The server makes the final ownership, status, and 24-hour check.
      let selected;
      if (typeof chooseOrder === "function") {
        selected = await chooseOrder(eligible);
      } else {
        const choices = eligible.map((order, index) =>
          `${index + 1}. ${order.order_id} — ${order.status} — ₹${order.total}`
        ).join("\n");
        const choice = global.prompt(`Choose an order number to request cancellation:\n${choices}`);
        if (choice === null) return { status: "dismissed" };
        const index = Number(choice);
        selected = Number.isInteger(index) && index >= 1 && index <= eligible.length
          ? eligible[index - 1] : null;
      }
      // Only an order from the authenticated list may be selected.
      const order = eligible.find(item => item.order_id === selected?.order_id);
      if (!order) {
        addBotMessage("No order was selected. Nothing was cancelled.");
        return { status: "dismissed" };
      }

      const approved = typeof confirmCancel === "function"
        ? await confirmCancel(order)
        : global.confirm(`Cancel order ${order.order_id}? Please confirm before proceeding.`);
      if (!approved) {
        addBotMessage("Cancellation stopped. Your order has not been changed.");
        return { status: "dismissed" };
      }

      const result = await request(`${base}/${encodeURIComponent(order.order_id)}/cancel`, {
        method: "POST"
      });
      addBotMessage(`Order ${result.order_id} was cancelled.${result.payment_note ? ` ${result.payment_note}` : ""}`);
      if (typeof onCancelled === "function") await onCancelled(result);
      return { status: "cancelled", result };
    } catch (error) {
      const message = error.status === 401
        ? "Please sign in to your account, then ask me to cancel your order again."
        : error.status === 404 || error.status === 409
          ? "That order cannot be cancelled now. Please refresh My Orders or contact the café."
          : "I couldn't complete the cancellation. Please check My Orders before trying again.";
      addBotMessage(message);
      return { status: "error", error };
    }
  }

  global.CoffeeCapeCancelFlow = { start };
})(window);
