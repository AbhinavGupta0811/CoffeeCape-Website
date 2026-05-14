document.addEventListener("DOMContentLoaded", () => {

  /* =========================
     DOM ELEMENTS
  ========================= */

  const orderIdEl =
    document.getElementById("orderId");

  const trackBtn =
    document.getElementById("trackBtn");

  const homeBtn =
    document.getElementById("homeBtn");

  const timerEl =
    document.getElementById("countdownTimer");

  const liveBadge =
    document.querySelector(".live-badge");

  const timelineSteps =
    document.querySelectorAll(".step");

  /* =========================
     URL PARAMS
  ========================= */

  const params =
    new URLSearchParams(window.location.search);

  const orderId =
    params.get("orderId");

  /* =========================
     VALIDATE ORDER
  ========================= */

  if (!orderId) {

    window.location.href =
      "error.html?type=notfound";

    return;
  }

  /* =========================
     SET ORDER ID
  ========================= */

  orderIdEl.textContent = orderId;

  /* =========================
     CONFETTI SYSTEM
  ========================= */

  function createConfetti() {

    const colors = [
      "#1db954",
      "#ffffff",
      "#38bdf8",
      "#facc15"
    ];

    for (let i = 0; i < 140; i++) {

      const confetti =
        document.createElement("div");

      confetti.className =
        "confetti";

      confetti.style.left =
        Math.random() * 100 + "vw";

      confetti.style.background =
        colors[
          Math.floor(
            Math.random() * colors.length
          )
        ];

      confetti.style.animationDuration =
        (Math.random() * 3 + 3) + "s";

      confetti.style.width =
        confetti.style.height =
        (Math.random() * 10 + 5) + "px";

      document.body.appendChild(confetti);

      setTimeout(() => {
        confetti.remove();
      }, 7000);

    }

  }

  createConfetti();

  /* =========================
     DELIVERY COUNTDOWN
  ========================= */

  let minutes = 24;

  function updateTimer() {

    if (minutes > 0) {
      minutes--;
    }

    timerEl.textContent =
      `${minutes} mins`;

  }

  setInterval(updateTimer, 60000);

  /* =========================
     DYNAMIC LIVE STATUS
  ========================= */

  const statuses = [

    {
      text: "Chef is preparing your order 👨‍🍳",
      activeStep: 1
    },

    {
      text: "Order packed successfully 📦",
      activeStep: 2
    },

    {
      text: "Delivery partner is on the way 🛵",
      activeStep: 3
    }

  ];

  let currentStatus = 0;

  function updateLiveStatus() {

    if (currentStatus >= statuses.length)
      return;

    const state =
      statuses[currentStatus];

    /* Badge text */
    if (liveBadge) {

      liveBadge.innerHTML = `
        <span class="dot"></span>
        ${state.text}
      `;
    }

    /* Timeline activation */
    timelineSteps.forEach((step, index) => {

      if (index <= state.activeStep) {
        step.classList.remove("pending");
      }

    });

    currentStatus++;

  }

  /* First update */
  updateLiveStatus();

  /* Simulated status progression */
  setInterval(updateLiveStatus, 12000);

  /* =========================
    BUTTON ACTIONS
  ========================= */
  trackBtn?.addEventListener(
    "click",
    () => {

      window.location.href =
        "My-Activity.html";

    }
  );

  homeBtn?.addEventListener(
    "click",
    () => {

      window.location.href =
        "index.html#menu";

    }
  );

  /* =========================
     PAGE ENTRY ANIMATION
  ========================= */

  document.body.style.opacity = "0";

  setTimeout(() => {

    document.body.style.transition =
      "opacity .8s ease";

    document.body.style.opacity = "1";

  }, 100);

});