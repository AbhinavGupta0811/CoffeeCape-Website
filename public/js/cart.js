(() => {
  const socket = io();
  const API_BASE = "/api/cart";
  const CART_PAGE = "cart.html";
  const AUTH_PAGE = "Auth.html";

  let itemSelected = false;
  let userLoggedIn = false;
  /* ======================
     API HELPER
  ====================== */
  async function apiRequest(url, method = "GET", data = null) {
    try {
      const options = {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      };

      if (data) options.body = JSON.stringify(data);

      const res = await fetch(url, options);

      if (res.status === 401) {
        userLoggedIn = false;
        return null;
      }

      if (!res.ok) {
        const errorText = await res.text();
        console.error("API Error:", res.status, errorText);
        throw new Error(`Request failed: ${res.status}`);
      }

      userLoggedIn = true;
      return await res.json();

    } catch (err) {
      console.error("Network/API error:", err);
      userLoggedIn = false;
      return null;
    }
  }

  /* ======================
     SYNC LOGIN & CART STATE
  ====================== */
  async function syncCartState() {
    const res = await apiRequest(API_BASE);

    if (res && Array.isArray(res.cart)) {
      userLoggedIn = true;
      itemSelected = res.cart.length > 0;
    } else {
      userLoggedIn = false;
      itemSelected = false;
    }

    updateNextButton();
  }

  /* ======================
    LOAD PRODUCTS
  ====================== */
  async function loadProducts() {

    const menuGrids =
      document.querySelectorAll(".menu-grid");

    if (!menuGrids.length) return;

    for (const menuGrid of menuGrids) {

      const category =
        menuGrid.dataset.category;

      if (!category) continue;

      try {

        menuGrid.innerHTML = `
          <p style="
            text-align:center;
            padding:40px;
            font-weight:600;
          ">
            Loading products...
          </p>
        `;

        const res =
          await fetch(
            `/api/products/category/${category}`
          );

        if (!res.ok) {
          throw new Error("Failed to load");
        }

        const data =
          await res.json();

        if (!data.products?.length) {

          menuGrid.innerHTML = `
            <p style="
              text-align:center;
              padding:40px;
              font-weight:600;
            ">
              No products found
            </p>
          `;

          continue;
        }

        menuGrid.innerHTML =
          data.products
            .map(createProductCard)
            .join("");
        initFilters();

      } catch (err) {

        console.error(
          `Load ${category} error:`,
          err
        );

        menuGrid.innerHTML = `
          <p style="
            text-align:center;
            padding:40px;
            color:red;
            font-weight:600;
          ">
            Failed to load products
          </p>
        `;
      }
    }
  }

  /* ======================
    PRODUCT CARD
  ====================== */
  function createProductCard(product){
    console.log("Editing product:", product);
    const outOfStock =
        product.availability === "out_of_stock";

    return `
        <div class="card ${product.subcategory || ""}">

            <div class="card-image-wrapper">

                ${
                    product.badge
                    ? `
                        <span class="product-badge">
                            ${escapeHtml(product.badge)}
                        </span>
                    `
                    : ""
                }

                <img
                    src="${
                        product.image?.startsWith("/")
                            ? product.image
                            : `/uploads/products/${product.image}`
                    }"
                    alt="${escapeHtml(product.name)}"
                    onerror="this.src='/assets/default-food.png'"
                />

            </div>

            <div class="card-content">

                <div class="product-header">

                    <h2>
                        ${escapeHtml(product.name)}
                    </h2>

                    <span class="
                        stock-status
                        ${outOfStock ? "out" : "in"}
                    ">
                        ${
                            outOfStock
                                ? "Out Of Stock"
                                : "Available"
                        }
                    </span>

                </div>

                <div class="product-meta">

                    ${
                        product.category
                        ? `
                            <span>
                                <i class="fa-solid fa-layer-group"></i>
                                ${escapeHtml(product.category)}
                            </span>
                        `
                        : ""
                    }

                    ${
                        product.subcategory
                        ? `
                            <span>
                                <i class="fa-solid fa-tag"></i>
                                ${escapeHtml(product.subcategory)}
                            </span>
                        `
                        : ""
                    }

                    ${
                        product.prep_time
                        ? `
                            <span>
                                <i class="fa-solid fa-clock"></i>
                                ${product.prep_time} Min
                            </span>
                        `
                        : ""
                    }

                    ${
                        product.rating
                        ? `
                            <span>
                                <i class="fa-solid fa-star"></i>
                                ${product.rating}
                            </span>
                        `
                        : ""
                    }

                </div>

                ${
                    product.description
                    ? `
                        <p class="product-description">
                            ${escapeHtml(product.description)}
                        </p>
                    `
                    : ""
                }

                <div class="product-extra-info">

                    ${
                        product.calories
                        ? `
                            <div>
                                <strong>Calories:</strong>
                                ${product.calories}
                            </div>
                        `
                        : ""
                    }

                    ${
                        product.stock_quantity !== undefined
                        ? `
                            <div>
                                <strong>Stock:</strong>
                                ${product.stock_quantity}
                            </div>
                        `
                        : ""
                    }

                    ${
                        product.sku
                        ? `
                            <div>
                                <strong>SKU:</strong>
                                ${escapeHtml(product.sku)}
                            </div>
                        `
                        : ""
                    }

                </div>

                <div class="product-price">

                    ${
                        product.offer_price
                        ? `
                            <span class="offer-price">
                                ₹${product.offer_price}
                            </span>

                            <span class="original-price">
                                ₹${product.price}
                            </span>
                        `
                        : `
                            <span class="offer-price">
                                ₹${product.price}
                            </span>
                        `
                    }

                </div>

                <button
                    class="order-btn"
                    data-product-id="${product.product_id}"
                    data-qty="1"
                    ${outOfStock ? "disabled" : ""}
                >

                    <i class="fa-solid fa-cart-shopping"></i>

                    ${
                        outOfStock
                            ? " Out Of Stock"
                            : " Add To Cart"
                    }

                </button>

            </div>

        </div>
    `;
}

  /* ======================
     ADD TO CART
  ====================== */
  async function addToCart(item) {
    console.log(item);
    // 🔒 If not logged in → show warning
    if (!userLoggedIn) {
      showToast(
        `<i class="fa-solid fa-lock" style="margin-right:6px;"></i> Please login to add items`
      );

      setTimeout(() => {
        window.location.href = AUTH_PAGE;
      }, 1500);

      return;
    }

    // ✅ If logged in → add to backend
    
    const res = await apiRequest(`${API_BASE}/add`, "POST", item);

    if (res) {
      itemSelected = true;

      showToast(
        `<i class="fa-solid fa-circle-check" style="margin-right:6px;"></i> Added to cart`
      );

      updateNextButton();
    }
  }

  /* ======================
     CLICK LISTENER
  ====================== */
  document.addEventListener("click", e => {
    const btn = e.target.closest(".order-btn");
    if (!btn) return;

    addToCart({
      product_id: btn.dataset.productId,
      qty: Number(btn.dataset.qty || 1)
    });
  });

  /* ======================
     NEXT BUTTON
  ====================== */
  function initNextButton() {

    let nextBtn = document.getElementById("nextBtn");

    if (!nextBtn) {
      nextBtn = document.createElement("button");
      nextBtn.id = "nextBtn";
      nextBtn.textContent = "Next →";
      document.body.appendChild(nextBtn);
    }

    nextBtn.style.cssText = `
      position: fixed;
      bottom: 25px;
      right: 25px;
      padding: 14px 22px;
      border-radius: 30px;
      border: none;
      background: #ccc;
      color: #666;
      cursor: not-allowed;
      z-index: 9999;
      transition: .3s;
      font-weight: 600;
      opacity: 0.6;
    `;

    nextBtn.addEventListener("click", () => {

      if (!userLoggedIn) {
        showToast(
          `<i class="fa-solid fa-lock" style="margin-right:6px;"></i> Login required`
        );

        setTimeout(() => {
          window.location.href = AUTH_PAGE;
        }, 2000);

        return;
      }

      if (!itemSelected) {
        showToast(
          `<i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i> Select at least one item`
        );
        return;
      }

      window.location.href = CART_PAGE;
    });
  }

  /* ======================
     UPDATE NEXT BUTTON STATE
  ====================== */
  function updateNextButton() {
    const btn = document.getElementById("nextBtn");
    if (!btn) return;

    const canProceed = userLoggedIn && itemSelected;

    btn.disabled = !canProceed;
    btn.style.background = canProceed ? "#4a90e2" : "#ccc";
    btn.style.color = canProceed ? "#fff" : "#666";
    btn.style.cursor = canProceed ? "pointer" : "not-allowed";
    btn.style.opacity = canProceed ? "1" : "0.6";
  }

  /* ======================
    FILTER BUTTONS
  ====================== */
  function initFilters() {

    const filterBtns =
      document.querySelectorAll(".filter-btn");

    if (!filterBtns.length) return;

    filterBtns.forEach(btn => {

      btn.addEventListener("click", () => {

        const filter =
          btn.dataset.filter;

        filterBtns.forEach(b =>
          b.classList.remove("active")
        );

        btn.classList.add("active");

        document
          .querySelectorAll(".card")
          .forEach(card => {

            card.style.display =

              filter === "all" ||

              card.classList.contains(filter)

              ? "flex"

              : "none";
          });
      });
    });
  }

  /* ======================
     TOGGLE SWITCH
  ====================== */
  function initToggleSwitch() {
    const toggle = document.getElementById("menuToggle");
    if (!toggle) return;

    // Detect which menus exist on current page
    const coldDrinksMenu = document.getElementById("coldDrinksMenu");
    const refreshmentMenu = document.getElementById("refreshmentMenu");
    const burgersMenu = document.getElementById("burgersMenu");
    const friesMenu = document.getElementById("friesMenu");

    function updateMenuView() {

      // Refreshment page
      if (coldDrinksMenu && refreshmentMenu) {
        if (toggle.checked) {
          coldDrinksMenu.classList.add("hidden");
          refreshmentMenu.classList.remove("hidden");
        } else {
          coldDrinksMenu.classList.remove("hidden");
          refreshmentMenu.classList.add("hidden");
        }
      }

      // Burger page
      if (burgersMenu && friesMenu) {
        if (toggle.checked) {
          burgersMenu.classList.add("hidden");
          friesMenu.classList.remove("hidden");
        } else {
          burgersMenu.classList.remove("hidden");
          friesMenu.classList.add("hidden");
        }
      }
    }

    updateMenuView();
    toggle.addEventListener("change", updateMenuView);
  }

  /* ======================
     TOAST
  ====================== */
  function showToast(msg) {

    let toast = document.getElementById("toast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 25px;
        background: #333;
        color: #fff;
        padding: 12px 18px;
        border-radius: 8px;
        opacity: 0;
        transition: .3s;
        z-index: 9999;
      `;
      document.body.appendChild(toast);
    }

    toast.innerHTML = msg;
    toast.style.opacity = "1";

    setTimeout(() => {
      toast.style.opacity = "0";
    }, 2000);
  }

  /* ======================
    ESCAPE HTML
  ====================== */
  function escapeHtml(text = "") {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ======================
    LIVE PRODUCT UPDATES
  ====================== */
  socket.on(
    "productAdded",
    async () => {

      await loadProducts();
    }
  );

  socket.on(
    "productUpdated",
    async () => {

      await loadProducts();
    }
  );

  socket.on(
    "productDeleted",
    async () => {

      await loadProducts();
    }
  );

  socket.on(
    "productAvailabilityUpdated",
    async () => {

      await loadProducts();
    }
  );

  /* ======================
     INIT
  ====================== */
  document.addEventListener("DOMContentLoaded", async () => {
    initNextButton();
    await syncCartState();
    await loadProducts();
    initFilters();
    initToggleSwitch();
  });
})();