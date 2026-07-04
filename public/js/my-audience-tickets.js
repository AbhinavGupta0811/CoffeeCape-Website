(() => {
  "use strict";
  /*------------------- CONFIG — adjust API_BASE / paths to match your deployment --------------- */
  const API_BASE = "/api/audience";
  const LOGIN_PAGE = "Auth.html";
  const BOOK_EVENT_PAGE = "audience-booking.html";
  const PAGE_SIZE = 6;              // cards per page (client-side)
  const FETCH_LIMIT = 50;           // max allowed by API per request
  const TOAST_DURATION = 3500;

  /* ---------------------------------------------------------
     DOM REFERENCES
  --------------------------------------------------------- */
  const $ = (sel) => document.querySelector(sel);

  const backBtn            = $("#backBtn");
  const totalTicketCountEl = $("#totalTicketCount");

  const upcomingCountEl    = $("#upcomingCount");
  const completedCountEl   = $("#completedCount");
  const cancelledCountEl   = $("#cancelledCount");
  const allTicketCountEl   = $("#allTicketCount");

  const ticketSearchInput  = $("#ticketSearch");
  const filtersContainer   = $("#ticketFilters");
  const sortSelect         = $("#sortTickets");

  const ticketContainer    = $("#ticketContainer");
  const ticketSkeleton     = $("#ticketSkeleton");
  const emptyState         = $("#emptyState");
  const bookEventBtn       = $("#bookEventBtn");

  const paginationContainer = $("#paginationContainer");
  const paginationNumbers   = $("#paginationNumbers");
  const previousPageBtn     = $("#previousPage");
  const nextPageBtn         = $("#nextPage");

  const ticketModal        = $("#ticketModal");
  const closeTicketModal   = $("#closeTicketModal");
  const ticketDetails      = $("#ticketDetails");

  const cancelModal        = $("#cancelModal");
  const cancelNoBtn        = $("#cancelNoBtn");
  const cancelYesBtn       = $("#cancelYesBtn");

  const toast        = $("#toast");
  const toastIcon    = $("#toastIcon");
  const toastMessage = $("#toastMessage");

  /* ---------------------------------------------------------
     STATE
  --------------------------------------------------------- */
  const state = {
    filter: "all",          // all | upcoming | completed | cancelled
    sort: "newest",         // newest | oldest | eventAsc | eventDesc
    search: "",
    page: 1,
    rawList: [],            // full fetched list for current filter
    filteredList: [],       // after search + sort applied
    cache: {},               // filter -> raw list cache
    pendingCancelId: null,
    toastTimer: null
  };

  /* ---------------------------------------------------------
     AUTH / FETCH HELPER
  --------------------------------------------------------- */
    async function apiFetch(path, options = {}) {

        const controller = new AbortController();

        try {

            const response = await fetch(
                `${API_BASE}${path}`,
                {
                    ...options,

                    signal: controller.signal,

                    credentials: "include",

                    headers: {
                        "Content-Type": "application/json",
                        ...(options.headers || {})
                    }
                }
            );

            let data = null;

            try {
                data = await response.json();
            }
            catch {
                data = null;
            }

            if (response.status === 401) {

                window.location.href = LOGIN_PAGE;

                throw new Error(
                    "Authentication required."
                );
            }

            if (!response.ok) {

                const error = new Error(
                    data?.message ||
                    `Request failed (${response.status})`
                );

                error.status = response.status;
                error.code = data?.code;

                throw error;
            }

            if (!data || data.success === false) {

                const error = new Error(
                    data?.message ||
                    "Unexpected server response."
                );

                error.status = response.status;
                error.code = data?.code;

                throw error;
            }

            return data;

        }
        catch (err) {

            if (err.name === "AbortError") {
                return null;
            }

            throw err;
        }
    }

  /* ---------------------------------------------------------
     FIELD NORMALIZATION
  --------------------------------------------------------- */
  function field(obj, ...keys) {
    for (const key of keys) {
      if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return undefined;
  }

  function normalizeBooking(b) {
    return {
      audienceBookingId: b.audienceBookingId ?? null,
      bookingId: b.bookingId ?? null,
      userId: b.userId ?? null,
      eventType: b.event?.type ?? null,
      eventCategory: b.event?.category ?? null,
      eventDate: b.event?.date ?? null,
      eventTime: b.event?.time ?? null,
      audienceCount: Number(b.audience?.count) || 0,
      fullName: b.customer?.fullName ?? null,
      email: b.customer?.email ?? null,
      phone: b.customer?.phone ?? null,
      ticketPrice: Number(b.pricing?.ticketPrice) || 0,
      total: Number(b.pricing?.total) || 0,
      paymentStatus: b.payment?.status ?? "pending",
      status: (b.status || "pending").toLowerCase(),
      createdAt: b.createdAt ?? null,
      updatedAt: b.updatedAt ?? null
    };
  }

  /* ---------------------------------------------------------
     FORMAT HELPERS
  --------------------------------------------------------- */
  function formatDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    if (isNaN(d)) return String(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric"
    });
  }

  function formatTime(timeStr) {
    if (!timeStr) return "—";
    const parts = String(timeStr).split(":");
    if (parts.length < 2) return timeStr;
    const h = parseInt(parts[0], 10);
    const m = parts[1];
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = ((h + 11) % 12) + 1;
    return `${hour12}:${m} ${period}`;
  }

  function formatCurrency(amount) {
    const n = Number(amount) || 0;
    return `₹${n.toLocaleString("en-IN")}`;
  }

  function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function eventLabel(eventType) {
    const map = {
      openmic: "Open Mic",
      karaoke: "Karaoke Night",
      tasting: "Tasting Event"
    };
    return map[(eventType || "").toLowerCase()] || capitalize(eventType);
  }

  // Derives the display bucket (upcoming / completed / cancelled) for
  // "confirmed" bookings whose bucket depends on the event date/time.
  function deriveDisplayStatus(booking) {
    if (booking.status === "cancelled") return "cancelled";
    if (booking.status === "completed") return "completed";

    if (booking.status === "confirmed") {
      const eventDateTime = new Date(`${booking.eventDate}T${booking.eventTime || "00:00:00"}`);
      if (!isNaN(eventDateTime) && eventDateTime < new Date()) return "completed";
      return "upcoming";
    }

    return booking.status || "pending";
  }

  function statusBadgeClass(status) {
    const map = {
      upcoming: "status-upcoming",
      confirmed: "status-upcoming",
      completed: "status-completed",
      cancelled: "status-cancelled",
      pending: "status-pending"
    };
    return map[status] || "status-pending";
  }

  /* ---------------------------------------------------------
     TOAST
  --------------------------------------------------------- */
  function showToast(message, type = "success") {
    if (!toast) return;

    clearTimeout(state.toastTimer);

    toastMessage.textContent = message;
    toastIcon.innerHTML = type === "success"
      ? '<i class="fa-solid fa-circle-check"></i>'
      : '<i class="fa-solid fa-circle-exclamation"></i>';

    toast.classList.remove("success", "error");
    toast.classList.add(type, "show");

    state.toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, TOAST_DURATION);
  }

  /* ---------------------------------------------------------
     LOADING / EMPTY STATE TOGGLES
  --------------------------------------------------------- */
  function setLoading(isLoading) {
    ticketSkeleton.classList.toggle("hidden", !isLoading);
    ticketContainer.classList.toggle("hidden", isLoading);
    if (isLoading) {
      emptyState.classList.add("hidden");
      paginationContainer.classList.add("hidden");
    }
  }

  function setEmpty(isEmpty) {
    if (isEmpty) {
      ticketContainer.innerHTML = "";
    }
    
    emptyState.classList.toggle("hidden", !isEmpty);
    ticketContainer.classList.toggle("hidden", isEmpty);
    paginationContainer.classList.toggle("hidden", isEmpty);
  }

  /* ---------------------------------------------------------
     DATA FETCHING
  --------------------------------------------------------- */
  const FILTER_ENDPOINTS = {
    all: "/my",
    upcoming: "/upcoming",
    completed: "/completed",
    cancelled: "/cancelled"
  };

  async function fetchFullList(filter) {
    const endpoint = FILTER_ENDPOINTS[filter] || FILTER_ENDPOINTS.all;

    // First page
    const first = await apiFetch(`${endpoint}?page=1&limit=${FETCH_LIMIT}`);
    console.log(
      "FILTER:",
      filter
    );

    console.log(
      "BOOKINGS:",
      first.bookings
    );
    let bookings = (first.bookings || []).map(normalizeBooking);
    console.log(
      "NORMALIZED:",
      bookings
    );

    const totalPages = first.pagination ? first.pagination.totalPages : 1;

    // Fetch remaining pages if any (API caps limit at 50/page)
    if (totalPages > 1) {
      const requests = [];
      for (let p = 2; p <= totalPages; p++) {
        requests.push(apiFetch(`${endpoint}?page=${p}&limit=${FETCH_LIMIT}`));
      }
      const rest = await Promise.all(requests);
      rest.forEach((r) => {
        bookings = bookings.concat((r.bookings || []).map(normalizeBooking));
      });
    }

    return bookings;
  }

  async function loadOverviewCounts() {
    try {
      const [all, upcoming, completed, cancelled] = await Promise.all([
        apiFetch("/my?page=1&limit=1"),
        apiFetch("/upcoming?page=1&limit=1"),
        apiFetch("/completed?page=1&limit=1"),
        apiFetch("/cancelled?page=1&limit=1")
      ]);

      const allTotal = all.pagination?.total ?? 0;
      const upcomingTotal = upcoming.pagination?.total ?? 0;
      const completedTotal = completed.pagination?.total ?? 0;
      const cancelledTotal = cancelled.pagination?.total ?? 0;

      allTicketCountEl.textContent = allTotal;
      upcomingCountEl.textContent = upcomingTotal;
      completedCountEl.textContent = completedTotal;
      cancelledCountEl.textContent = cancelledTotal;
      totalTicketCountEl.textContent = `${allTotal} Ticket${allTotal === 1 ? "" : "s"}`;
    } catch (err) {
      console.error("Failed to load overview counts:", err);
    }
  }

  async function loadTicketsForFilter(filter, { force = false } = {}) {
    setLoading(true);

    try {
      if (force || !state.cache[filter]) {
        state.cache[filter] = await fetchFullList(filter);
      }
      state.rawList = state.cache[filter];
      applyClientFilters();
    } catch (err) {
      console.error("Failed to load tickets:", err);
      showToast(err.message || "Failed to load tickets.", "error");
      state.rawList = [];
      state.filteredList = [];
      renderTickets([]);
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------------------------------------------
     CLIENT-SIDE SEARCH + SORT + PAGINATION
  --------------------------------------------------------- */
  function applyClientFilters() {
    const query = state.search.trim().toLowerCase();

    let list = state.rawList;

    if (query) {
      list = list.filter((b) => {
        const idMatch = (b.audienceBookingId || "").toLowerCase().includes(query);
        const bookingMatch = (b.bookingId || "").toLowerCase().includes(query);
        const eventMatch = eventLabel(b.eventType).toLowerCase().includes(query);
        return idMatch || bookingMatch || eventMatch;
      });
    }

    list = [...list].sort((a, b) => {
      switch (state.sort) {
        case "oldest":
          return new Date(a.createdAt) - new Date(b.createdAt);
        case "eventAsc":
          return new Date(`${a.eventDate}T${a.eventTime || "00:00:00"}`) -
                 new Date(`${b.eventDate}T${b.eventTime || "00:00:00"}`);
        case "eventDesc":
          return new Date(`${b.eventDate}T${b.eventTime || "00:00:00"}`) -
                 new Date(`${a.eventDate}T${a.eventTime || "00:00:00"}`);
        case "newest":
        default:
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });

    state.filteredList = list;
    state.page = Math.min(state.page, Math.max(1, Math.ceil(list.length / PAGE_SIZE)));
    renderCurrentPage();
  }

  function renderCurrentPage() {
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = state.filteredList.slice(start, start + PAGE_SIZE);

    if (state.filteredList.length === 0) {
      setEmpty(true);
      paginationNumbers.innerHTML = "";
      return;
    }

    setEmpty(false);
    renderTickets(pageItems);
    renderPagination();
  }

  /* ---------------------------------------------------------
     RENDER — TICKET CARDS
  --------------------------------------------------------- */
  function renderTickets(list) {
    ticketContainer.innerHTML = "";

    if (!list.length) return;

    const fragment = document.createDocumentFragment();

    list.forEach((booking) => {
      fragment.appendChild(createTicketCard(booking));
    });

    ticketContainer.appendChild(fragment);
  }

  function createTicketCard(booking) {
    const displayStatus = deriveDisplayStatus(booking);

    const card = document.createElement("article");
    card.className = "ticket-card";
    card.dataset.id = booking.audienceBookingId;

    card.innerHTML = `
      <div class="ticket-card-top">
        <span class="ticket-id">#${escapeHtml(booking.audienceBookingId || "—")}</span>
        <span class="ticket-status-badge ${statusBadgeClass(displayStatus)}">
          ${capitalize(displayStatus)}
        </span>
      </div>

      <h3 class="ticket-event-name">${escapeHtml(eventLabel(booking.eventType))}</h3>

      <div class="ticket-info-grid">
        <div class="ticket-info-item">
          <i class="fa-solid fa-calendar-day"></i>
          <span>${formatDate(booking.eventDate)}</span>
        </div>
        <div class="ticket-info-item">
          <i class="fa-solid fa-clock"></i>
          <span>${formatTime(booking.eventTime)}</span>
        </div>
        <div class="ticket-info-item">
          <i class="fa-solid fa-user-group"></i>
          <span>${booking.audienceCount} Guest${booking.audienceCount === 1 ? "" : "s"}</span>
        </div>
        <div class="ticket-info-item">
          <i class="fa-solid fa-indian-rupee-sign"></i>
          <span>${formatCurrency(booking.total)}</span>
        </div>
      </div>

      <div class="ticket-card-actions">
        <button class="secondary-btn view-ticket-btn" data-id="${escapeHtml(booking.audienceBookingId)}">
          <i class="fa-solid fa-eye"></i> View
        </button>
        ${
          displayStatus === "upcoming"
            ? `<button class="danger-btn cancel-ticket-btn" data-id="${escapeHtml(booking.audienceBookingId)}">
                 <i class="fa-solid fa-ban"></i> Cancel
               </button>`
            : ""
        }
      </div>
    `;

    return card;
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ---------------------------------------------------------
     RENDER — PAGINATION
  --------------------------------------------------------- */
  function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(state.filteredList.length / PAGE_SIZE));

    previousPageBtn.disabled = state.page <= 1;
    nextPageBtn.disabled = state.page >= totalPages;

    paginationNumbers.innerHTML = "";

    const maxButtons = 5;
    let startPage = Math.max(1, state.page - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    startPage = Math.max(1, endPage - maxButtons + 1);

    for (let p = startPage; p <= endPage; p++) {
      const btn = document.createElement("button");
      btn.className = "page-number" + (p === state.page ? " active" : "");
      btn.textContent = p;
      btn.addEventListener("click", () => {
        state.page = p;
        renderCurrentPage();
        ticketContainer.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      paginationNumbers.appendChild(btn);
    }
  }

  /* ---------------------------------------------------------
     TICKET DETAIL MODAL
  --------------------------------------------------------- */
  async function openTicketDetails(audienceBookingId) {
    ticketDetails.innerHTML = `<div class="modal-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading ticket...</div>`;
    ticketModal.classList.remove("hidden");

    try {
      const data = await apiFetch(`/ticket/${encodeURIComponent(audienceBookingId)}`);
      renderTicketDetails(data.ticket);
    } catch (err) {
      console.error("Failed to load ticket details:", err);
      ticketDetails.innerHTML = `<div class="modal-error">${escapeHtml(err.message || "Failed to load ticket.")}</div>`;
    }
  }

  function renderTicketDetails(ticket) {
    const displayStatus = deriveDisplayStatus({
      status: ticket.status,
      eventDate: ticket.event?.date,
      eventTime: ticket.event?.time
    });

    const audienceDetails = ticket.audience?.details || {};
    const detailsRows = Object.entries(audienceDetails)
      .filter(([key, value]) => {

        if (key === "metadata") return false;
        if (value === null || value === undefined) return false;
        if (typeof value === "string" && value.trim() === "") {
          return false;
        }
        return true;
      })

      .map(([key, value]) => {
        const label = key
          .replace(/([A-Z])/g, " $1")
          .replace(/_/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase());
        return `
          <div class="ticket-detail-row">
            <span class="label">${escapeHtml(label)}</span>
            <span class="value">
              ${
                typeof value === "object"
                  ? escapeHtml(JSON.stringify(value))
                  : escapeHtml(String(value))
              }
            </span>
          </div>
        `;
      })
      .join("");

    ticketDetails.innerHTML = `
      <div class="ticket-modal-header">
        <span class="ticket-status-badge ${statusBadgeClass(displayStatus)}">
          ${capitalize(displayStatus)}
        </span>

        <h2>${escapeHtml(eventLabel(ticket.event?.type))}</h2>

        <p class="ticket-modal-id">
          Booking ID :
          #${escapeHtml(ticket.audienceBookingId)}
        </p>
      </div>

      <!-- EVENT -->
      <div class="ticket-detail-section">
        <h4>Event Details</h4>
        <div class="ticket-detail-row">
          <span class="label">Category</span>
          <span class="value">
            ${escapeHtml(capitalize(ticket.event?.category || "—"))}
          </span>
        </div>

        <div class="ticket-detail-row">
          <span class="label">Date</span>
          <span class="value">
            ${formatDate(ticket.event?.date)}
          </span>
        </div>

        <div class="ticket-detail-row">
          <span class="label">Time</span>
          <span class="value">
            ${formatTime(ticket.event?.time)}
          </span>
        </div>

        <div class="ticket-detail-row">
          <span class="label">Venue</span>
          <span class="value">
            ${escapeHtml(ticket.event?.venue || "Not Assigned")}
          </span>
        </div>

        <div class="ticket-detail-row">
          <span class="label">Event Status</span>
          <span class="value">
            ${capitalize(ticket.event?.status || "—")}
          </span>
        </div>
      </div>

      <!-- CUSTOMER -->
      <div class="ticket-detail-section">
        <h4>Guest Details</h4>
        <div class="ticket-detail-row">
          <span class="label">Name</span>
          <span class="value">
            ${escapeHtml(ticket.customer?.fullName || "—")}
          </span>
        </div>

        <div class="ticket-detail-row">
          <span class="label">Email</span>
          <span class="value">
            ${escapeHtml(ticket.customer?.email || "—")}
          </span>
        </div>

        <div class="ticket-detail-row">
          <span class="label">Phone</span>
          <span class="value">
            ${escapeHtml(ticket.customer?.phone || "—")}
          </span>
        </div>

        <div class="ticket-detail-row">
          <span class="label">Guests</span>
          <span class="value">
            ${ticket.audience?.count ?? 0}
          </span>
        </div>

        ${detailsRows}
      </div>

      <!-- PAYMENT -->
      <div class="ticket-detail-section">
        <h4>Payment</h4>
        <div class="ticket-detail-row">
          <span class="label">Ticket Price</span>
          <span class="value">
            ${formatCurrency(ticket.pricing?.ticketPrice)}
          </span>
        </div>

        <div class="ticket-detail-row">
          <span class="label">Total Paid</span>
          <span class="value">
            ${formatCurrency(ticket.pricing?.total)}
          </span>
        </div>

        <div class="ticket-detail-row">
          <span class="label">Payment Status</span>
          <span class="value">
            ${capitalize(ticket.payment?.status || "Pending")}
          </span>
        </div>
      </div>

      <!-- BOOKING -->
      <div class="ticket-detail-section">
        <h4>Booking Information</h4>
        <div class="ticket-detail-row">
          <span class="label">Booked On</span>
          <span class="value">
            ${formatDate(ticket.booking?.createdAt)}
          </span>
        </div>

        <div class="ticket-detail-row">
          <span class="label">Last Updated</span>
          <span class="value">
            ${formatDate(ticket.booking?.updatedAt)}
          </span>
        </div>
      </div>

      ${
        displayStatus === "upcoming"
          ? `
          <div class="ticket-modal-actions">
            <button class="danger-btn" id="modalCancelBtn" data-id="${escapeHtml(ticket.audienceBookingId)}">
              <i class="fa-solid fa-ban"></i>
              Cancel Booking
            </button>
          </div>
          `
          : ""
      }

    `;

    const modalCancelBtn = document.getElementById("modalCancelBtn");
    if (modalCancelBtn) {
      modalCancelBtn.addEventListener(
        "click",
        () => {
          closeTicketModalFn();
          openCancelModal(
            ticket.audienceBookingId
          );
        }
      );
    }
  }

  function closeTicketModalFn() {
    ticketModal.classList.add("hidden");
    ticketDetails.innerHTML = "";
  }

  /* ---------------------------------------------------------
     CANCEL BOOKING MODAL
  --------------------------------------------------------- */
  function openCancelModal(audienceBookingId) {
    state.pendingCancelId = audienceBookingId;
    cancelModal.classList.remove("hidden");
  }

  function closeCancelModalFn() {
    state.pendingCancelId = null;
    cancelModal.classList.add("hidden");
  }

  async function confirmCancelBooking() {
    const id = state.pendingCancelId;
    if (!id) return;

    cancelYesBtn.disabled = true;
    cancelYesBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cancelling...`;

    try {
      const data = await apiFetch(`/${encodeURIComponent(id)}/cancel`, {
        method: "PATCH"
      });

      showToast(data.message || "Booking cancelled.", "success");
      closeCancelModalFn();

      // Invalidate caches since status has changed across tabs
      state.cache = {};
      await Promise.all([
        loadOverviewCounts(),
        loadTicketsForFilter(state.filter, { force: true })
      ]);
    } catch (err) {
      console.error("Cancel booking failed:", err);
      showToast(err.message || "Failed to cancel booking.", "error");
    } finally {
      cancelYesBtn.disabled = false;
      cancelYesBtn.innerHTML = "Cancel Booking";
    }
  }

  /* ---------------------------------------------------------
     DEBOUNCE
  --------------------------------------------------------- */
  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  /* ---------------------------------------------------------
     EVENT LISTENERS
  --------------------------------------------------------- */
  function bindEvents() {
    backBtn?.addEventListener("click", () => {
      if (document.referrer) {
        window.history.back();
      } else {
        window.location.href = "index.html";
      }
    });

    bookEventBtn?.addEventListener("click", () => {
      window.location.href = BOOK_EVENT_PAGE;
    });

    filtersContainer?.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-btn");
      if (!btn) return;

      filtersContainer.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      state.filter = btn.dataset.filter || "all";
      state.page = 1;
      loadTicketsForFilter(state.filter);
    });

    sortSelect?.addEventListener("change", () => {
      state.sort = sortSelect.value;
      state.page = 1;
      applyClientFilters();
    });

    ticketSearchInput?.addEventListener(
      "input",
      debounce(() => {
        state.search = ticketSearchInput.value;
        state.page = 1;
        applyClientFilters();
      }, 300)
    );

    previousPageBtn?.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        renderCurrentPage();
        ticketContainer.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    nextPageBtn?.addEventListener("click", () => {
      const totalPages = Math.max(1, Math.ceil(state.filteredList.length / PAGE_SIZE));
      if (state.page < totalPages) {
        state.page += 1;
        renderCurrentPage();
        ticketContainer.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    // Delegate view/cancel clicks from ticket cards
    ticketContainer?.addEventListener("click", (e) => {
      const viewBtn = e.target.closest(".view-ticket-btn");
      if (viewBtn) {
        openTicketDetails(viewBtn.dataset.id);
        return;
      }

      const cancelBtn = e.target.closest(".cancel-ticket-btn");
      if (cancelBtn) {
        openCancelModal(cancelBtn.dataset.id);
        return;
      }

      // Clicking the card itself (not a button) opens details
      const card = e.target.closest(".ticket-card");
      if (card && !e.target.closest("button")) {
        openTicketDetails(card.dataset.id);
      }
    });

    // Ticket modal close
    closeTicketModal?.addEventListener("click", closeTicketModalFn);
    ticketModal?.querySelector(".modal-overlay")?.addEventListener("click", closeTicketModalFn);

    // Cancel modal
    cancelNoBtn?.addEventListener("click", closeCancelModalFn);
    cancelYesBtn?.addEventListener("click", confirmCancelBooking);
    cancelModal?.querySelector(".modal-overlay")?.addEventListener("click", closeCancelModalFn);

    // Escape key closes any open modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!ticketModal.classList.contains("hidden")) closeTicketModalFn();
        if (!cancelModal.classList.contains("hidden")) closeCancelModalFn();
      }
    });
  }

  /* ---------------------------------------------------------
     INIT
  --------------------------------------------------------- */
  async function init() {
    bindEvents();
    setLoading(true);

    await Promise.all([
      loadOverviewCounts(),
      loadTicketsForFilter(state.filter)
    ]);
  }

  document.addEventListener("DOMContentLoaded", init);
})();