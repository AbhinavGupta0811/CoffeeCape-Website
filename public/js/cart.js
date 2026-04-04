(() => {
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
        throw new Error("Request failed");
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
     ADD TO CART
  ====================== */
  async function addToCart(item) {

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
      name: btn.dataset.name,
      price: Number(btn.dataset.price),
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
    const filterBtns = document.querySelectorAll(".filter-btn");
    if (!filterBtns.length) return;

    const cards = document.querySelectorAll(".card");

    filterBtns.forEach(btn => {
      btn.addEventListener("click", () => {

        const filter = btn.dataset.filter;

        filterBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        cards.forEach(card => {
          card.style.display =
            filter === "all" || card.classList.contains(filter)
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
    const drinksMenu = document.getElementById("drinksMenu");
    const snacksMenu = document.getElementById("snacksMenu");
    const burgersMenu = document.getElementById("burgersMenu");
    const friesMenu = document.getElementById("friesMenu");

    function updateMenuView() {

      // Refreshment page
      if (drinksMenu && snacksMenu) {
        if (toggle.checked) {
          drinksMenu.classList.add("hidden");
          snacksMenu.classList.remove("hidden");
        } else {
          drinksMenu.classList.remove("hidden");
          snacksMenu.classList.add("hidden");
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
     INIT
  ====================== */
  document.addEventListener("DOMContentLoaded", () => {
    initNextButton();
    syncCartState();
    initFilters();
    initToggleSwitch();
  });
})();