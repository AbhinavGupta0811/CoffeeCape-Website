/**
 * BrewBot — CoffeeCape Customer Chatbot
 * Pure NLP backend (Flask). No API keys anywhere.
 *
 * FIXED: Chat window no longer closes after sending a message.
 */
(function () {
  "use strict";

  /* ── CONFIG ─────────────────────────────────────────── */
  const API_URL = "http://localhost:5000/chat"; // ← update for production

  const QUICK_REPLIES = [
    "☕ Hot Beverages",
    "🧋 Cold Beverages",
    "🎉 Events & Activities",
    "📅 Book an Event",
    "🕐 Opening Hours",
    "📍 Location & Contact",
    "⭐ Recommendations",
    "💰 Pricing",
  ];

  /* ── MARKDOWN-LITE RENDERER ─────────────────────────── */
  function renderMarkdown(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,     "<em>$1</em>")
      .replace(/_(.+?)_/g,       "<em>$1</em>")
      .replace(/`(.+?)`/g,       "<code>$1</code>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, "<br>");
  }

  /* ── BUILD WIDGET HTML ──────────────────────────────── */
  function injectHTML() {
    // Inject into body directly — outside any form element
    const wrapper = document.createElement("div");
    wrapper.id = "brewbot-root";
    // FIX: stop ALL clicks inside the widget from bubbling to document
    wrapper.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    wrapper.innerHTML = `
      <button type="button" id="brewbot-toggle" aria-label="Open BrewBot chat">
        <span class="toggle-open"><i class="fas fa-robot"></i></span>
        <span class="toggle-close">✕</span>
        <span class="brewbot-notif"></span>
      </button>

      <div id="brewbot-window" role="dialog" aria-label="BrewBot" aria-hidden="true">
        <div class="brewbot-header">
          <div class="brewbot-avatar"><i class="fas fa-robot"></i></div>
          <div class="brewbot-hinfo">
            <h4>BrewBot</h4>
            <p><span class="brew-status-dot"></span>Online · CoffeeCape Support</p>
          </div>
        </div>

        <div class="brewbot-messages" id="brewbot-messages" aria-live="polite"></div>
        <div class="brew-quick-replies" id="brew-qr"></div>

        <div class="brewbot-footer">
          <input type="text" id="brewbot-input" placeholder="Ask me anything…"
                 autocomplete="off" maxlength="300" aria-label="Type your message"/>
          <button type="button" id="brewbot-send" disabled aria-label="Send">➤</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrapper);
  }

  /* ── QUICK REPLIES ──────────────────────────────────── */
  function showQuickReplies() {
    const container = document.getElementById("brew-qr");
    if (!container) return;
    container.innerHTML = "";
    QUICK_REPLIES.forEach(label => {
      const btn = document.createElement("button");
      btn.type = "button"; // FIX: always explicit type
      btn.className = "brew-qbtn";
      btn.textContent = label;
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        hideQuickReplies();
        sendMessage(label);
      });
      container.appendChild(btn);
    });
  }

  function hideQuickReplies() {
    const c = document.getElementById("brew-qr");
    if (c) c.innerHTML = "";
  }

  /* ── ADD MESSAGE BUBBLE ─────────────────────────────── */
  function addMessage(role, text) {
    const msgs = document.getElementById("brewbot-messages");
    if (!msgs) return;

    const wrap = document.createElement("div");
    wrap.className = `brew-msg ${role}`;

    const icon = document.createElement("div");
    icon.className = "msg-icon";
    icon.innerHTML = role === "bot" ? "<i class=\"fas fa-robot\"></i>" : "<i class=\"fas fa-user\"></i>";

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.innerHTML = renderMarkdown(text);

    wrap.appendChild(icon);
    wrap.appendChild(bubble);
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  /* ── TYPING INDICATOR ───────────────────────────────── */
  function showTyping() {
    const msgs = document.getElementById("brewbot-messages");
    if (!msgs) return;
    const div = document.createElement("div");
    div.className = "brew-msg bot brew-typing";
    div.id = "brew-typing";
    div.innerHTML = `
      <div class="msg-icon">☕</div>
      <div class="msg-bubble">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById("brew-typing");
    if (el) el.remove();
  }

  /* ── SEND MESSAGE ───────────────────────────────────── */
  let isBusy = false;

  async function sendMessage(text) {
    text = (text || "").trim();
    if (!text || isBusy) return;

    const input   = document.getElementById("brewbot-input");
    const sendBtn = document.getElementById("brewbot-send");

    // Clear input and lock UI immediately
    input.value = "";
    sendBtn.disabled = true;
    hideQuickReplies();
    addMessage("user", text);
    isBusy = true;
    showTyping();

    // Natural typing delay
    await new Promise(r => setTimeout(r, 450 + Math.random() * 300));

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      hideTyping();
      addMessage("bot", data.reply);

    } catch (err) {
      hideTyping();
      addMessage("bot",
        "Sorry, I'm having a little trouble connecting! ☕\n\n" +
        "Please reach us directly:\n📞 +91 98765 43210\n📧 info@coffeeshopwebsite.com"
      );
      console.error("BrewBot error:", err);
    } finally {
      isBusy = false;
      // Re-enable send button if there's text
      if (input) sendBtn.disabled = input.value.trim().length === 0;
      // Show quick replies again for first few messages
      const msgCount = document.querySelectorAll(".brew-msg.user").length;
      if (msgCount <= 2) setTimeout(showQuickReplies, 500);
    }
  }

  /* ── TOGGLE WINDOW ──────────────────────────────────── */
  let greeted = false;
  let isOpen  = false;

  function openWindow() {
    const win = document.getElementById("brewbot-window");
    const btn = document.getElementById("brewbot-toggle");
    if (!win || isOpen) return;
    isOpen = true;
    win.classList.add("visible");
    win.setAttribute("aria-hidden", "false");
    btn.classList.add("open");

    if (!greeted) {
      greeted = true;
      setTimeout(() => {
        addMessage("bot",
          "Hey there! ☕ Welcome to **CoffeeCape**!\n\n" +
          "I'm **BrewBot** — your personal café guide.\n" +
          "Ask me about our menu, events, bookings, hours or anything else!"
        );
        setTimeout(showQuickReplies, 300);
      }, 350);
    }
    setTimeout(() => {
      const inp = document.getElementById("brewbot-input");
      if (inp) inp.focus();
    }, 300);
  }

  function closeWindow() {
    const win = document.getElementById("brewbot-window");
    const btn = document.getElementById("brewbot-toggle");
    if (!win || !isOpen) return;
    isOpen = false;
    win.classList.remove("visible");
    win.setAttribute("aria-hidden", "true");
    btn.classList.remove("open");
  }

  /* ── INIT ───────────────────────────────────────────── */
  function init() {
    injectHTML();

    const toggle  = document.getElementById("brewbot-toggle");
    const input   = document.getElementById("brewbot-input");
    const sendBtn = document.getElementById("brewbot-send");

    // Toggle button — stopPropagation so it doesn't trigger outside-click handler
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      isOpen ? closeWindow() : openWindow();
    });

    // Input changes
    input.addEventListener("input", function () {
      sendBtn.disabled = input.value.trim().length === 0 || isBusy;
    });

    // Enter key to send
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) sendMessage(input.value);
      }
    });

    // Send button — stopPropagation is handled by #brewbot-root wrapper above
    sendBtn.addEventListener("click", function () {
      sendMessage(input.value);
    });

    // FIX: Outside click closes window — but NOT when clicking inside #brewbot-root
    // The stopPropagation on #brewbot-root wrapper handles this cleanly.
    document.addEventListener("click", function () {
      if (isOpen) closeWindow();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();