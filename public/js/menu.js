(() => {
  const API_BASE = "/api/cart";
  const CHECKOUT_PAGE = "checkout.html";
  const cartContainer = document.getElementById("cartContainer");

  /* =======================
     API HELPER
  ======================== */
  async function apiRequest(url, method = "GET", data = null) {
    try {
      const options = {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      };

      if (data) options.body = JSON.stringify(data);

      const res = await fetch(url, options);

      let json = {};
      try {
        json = await res.json();
      } catch {
        json = {};
      }

      if (res.status === 401) {
        window.location.href = "error.html?type=unauthorized";
        return null;
      }

      if (res.status === 403) {
        alert("Access forbidden.");
        return null;
      }

      if (res.status === 404) {
        window.location.href = "error.html?type=notfound";
        return null;
      }

      if (res.status === 409) {
        alert("Conflict detected.");
        return null;
      }

      if (res.status === 500) {
        window.location.href = "error.html?type=server";
        return null;
      }

      if (!res.ok) {
        throw new Error(json.message || "Request failed");
      }

      return json;

    } catch (err) {
      console.error("Cart API error:", err);
      window.location.href = "error.html?type=network";
      return null;
    }
  }

  /* =======================
     LOAD CART
  ======================== */
  async function loadCart() {
    try {
      const res = await apiRequest(API_BASE);
      renderCart(res.cart);
    } catch {
      cartContainer.innerHTML = `
        <p class="empty"><i class="fa-solid fa-lock" style="margin-right:6px;"></i> Please login to view your cart</p>
      `;
    }
  }

  /* =======================
     RENDER CART (UI RESTORED)
  ======================== */
  function renderCart(cart) {
    if (!cart || cart.length === 0) {
      cartContainer.innerHTML = `
        <p class="empty"><i class="fa-solid fa-cart-shopping" style="margin-right:6px;"></i> Your cart is empty</p>
      `;
      return;
    }

    let total = 0;

    cartContainer.innerHTML =
      cart
        .map(item => {
          const finalPrice =
            item.offer_price || item.price;

          total += finalPrice * item.qty;

          return `
            <div class="cart-item" data-id="${item.id}">
              <div class="item-info">
                <h3>${item.name}</h3>
                <p class="price">₹${item.price}</p>
              </div>

              <div class="qty-controls">
                <button class="decrease">−</button>
                <span>${item.qty}</span>
                <button class="increase">+</button>
              </div>

              <button class="remove-btn">Remove</button>
            </div>
          `;
        })
        .join("") +
      `
        <div class="cart-footer">
          <div class="total">Total: ₹${total.toFixed(2)}</div>
          <button class="checkout-btn">Proceed to Checkout</button>
        </div>
      `;
  }

  /* =======================
     UPDATE QTY
  ======================== */
  async function updateQty(id, qty) {
    if (qty < 1) return;
    // Capture the return value here:
    const res = await apiRequest(`${API_BASE}/update`, "PUT", { id, qty });
    if(!res) return; 
    loadCart();
  }

  /* =======================
     REMOVE ITEM
  ======================== */
  async function removeItem(id) {
    // Capture the return value here:
    const res = await apiRequest(`${API_BASE}/remove/${id}`, "DELETE");
    if(!res) return;
    loadCart();
  }
  /* =======================
     EVENTS
  ======================== */
  cartContainer.addEventListener("click", e => {

    if (e.target.classList.contains("checkout-btn")) {
      apiRequest(API_BASE)
        .then(res => {
          if (res) {window.location.href = CHECKOUT_PAGE;}
        });
      return;
    }

    const itemEl = e.target.closest(".cart-item");
    if (!itemEl) return;

    const id = itemEl.dataset.id;
    const qtyEl = itemEl.querySelector(".qty-controls span");
    const currentQty = Number(qtyEl.textContent);

    if (e.target.classList.contains("increase")) {
      updateQty(id, currentQty + 1);
    }

    if (e.target.classList.contains("decrease")) {
      updateQty(id, currentQty - 1);
    }

    if (e.target.classList.contains("remove-btn")) {
      removeItem(id);
    }
  });

  /* =======================
     INIT
  ======================== */
  document.addEventListener("DOMContentLoaded", loadCart);
})();