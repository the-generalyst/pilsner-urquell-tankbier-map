/* Berlin Tankbier Map — Pilsner Urquell from the tank
   Plain vanilla JS + Leaflet. Everything visitors contribute (prices, star
   ratings, and new bars in any city) is stored in the browser via localStorage,
   so the site needs no backend and no login. */

(function () {
  "use strict";

  const PRICES_KEY = "tankbier_prices_v1";
  const USER_BARS_KEY = "tankbier_userbars_v1";
  const BERLIN_CENTER = [52.503, 13.45];

  let seedBars = [];
  let bars = []; // seed + user-added
  let cityFilter = "__all";
  let map = null;
  let markerLayer = null;
  const markers = {}; // id -> leaflet marker
  let modalRating = 0;

  /* ---------- Storage: reviews (price + rating) ---------- */
  function loadPrices() {
    try { return JSON.parse(localStorage.getItem(PRICES_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function savePrices(data) { localStorage.setItem(PRICES_KEY, JSON.stringify(data)); }
  function pricesFor(barId) { return loadPrices()[barId] || []; }
  function addReview(barId, entry) {
    const all = loadPrices();
    if (!all[barId]) all[barId] = [];
    all[barId].push(entry);
    savePrices(all);
  }

  /* ---------- Storage: user-added bars ---------- */
  function loadUserBars() {
    try { return JSON.parse(localStorage.getItem(USER_BARS_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveUserBar(bar) {
    const list = loadUserBars();
    list.push(bar);
    localStorage.setItem(USER_BARS_KEY, JSON.stringify(list));
  }

  /* ---------- Aggregates ---------- */
  function avgPerHalfLitre(barId) {
    const list = pricesFor(barId).filter((p) => typeof p.price === "number" && p.price > 0);
    if (!list.length) return null;
    const sum = list.reduce((acc, p) => acc + (p.price / p.size) * 0.5, 0);
    return sum / list.length;
  }
  function avgRating(barId) {
    const list = pricesFor(barId).filter((p) => p.rating >= 1);
    if (!list.length) return null;
    return list.reduce((acc, p) => acc + p.rating, 0) / list.length;
  }
  function fmtEuro(n) { return "€" + n.toFixed(2).replace(".", ","); }

  function gmapsUrl(bar) {
    return "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(bar.name + ", " + bar.address + ", " + bar.city);
  }

  function starsHtml(value) {
    const rounded = Math.round(value);
    let out = '<span class="stars" aria-label="' + value.toFixed(1) + ' out of 5">';
    for (let i = 1; i <= 5; i++) {
      out += i <= rounded ? "★" : '<span class="empty">★</span>';
    }
    return out + "</span>";
  }

  /* ---------- Map ---------- */
  function tankIcon() {
    return L.divIcon({
      className: "",
      html: '<div class="tank-marker"><span>🛢️</span></div>',
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -34],
    });
  }

  function initMap() {
    map = L.map("leaflet-map", { scrollWheelZoom: true }).setView(BERLIN_CENTER, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }

  function visibleBars() {
    return cityFilter === "__all" ? bars : bars.filter((b) => b.city === cityFilter);
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    for (const k in markers) delete markers[k];
    const coords = [];
    visibleBars().forEach((bar) => {
      const marker = L.marker([bar.lat, bar.lng], { icon: tankIcon() });
      marker.bindPopup(popupHtml(bar));
      marker.on("popupopen", () => wirePopup(bar));
      marker.on("click", () => selectBar(bar.id, false));
      marker.addTo(markerLayer);
      markers[bar.id] = marker;
      coords.push([bar.lat, bar.lng]);
    });
    if (coords.length) map.fitBounds(coords, { padding: [50, 50], maxZoom: 15 });
  }

  function popupHtml(bar) {
    const avg = avgPerHalfLitre(bar.id);
    const rating = avgRating(bar.id);
    const lines = [];
    if (rating) lines.push(starsHtml(rating) + " " + rating.toFixed(1));
    lines.push(avg ? "Avg " + fmtEuro(avg) + " / 0.5 L" : "No prices yet");
    return (
      '<div class="popup-name">' + escapeHtml(bar.name) + "</div>" +
      '<div class="popup-addr">' + escapeHtml(bar.city) + " · " + escapeHtml(bar.address) + "</div>" +
      '<div class="popup-addr">' + lines.join(" &nbsp;·&nbsp; ") + "</div>" +
      '<div class="popup-actions">' +
        '<button class="popup-btn" data-detail="' + bar.id + '">View &amp; review</button>' +
        '<a class="popup-link" href="' + gmapsUrl(bar) + '" target="_blank" rel="noopener">Google Maps ↗</a>' +
      "</div>"
    );
  }

  function wirePopup(bar) {
    const btn = document.querySelector('[data-detail="' + bar.id + '"]');
    if (btn) btn.addEventListener("click", () => selectBar(bar.id, true));
  }

  /* ---------- City filter ---------- */
  function renderCityFilter() {
    const sel = document.getElementById("city-filter");
    const cities = Array.from(new Set(bars.map((b) => b.city))).sort((a, b) => a.localeCompare(b));
    const current = cityFilter;
    sel.innerHTML = '<option value="__all">All cities (' + bars.length + ")</option>";
    cities.forEach((c) => {
      const n = bars.filter((b) => b.city === c).length;
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c + " (" + n + ")";
      sel.appendChild(opt);
    });
    sel.value = cities.includes(current) || current === "__all" ? current : "__all";
    cityFilter = sel.value;
  }

  /* ---------- Sidebar ---------- */
  function renderSidebar() {
    const ul = document.getElementById("bar-list");
    ul.innerHTML = "";
    const list = visibleBars();
    list.forEach((bar) => {
      const avg = avgPerHalfLitre(bar.id);
      const rating = avgRating(bar.id);
      const li = document.createElement("li");
      li.className = "bar-item";
      li.dataset.id = bar.id;
      li.innerHTML =
        '<div class="bar-item__name">' + escapeHtml(bar.name) +
          (bar.source === "user" ? '<span class="bar-item__badge">added</span>' : "") + "</div>" +
        '<div class="bar-item__meta">' +
          "<span>" + escapeHtml(bar.neighborhood ? bar.neighborhood + ", " : "") + escapeHtml(bar.city) + "</span>" +
          '<span class="bar-item__rating">' + (rating ? "★ " + rating.toFixed(1) : "") + "</span>" +
        "</div>" +
        '<div class="bar-item__meta">' +
          "<span></span>" +
          '<span class="bar-item__price">' + (avg ? fmtEuro(avg) + " / 0.5L" : "—") + "</span>" +
        "</div>";
      li.addEventListener("click", () => selectBar(bar.id, true));
      ul.appendChild(li);
    });
    document.getElementById("sidebar-count").textContent = list.length + " bars";
    document.getElementById("sidebar-title").textContent =
      cityFilter === "__all" ? "All bars" : cityFilter;
  }

  function highlightSidebar(barId) {
    document.querySelectorAll(".bar-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === barId);
    });
  }

  /* ---------- Select / detail ---------- */
  function selectBar(barId, scroll) {
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
    const rating = avgRating(bar.id);
    const priced = list.filter((p) => typeof p.price === "number" && p.price > 0);

    let summary = "";
    if (rating || avg) {
      const cells = [];
      if (rating)
        cells.push('<div class="price-summary__item"><div class="big">' + rating.toFixed(1) +
          ' <span style="font-size:1rem">★</span></div><div class="lbl">Avg rating</div></div>');
      if (avg)
        cells.push('<div class="price-summary__item"><div class="big">' + fmtEuro(avg) +
          '</div><div class="lbl">Avg / 0.5 L</div></div>');
      if (priced.length) {
        const cheapest = Math.min.apply(null, priced.map((p) => (p.price / p.size) * 0.5));
        cells.push('<div class="price-summary__item"><div class="big">' + fmtEuro(cheapest) +
          '</div><div class="lbl">Cheapest / 0.5 L</div></div>');
      }
      cells.push('<div class="price-summary__item"><div class="big">' + list.length +
        '</div><div class="lbl">Reviews</div></div>');
      summary = '<div class="price-summary">' + cells.join("") + "</div>";
    }

    let log = "";
    if (list.length) {
      log = '<ul class="price-log">' + list.map((p) => {
        const bits = [];
        if (p.rating >= 1) bits.push(starsHtml(p.rating));
        if (typeof p.price === "number" && p.price > 0)
          bits.push("<strong>" + fmtEuro(p.price) + "</strong> · " + p.size + " L");
        if (p.note) bits.push('<span class="pl-note">— ' + escapeHtml(p.note) + "</span>");
        return "<li><span>" + bits.join(" ") + '</span><span class="pl-note">' + formatDate(p.ts) + "</span></li>";
      }).join("") + "</ul>";
    } else {
      log = '<p class="price-empty">No reviews yet — be the first to rate it or log a price!</p>';
    }

    el.innerHTML =
      '<div class="detail__top"><h3>' + escapeHtml(bar.name) + "</h3>" +
        '<span class="detail__tag">' + escapeHtml(bar.type) + "</span></div>" +
      '<p class="detail__addr">📍 ' + escapeHtml(bar.address) + " · " + escapeHtml(bar.city) +
        (bar.neighborhood ? " (" + escapeHtml(bar.neighborhood) + ")" : "") +
        (bar.source === "user" ? ' <span class="bar-item__badge">community added</span>' : "") + "</p>" +
      (bar.note ? '<p class="detail__note">' + escapeHtml(bar.note) + "</p>" : "") +
      '<div class="detail__prices"><h4>⭐ Ratings &amp; 💶 prices</h4>' + summary + log + "</div>" +
      '<div style="display:flex; gap:0.6rem; flex-wrap:wrap;">' +
        '<button class="btn btn--primary" id="open-price-modal">＋ Rate / log a price</button>' +
        '<a class="btn btn--ghost" style="color:var(--green);border-color:var(--green)" href="' +
          gmapsUrl(bar) + '" target="_blank" rel="noopener">📍 Google Maps ↗</a>' +
        (bar.website ? '<a class="btn btn--ghost" style="color:var(--green);border-color:var(--green)" href="' +
          encodeURI(bar.website) + '" target="_blank" rel="noopener">Website ↗</a>' : "") +
      "</div>";

    section.hidden = false;
    document.getElementById("open-price-modal").addEventListener("click", () => openPriceModal(bar));
  }

  /* ---------- Price + rating modal ---------- */
  function setModalRating(val) {
    modalRating = val;
    document.getElementById("rating-input").value = val || "";
    document.querySelectorAll("#star-input .star").forEach((s) => {
      s.classList.toggle("on", parseInt(s.dataset.val, 10) <= val);
    });
  }
  function openPriceModal(bar) {
    const modal = document.getElementById("price-modal");
    document.getElementById("modal-bar-name").textContent = bar.name + " · " + bar.city;
    modal.dataset.barId = bar.id;
    setModalRating(0);
    document.getElementById("price-error").hidden = true;
    modal.hidden = false;
  }
  function closePriceModal() {
    document.getElementById("price-modal").hidden = true;
    document.getElementById("price-form").reset();
    setModalRating(0);
  }

  function wirePriceModal() {
    const modal = document.getElementById("price-modal");
    modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closePriceModal));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closePriceModal();
    });

    document.querySelectorAll("#star-input .star").forEach((star) => {
      const v = parseInt(star.dataset.val, 10);
      star.addEventListener("click", () => setModalRating(v === modalRating ? 0 : v));
      star.addEventListener("mouseenter", () => {
        document.querySelectorAll("#star-input .star").forEach((s) =>
          s.classList.toggle("on", parseInt(s.dataset.val, 10) <= v));
      });
    });
    document.getElementById("star-input").addEventListener("mouseleave", () => setModalRating(modalRating));

    document.getElementById("price-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const barId = modal.dataset.barId;
      const priceRaw = document.getElementById("price-input").value;
      const price = priceRaw === "" ? null : parseFloat(priceRaw);
      const size = parseFloat(document.getElementById("size-input").value);
      const note = document.getElementById("note-input").value.trim();
      const rating = modalRating || null;

      if (!rating && (price === null || isNaN(price) || price <= 0)) {
        document.getElementById("price-error").hidden = false;
        return;
      }

      const entry = { ts: Date.now(), size: size, note: note };
      if (rating) entry.rating = rating;
      if (price !== null && !isNaN(price) && price > 0) entry.price = price;
      addReview(barId, entry);
      closePriceModal();

      const bar = bars.find((b) => b.id === barId);
      renderSidebar();
      highlightSidebar(barId);
      renderDetail(bar);
      if (markers[barId]) markers[barId].setPopupContent(popupHtml(bar));
    });
  }

  /* ---------- Add-a-bar modal ---------- */
  function openAddModal() {
    document.getElementById("add-bar-modal").hidden = false;
    document.getElementById("ab-name").focus();
  }
  function closeAddModal() {
    document.getElementById("add-bar-modal").hidden = true;
    document.getElementById("add-bar-form").reset();
    const err = document.getElementById("ab-error");
    err.hidden = true;
  }

  function slugify(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "bar";
  }

  async function geocode(query) {
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(query);
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!res.ok) throw new Error("geocode failed");
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  }

  function wireAddModal() {
    document.getElementById("add-bar-btn").addEventListener("click", openAddModal);
    const modal = document.getElementById("add-bar-modal");
    modal.querySelectorAll("[data-close-add]").forEach((el) => el.addEventListener("click", closeAddModal));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closeAddModal();
    });

    document.getElementById("add-bar-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("ab-submit");
      const err = document.getElementById("ab-error");
      err.hidden = true;

      const name = document.getElementById("ab-name").value.trim();
      const city = document.getElementById("ab-city").value.trim();
      const address = document.getElementById("ab-address").value.trim();
      const neighborhood = document.getElementById("ab-neighborhood").value.trim();
      const website = document.getElementById("ab-website").value.trim();
      const note = document.getElementById("ab-note").value.trim();
      const type = document.getElementById("ab-type").value;
      if (!name || !city || !address) return;

      btn.disabled = true;
      btn.textContent = "Looking up address…";
      let loc = null;
      try {
        loc = await geocode(address + ", " + city);
      } catch (ex) {
        err.textContent = "Couldn't reach the map lookup service. Check your connection and try again.";
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = "Find on map & add";
        return;
      }
      if (!loc) {
        err.textContent = "Couldn't find that address. Try adding a postcode or checking the spelling.";
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = "Find on map & add";
        return;
      }

      const bar = {
        id: slugify(name) + "-" + Date.now().toString(36),
        name: name, city: city, address: address, neighborhood: neighborhood,
        lat: loc.lat, lng: loc.lng, type: type, note: note, website: website,
        source: "user",
      };
      saveUserBar(bar);
      bars.push(bar);
      bars.sort((a, b) => a.name.localeCompare(b.name));

      cityFilter = city;
      renderCityFilter();
      renderMarkers();
      renderSidebar();
      updateHeroCount();
      btn.disabled = false;
      btn.textContent = "Find on map & add";
      closeAddModal();
      selectBar(bar.id, true);
    });
  }

  /* ---------- Helpers ---------- */
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function formatDate(ts) {
    return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function updateHeroCount() {
    const cityCount = new Set(bars.map((b) => b.city)).size;
    document.getElementById("hero-count").textContent =
      "🛢️ " + bars.length + " tank beer spots across " + cityCount +
      (cityCount === 1 ? " city" : " cities");
  }

  /* ---------- Boot ---------- */
  function start() {
    bars = seedBars.concat(loadUserBars()).sort((a, b) => a.name.localeCompare(b.name));
    updateHeroCount();
    initMap();
    renderCityFilter();
    renderMarkers();
    renderSidebar();
    wirePriceModal();
    wireAddModal();

    document.getElementById("city-filter").addEventListener("change", (e) => {
      cityFilter = e.target.value;
      renderMarkers();
      renderSidebar();
    });
  }

  fetch("data/bars.json")
    .then((r) => r.json())
    .then((data) => { seedBars = data; start(); })
    .catch((err) => {
      document.getElementById("hero-count").textContent = "Could not load bar data.";
      console.error(err);
    });
})();
