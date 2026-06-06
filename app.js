/* Tankové Pivo Map — tank beer bars across Europe
   Plain vanilla JS + Leaflet.

   DATA BACKEND (see config.js):
   - If a Supabase URL + anon key are configured, bars / prices / ratings / beer
     reports are SHARED LIVE with everyone via the database.
   - If not, everything falls back to this browser's localStorage (private to
     the visitor) so the site still works with zero setup. */

(function () {
  "use strict";

  const EUROPE_CENTER = [50.5, 12.5];

  /* ════════════════════════════════════════════════════════════════════════
     BACKEND — shared (Supabase) or local (localStorage). Reads are served from
     an in-memory cache hydrated at startup; writes update the cache and persist.
     ════════════════════════════════════════════════════════════════════════ */
  const Backend = (function () {
    const cfg = window.TANKMAP_CONFIG || {};
    let shared = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
      window.supabase && window.supabase.createClient);
    const sb = shared ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

    const LS = { bars: "tankbier_userbars_v1", prices: "tankbier_prices_v1", beers: "tankbier_beers_v1" };
    const cache = { userBars: [], reviews: {}, beers: {} };

    function dedupe(a) { const s = {}, o = []; a.forEach((x) => { if (x && !s[x]) { s[x] = 1; o.push(x); } }); return o; }

    function rowToReview(r) {
      const e = { size: r.size != null ? Number(r.size) : 0.5, note: r.note || "",
        ts: r.created_at ? Date.parse(r.created_at) : Date.now() };
      if (r.rating != null) e.rating = Number(r.rating);
      if (r.price != null) e.price = Number(r.price);
      return e;
    }

    function loadLocal() {
      try { cache.userBars = JSON.parse(localStorage.getItem(LS.bars)) || []; } catch (e) { cache.userBars = []; }
      try { cache.reviews = JSON.parse(localStorage.getItem(LS.prices)) || {}; } catch (e) { cache.reviews = {}; }
      try { cache.beers = JSON.parse(localStorage.getItem(LS.beers)) || {}; } catch (e) { cache.beers = {}; }
    }

    function init() {
      if (shared) {
        return Promise.all([
          sb.from("bars").select("*"),
          sb.from("reviews").select("*").order("created_at", { ascending: true }),
          sb.from("beer_reports").select("bar_id,brand_id"),
        ]).then((res) => {
          const e = res[0].error || res[1].error || res[2].error;
          if (e) throw e;
          cache.userBars = (res[0].data || []).map((b) => ({
            id: b.id, name: b.name, city: b.city, country: b.country, neighborhood: b.neighborhood,
            lat: Number(b.lat), lng: Number(b.lng), type: b.type, beers: b.beers || [],
            note: b.note, website: b.website, source: "user",
          }));
          cache.reviews = {};
          (res[1].data || []).forEach((r) => {
            (cache.reviews[r.bar_id] = cache.reviews[r.bar_id] || []).push(rowToReview(r));
          });
          cache.beers = {};
          (res[2].data || []).forEach((b) => {
            (cache.beers[b.bar_id] = cache.beers[b.bar_id] || []).push(b.brand_id);
          });
          Object.keys(cache.beers).forEach((k) => { cache.beers[k] = dedupe(cache.beers[k]); });
        }).catch((err) => {
          console.error("Shared-data load failed — falling back to this browser only. Check config.js and that schema.sql was run.", err);
          shared = false;
          loadLocal();
        });
      }
      loadLocal();
      return Promise.resolve();
    }

    function addReview(barId, entry) {
      (cache.reviews[barId] = cache.reviews[barId] || []).push(entry);
      if (shared) {
        return sb.from("reviews").insert({
          bar_id: barId, size: entry.size, note: entry.note || null,
          rating: entry.rating != null ? entry.rating : null,
          price: entry.price != null ? entry.price : null,
        }).then((r) => { if (r.error) throw r.error; });
      }
      localStorage.setItem(LS.prices, JSON.stringify(cache.reviews));
      return Promise.resolve();
    }

    function setBeers(barId, ids) {
      const existing = cache.beers[barId] || [];
      const union = dedupe(existing.concat(ids));
      const toAdd = union.filter((b) => existing.indexOf(b) < 0);
      cache.beers[barId] = union;
      if (shared) {
        if (!toAdd.length) return Promise.resolve();
        return sb.from("beer_reports").insert(toAdd.map((b) => ({ bar_id: barId, brand_id: b })))
          .then((r) => { if (r.error) throw r.error; });
      }
      localStorage.setItem(LS.beers, JSON.stringify(cache.beers));
      return Promise.resolve();
    }

    function addBar(bar) {
      cache.userBars.push(bar);
      if (shared) {
        return sb.from("bars").insert({
          id: bar.id, name: bar.name, city: bar.city, country: bar.country || null,
          neighborhood: bar.neighborhood || null, lat: bar.lat, lng: bar.lng,
          type: bar.type || null, beers: bar.beers || [], note: bar.note || null,
          website: bar.website || null,
        }).then((r) => { if (r.error) throw r.error; });
      }
      localStorage.setItem(LS.bars, JSON.stringify(cache.userBars));
      return Promise.resolve();
    }

    return {
      init: init,
      get shared() { return shared; },
      userBars: () => cache.userBars,
      reviewsFor: (id) => cache.reviews[id] || [],
      beersFor: (id) => cache.beers[id] || [],
      addReview: addReview, setBeers: setBeers, addBar: addBar,
    };
  })();

  /* ──────────────── app state ──────────────── */
  let seedBars = [];
  let bars = [];
  let brands = [];
  const brandMap = {};
  let cityFilter = "__all";
  let map = null;
  let markerLayer = null;
  const markers = {};
  let modalRating = 0;

  /* thin read wrappers over the backend cache */
  function pricesFor(barId) { return Backend.reviewsFor(barId); }
  function communityBeers(barId) { return Backend.beersFor(barId); }

  /* ---------- Brands ---------- */
  function resolveBeer(id) {
    if (brandMap[id]) return brandMap[id];
    if (id && id.indexOf("x:") === 0) {
      const nm = id.slice(2);
      return { id: id, name: nm, short: nm.slice(0, 2), bg: "#6b6557", fg: "#ffffff", logo: "" };
    }
    return brandMap.other || { id: "other", name: "Other tank beer", short: "?", bg: "#6b6557", fg: "#fff", logo: "" };
  }
  function beersForBar(bar) {
    const ids = (bar.beers || []).concat(communityBeers(bar.id));
    const seen = {}, out = [];
    ids.forEach((id) => { if (id && !seen[id]) { seen[id] = 1; out.push(id); } });
    return out;
  }
  function primaryBrand(bar) { return resolveBeer(beersForBar(bar)[0] || "other"); }
  function beerPillsHtml(bar) {
    const ids = beersForBar(bar);
    if (!ids.length) return '<p class="price-empty">No beers reported yet.</p>';
    return '<div class="beer-pills">' + ids.map((id) => {
      const b = resolveBeer(id);
      return '<span class="beer-pill" style="background:' + b.bg + ";color:" + b.fg + '">' +
        escapeHtml(b.name) + "</span>";
    }).join("") + "</div>";
  }

  /* ---------- Aggregates ---------- */
  function avgPerHalfLitre(barId) {
    const list = pricesFor(barId).filter((p) => typeof p.price === "number" && p.price > 0);
    if (!list.length) return null;
    return list.reduce((acc, p) => acc + (p.price / p.size) * 0.5, 0) / list.length;
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
    for (let i = 1; i <= 5; i++) out += i <= rounded ? "★" : '<span class="empty">★</span>';
    return out + "</span>";
  }

  /* ---------- Map ---------- */
  function brandIcon(brand) {
    let inner = '<span style="color:' + brand.fg + '">' + escapeHtml(brand.short) + "</span>";
    if (brand.logo) {
      // logo image sits on top of the badge; if the file is missing it hides
      // itself (onerror) and the coloured badge shows through.
      inner += '<img class="brand-marker__logo" src="' + brand.logo +
        '" alt="" onerror="this.style.display=\'none\'">';
    }
    return L.divIcon({
      className: "",
      html: '<div class="brand-marker" style="background:' + brand.bg + ";border-color:" +
        brand.fg + ';">' + inner + "</div>",
      iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -36],
    });
  }

  function initMap() {
    map = L.map("leaflet-map", { scrollWheelZoom: true }).setView(EUROPE_CENTER, 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
      const marker = L.marker([bar.lat, bar.lng], { icon: brandIcon(primaryBrand(bar)) });
      marker.bindPopup(popupHtml(bar));
      marker.on("popupopen", () => wirePopup(bar));
      marker.on("click", () => selectBar(bar.id, false));
      marker.addTo(markerLayer);
      markers[bar.id] = marker;
      coords.push([bar.lat, bar.lng]);
    });
    if (coords.length) map.fitBounds(coords, { padding: [50, 50], maxZoom: 14 });
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
      beerPillsHtml(bar) +
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

  /* ---------- City filter & legend ---------- */
  function renderCityFilter() {
    const sel = document.getElementById("city-filter");
    const cities = Array.from(new Set(bars.map((b) => b.city))).sort((a, b) => a.localeCompare(b));
    const current = cityFilter;
    sel.innerHTML = '<option value="__all">All cities (' + bars.length + ")</option>";
    cities.forEach((c) => {
      const n = bars.filter((b) => b.city === c).length;
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c + " (" + n + ")";
      sel.appendChild(opt);
    });
    sel.value = cities.indexOf(current) >= 0 || current === "__all" ? current : "__all";
    cityFilter = sel.value;
  }

  function renderLegend() {
    document.getElementById("brand-legend").innerHTML = brands
      .filter((b) => b.id !== "other")
      .map((b) => {
        let dot = '<span class="brand-dot" style="background:' + b.bg + ";color:" + b.fg + '">' +
          escapeHtml(b.short);
        if (b.logo) dot += '<img class="brand-dot__logo" src="' + b.logo +
          '" alt="" onerror="this.style.display=\'none\'">';
        dot += "</span>";
        return '<span class="brand-legend__item">' + dot + escapeHtml(b.name) + "</span>";
      }).join("");
  }

  /* ---------- Sidebar ---------- */
  function renderSidebar() {
    const ul = document.getElementById("bar-list");
    ul.innerHTML = "";
    const list = visibleBars();
    list.forEach((bar) => {
      const avg = avgPerHalfLitre(bar.id);
      const rating = avgRating(bar.id);
      const brand = primaryBrand(bar);
      const li = document.createElement("li");
      li.className = "bar-item";
      li.dataset.id = bar.id;
      li.innerHTML =
        '<div class="bar-item__name">' +
          '<span class="brand-dot brand-dot--sm" style="background:' + brand.bg + ";color:" + brand.fg + '">' +
            escapeHtml(brand.short) +
            (brand.logo ? '<img class="brand-dot__logo" src="' + brand.logo + '" alt="" onerror="this.style.display=\'none\'">' : "") +
          "</span>" +
          escapeHtml(bar.name) +
          (bar.source === "user" ? '<span class="bar-item__badge">added</span>' : "") + "</div>" +
        '<div class="bar-item__meta">' +
          "<span>" + escapeHtml(bar.neighborhood ? bar.neighborhood + ", " : "") + escapeHtml(bar.city) + "</span>" +
          '<span class="bar-item__rating">' + (rating ? "★ " + rating.toFixed(1) : "") + "</span>" +
        "</div>" +
        '<div class="bar-item__meta"><span></span>' +
          '<span class="bar-item__price">' + (avg ? fmtEuro(avg) + " / 0.5L" : "—") + "</span></div>";
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
    if (scroll) document.getElementById("bar-detail").scrollIntoView({ behavior: "smooth", block: "center" });
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
      if (rating) cells.push('<div class="price-summary__item"><div class="big">' + rating.toFixed(1) +
        ' <span style="font-size:1rem">★</span></div><div class="lbl">Avg rating</div></div>');
      if (avg) cells.push('<div class="price-summary__item"><div class="big">' + fmtEuro(avg) +
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
        (bar.country ? ", " + escapeHtml(bar.country) : "") +
        (bar.neighborhood ? " (" + escapeHtml(bar.neighborhood) + ")" : "") +
        (bar.source === "user" ? ' <span class="bar-item__badge">community added</span>' : "") + "</p>" +
      (bar.note ? '<p class="detail__note">' + escapeHtml(bar.note) + "</p>" : "") +
      '<div class="detail__prices"><h4>🍺 On tank here</h4>' + beerPillsHtml(bar) +
        '<button class="btn btn--ghost" style="color:var(--green);border-color:var(--green);padding:0.5rem 1rem;font-size:0.9rem" id="open-beers-modal">＋ Update beers served</button>' +
      "</div>" +
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
    document.getElementById("open-beers-modal").addEventListener("click", () => openBeersModal(bar));
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
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closePriceModal(); });

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

      const btn = document.querySelector("#price-form button[type=submit]");
      btn.disabled = true;
      Backend.addReview(barId, entry).then(() => {
        closePriceModal(); refreshBar(barId);
      }).catch((err) => { console.error(err); alert("Sorry, saving failed. Please try again."); })
        .then(() => { btn.disabled = false; });
    });
  }

  /* ---------- Beers modal ---------- */
  function buildChecklist(container, seedIds, selectedIds) {
    container.innerHTML = brands.map((b) => {
      const isSeed = seedIds.indexOf(b.id) >= 0;
      const checked = isSeed || selectedIds.indexOf(b.id) >= 0;
      const badge = '<span class="beer-logo" style="background:' + b.bg + ";color:" + b.fg + '">' +
        escapeHtml(b.short) +
        (b.logo ? '<img src="' + b.logo + '" alt="" onerror="this.style.display=\'none\'">' : "") +
        "</span>";
      return '<label class="beer-check' + (checked ? " on" : "") + '">' +
        '<input type="checkbox" value="' + b.id + '"' +
        (checked ? " checked" : "") + (isSeed ? " disabled" : "") + ">" +
        badge + '<span class="beer-name">' + escapeHtml(b.name) + (isSeed ? " ✓" : "") + "</span></label>";
    }).join("");
    container.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => cb.closest(".beer-check").classList.toggle("on", cb.checked));
    });
  }
  function openBeersModal(bar) {
    const modal = document.getElementById("beers-modal");
    modal.dataset.barId = bar.id;
    document.getElementById("beers-modal-bar").textContent = bar.name + " · " + bar.city;
    document.getElementById("bm-error").hidden = true;
    document.getElementById("bm-beer-other").value = "";
    buildChecklist(document.getElementById("bm-beers"), bar.beers || [], communityBeers(bar.id));
    modal.hidden = false;
  }
  function closeBeersModal() { document.getElementById("beers-modal").hidden = true; }
  function wireBeersModal() {
    const modal = document.getElementById("beers-modal");
    modal.querySelectorAll("[data-close-beers]").forEach((el) => el.addEventListener("click", closeBeersModal));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeBeersModal(); });

    document.getElementById("beers-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const barId = modal.dataset.barId;
      const bar = bars.find((b) => b.id === barId);
      const checked = Array.from(modal.querySelectorAll("#bm-beers input:checked:not(:disabled)")).map((i) => i.value);
      const other = document.getElementById("bm-beer-other").value.trim();
      if (other) checked.push("x:" + other);
      const seed = bar.beers || [];
      if (!seed.length && !checked.length) { document.getElementById("bm-error").hidden = false; return; }

      const btn = document.querySelector("#beers-form button[type=submit]");
      btn.disabled = true;
      Backend.setBeers(barId, checked).then(() => {
        closeBeersModal(); refreshBar(barId);
      }).catch((err) => { console.error(err); alert("Sorry, saving failed. Please try again."); })
        .then(() => { btn.disabled = false; });
    });
  }

  function refreshBar(barId) {
    const bar = bars.find((b) => b.id === barId);
    renderSidebar();
    highlightSidebar(barId);
    renderDetail(bar);
    if (markers[barId]) {
      markers[barId].setIcon(brandIcon(primaryBrand(bar)));
      markers[barId].setPopupContent(popupHtml(bar));
    }
  }

  /* ---------- Add-a-bar modal ---------- */
  function openAddModal() {
    buildChecklist(document.getElementById("ab-beers"), [], ["pilsner-urquell"]);
    document.getElementById("add-bar-modal").hidden = false;
    document.getElementById("ab-name").focus();
  }
  function closeAddModal() {
    document.getElementById("add-bar-modal").hidden = true;
    document.getElementById("add-bar-form").reset();
    document.getElementById("ab-error").hidden = true;
  }
  function slugify(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "bar";
  }
  async function geocode(query) {
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(query);
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
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeAddModal(); });

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
      const beers = Array.from(document.querySelectorAll("#ab-beers input:checked")).map((i) => i.value);
      const otherBeer = document.getElementById("ab-beer-other").value.trim();
      if (otherBeer) beers.push("x:" + otherBeer);
      if (!name || !city || !address) return;
      if (!beers.length) { err.textContent = "Pick at least one tank beer (or type one in)."; err.hidden = false; return; }

      btn.disabled = true;
      btn.textContent = "Looking up address…";
      let loc = null;
      try { loc = await geocode(address + ", " + city); }
      catch (ex) {
        err.textContent = "Couldn't reach the map lookup service. Check your connection and try again.";
        err.hidden = false; btn.disabled = false; btn.textContent = "Find on map & add"; return;
      }
      if (!loc) {
        err.textContent = "Couldn't find that address. Try adding a postcode or checking the spelling.";
        err.hidden = false; btn.disabled = false; btn.textContent = "Find on map & add"; return;
      }

      const bar = {
        id: slugify(name) + "-" + Date.now().toString(36),
        name: name, city: city, country: "", address: address, neighborhood: neighborhood,
        lat: loc.lat, lng: loc.lng, type: type, beers: beers, note: note,
        website: website, source: "user",
      };
      btn.textContent = "Saving…";
      try { await Backend.addBar(bar); }
      catch (ex) {
        err.textContent = "Couldn't save the bar. Please try again.";
        err.hidden = false; btn.disabled = false; btn.textContent = "Find on map & add"; return;
      }
      bars.push(bar);
      bars.sort((a, b) => a.name.localeCompare(b.name));
      cityFilter = city;
      renderCityFilter(); renderMarkers(); renderSidebar(); updateHeroCount();
      btn.disabled = false; btn.textContent = "Find on map & add";
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
      "🛢️ " + bars.length + " tank beer spots across " + cityCount + (cityCount === 1 ? " city" : " cities");
  }
  function applySharedCopy() {
    if (!Backend.shared) return;
    document.querySelectorAll(".modal__hint").forEach((el) => {
      el.textContent = "Shared live with everyone on the map. Thanks for contributing! 🍻";
    });
    const credit = document.querySelector(".footer__credit");
    if (credit) credit.innerHTML = credit.innerHTML.replace(
      "Contributions are stored in your browser.",
      "Contributions are shared live with everyone. 🌍");
  }

  /* ---------- Boot ---------- */
  function start() {
    brands.forEach((b) => { brandMap[b.id] = b; });
    bars = seedBars.concat(Backend.userBars()).sort((a, b) => a.name.localeCompare(b.name));
    updateHeroCount();
    initMap();
    renderLegend();
    renderCityFilter();
    renderMarkers();
    renderSidebar();
    wirePriceModal();
    wireBeersModal();
    wireAddModal();
    applySharedCopy();

    document.getElementById("city-filter").addEventListener("change", (e) => {
      cityFilter = e.target.value; renderMarkers(); renderSidebar();
    });
  }

  Promise.all([
    fetch("data/bars.json").then((r) => r.json()),
    fetch("data/brands.json").then((r) => r.json()),
  ])
    .then(([barData, brandData]) => {
      seedBars = barData; brands = brandData;
      return Backend.init();
    })
    .then(start)
    .catch((err) => {
      document.getElementById("hero-count").textContent = "Could not load map data.";
      console.error(err);
    });
})();
