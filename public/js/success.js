document.addEventListener("DOMContentLoaded", () => {

  const orderIdEl = document.getElementById("orderId");
  const viewOrdersBtn = document.getElementById("viewOrdersBtn");
  const homeBtn = document.getElementById("homeBtn");

  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("orderId");

  /* ❌ If no orderId → error */
  if (!orderId) {
    window.location.href = "error.html?type=notfound";
    return;
  }

  /* ✅ Show success directly */
  orderIdEl.textContent = orderId;

  /* Buttons */
  viewOrdersBtn?.addEventListener("click", () => {
    window.location.href = "My-Activity.html";
  });

  homeBtn?.addEventListener("click", () => {
    window.location.href = "Index.html#menu";
  });

});