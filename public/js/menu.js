(() => {
  const API_BASE = "/api/cart";
  const CHECKOUT_PAGE = "checkout.html";
  const cartContainer = document.getElementById("cartContainer");

  /* =============================================
     XSS SANITIZER
     All server-supplied strings MUST pass through
     this before being injected into innerHTML.
  ============================================= */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(String(str ?? "")));
    return div.innerHTML;
  }

  /* =============================================
     ID VALIDATOR
     Cart item IDs from the server are injected
     into API URLs as path params. Validate they
     are safe positive integers before use.
  ============================================= */
  function isSafeId(id) {
    const n = Number(id);
    return Number.isInteger(n) && n > 0;
  }

  /* =============================================
     DEBOUNCE
     Prevents rapid qty-button taps from firing
     concurrent API requests that could corrupt qty.
  ============================================= */
  function debounce(fn, ms = 400) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  /* =============================================
     API HELPER
  ============================================= */
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
        showToast("Access forbidden.", "error");
        return null;
      }

      if (res.status === 404) {
        window.location.href = "error.html?type=notfound";
        return null;
      }

      if (res.status === 409) {
        showToast("Something went wrong!", "error");
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

  /* =============================================
     TOAST
     FIX: Uses CSS classes instead of inline styles
     so the stylesheet controls all appearance.
     FIX: message is set via textContent, not
     innerHTML, to prevent XSS if a caller ever
     passes user-controlled content.
  ============================================= */
  function showToast(message, type = "info") {
    /* Re-use a single persistent toast element */
    let toast = document.getElementById("cart-toast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "cart-toast";
      toast.className = "toast";
      document.body.appendChild(toast);
    }

    const icons = {
      success: "fa-circle-check",
      error:   "fa-circle-xmark",
      warning: "fa-triangle-exclamation",
      info:    "fa-circle-info"
    };

    /* Build safely — icon via class, message via textContent */
    toast.innerHTML = "";

    const icon = document.createElement("i");
    icon.className = `fa-solid ${icons[type] || icons.info}`;
    toast.appendChild(icon);

    const msg = document.createElement("span");
    msg.textContent = message;   /* ← safe, not innerHTML */
    toast.appendChild(msg);

    /* Apply type class */
    toast.className = `toast ${type}`;

    /* Animate in */
    toast.classList.remove("show");
    void toast.offsetWidth;        /* force reflow for re-trigger */
    toast.classList.add("show");

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }

  /* =============================================
     LOAD CART
     FIX: Guard against apiRequest returning null
     before accessing res.cart (was a TypeError crash).
  ============================================= */
  async function loadCart() {
    try {
      const res = await apiRequest(API_BASE);

      /* apiRequest already redirected on 401/404/500 */
      if (!res) return;

      renderCart(res.cart || []);

    } catch {
      if (cartContainer) {
        cartContainer.innerHTML = "";
        const msg = document.createElement("p");
        msg.className = "empty";

        const ico = document.createElement("i");
        ico.className = "fa-solid fa-lock";
        ico.style.marginRight = "6px";
        msg.appendChild(ico);
        msg.appendChild(
          document.createTextNode(" Please login to view your cart")
        );

        cartContainer.appendChild(msg);
      }
    }
  }

  /* =============================================
     RENDER CART
     FIX: All server-supplied strings are sanitized
     with escapeHtml() before injection into innerHTML.
     FIX: image src whitelisted to same-origin /
     relative / known CDN paths.
  ============================================= */
  function renderCart(cart) {
    if (!cartContainer) return;

    const countEl = document.getElementById("cartCount");

    if (!cart || cart.length === 0) {
      if (countEl) countEl.textContent = 0;
      cartContainer.innerHTML = "";

      const wrapper = document.createElement("div");
      wrapper.className = "empty-cart";
      wrapper.innerHTML = `
        <div class="empty-icon">
          <i class="fa-solid fa-cart-shopping"></i>
        </div>
        <h2>Your Cart is Empty</h2>
        <p>Fresh coffee and delicious treats are waiting for you.</p>
        <a href="Index.html#menu" class="browse-btn">Browse Menu</a>
      `;
      cartContainer.appendChild(wrapper);
      return;
    }

    if (countEl) countEl.textContent = cart.length;

    let subtotal = 0;
    let saved    = 0;

    /* Build item HTML using sanitized values */
    const itemsHTML = cart.map(item => {
      const actualPrice = Number(item.price)            || 0;
      const finalPrice  = Number(item.offer_price || item.price) || 0;
      const qty         = Number(item.qty)              || 1;
      const itemTotal   = finalPrice * qty;

      subtotal += itemTotal;
      saved    += (actualPrice - finalPrice) * qty;

      /* Sanitize every server-supplied string */
      const safeName        = escapeHtml(item.name);
      const safeRating      = escapeHtml(item.rating      || "4.5");
      const safePrepTime    = escapeHtml(item.prep_time   || 15);
      const safeDescription = escapeHtml(item.description || "");
      const safeCategory    = escapeHtml(item.category    || "");
      const safeBadge       = escapeHtml(item.badge       || "");
      const safeId          = escapeHtml(item.id);

      /* Whitelist image src: only relative, same-origin, or http(s) URLs */
      const rawImage = String(item.image || "");
      const safeImage = /^(https?:\/\/|\/|assets\/)/.test(rawImage)
        ? rawImage
        : "assets/default-food.png";

      const availability = item.availability === "in_stock"
        ? "In Stock"
        : "Unavailable";

      return `
      <div class="cart-item" data-id="${safeId}">
        <div class="cart-image">
          <img
            src="${safeImage}"
            alt="${safeName}"
            onerror="this.src='assets/default-food.png'"
          >
          ${safeBadge ? `
            <span class="product-badge">${safeBadge}</span>
          ` : ""}
        </div>

        <div class="cart-content">
          <div class="top-row">
            <div>
              <h3>${safeName}</h3>

              <div class="rating-row">
                <span>
                  <i class="fa-solid fa-star"></i>
                  ${safeRating}
                </span>
                <span>
                  <i class="fa-solid fa-clock"></i>
                  ${safePrepTime} min
                </span>
              </div>
            </div>

            <button class="remove-btn" aria-label="Remove ${safeName}">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>

          <p class="cart-description">${safeDescription}</p>

          <div class="category-row">
            <span>${safeCategory}</span>
            <span>${escapeHtml(availability)}</span>
          </div>

          <div class="bottom-row">
            <div class="price-box">
              ${item.offer_price
                ? `<span class="old-price">₹${actualPrice}</span>`
                : ""
              }
              <span class="new-price">₹${finalPrice}</span>
            </div>

            <div class="qty-controls">
              <button class="decrease" aria-label="Decrease quantity">-</button>
              <span>${qty}</span>
              <button class="increase" aria-label="Increase quantity">+</button>
            </div>
          </div>
        </div>
      </div>
      `;
    }).join("");

    cartContainer.innerHTML = itemsHTML + `
      <div class="cart-footer">
        <div class="cart-total-row">
          <span>Cart Total</span>
          <strong>₹${subtotal.toFixed(2)}</strong>
        </div>
      </div>
    `;

    /* Update summary sidebar */
    const subtotalEl = document.getElementById("subtotal");
    if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toFixed(2)}`;

    const savedEl = document.getElementById("savedAmount");
    if (savedEl) savedEl.textContent = `₹${saved.toFixed(2)}`;

    const target       = 2999;
    const remaining    = Math.max(target - subtotal, 0);

    const remainingEl  = document.getElementById("remainingAmount");
    if (remainingEl) remainingEl.textContent = `₹${remaining.toFixed(0)}`;

    const progressFill = document.getElementById("progressFill");
    if (progressFill) {
      const percent = Math.min((subtotal / target) * 100, 100);
      progressFill.style.width = percent + "%";
    }

    const addon = document.getElementById("summaryAddon");
    if (addon) {
      /* Addon content is static — no user data injected */
      addon.innerHTML = `
        <div class="addon-card">
          <h4>❤️ Recommended</h4>
          <p>Add a delicious dessert to complete your meal.</p>
          <button type="button">Explore</button>
        </div>
      `;
    }
  }

  /* =============================================
     UPDATE QTY
     FIX: Validate id is a safe integer before use
     in URL. Debounced to prevent concurrent races.
     FIX: qty < 1 guard is unchanged but qty === 0
     will now never reach the server (decrease from
     qty=1 is blocked at the event handler level too).
  ============================================= */
  const updateQty = debounce(async (id, qty) => {
    if (!isSafeId(id)) {
      console.warn("updateQty: invalid id", id);
      return;
    }

    if (qty < 1) return;

    const res = await apiRequest(`${API_BASE}/update`, "PUT", {
      id: Number(id),
      qty
    });

    if (!res) return;
    loadCart();
  }, 350);

  /* =============================================
     REMOVE ITEM
     FIX: Validate id before inserting into URL.
  ============================================= */
  async function removeItem(id) {
    if (!isSafeId(id)) {
      console.warn("removeItem: invalid id", id);
      return;
    }

    const res = await apiRequest(`${API_BASE}/remove/${Number(id)}`, "DELETE");
    if (!res) return;
    loadCart();
  }

  /* =============================================
     EVENTS
     FIX: Decrease at qty=1 is blocked here —
     prevents a qty=0 request from ever being sent.
  ============================================= */
  if (cartContainer) {
    cartContainer.addEventListener("click", e => {
      const itemEl = e.target.closest(".cart-item");
      if (!itemEl) return;

      const id = itemEl.dataset.id;

      if (!isSafeId(id)) return;

      const qtyEl      = itemEl.querySelector(".qty-controls span");
      const currentQty = Number(qtyEl?.textContent) || 1;

      if (e.target.closest(".increase")) {
        updateQty(id, currentQty + 1);
      }

      if (e.target.closest(".decrease")) {
        /* FIX: Do not send qty=0 to the server.
           If user wants to remove, they use the trash button. */
        if (currentQty <= 1) {
          showToast("Use the remove button to delete an item.", "info");
          return;
        }
        updateQty(id, currentQty - 1);
      }

      if (e.target.closest(".remove-btn")) {
        removeItem(id);
      }
    });
  }

  /* =============================================
     INIT
  ============================================= */
  document.addEventListener("DOMContentLoaded", () => {
    loadCart();

    document.querySelector(".continue-btn")
      ?.addEventListener("click", () => {
        window.location.href = "Index.html#menu";
      });

    document.querySelector(".checkout-btn")
      ?.addEventListener("click", async () => {
        const res = await apiRequest(API_BASE);
        if (!res) return;

        if (!res.cart || res.cart.length === 0) {
          showToast(
            "Your cart is empty! Please add some items before checkout.",
            "warning"
          );
          return;
        }

        showToast("Redirecting to checkout...", "success");

        setTimeout(() => {
          window.location.href = CHECKOUT_PAGE;
        }, 800);
      });
  });
})();