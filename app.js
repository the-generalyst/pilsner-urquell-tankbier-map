/* Berlin Tankbier Map — Pilsner Urquell from the tank
   Plain vanilla JS + Leaflet. Prices are stored in the browser (localStorage),
   so anyone can log a price without a backend or a login. */

(function () {
  "use strict";

  const STORAGE_KEY = "tankbier_prices_v1";
  const BERLIN_CENTER = [52.503, 13.45];

  let bars = [];
  let map = null;
  const markers = {}; // id -> leaflet marker
  let activeBarId = null;

  /* ---------- Price storage ---------- */
  function loadPrices() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function savePrices(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  function pricesFor(barId) {
    const all = loadPrices();
    return all[barId] || [];
  }
  function addPrice(barId, entry) {
    const all = loadPrices();
    if (!all[barId]) all[barId] = [];
    all[barId].push(entry);
    savePrices(all);
  }

  /* normalise prices to €/0.5L so different glass sizes are comparable */
  function avgPerHalfLitre(barId) {
    const list = pricesFor(barId);
    if (!list.length) return null;
    const sum = list.reduce((acc, p) => acc + (p.price / p.size) * 0.5, 0);
    return sum / list.length;
  }
  function fmtEuro(n) {
    return "€" + n.toFixed(2).replace(".", ",");
  }

  /* ---------- Map ---------- */
  function initMap() {
    map = L.map("leaflet-map", { scrollWheelZoom: true }).setView(BERLIN_CENTER, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const tankIcon = L.divIcon({
      className: "",
      html: '<div class="tank-marker"><span>🛢️</span></div>',
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -34],
    });

    const group = [];
    bars.forEach((bar) => {
      const marker = L.marker([bar.lat, bar.lng], { icon: tankIcon }).addTo(map);
      marker.bindPopup(popupHtml(bar));
      marker.on("popupopen", () => wirePopup(bar));
      marker.on("click", () => selectBar(bar.id, false));
      markers[bar.id] = marker;
      group.push([bar.lat, bar.lng]);
    });

    if (group.length) {
      map.fitBounds(group, { padding: [50, 50] });
    }
  }

  function popupHtml(bar) {
    const avg = avgPerHalfLitre(bar.id);
    const priceLine = avg
      ? `<div class="popup-addr">Avg ${fmtEuro(avg)} / 0.5 L · ${pricesFor(bar.id).length} report(s)</div>`
      : `<div class="popup-addr">No prices logged yet</div>`;
    return `
      <div class="popup-name">${escapeHtml(bar.name)}</div>
      <div class="popup-addr">${escapeHtml(bar.address)}</div>
      ${priceLine}
      <button class="popup-btn" data-detail="${bar.id}">View &amp; log price</button>
    `;
  }

  function wirePopup(bar) {
    const btn = document.querySelector(`[data-detail="${bar.id}"]`);
    if (btn) btn.addEventListener("click", () => selectBar(bar.id, true));
  }

  /* ---------- Sidebar list ---------- */
  function renderSidebar() {
    const ul = document.getElementById("bar-list");
    ul.innerHTML = "";
    bars.forEach((bar) => {
      const avg = avgPerHalfLitre(bar.id);
      const li = document.createElement("li");
      li.className = "bar-item";
      li.dataset.id = bar.id;
      li.innerHTML = `
        <div class="bar-item__name">${escapeHtml(bar.name)}</div>
        <div class="bar-item__meta">
          <span>${escapeHtml(bar.neighborhood)}</span>
          <span class="bar-item__price">${avg ? fmtEuro(avg) + " / 0.5L" : "—"}</span>
        </div>`;
      li.addEventListener("click", () => selectBar(bar.id, true));
      ul.appendChild(li);
    });
    document.getElementById("sidebar-count").textContent = bars.length + " bars";
  }

  function highlightSidebar(barId) {
    document.querySelectorAll(".bar-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === barId);
    });
  }

  /* ---------- Select / detail ---------- */
  function selectBar(barId, scroll) {
    activeBarId = barId;
    const bar = bars.find((b) => b.id === barId);
    if (!bar) return;

    map.setView([bar.lat, bar.lng], 15, { animate: true });
    if (markers[barId]) markers[barId].openPopup();
    highlightSidebar(barId);
    renderDetail(bar);

    if (scroll) {
      document.getElementById("bar-detail").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function renderDetail(bar) {
    const section = document.getElementById("bar-detail");
    const el = document.getElementById("detail-content");
    const list = pricesFor(bar.id).slice().sort((a, b) => b.ts - a.ts);
    const avg = avgPerHalfLitre(bar.id);

    let priceBlock;
    if (list.length) {
      const cheapest = Math.min(...list.map((p) => (p.price / p.size) * 0.5));
      priceBlock = `
        <div class="price-summary">
          <div class="price-summary__item"><div class="big">${fmtEuro(avg)}</div><div class="lbl">Avg / 0.5 L</div></div>
          <div class="price-summary__item"><div class="big">${fmtEuro(cheapest)}</div><div class="lbl">Cheapest / 0.5 L</div></div>
          <div class="price-summary__item"><div class="big">${list.length}</div><div class="lbl">Reports</div></div>
        </div>
        <ul class="price-log">
          ${list
            .map(
              (p) => `<li>
                <span><strong>${fmtEuro(p.price)}</strong> · ${p.size} L
                ${p.note ? `<span class="pl-note">— ${escapeHtml(p.note)}</span>` : ""}</span>
                <span class="pl-note">${formatDate(p.ts)}</span>
              </li>`
            )
            .join("")}
        </ul>`;
    } else {
      priceBlock = `<p class="price-empty">No prices logged yet — be the first to add one!</p>`;
    }

    el.innerHTML = `
      <div class="detail__top">
        <h3>${escapeHtml(bar.name)}</h3>
        <span class="detail__tag">${escapeHtml(bar.type)}</span>
      </div>
      <p class="detail__addr">📍 ${escapeHtml(bar.address)} · ${escapeHtml(bar.neighborhood)}</p>
      <p class="detail__note">${escapeHtml(bar.note)}</p>
      <div class="detail__prices">
        <h4>💶 Crowd-sourced prices</h4>
        ${priceBlock}
      </div>
      <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
        <button class="btn btn--primary" id="open-price-modal">＋ Log a price</button>
        ${bar.website ? `<a class="btn btn--ghost" style="color:var(--green);border-color:var(--green)" href="${bar.website}" target="_blank" rel="noopener">Website ↗</a>` : ""}
      </div>`;

    section.hidden = false;
    document.getElementById("open-price-modal").addEventListener("click", () => openModal(bar));
  }

  /* ---------- Modal ---------- */
  function openModal(bar) {
    const modal = document.getElementById("price-modal");
    document.getElementById("modal-bar-name").textContent = bar.name;
    modal.dataset.barId = bar.id;
    modal.hidden = false;
    document.getElementById("price-input").focus();
  }
  function closeModal() {
    document.getElementById("price-modal").hidden = true;
    document.getElementById("price-form").reset();
  }

  function wireModal() {
    const modal = document.getElementById("price-modal");
    modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closeModal();
    });

    document.getElementById("price-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const barId = modal.dataset.barId;
      const price = parseFloat(document.getElementById("price-input").value);
      const size = parseFloat(document.getElementById("size-input").value);
      const note = document.getElementById("note-input").value.trim();
      if (isNaN(price) || price <= 0) return;

      addPrice(barId, { price, size, note, ts: Date.now() });
      closeModal();

      // refresh everything that shows prices
      const bar = bars.find((b) => b.id === barId);
      renderSidebar();
      highlightSidebar(barId);
      renderDetail(bar);
      if (markers[barId]) markers[barId].setPopupContent(popupHtml(bar));
    });
  }

  /* ---------- Helpers ---------- */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  /* ---------- Boot ---------- */
  fetch("data/bars.json")
    .then((r) => r.json())
    .then((data) => {
      bars = data.sort((a, b) => a.name.localeCompare(b.name));
      document.getElementById("hero-count").textContent =
        "🛢️ " + bars.length + " tank beer spots mapped across Berlin";
      initMap();
      renderSidebar();
      wireModal();
    })
    .catch((err) => {
      document.getElementById("hero-count").textContent = "Could not load bar data.";
      console.error(err);
    });
})();
