/**
 * BrewBot — CoffeeCape Customer Chatbot
 * Frontend chatbot widget for the CoffeeCape website.
 */

(function () {
  "use strict";

  if (window.__brewbotInitialized) return;
  window.__brewbotInitialized = true;

  /* ── CONFIG ───────────────────────────────────────────── */

  const API_URL = "/chat";
  const HEALTH_URL = "/health";
  const MAX_MESSAGE_LENGTH = 500;
  let chatbotOnline = false;

  async function checkChatbotStatus() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(HEALTH_URL, {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store",
        signal: controller.signal
      });

      clearTimeout(timeout);

      let data = null;

      try {
        data = await res.json();
      } catch {
        data = null;
      }

      chatbotOnline =
        res.ok &&
        data &&
        data.status === "ok" &&
        data.database === "connected" &&
        data.nlp === "ready";
    } catch {
      chatbotOnline = false;
    }

    const statusText = document.querySelector(".brew-status-dot")?.parentElement;

    if (statusText) {
      statusText.innerHTML = chatbotOnline
        ? '<span class="brew-status-dot"></span>Online · CoffeeCape Support'
        : '<span class="brew-status-dot"></span>Offline · Temporarily unavailable';
    }

    updateSendButton();
  }

  const QUICK_REPLIES = [
    { label: "Hot Beverages", icon: "fas fa-mug-hot", message: "Hot Beverages" },
    { label: "Cold Beverages", icon: "fas fa-glass-water", message: "Cold Beverages" },
    { label: "Events & Activities", icon: "fas fa-calendar-days", message: "Events & Activities" },
    { label: "Book an Event", icon: "fas fa-calendar-check", message: "Book an Event" },
    { label: "Opening Hours", icon: "fas fa-clock", message: "Opening Hours" },
    { label: "Location & Contact", icon: "fas fa-location-dot", message: "Location and Contact" },
    { label: "Recommendations", icon: "fas fa-star", message: "Recommendations" },
    { label: "Pricing", icon: "fas fa-indian-rupee-sign", message: "Pricing" }
  ];

  /* ── SAFE TEXT / MARKDOWN RENDERER ───────────────────── */

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function sanitizeURL(url) {
    const value = String(url || "").trim();

    if (!value) return null;

    if (value.startsWith("/") && !value.startsWith("//")) {
      return value;
    }

    if (value.startsWith("#")) {
      return value;
    }

    try {
      const parsed = new URL(value, window.location.origin);

      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }

      return null;
    } catch {
      return null;
    }
  }

  function renderMarkdown(text) {
    let output = escapeHTML(text || "");

    output = output.replace(
      /\*\*(.+?)\*\*/g,
      "<strong>$1</strong>"
    );

    output = output.replace(
      /`(.+?)`/g,
      "<code>$1</code>"
    );

    output = output.replace(
      /_(.+?)_/g,
      "<em>$1</em>"
    );

    output = output.replace(
      /\*(.+?)\*/g,
      "<em>$1</em>"
    );

    output = output.replace(
      /\[(.+?)\]\((.+?)\)/g,
      function (_, label, rawURL) {
        const safeURL = sanitizeURL(rawURL);

        if (!safeURL) {
          return label;
        }

        return `<a href="${escapeHTML(safeURL)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      }
    );

    return output.replace(/\n/g, "<br>");
  }

  /* ── BUILD WIDGET HTML ───────────────────────────────── */

  function injectHTML() {
    if (document.getElementById("brewbot-root")) return;

    const wrapper = document.createElement("div");
    wrapper.id = "brewbot-root";

    wrapper.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    wrapper.innerHTML = `
      <button
        type="button"
        id="brewbot-toggle"
        aria-label="Open BrewBot chat"
        aria-expanded="false"
        aria-controls="brewbot-window"
      >
        <span class="toggle-open" aria-hidden="true">
          <i class="fas fa-robot"></i>
        </span>
        <span class="toggle-close" aria-hidden="true">×</span>
        <span
          class="brewbot-notif"
          aria-hidden="true"
        ></span>
      </button>

      <div
        id="brewbot-window"
        role="dialog"
        aria-label="BrewBot customer support"
        aria-hidden="true"
      >
        <div class="brewbot-header">
          <div class="brewbot-avatar" aria-hidden="true">
            <i class="fas fa-robot"></i>
          </div>
          <div class="brewbot-hinfo">
            <h4>BrewBot</h4>
            <p>
              <span class="brew-status-dot" aria-hidden="true"></span>
              Online · CoffeeCape Support
            </p>
          </div>
        </div>

        <div
          class="brewbot-messages"
          id="brewbot-messages"
          aria-live="polite"
          aria-relevant="additions"
        ></div>

        <div
          class="brew-quick-replies"
          id="brew-qr"
          aria-label="Suggested questions"
        ></div>

        <div class="brewbot-footer">
          <input
            type="text"
            id="brewbot-input"
            placeholder="Ask me anything..."
            autocomplete="off"
            maxlength="${MAX_MESSAGE_LENGTH}"
            aria-label="Type your message"
          />

          <button
            type="button"
            id="brewbot-send"
            disabled
            aria-label="Send message"
          >
            <i class="fas fa-paper-plane" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(wrapper);
  }

  /* ── QUICK REPLIES ────────────────────────────────────── */

  function showQuickReplies() {
    const container = document.getElementById("brew-qr");

    if (!container) return;

    container.innerHTML = "";

    QUICK_REPLIES.forEach(function (item) {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "brew-qbtn";
      button.setAttribute("aria-label", item.label);

      const icon = document.createElement("i");
      icon.className = item.icon;
      icon.setAttribute("aria-hidden", "true");

      const text = document.createElement("span");
      text.textContent = item.label;

      button.appendChild(icon);
      button.appendChild(text);

      button.addEventListener("click", function (event) {
        event.stopPropagation();

        if (isBusy) return;

        hideQuickReplies();
        sendMessage(item.message);
      });

      container.appendChild(button);
    });
  }

  function hideQuickReplies() {
    const container = document.getElementById("brew-qr");

    if (container) {
      container.innerHTML = "";
    }
  }

  /* ── ADD MESSAGE BUBBLE ───────────────────────────────── */

  function addMessage(role, text) {
    const messages = document.getElementById("brewbot-messages");

    if (!messages) return;

    const wrap = document.createElement("div");
    wrap.className = `brew-msg ${role}`;

    const icon = document.createElement("div");
    icon.className = "msg-icon";
    icon.setAttribute("aria-hidden", "true");

    const iconElement = document.createElement("i");

    iconElement.className =
      role === "bot"
        ? "fas fa-robot"
        : "fas fa-user";

    icon.appendChild(iconElement);

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.innerHTML = renderMarkdown(text);

    wrap.appendChild(icon);
    wrap.appendChild(bubble);
    messages.appendChild(wrap);

    messages.scrollTop = messages.scrollHeight;
  }

  /* ── TYPING INDICATOR ─────────────────────────────────── */

  function showTyping() {
    const messages = document.getElementById("brewbot-messages");

    if (!messages) return;

    hideTyping();

    const div = document.createElement("div");

    div.className = "brew-msg bot brew-typing";
    div.id = "brew-typing";
    div.setAttribute("aria-label", "BrewBot is typing");

    div.innerHTML = `
      <div class="msg-icon" aria-hidden="true">
        <i class="fas fa-robot"></i>
      </div>
      <div class="msg-bubble">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    `;

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() {
    const element = document.getElementById("brew-typing");

    if (element) {
      element.remove();
    }
  }

  /* ── SEND MESSAGE ─────────────────────────────────────── */

  let isBusy = false;

  async function sendMessage(text) {
    text = String(text || "").trim();

    if (!text || isBusy) return;

    if (!chatbotOnline) {
      addMessage(
        "bot",
        "BrewBot is temporarily offline for maintenance. Please try again later."
      );
      return;
    }

    if (text.length > MAX_MESSAGE_LENGTH) {
      addMessage(
        "bot",
        `Please keep your message under ${MAX_MESSAGE_LENGTH} characters.`
      );
      return;
    }

    const input = document.getElementById("brewbot-input");
    const sendButton = document.getElementById("brewbot-send");

    if (!input || !sendButton) return;

    input.value = "";
    input.disabled = true;
    sendButton.disabled = true;

    hideQuickReplies();
    addMessage("user", text);

    isBusy = true;
    showTyping();

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          message: text
        })
      });

      let data = null;

      try {
        data = await response.json();
      } catch {
        throw new Error("Server returned an invalid response.");
      }

      if (!response.ok) {
        throw new Error(
          data && data.error
            ? data.error
            : `Request failed with HTTP ${response.status}.`
        );
      }

      if (
        !data ||
        typeof data.reply !== "string" ||
        !data.reply.trim()
      ) {
        throw new Error("Server returned an invalid chatbot reply.");
      }

      hideTyping();
      addMessage("bot", data.reply);
    } catch (error) {
      hideTyping();
      chatbotOnline = false;

      addMessage(
        "bot",
        "Sorry, I'm having trouble connecting right now.\n\n" +
        "Please try again in a moment or contact CoffeeCape directly."
      );

      console.error("BrewBot error:", error);

      await checkChatbotStatus();
    } finally {
      isBusy = false;

      if (input) {
        input.disabled = false;
        input.focus();
      }

      updateSendButton();

      const messageCount =
        document.querySelectorAll(".brew-msg.user").length;

      if (messageCount <= 2) {
        setTimeout(showQuickReplies, 300);
      }
    }
  }

  /* ── INPUT STATE ───────────────────────────────────────── */

  function updateSendButton() {
    const input = document.getElementById("brewbot-input");
    const sendButton = document.getElementById("brewbot-send");

    if (!input || !sendButton) return;

    sendButton.disabled =
      !chatbotOnline ||
      isBusy ||
      input.disabled ||
      input.value.trim().length === 0;
  }

  /* ── TOGGLE WINDOW ────────────────────────────────────── */

  let greeted = false;
  let isOpen = false;

  function openWindow() {
    const windowElement = document.getElementById("brewbot-window");
    const toggleButton = document.getElementById("brewbot-toggle");

    if (!windowElement || !toggleButton || isOpen) return;

    isOpen = true;

    windowElement.classList.add("visible");
    windowElement.setAttribute("aria-hidden", "false");

    toggleButton.classList.add("open");
    toggleButton.setAttribute("aria-expanded", "true");
    toggleButton.setAttribute("aria-label", "Close BrewBot chat");

    if (!greeted) {
      greeted = true;

      setTimeout(function () {
        addMessage(
          "bot",
          "Hey there! Welcome to **CoffeeCape**!\n\n" +
          "I'm **BrewBot** — your personal café guide.\n" +
          "Ask me about our menu, events, bookings, hours, or anything else!"
        );

        setTimeout(showQuickReplies, 300);
      }, 250);
    }

    setTimeout(function () {
      const input = document.getElementById("brewbot-input");

      if (input && !input.disabled) {
        input.focus();
      }
    }, 300);
  }

  function closeWindow() {
    const windowElement = document.getElementById("brewbot-window");
    const toggleButton = document.getElementById("brewbot-toggle");

    if (!windowElement || !toggleButton || !isOpen) return;

    isOpen = false;

    windowElement.classList.remove("visible");
    windowElement.setAttribute("aria-hidden", "true");

    toggleButton.classList.remove("open");
    toggleButton.setAttribute("aria-expanded", "false");
    toggleButton.setAttribute("aria-label", "Open BrewBot chat");
  }

  /* ── INITIALIZATION ───────────────────────────────────── */

  function init() {
    injectHTML();
    checkChatbotStatus();
    setInterval(checkChatbotStatus, 30000);

    const toggleButton = document.getElementById("brewbot-toggle");
    const input = document.getElementById("brewbot-input");
    const sendButton = document.getElementById("brewbot-send");

    if (!toggleButton || !input || !sendButton) {
      console.error("BrewBot initialization failed.");
      return;
    }

    /* Toggle */

    toggleButton.addEventListener("click", function (event) {
      event.stopPropagation();

      if (isOpen) {
        closeWindow();
      } else {
        openWindow();
      }
    });

    /* Input */

    input.addEventListener("input", function () {
      updateSendButton();
    });

    /* Enter to send */

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();

        if (!sendButton.disabled) {
          sendMessage(input.value);
        }
      }
    });

    /* Send button */

    sendButton.addEventListener("click", function (event) {
      event.stopPropagation();

      if (!sendButton.disabled) {
        sendMessage(input.value);
      }
    });

    /* Escape closes chatbot */

    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && isOpen) {
        closeWindow();
        toggleButton.focus();
      }
    });

    /* Outside click */

    document.addEventListener("click", function () {
      if (isOpen) {
        closeWindow();
      }
    });

    updateSendButton();
  }

  /* ── START ─────────────────────────────────────────────── */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true
    });
  } else {
    init();
  }
})();