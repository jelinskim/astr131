/* =============================================================================
   Constellation Trainer
   ============================================================================= */
(function () {
  "use strict";

  const app = document.getElementById("app");
  const KEY = {
    stats: "sc_stats_v1", draft: "sc_manage_draft_v1", preview: "sc_preview_v1",
    atlasSort: "sc_atlas_sort_v1", statsSort: "sc_stats_sort_v1",
    quizState: "sc_quiz_state_v1", theme: "sc_theme_v1", favorites: "sc_favorites_v1",
  };

  /* ---------------------------------------------------------------- storage */
  function load(key, fb) { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { } }
  function del(key) { try { localStorage.removeItem(key); } catch (e) { } }

  /* -------------------------------------------------------------- utilities */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function slugify(s) { return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  let toastTimer;
  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // Reference-counted page-scroll lock so nested overlays don't unlock early.
  let scrollLocks = 0;
  function lockScroll() { scrollLocks++; document.body.style.overflow = "hidden"; }
  function unlockScroll() { scrollLocks = Math.max(0, scrollLocks - 1); if (scrollLocks === 0) document.body.style.overflow = ""; }

  const FS_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;

  /* --------------------------------------------------------- geocoding (OSM) */
  async function geocodeForward(q) {
    if (typeof fetch !== "function") throw new Error("no fetch");
    const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
    const r = await fetch(u, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("http " + r.status);
    const j = await r.json();
    if (!j || !j.length) return null;
    return { lat: +parseFloat(j[0].lat).toFixed(4), lon: +parseFloat(j[0].lon).toFixed(4) };
  }
  async function geocodeReverse(lat, lon) {
    if (typeof fetch !== "function") throw new Error("no fetch");
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lon}`;
    const r = await fetch(u, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("http " + r.status);
    const j = await r.json();
    if (j && j.address) {
      const a = j.address;
      const parts = [a.city || a.town || a.village || a.hamlet || a.county, a.state, a.country].filter(Boolean);
      if (parts.length) return { label: parts.join(", ") };
    }
    return j && j.display_name ? { label: j.display_name } : null;
  }
  const fmtLat = (l) => `${Math.abs(l).toFixed(2)}°${l >= 0 ? "N" : "S"}`;
  const fmtLon = (l) => `${Math.abs(l).toFixed(2)}°${l >= 0 ? "E" : "W"}`;
  const osmLink = (lat, lon) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=6/${lat}/${lon}`;

  /* ------------------------------------------------------------- data layer */
  const cfg = Object.assign({ imageDir: "images", imageExt: "png", linesSuffix: "_lines" }, window.QUIZ_CONFIG || {});

  function normalize(list) {
    return (list || []).map((c) => {
      const name = (c.name || "").trim();
      const slug = (c.slug || slugify(name)).trim();
      const out = { slug, name: name || slug };
      ["week", "abbr", "hemisphere", "location", "lat", "lon", "versions", "notes", "ext"]
        .forEach((k) => { if (c[k] !== undefined && c[k] !== null && c[k] !== "") out[k] = c[k]; });
      if (out.week !== undefined) out.week = Number(out.week);
      if (out.lat !== undefined) out.lat = Number(out.lat);
      if (out.lon !== undefined) out.lon = Number(out.lon);
      if (out.versions !== undefined) out.versions = Math.max(1, Math.round(Number(out.versions)) || 1);
      return out;
    }).filter((c) => c.slug);
  }
  function publishedData() { return normalize(window.CONSTELLATIONS || []); }
  function draftData() { const d = load(KEY.draft, null); return d ? normalize(d) : null; }
  function previewOn() { return load(KEY.preview, false) === true; }
  function activeData() { if (previewOn()) { const d = draftData(); if (d) return d; } return publishedData(); }

  // Version count: explicit `versions` in data.js wins; otherwise we probe the
  // folder (cached) so dropping V2/V3… files in just works with no data edit.
  const verCache = {};
  function versionCount(c) {
    if (!c) return 1;
    if (c.versions) return Math.max(1, Math.round(Number(c.versions)) || 1);
    return verCache[c.slug] != null ? verCache[c.slug] : 1;
  }
  function probeImg(src) { return new Promise((res) => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = src; }); }
  async function detectVersions(c, max) {
    max = max || 12;
    if (c.versions) { verCache[c.slug] = Math.max(1, Math.round(Number(c.versions)) || 1); return verCache[c.slug]; }
    if (verCache[c.slug] != null) return verCache[c.slug];
    let n = 1;
    for (let v = 2; v <= max; v++) { if (await probeImg(imgSrc(c, false, v))) n = v; else break; }
    verCache[c.slug] = n;
    return n;
  }
  // images/<slug>/V<n>.png (no lines) and images/<slug>/V<n>Lines.png (with lines)
  function imgSrc(c, lines, version) {
    const v = Math.max(1, Math.round(Number(version)) || 1);
    const ext = c.ext || cfg.imageExt;
    return `${cfg.imageDir}/${c.slug}/V${v}${lines ? "Lines" : ""}.${ext}`;
  }
  function randVersion(c) { const n = versionCount(c); return 1 + Math.floor(Math.random() * n); }
  // optional custom hover thumbnail: images/<slug>/V<n>Hover.png
  function imgHover(c, version) {
    const v = Math.max(1, Math.round(Number(version)) || 1);
    const ext = c.ext || cfg.imageExt;
    return `${cfg.imageDir}/${c.slug}/V${v}Hover.${ext}`;
  }
  function weeksOf(list) { const s = new Set(); list.forEach((c) => { if (Number.isFinite(c.week)) s.add(c.week); }); return Array.from(s).sort((a, b) => a - b); }

  /* ------------------------------------------------------------ stats model */
  function blankStats() { return { version: 1, per: {}, history: [], bestStreak: 0 }; }
  function getStats() { return load(KEY.stats, blankStats()); }
  function recordAnswer(slug, ok) {
    const s = getStats(); const p = s.per[slug] || { seen: 0, correct: 0 };
    p.seen += 1; if (ok) p.correct += 1; s.per[slug] = p; save(KEY.stats, s);
  }
  function recordQuiz(entry, bestStreakRun) {
    const s = getStats(); s.history.push(entry);
    if (s.history.length > 100) s.history = s.history.slice(-100);
    if (bestStreakRun > (s.bestStreak || 0)) s.bestStreak = bestStreakRun;
    save(KEY.stats, s);
  }
  function overall() {
    const s = getStats(); let seen = 0, correct = 0;
    Object.values(s.per).forEach((p) => { seen += p.seen; correct += p.correct; });
    return { quizzes: s.history.length, questions: seen, correct, accuracy: seen ? Math.round((correct / seen) * 100) : 0, bestStreak: s.bestStreak || 0 };
  }
  function missedSlugs() { const s = getStats(); return Object.keys(s.per).filter((k) => s.per[k].seen > 0 && s.per[k].correct < s.per[k].seen); }
  // "in the red" = same trouble rule the stats page highlights
  function redSlugs() {
    const s = getStats();
    return Object.keys(s.per).filter((k) => {
      const p = s.per[k]; if (!p || p.seen <= 0) return false;
      const acc = Math.round((p.correct / p.seen) * 100);
      return p.correct === 0 || (p.seen >= 2 && acc < 70);
    });
  }
  /* ------------------------------------------------------------- favorites */
  function getFavs() { const f = load(KEY.favorites, []); return Array.isArray(f) ? f : []; }
  function isFav(slug) { return getFavs().indexOf(slug) !== -1; }
  function toggleFav(slug) {
    const f = getFavs(), i = f.indexOf(slug);
    if (i === -1) f.push(slug); else f.splice(i, 1);
    save(KEY.favorites, f); return i === -1;
  }
  const STAR_FILLED = `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.8 6.8 20.6l1-5.8L3.5 9.7l5.9-.9z"/></svg>`;
  const STAR_OUTLINE = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.8 6.8 20.6l1-5.8L3.5 9.7l5.9-.9z"/></svg>`;

  /* -------------------------------------------------------- shared fragments */
  const STARRULE = `<span class="starrule"><span class="r"></span>
    <svg width="52" height="12" viewBox="0 0 52 12" fill="none" stroke="currentColor" stroke-width="1">
      <path d="M4 8 L18 4 L34 9 L48 3" opacity="0.7"/>
      <circle cx="4" cy="8" r="1.6" fill="currentColor" stroke="none"/>
      <circle cx="18" cy="4" r="2" fill="currentColor" stroke="none"/>
      <circle cx="34" cy="9" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="48" cy="3" r="1.8" fill="currentColor" stroke="none"/>
    </svg><span class="r"></span></span>`;

  function frameHTML(c, { lines = false, badge, allowToggle = true, version = 1 } = {}) {
    const plain = esc(imgSrc(c, false, version)), line = esc(imgSrc(c, true, version));
    const b = badge != null ? `<span class="chart-badge" data-badge>${esc(badge)}</span>` : "";
    return `
      <div class="chart-frame" data-frame data-slug="${esc(c.slug)}" data-allowtoggle="${allowToggle}" data-version="${version}">
        <span class="corner tl"></span><span class="corner tr"></span>
        <span class="corner bl"></span><span class="corner br"></span>
        <img data-img="plain" class="${lines ? "hidden" : ""}" alt="Constellation, stars only" src="${plain}">
        <img data-img="lines" class="${lines ? "" : "hidden"}" alt="Constellation with lines" src="${line}">
        <div class="chart-missing"><span>Image not found<br><span class="mono" data-misspath></span></span></div>
        <button type="button" class="chart-fs" data-fs aria-label="View fullscreen" title="Fullscreen">${FS_ICON}</button>
        ${b}
      </div>`;
  }
  function wireFrame(root) {
    root.querySelectorAll("[data-frame]").forEach((frame) => {
      const plain = frame.querySelector('[data-img="plain"]');
      const lines = frame.querySelector('[data-img="lines"]');
      const missing = frame.querySelector(".chart-missing");
      const pathEl = frame.querySelector("[data-misspath]");
      function fail(img) {
        if (!missing || img.classList.contains("hidden")) return; // only for the visible image
        if (pathEl) pathEl.textContent = img.getAttribute("src");
        missing.classList.add("show");
      }
      if (plain) plain.addEventListener("error", () => fail(plain));
      if (lines) lines.addEventListener("error", () => fail(lines));
      const fs = frame.querySelector("[data-fs]");
      if (fs) fs.addEventListener("click", (e) => {
        e.stopPropagation();
        const linesVisible = !lines.classList.contains("hidden");
        const allow = frame.getAttribute("data-allowtoggle") !== "false";
        const version = Number(frame.getAttribute("data-version")) || 1;
        openFullscreen(frame.getAttribute("data-slug"), linesVisible, allow, version);
      });
    });
  }
  function emptyDatasetHTML() {
    return `
      <div class="panel center mt-lg">
        <h3>No constellations yet</h3>
        <p class="dim" style="max-width:52ch;margin:10px auto 18px">
          Add your first one in <b>Manage</b>, or drop two images into the
          <span class="mono">images/</span> folder and add an entry to
          <span class="mono">data.js</span>.</p>
        <a class="btn primary" href="#/manage">Open Manage</a>
      </div>`;
  }

  // Replace native <select> popups with app-styled dropdowns (keeps the native
  // element in the DOM for its value + change events, so existing wiring works).
  function enhanceSelects(root) {
    root.querySelectorAll("select").forEach((sel) => {
      if (sel.dataset.enh) return;
      sel.dataset.enh = "1";
      const wrap = document.createElement("div");
      wrap.className = "uisel";
      sel.parentNode.insertBefore(wrap, sel);
      wrap.appendChild(sel);
      sel.classList.add("uisel-native");
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "uisel-btn";
      const menu = document.createElement("div");
      menu.className = "uisel-menu"; menu.hidden = true; menu.setAttribute("role", "listbox");
      wrap.appendChild(btn); wrap.appendChild(menu);
      const sync = () => { const o = sel.options[sel.selectedIndex]; btn.textContent = o ? o.text : ""; };
      const drawMenu = () => {
        menu.innerHTML = [...sel.options].map((o, i) =>
          `<div class="uisel-opt${i === sel.selectedIndex ? " sel" : ""}" role="option" data-i="${i}">${esc(o.text)}</div>`).join("");
      };
      const openMenu = () => { drawMenu(); menu.hidden = false; wrap.classList.add("open"); };
      const closeMenu = () => { menu.hidden = true; wrap.classList.remove("open"); };
      btn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden ? openMenu() : closeMenu(); });
      menu.addEventListener("click", (e) => {
        const o = e.target.closest("[data-i]"); if (!o) return;
        sel.selectedIndex = Number(o.dataset.i); sync(); closeMenu();
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      });
      document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) closeMenu(); });
      sel.addEventListener("change", sync);
      sync();
    });
  }

  /* -------------------------------------------------------- fullscreen viewer */
  function openFullscreen(slug, startLines, allowToggle, version) {
    const c = activeData().find((x) => x.slug === slug);
    if (!c) return;
    const v = Math.max(1, Math.round(Number(version)) || 1);
    const back = document.createElement("div");
    back.className = "fs-back";
    back.innerHTML = `
      <div class="fs-bar">
        <span class="fs-title">${allowToggle ? esc(c.name) : "Identify the constellation"}</span>
        <div class="fs-actions">
          <div class="fs-zoombtns">
            <button type="button" class="icon-btn" id="fsOut" aria-label="Zoom out">−</button>
            <button type="button" class="icon-btn" id="fsIn" aria-label="Zoom in">+</button>
            <button type="button" class="icon-btn" id="fsFit" aria-label="Reset zoom" title="Reset zoom"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>
          </div>
          ${allowToggle ? `<button type="button" class="btn small fs-toggle" id="fsToggle">${startLines ? "Hide lines" : "Show lines"}</button>` : ""}
          <button type="button" class="icon-btn" id="fsClose" aria-label="Close fullscreen">✕</button>
        </div>
      </div>
      <div class="fs-stage" id="fsStage">
        <div class="fs-zoom" id="fsZoom">
          <img id="fsPlain" draggable="false" class="${startLines ? "hidden" : ""}" src="${esc(imgSrc(c, false, v))}" alt="">
          <img id="fsLines" draggable="false" class="${startLines ? "" : "hidden"}" src="${esc(imgSrc(c, true, v))}" alt="">
        </div>
      </div>`;
    document.body.appendChild(back);
    lockScroll();

    let lines = !!startLines;
    const plain = back.querySelector("#fsPlain");
    const linesImg = back.querySelector("#fsLines");
    const toggle = back.querySelector("#fsToggle");
    if (toggle) toggle.addEventListener("click", () => {
      lines = !lines;
      plain.classList.toggle("hidden", lines);
      linesImg.classList.toggle("hidden", !lines);
      toggle.textContent = lines ? "Hide lines" : "Show lines";
    });

    // --- zoom + pan: buttons (desktop), wheel-to-cursor (desktop), pinch + drag (any)
    const stage = back.querySelector("#fsStage");
    const zoom = back.querySelector("#fsZoom");
    let scale = 1, tx = 0, ty = 0;
    const clamp = (s) => Math.max(1, Math.min(6, s));
    function apply() {
      zoom.style.transform = (scale === 1 && tx === 0 && ty === 0)
        ? "none" : `translate(${tx}px, ${ty}px) scale(${scale})`;
      stage.classList.toggle("zoomed", scale > 1);
    }
    // Zoom about a screen point (cx,cy) so that point stays put.
    function zoomAt(cx, cy, s1) {
      const rect = stage.getBoundingClientRect();
      s1 = clamp(s1);
      if (s1 === scale) return;
      const dx = (cx - rect.left) - rect.width / 2;
      const dy = (cy - rect.top) - rect.height / 2;
      tx = dx - s1 * (dx - tx) / scale;
      ty = dy - s1 * (dy - ty) / scale;
      scale = s1;
      if (scale === 1) { tx = 0; ty = 0; }
      apply();
    }
    function zoomBy(cx, cy, factor) { zoomAt(cx, cy, scale * factor); }
    function reset() { scale = 1; tx = 0; ty = 0; apply(); }
    function zoomCenter(s1) { const r = stage.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, s1); }

    back.querySelector("#fsIn").addEventListener("click", () => zoomCenter(scale * 1.3));
    back.querySelector("#fsOut").addEventListener("click", () => zoomCenter(scale / 1.3));
    back.querySelector("#fsFit").addEventListener("click", reset);
    stage.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
    stage.addEventListener("dblclick", (e) => { e.preventDefault(); if (scale > 1) reset(); else zoomAt(e.clientX, e.clientY, 2); });

    // Unified pointer handling: mouse drag + touch pinch/pan (incremental, so
    // zoom-out tracks fingers regardless of how the pinch started).
    const pts = new Map();
    let pinchLast = null, panLast = null, lastTap = 0;
    const distOf = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    stage.addEventListener("pointerdown", (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { stage.setPointerCapture(e.pointerId); } catch (err) { }
      zoom.classList.add("dragging");
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinchLast = { d: distOf(a, b), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        panLast = null;
      } else if (pts.size === 1) {
        panLast = { x: e.clientX, y: e.clientY };
        // double-tap (touch) to reset zoom
        if (e.pointerType === "touch") {
          const now = Date.now();
          if (now - lastTap < 320) { reset(); lastTap = 0; } else lastTap = now;
        }
        if (scale > 1) e.preventDefault();
      }
    });
    stage.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2 && pinchLast) {
        const [a, b] = [...pts.values()];
        const cd = distOf(a, b), cmx = (a.x + b.x) / 2, cmy = (a.y + b.y) / 2;
        tx += cmx - pinchLast.mx; ty += cmy - pinchLast.my;      // two-finger pan
        if (pinchLast.d > 0) zoomBy(cmx, cmy, cd / pinchLast.d);  // incremental zoom
        pinchLast = { d: cd, mx: cmx, my: cmy };
      } else if (pts.size === 1 && scale > 1 && panLast) {
        const p = [...pts.values()][0];
        tx += p.x - panLast.x; ty += p.y - panLast.y;
        panLast = { x: p.x, y: p.y };
        apply();
      }
    });
    function liftPointer(e) {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinchLast = null;
      if (pts.size === 1) { const p = [...pts.values()][0]; panLast = { x: p.x, y: p.y }; }
      if (pts.size === 0) { panLast = null; zoom.classList.remove("dragging"); }
    }
    stage.addEventListener("pointerup", liftPointer);
    stage.addEventListener("pointercancel", liftPointer);

    function close() { back.remove(); unlockScroll(); document.removeEventListener("keydown", onKey); }
    function onKey(e) {
      if (e.key === "Escape") close();
      else if (e.key === "+" || e.key === "=") zoomCenter(scale * 1.3);
      else if (e.key === "-" || e.key === "_") zoomCenter(scale / 1.3);
      else if (e.key === "0") { scale = 1; tx = 0; ty = 0; apply(); }
    }
    back.querySelector("#fsClose").addEventListener("click", close);
    document.addEventListener("keydown", onKey);
  }

  /* ================================================================== HOME */
  function viewHome() {
    const list = activeData(), o = overall(), count = list.length;
    app.innerHTML = `
      <section class="frontispiece">
        <p class="plate-tag">Astronomy 131</p>
        <h1 class="title">Constellation Trainer</h1>
        <p class="subtitle"></p>
        ${STARRULE}
        <p class="dim" style="max-width:44ch;margin:0 auto">Based on the regions and celestial bodies covered during our ASTR-131 planetarium sessions.</p>
        <div class="hero-actions">
          <a class="btn primary" href="#/quiz">Begin a quiz</a>
          <a class="btn ghost" href="#/browse">Open the atlas</a>
          <a class="btn ghost" href="#/guide">Quick Start</a>
        </div>
        <div class="ledger">
          <span><b>${count}</b> charted</span><span class="sep">·</span>
          <span><b>${o.quizzes}</b> quizzes</span><span class="sep">·</span>
          <span>accuracy <b>${o.accuracy}%</b></span><span class="sep">·</span>
          <span>best streak <b>${o.bestStreak}</b></span>
        </div>
      </section>
      ${count === 0 ? emptyDatasetHTML() : ""}`;
  }

  /* ============================================================== QUICK START */
  function viewGuide() {
    app.innerHTML = `
      <div class="section-head"><p class="eyebrow">Quick Start</p><h2>How to use the trainer</h2></div>
      <div class="stage guide">
        <section class="panel guide-sec">
          <h3>Quiz</h3>
          <p>You're shown a constellation's stars with no lines drawn; identify it, then the lined version is revealed so you can check yourself. Both the <b>order of the constellations</b> and <b>which photo</b> of each one you see are randomized every run - so you learn the shape, not one picture.</p>
          <p class="guide-lbl">Answering a question</p>
          <p>Type in the search box to filter, then pick a name from the list (beside the image on desktop, below it on mobile). If what you type <b>exactly matches</b> a name it's selected automatically - just press Enter. Otherwise click a name and hit <b>Check answer</b>. After the reveal, press <b>Next chart</b>.</p>
          <p class="guide-lbl">Which constellations?</p>
          <ul>
            <li><b>All</b> - every loaded constellation.</li>
            <li><b>A single week</b> - pick one week; only that week's constellations are shown and offered as answers.</li>
            <li><b>Everything through a week</b> - cumulative review, up to and including the week you choose.</li>
            <li><b>In the red</b> - only your weak spots (the red rows on Stats). A second menu chooses whether the answer choices are <b>only the red ones</b> or <b>all constellations</b>.</li>
            <li><b>My favorites</b> - only constellations you've starred. Like "In the red", you can set the answer choices to <b>only your favorites</b> or <b>all constellations</b>.</li>
          </ul>
          <p class="guide-lbl">Pausing &amp; ending</p>
          <p>Your quiz is saved as you go. Leave and come back and you'll be offered <b>Resume</b> or start fresh (starting a new one warns you first, since it replaces the saved one). <b>End quiz</b> - next to Check answer - stops early and jumps straight to your results for what you answered.</p>
        </section>

        <section class="panel guide-sec">
          <h3>Atlas</h3>
          <p>A searchable, sortable grid of every constellation. Hover a card on desktop to preview it; open one for the full view.</p>
          <ul>
            <li><b>Tags</b> under each card show its week, abbreviation, hemisphere, observation location, and coordinates.</li>
            <li>Tap the <b>☆ star</b> (on a card or inside the open card) to add/remove a <b>favorite</b>. The <b>Favorites</b> button filters the grid to just those, and they power the "My favorites" quiz.</li>
            <li><b>Sort</b> by name, week, or location (each ascending/descending); your choice is remembered.</li>
            <li><b>Show constellation lines</b> toggles the figure over the stars, and the <b>lat / lon</b> tag opens that spot on a map.</li>
            <li>The <b>‹ ›</b> arrows move between constellations without closing; arrows on the image flip between alternate <b>photos</b> when there's more than one.</li>
            <li>The <b>⛶ fullscreen</b> button opens a large view where you can <b>zoom and pan</b> - scroll wheel and drag, or the <b>+ / − and reset</b> buttons on desktop; pinch and drag (double-tap to reset) on mobile - and toggle the lines.</li>
          </ul>
        </section>

        <section class="panel guide-sec">
          <h3>Stats</h3>
          <ul>
            <li>Click any <b>column header</b> to sort (click again to reverse - an arrow marks the active column). On mobile use the <b>Sort by</b> menu. Your sort is remembered.</li>
            <li>A row turns <b>red</b> when it's a trouble spot: never answered correctly, or seen at least twice with accuracy under 70%. These feed the quiz's <b>In the red</b> set.</li>
            <li><b>Progress over time</b> charts your accuracy across recent quizzes so you can see whether you're improving.</li>
            <li><b>Reset all data</b> permanently erases your quiz history, accuracy, and streaks from this browser. There's no undo. (Your favorites and settings are kept.)</li>
          </ul>
        </section>

        <section class="panel guide-sec">
          <h3>Good to know</h3>
          <ul>
            <li>Use the <b>sun / moon</b> button in the top bar to switch between <b>light and dark mode</b>; your choice sticks.</li>
            <li>Everything - scores, favorites, settings, the in-progress quiz - is saved only in <b>this browser</b>, so your phone and laptop keep separate progress.</li>
          </ul>
        </section>

        <div class="center mt-lg"><a class="btn primary" href="#/quiz">Start a quiz</a></div>
      </div>`;
  }

  /* ================================================================== QUIZ */
  let quiz = null;

  function saveQuiz() {
    if (!quiz) return;
    save(KEY.quizState, {
      orderSlugs: quiz.order.map((c) => c.slug),
      versions: quiz.versions,
      optionSlugs: quiz.options.map((c) => c.slug),
      pos: quiz.pos, correctCount: quiz.correctCount, answers: quiz.answers,
      streak: quiz.streak, bestStreakRun: quiz.bestStreakRun,
      label: quiz.label, answered: quiz.answered, ts: Date.now(),
    });
  }
  function clearQuiz() { del(KEY.quizState); }
  function savedQuizExists() { return !!load(KEY.quizState, null); }

  function resumeQuiz() {
    const st = load(KEY.quizState, null);
    if (!st) { viewQuizSetup(); return; }
    const list = activeData(), bySlug = Object.fromEntries(list.map((c) => [c.slug, c]));
    const order = (st.orderSlugs || []).map((s) => bySlug[s]).filter(Boolean);
    if (order.length === 0) { clearQuiz(); viewQuizSetup(); return; }
    const options = (st.optionSlugs || []).map((s) => bySlug[s]).filter(Boolean);
    const versions = (st.versions && st.versions.length === (st.orderSlugs || []).length)
      ? st.versions : order.map((c) => randVersion(c));
    quiz = {
      order, versions,
      options: options.length ? options : order.slice().sort((a, b) => a.name.localeCompare(b.name)),
      pos: Math.min(st.pos || 0, order.length - 1),
      correctCount: st.correctCount || 0, answers: st.answers || [],
      streak: st.streak || 0, bestStreakRun: st.bestStreakRun || 0,
      label: st.label || "resumed", answered: false, selected: null,
    };
    renderQuestion();
    if (st.answered) revealCurrent();
  }

  function endQuiz() {
    if (!quiz) return;
    if (!confirm("End this quiz now? You'll see results for the questions you've answered.")) return;
    if (quiz.answers.length === 0) { clearQuiz(); quiz = null; toast("Quiz ended."); viewQuizSetup(); return; }
    finishQuiz();
  }

  function viewQuizSetup() {
    const list = activeData();
    if (list.length === 0) { app.innerHTML = `<div class="section-head"><p class="eyebrow">Quiz</p><h2>Nothing to quiz yet</h2></div>${emptyDatasetHTML()}`; return; }
    const weeks = weeksOf(list);
    const reds = redSlugs().filter((s) => list.some((c) => c.slug === s));
    const favs = getFavs().filter((s) => list.some((c) => c.slug === s));
    const inProg = load(KEY.quizState, null);
    const resumeCard = inProg ? `
      <div class="stage" style="margin-bottom:18px"><div class="panel resume-card">
        <div><p class="eyebrow" style="text-align:left;margin:0 0 4px">Quiz in progress</p>
          <p style="margin:0" class="dim">You answered <b>${(inProg.answers || []).length}</b> of <b>${(inProg.orderSlugs || []).length}</b> · ${esc(inProg.label || "")}</p></div>
        <div class="row-gap" style="margin-top:12px">
          <button class="btn primary" id="resumeBtn">Resume quiz</button>
          <button class="btn ghost small danger" id="discardBtn">Discard</button>
        </div>
      </div></div>` : "";

    app.innerHTML = `
      <div class="section-head"><h2>Celestial Quiz</h2><p class="eyebrow">I believe in you</p></div>
      ${resumeCard}
      <div class="stage">
        <div class="panel">
          ${inProg ? `<p class="eyebrow" style="text-align:left">Start a new quiz</p>` : ""}
          <label class="field">
            <span class="lbl">Which constellations?</span>
            <select id="setType">
              <option value="all">All (${list.length})</option>
              ${weeks.length ? `<option value="week">A single week</option>` : ""}
              ${weeks.length ? `<option value="through">Everything through a week</option>` : ""}
              ${reds.length ? `<option value="red">In the red (${reds.length})</option>` : ""}
              ${favs.length ? `<option value="favorites">My favorites (${favs.length})</option>` : ""}
            </select>
          </label>
          <label class="field" id="weekWrap" hidden>
            <span class="lbl">Week</span>
            <select id="weekSel">${weeks.map((w) => `<option value="${w}">Week ${w}</option>`).join("")}</select>
          </label>
          <label class="field" id="redScopeWrap" hidden>
            <span class="lbl">Answer options</span>
            <select id="redScope">
              <option value="only">Only the red constellations</option>
              <option value="all">All constellations</option>
            </select>
          </label>
          <label class="field" id="favScopeWrap" hidden>
            <span class="lbl">Answer options</span>
            <select id="favScope">
              <option value="only">Only my favorites</option>
              <option value="all">All constellations</option>
            </select>
          </label>
          <p class="faint" style="font-size:.85rem;margin:2px 0 18px">Both the order and constellation images are randomized on each run.</p>
          <button class="btn primary" id="startBtn" style="width:100%">Begin</button>
        </div>
      </div>`;

    const setType = document.getElementById("setType");
    const weekWrap = document.getElementById("weekWrap");
    const redScopeWrap = document.getElementById("redScopeWrap");
    const favScopeWrap = document.getElementById("favScopeWrap");
    function syncOpts() {
      weekWrap.hidden = !(setType.value === "week" || setType.value === "through");
      redScopeWrap.hidden = setType.value !== "red";
      favScopeWrap.hidden = setType.value !== "favorites";
    }
    syncOpts();
    setType.addEventListener("change", syncOpts);
    if (inProg) {
      document.getElementById("resumeBtn").addEventListener("click", resumeQuiz);
      document.getElementById("discardBtn").addEventListener("click", () => {
        if (confirm("Discard your quiz in progress?")) { clearQuiz(); toast("Quiz discarded."); viewQuizSetup(); }
      });
    }
    document.getElementById("startBtn").addEventListener("click", () => {
      if (savedQuizExists() && !confirm("Start a new quiz? This overwrites your quiz in progress.")) return;
      startQuiz(setType.value, document.getElementById("weekSel")?.value, document.getElementById("redScope")?.value, document.getElementById("favScope")?.value);
    });
    enhanceSelects(app);
  }

  async function startQuiz(setType, week, redScope, favScope) {
    const list = activeData();
    let pool, label = "all", options = null;
    if (setType === "week") { pool = list.filter((c) => c.week === Number(week)); label = "week " + week; }
    else if (setType === "through") { pool = list.filter((c) => Number.isFinite(c.week) && c.week <= Number(week)); label = "through week " + week; }
    else if (setType === "red") {
      const m = new Set(redSlugs()); pool = list.filter((c) => m.has(c.slug)); label = "in the red";
      if (redScope === "all") options = list; // answer choices span everything
    }
    else if (setType === "favorites") {
      const m = new Set(getFavs()); pool = list.filter((c) => m.has(c.slug)); label = "favorites";
      if (favScope === "all") options = list;
    }
    else { pool = list.slice(); }
    if (!pool || pool.length === 0) { toast("No constellations in that set."); return; }
    await Promise.all(pool.map((c) => detectVersions(c)));
    const optList = (options || pool).slice().sort((a, b) => a.name.localeCompare(b.name));
    const order = shuffle(pool);
    quiz = { order, versions: order.map((c) => randVersion(c)), pos: 0, correctCount: 0, answers: [], answered: false, streak: 0, bestStreakRun: 0, selected: null, label, options: optList };
    saveQuiz();
    renderQuestion();
  }

  function renderQuestion() {
    const q = quiz, total = q.order.length, c = q.order[q.pos];
    const pct = Math.round((q.pos / total) * 100);
    q.selected = null; q.answered = false;
    q.version = (q.versions && q.versions[q.pos]) || randVersion(c);
    const desktop = window.matchMedia ? window.matchMedia("(min-width: 760px)").matches : true;
    q.mode = "picker";

    const head = `
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="qmeta">
        <span>Chart <span class="mono">${q.pos + 1}</span> of <span class="mono">${total}</span></span>
        <span>Streak <span class="mono">${q.streak}</span> · Correct <span class="mono">${q.correctCount}</span></span>
      </div>`;
    const picker = `
      <div class="picker" data-picker>
        <input id="pickSearch" class="picker-search" type="text" placeholder="Search constellations…" autocomplete="off" spellcheck="false">
        <div class="picker-list" id="pickList" role="listbox" aria-label="Choose the constellation"></div>
      </div>`;
    const submitBtn = `<div class="answer-row">
        <button class="btn primary grow" id="submit" disabled>Check answer</button>
        <button type="button" class="btn ghost end-quiz" id="endQuiz">End quiz</button>
      </div>`;

    if (desktop) {
      app.innerHTML = `
        <div class="stage stage-wide">
          ${head}
          <div class="quiz-desktop">
            ${picker}
            <div class="quiz-main">
              ${frameHTML(c, { badge: "Stars only - no lines", allowToggle: false, version: q.version })}
              ${submitBtn}
              <div id="feedback"></div>
            </div>
          </div>
        </div>`;
    } else {
      app.innerHTML = `
        <div class="stage">
          ${head}
          ${frameHTML(c, { badge: "Stars only - no lines", allowToggle: false, version: q.version })}
          ${picker}
          ${submitBtn}
          <div id="feedback"></div>
        </div>`;
    }
    wireFrame(app);
    setupPicker(desktop);
    document.getElementById("endQuiz")?.addEventListener("click", endQuiz);
    saveQuiz();
  }

  // Answer picker: a searchable list of every constellation in the set.
  function setupPicker(desktop) {
    const q = quiz;
    const search = document.getElementById("pickSearch");
    const listEl = document.getElementById("pickList");
    const submit = document.getElementById("submit");

    function render() {
      const t = search.value.trim().toLowerCase();
      const items = t ? q.options.filter((o) => o.name.toLowerCase().includes(t)) : q.options;
      listEl.innerHTML = items.map((o) =>
        `<button type="button" class="picker-item ${o.slug === q.selected ? "sel" : ""}" role="option"
           aria-selected="${o.slug === q.selected}" data-slug="${esc(o.slug)}">${esc(o.name)}</button>`).join("")
        || `<p class="dim" style="grid-column:1/-1;margin:6px 2px">No matches.</p>`;
      listEl.querySelectorAll(".picker-item").forEach((btn) => {
        btn.addEventListener("click", () => select(btn.dataset.slug));
        btn.addEventListener("dblclick", () => { select(btn.dataset.slug); onSubmit(); });
      });
      // exact typed name auto-selects, no click needed
      const exact = q.options.find((o) => o.name.toLowerCase() === t);
      if (exact) select(exact.slug);
    }
    function select(slug) {
      q.selected = slug;
      submit.disabled = false;
      listEl.querySelectorAll(".picker-item").forEach((b) => {
        const on = b.dataset.slug === slug;
        b.classList.toggle("sel", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
    }
    search.addEventListener("input", render);
    search.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const t = search.value.trim().toLowerCase();
      const items = t ? q.options.filter((o) => o.name.toLowerCase().includes(t)) : q.options;
      if (q.selected && (!t || items.some((o) => o.slug === q.selected))) { onSubmit(); return; }
      if (items.length) { select(items[0].slug); if (items.length === 1) onSubmit(); }
    });
    submit.addEventListener("click", onSubmit);
    render();
    if (desktop) search.focus();
  }

  function setupCombo() {
    const q = quiz;
    const input = document.getElementById("answerInput");
    const listEl = document.getElementById("answerList");
    const submit = document.getElementById("submit");
    let filtered = q.options.slice(), active = -1, open = false;

    function compute() { const t = input.value.trim().toLowerCase(); filtered = t ? q.options.filter((o) => o.name.toLowerCase().includes(t)) : q.options.slice(); }
    function autoSelect() {
      const t = input.value.trim().toLowerCase();
      let sel = q.options.find((o) => o.name.toLowerCase() === t);
      if (!sel && t && filtered.length === 1) sel = filtered[0];
      q.selected = sel ? sel.slug : null; submit.disabled = !q.selected;
    }
    function draw() {
      if (!open || filtered.length === 0) { listEl.hidden = true; input.setAttribute("aria-expanded", "false"); return; }
      listEl.hidden = false; input.setAttribute("aria-expanded", "true");
      listEl.innerHTML = filtered.map((o, i) =>
        `<li role="option" data-slug="${esc(o.slug)}" aria-selected="${o.slug === q.selected}" class="${i === active ? "active" : ""} ${o.slug === q.selected ? "sel" : ""}">${esc(o.name)}</li>`).join("");
      const act = listEl.querySelector("li.active"); if (act && act.scrollIntoView) act.scrollIntoView({ block: "nearest" });
    }
    function openMenu() { open = true; compute(); if (active >= filtered.length) active = filtered.length - 1; draw(); }
    function closeMenu() { open = false; listEl.hidden = true; input.setAttribute("aria-expanded", "false"); }
    function choose(o) { q.selected = o.slug; input.value = o.name; submit.disabled = false; closeMenu(); }

    input.addEventListener("focus", openMenu);
    input.addEventListener("input", () => { open = true; compute(); active = filtered.length ? 0 : -1; autoSelect(); draw(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); if (!open) openMenu(); active = Math.min(active + 1, filtered.length - 1); draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (!open) openMenu(); active = Math.max(active - 1, 0); draw(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (open && active >= 0 && filtered[active] && filtered[active].name.toLowerCase() !== input.value.trim().toLowerCase()) choose(filtered[active]);
        else if (q.selected) onSubmit();
        else if (open && active >= 0) choose(filtered[active]);
      } else if (e.key === "Escape") closeMenu();
    });
    listEl.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li[data-slug]"); if (!li) return;
      e.preventDefault();
      const o = q.options.find((x) => x.slug === li.dataset.slug); if (o) { choose(o); input.focus(); }
    });
    input.addEventListener("blur", () => setTimeout(closeMenu, 120));
    submit.addEventListener("click", onSubmit);
    input.focus();
  }

  function revealCurrent() {
    const q = quiz, c = q.order[q.pos];
    const ans = q.answers[q.pos]; if (!ans) return;
    const ok = ans.ok, chosen = ans.chosen;
    q.answered = true;

    const frame = app.querySelector("[data-frame]");
    if (frame) {
      frame.querySelector('[data-img="plain"]').classList.add("hidden");
      frame.querySelector('[data-img="lines"]').classList.remove("hidden");
      frame.setAttribute("data-allowtoggle", "true"); // fullscreen may now compare
      const badge = frame.querySelector("[data-badge]"); if (badge) badge.textContent = "Lines revealed";
    }
    const input = document.getElementById("answerInput"); if (input) input.disabled = true;
    document.getElementById("answerList")?.setAttribute("hidden", "");
    const pickSearch = document.getElementById("pickSearch"); if (pickSearch) pickSearch.disabled = true;
    document.querySelector("[data-picker]")?.classList.add("locked");
    const submit = document.getElementById("submit"); if (submit) { submit.disabled = true; submit.style.display = "none"; }

    const chosenName = q.options.find((o) => o.slug === chosen)?.name || "-";
    const isLast = q.pos + 1 >= q.order.length;
    document.getElementById("feedback").innerHTML = `
      <div class="verdict ${ok ? "correct" : "wrong"}">
        <div class="vicon">${ok ? "✓" : "✕"}</div>
        <div class="vtext">
          ${ok ? `<b>Correct.</b> That's <b>${esc(c.name)}</b>.`
        : `<b>Not quite.</b> You chose ${esc(chosenName)} - this is <b>${esc(c.name)}</b>.`}
          ${c.notes ? `<div class="dim" style="font-size:.9rem;margin-top:4px">${esc(c.notes)}</div>` : ""}
        </div>
      </div>
      <div class="row-gap mt">
        <button class="btn primary" id="nextBtn">${isLast ? "See results" : "Next chart"}</button>
      </div>`;
    document.getElementById("nextBtn").addEventListener("click", () => { if (isLast) finishQuiz(); else { q.pos++; renderQuestion(); } });
    document.getElementById("nextBtn").focus();
  }

  function onSubmit() {
    const q = quiz;
    if (q.answered || !q.selected) return;
    const c = q.order[q.pos], chosen = q.selected;
    const ok = chosen === c.slug;
    recordAnswer(c.slug, ok);
    if (ok) { q.correctCount++; q.streak++; if (q.streak > q.bestStreakRun) q.bestStreakRun = q.streak; } else q.streak = 0;
    q.answers.push({ slug: c.slug, chosen, ok });
    revealCurrent();
    saveQuiz();
  }

  function finishQuiz() {
    const q = quiz, full = q.order.length, total = q.answers.length;
    const partial = total < full;
    clearQuiz();
    recordQuiz({ ts: Date.now(), set: q.label, total, correct: q.correctCount }, q.bestStreakRun);
    const pct = total ? Math.round((q.correctCount / total) * 100) : 0;
    const misses = q.answers.filter((a) => !a.ok);
    const byslug = Object.fromEntries(activeData().map((c) => [c.slug, c]));

    app.innerHTML = `
      <div class="section-head"><p class="eyebrow">Results · ${esc(q.label)}${partial ? " · ended early" : ""}</p><h2>${partial ? "Quiz ended" : "Quiz complete"}</h2></div>
      <div class="stage">
        <div class="panel">
          <div class="summary-score">
            <div class="big">${pct}<small>%</small></div>
            <div class="dim mono" style="margin-top:6px">${q.correctCount} / ${total} correct${partial ? ` · ${total} of ${full} answered` : ""} · best streak ${q.bestStreakRun}</div>
          </div>
          ${misses.length === 0
        ? `<p class="center" style="color:var(--verdigris-d);font-family:var(--ff-display);font-weight:600;font-size:1.3rem">A perfect run! The sky is yours.</p>`
        : `<p class="eyebrow" style="text-align:left">Missed (${misses.length})</p>
               <div class="miss-list">
                 ${misses.map((a) => {
          const c = byslug[a.slug]; if (!c) return "";
          const yours = q.options.find((o) => o.slug === a.chosen)?.name || "-";
          return `<div class="miss-item"><img src="${esc(imgSrc(c, true))}" alt="">
                     <div><div class="mi-name">${esc(c.name)}</div><div class="mi-yours">you said: ${esc(yours)}</div></div></div>`;
        }).join("")}
               </div>`}
          <div class="row-gap mt-lg" style="justify-content:center">
            <button class="btn primary" id="again">New quiz</button>
            ${misses.length ? `<button class="btn gold" id="retryMiss">Retry these misses</button>` : ""}
            <a class="btn ghost" href="#/stats">View stats</a>
          </div>
        </div>
      </div>`;
    document.getElementById("again").addEventListener("click", viewQuizSetup);
    const rm = document.getElementById("retryMiss");
    if (rm) rm.addEventListener("click", () => {
      const set = new Set(misses.map((m) => m.slug));
      const pool = activeData().filter((c) => set.has(c.slug));
      const order = shuffle(pool);
      quiz = { order, versions: order.map((c) => randVersion(c)), pos: 0, correctCount: 0, answers: [], answered: false, streak: 0, bestStreakRun: 0, selected: null, label: "retry misses", options: pool.slice().sort((a, b) => a.name.localeCompare(b.name)) };
      saveQuiz();
      renderQuestion();
    });
  }

  /* ================================================================ BROWSE */
  function viewBrowse() {
    const list = activeData();
    if (list.length === 0) { app.innerHTML = `<div class="section-head"><p class="eyebrow">Atlas</p><h2>Nothing to show yet</h2></div>${emptyDatasetHTML()}`; return; }
    const weeks = weeksOf(list);
    app.innerHTML = `
      <div class="section-head"><h2>The Atlas</h2><p class="eyebrow">Browse the night sky</p>
        </div>
      <div class="toolbar">
        <input type="text" id="search" class="grow" placeholder="Search by name…" autocomplete="off" style="max-width:320px">
        ${weeks.length ? `<select id="weekFilter" style="max-width:180px">
          <option value="">All weeks</option>${weeks.map((w) => `<option value="${w}">Week ${w}</option>`).join("")}</select>` : ""}
        <select id="sortSel" style="max-width:210px">
          <option value="name:1">Sort · Name (A–Z)</option>
          <option value="name:-1">Sort · Name (Z–A)</option>
          <option value="week:1">Sort · Week (earliest)</option>
          <option value="week:-1">Sort · Week (latest)</option>
          <option value="loc:1">Sort · Location (A–Z)</option>
          <option value="loc:-1">Sort · Location (Z–A)</option>
        </select>
        <button type="button" id="favFilter" class="btn ghost small fav-filter" aria-pressed="false">${STAR_OUTLINE}<span>Favorites</span></button>
      <span class="faint mono" id="browseCount" style="font-size:.8rem"></span>
          </div>
      <div class="grid" id="grid"></div>`;

    const grid = document.getElementById("grid");
    const search = document.getElementById("search");
    const weekFilter = document.getElementById("weekFilter");
    const sortSel = document.getElementById("sortSel");
    const favFilter = document.getElementById("favFilter");
    const countEl = document.getElementById("browseCount");
    let favOnly = false;
    const savedSort = load(KEY.atlasSort, { key: "name", dir: 1 });
    let sortKey = savedSort.key || "name", sortDir = savedSort.dir || 1;
    sortSel.value = `${sortKey}:${sortDir}`;

    function sortList(arr) {
      const byName = (a, b) => a.name.localeCompare(b.name);
      return arr.slice().sort((a, b) => {
        if (sortKey === "week") {
          const am = !Number.isFinite(a.week), bm = !Number.isFinite(b.week);
          if (am && !bm) return 1; if (!am && bm) return -1; if (am && bm) return byName(a, b);
          return sortDir * (a.week - b.week) || byName(a, b);
        }
        if (sortKey === "loc") {
          const al = (a.location || "").toLowerCase(), bl = (b.location || "").toLowerCase();
          if (!al && bl) return 1; if (al && !bl) return -1;
          return sortDir * al.localeCompare(bl) || byName(a, b); // grouped by location, then A–Z
        }
        return sortDir * byName(a, b);
      });
    }

    function render() {
      const term = (search.value || "").toLowerCase();
      const wk = weekFilter ? weekFilter.value : "";
      const favSet = new Set(getFavs());
      const filtered = sortList(list.filter((c) =>
        (!term || c.name.toLowerCase().includes(term)) &&
        (!wk || String(c.week) === wk) &&
        (!favOnly || favSet.has(c.slug))));
      countEl.textContent = `${filtered.length} ${filtered.length === 1 ? "constellation" : "constellations"} shown`;
      const siblings = filtered.map((c) => c.slug);
      grid.innerHTML = filtered.map((c) => `
        <div class="card" role="button" tabindex="0" data-slug="${esc(c.slug)}">
          <div class="thumb">
            <img class="thumb-plain" loading="lazy" src="${esc(imgSrc(c, false, 1))}" alt="${esc(c.name)}">
            <img class="thumb-hover" loading="lazy" src="${esc(imgHover(c, 1))}" onerror="this.onerror=null;this.src='${esc(imgSrc(c, false, 1))}'" alt="">
            <button type="button" class="card-fav ${isFav(c.slug) ? "on" : ""}" data-cardfav aria-label="Toggle favorite" aria-pressed="${isFav(c.slug)}">${isFav(c.slug) ? STAR_FILLED : STAR_OUTLINE}</button>
            <button type="button" class="card-fs" data-cardfs aria-label="View ${esc(c.name)} fullscreen" title="Fullscreen">${FS_ICON}</button>
          </div>
          <div class="cbody"><span class="cname">${esc(c.name)}</span>
            ${Number.isFinite(c.week) ? `<span class="tag">Wk ${c.week}</span>` : ""}</div>
        </div>`).join("") || `<p class="dim">${favOnly ? "No favorites yet - tap the ☆ on a card to add one." : "No matches."}</p>`;
      grid.querySelectorAll(".card").forEach((el) => {
        el.addEventListener("click", () => openDetail(el.dataset.slug, siblings, render));
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(el.dataset.slug, siblings, render); } });
        const fs = el.querySelector("[data-cardfs]");
        if (fs) fs.addEventListener("click", (e) => { e.stopPropagation(); openFullscreen(el.dataset.slug, true, true, 1); });
        const fav = el.querySelector("[data-cardfav]");
        if (fav) fav.addEventListener("click", (e) => {
          e.stopPropagation();
          const on = toggleFav(el.dataset.slug);
          fav.classList.toggle("on", on); fav.setAttribute("aria-pressed", on); fav.innerHTML = on ? STAR_FILLED : STAR_OUTLINE;
          if (favOnly) render();
        });
      });
    }
    search.addEventListener("input", render);
    if (weekFilter) weekFilter.addEventListener("change", render);
    sortSel.addEventListener("change", (e) => { const [k, d] = e.target.value.split(":"); sortKey = k; sortDir = Number(d); save(KEY.atlasSort, { key: sortKey, dir: sortDir }); render(); });
    favFilter.addEventListener("click", () => { favOnly = !favOnly; favFilter.classList.toggle("active", favOnly); favFilter.setAttribute("aria-pressed", favOnly); render(); });
    render();
    enhanceSelects(app);
  }

  function openDetail(slug, siblings, onFavChange) {
    const list = activeData();
    if (!siblings || !siblings.length) siblings = list.map((x) => x.slug);
    let idx = Math.max(0, siblings.indexOf(slug));

    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `
      <button type="button" class="modal-nav prev" data-nav="-1" aria-label="Previous constellation">‹</button>
      <div class="modal wide" role="dialog" aria-modal="true" id="detailModal"></div>
      <button type="button" class="modal-nav next" data-nav="1" aria-label="Next constellation">›</button>`;
    document.body.appendChild(back);
    lockScroll();
    const modal = back.querySelector("#detailModal");

    function chipHTML(c) {
      const chips = [];
      if (Number.isFinite(c.week)) chips.push(`<span class="chip">Week <b>${c.week}</b></span>`);
      if (c.abbr) chips.push(`<span class="chip">Abbr <b>${esc(c.abbr)}</b></span>`);
      if (c.hemisphere) chips.push(`<span class="chip">${esc(c.hemisphere)}</span>`);
      if (c.location) chips.push(`<span class="chip">Observed · <b>${esc(c.location)}</b></span>`);
      if (Number.isFinite(c.lat) && Number.isFinite(c.lon))
        chips.push(`<a class="chip" href="${esc(osmLink(c.lat, c.lon))}" target="_blank" rel="noopener">${fmtLat(c.lat)}, ${fmtLon(c.lon)} ↗</a>`);
      return chips;
    }

    function render() {
      const c = list.find((x) => x.slug === siblings[idx]);
      if (!c) return;
      const chips = chipHTML(c);
      // Render content synchronously (no flash); photo arrows are added after
      // versions are detected asynchronously.
      modal.innerHTML = `
        <div class="modal-head"><h3>${esc(c.name)}</h3>
          <div class="row-gap" style="gap:8px">
            <button class="icon-btn detail-fav ${isFav(c.slug) ? "on" : ""}" data-detailfav aria-label="Toggle favorite" aria-pressed="${isFav(c.slug)}">${isFav(c.slug) ? STAR_FILLED : STAR_OUTLINE}</button>
            <button class="icon-btn" data-close aria-label="Close">✕</button>
          </div></div>
        <div class="modal-body">
          <div class="detail-grid">
            <div class="detail-media">
              <div class="dg-frame">${frameHTML(c, { lines: false, badge: "Stars only", allowToggle: true, version: 1 })}</div>
              ${chips.length ? `<div class="detail-chips chips">${chips.join("")}</div>` : ""}
            </div>
            <div class="detail-side">
              <label class="switch detail-toggle"><input type="checkbox" id="lineToggle"><span class="track"></span>
                <span>Show constellation lines</span></label>
              ${c.notes ? `<p class="detail-notes dim">${esc(c.notes)}</p>` : ""}
            </div>
          </div>
        </div>`;
      modal.setAttribute("aria-label", c.name);
      wireFrame(modal);

      const favBtn = modal.querySelector("[data-detailfav]");
      if (favBtn) favBtn.addEventListener("click", () => {
        const on = toggleFav(c.slug);
        favBtn.classList.toggle("on", on); favBtn.setAttribute("aria-pressed", on); favBtn.innerHTML = on ? STAR_FILLED : STAR_OUTLINE;
        if (onFavChange) onFavChange(); // keep the grid behind in sync
      });

      const frame = modal.querySelector("[data-frame]");
      const plain = frame.querySelector('[data-img="plain"]');
      const lines = frame.querySelector('[data-img="lines"]');
      const badge = frame.querySelector("[data-badge]");
      modal.querySelector("#lineToggle").addEventListener("change", (e) => {
        if (e.target.checked) { plain.classList.add("hidden"); lines.classList.remove("hidden"); if (badge) badge.textContent = "With lines"; }
        else { lines.classList.add("hidden"); plain.classList.remove("hidden"); if (badge) badge.textContent = "Stars only"; }
      });
      modal.querySelector("[data-close]").addEventListener("click", close);

      // async: reveal photo (version) arrows once we know the count
      detectVersions(c).then((vc) => {
        if (vc <= 1 || siblings[idx] !== c.slug || !modal.querySelector(".dg-frame")) return;
        const dgFrame = modal.querySelector(".dg-frame");
        dgFrame.insertAdjacentHTML("beforeend", `
          <button type="button" class="photo-nav prev" data-photo="-1" aria-label="Previous photo">‹</button>
          <button type="button" class="photo-nav next" data-photo="1" aria-label="Next photo">›</button>
          <span class="photo-count" data-photocount>1 / ${vc}</span>`);
        let ver = 1;
        const countEl = dgFrame.querySelector("[data-photocount]");
        dgFrame.querySelectorAll("[data-photo]").forEach((btn) => btn.addEventListener("click", () => {
          ver = ((ver - 1 + Number(btn.dataset.photo) + vc) % vc) + 1;
          plain.src = imgSrc(c, false, ver);
          lines.src = imgSrc(c, true, ver);
          frame.setAttribute("data-version", ver);
          if (countEl) countEl.textContent = `${ver} / ${vc}`;
        }));
      });
    }

    function go(step) { idx = (idx + step + siblings.length) % siblings.length; render(); }
    function close() { back.remove(); unlockScroll(); document.removeEventListener("keydown", onKey); }
    function onKey(e) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    }
    back.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => go(Number(b.dataset.nav))));
    back.addEventListener("click", (e) => { if (e.target === back) close(); });
    document.addEventListener("keydown", onKey);
    render();
  }

  /* ================================================================= STATS */
  let statsSort = load(KEY.statsSort, { col: "acc", dir: 1 });
  function progressChartHTML() {
    const hist = (getStats().history || []).filter((h) => h && h.total > 0);
    const pts = hist.slice(-30).map((h) => Math.round((h.correct / h.total) * 100));
    if (pts.length < 2) {
      return `<div class="panel"><p class="eyebrow" style="text-align:left">Progress over time</p>
        <p class="dim" style="margin:0">Take a couple of quizzes and your accuracy trend will show up here.</p></div>`;
    }
    const W = 600, H = 200, padL = 32, padR = 12, padT = 14, padB = 22;
    const iw = W - padL - padR, ih = H - padT - padB, n = pts.length;
    const X = (i) => padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const Y = (v) => padT + (1 - v / 100) * ih;
    const grid = [0, 25, 50, 75, 100].map((v) => {
      const gy = Y(v).toFixed(1);
      return `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" class="pc-grid"/>` +
        (v % 50 === 0 ? `<text x="${padL - 6}" y="${(Y(v) + 3.5).toFixed(1)}" class="pc-lbl" text-anchor="end">${v}</text>` : "");
    }).join("");
    const line = pts.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
    const area = `M${X(0).toFixed(1)} ${(padT + ih).toFixed(1)} ` +
      pts.map((v, i) => `L${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ") +
      ` L${X(n - 1).toFixed(1)} ${(padT + ih).toFixed(1)} Z`;
    const dots = pts.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.6" class="pc-dot"/>`).join("");
    const avg = Math.round(pts.reduce((a, b) => a + b, 0) / n);
    const delta = pts[n - 1] - pts[0];
    return `<div class="panel">
      <p class="eyebrow" style="text-align:left">Progress over time</p>
      <div class="pc-meta dim mono">Last ${n} ${n === 1 ? "quiz" : "quizzes"} · latest ${pts[n - 1]}% · avg ${avg}%${delta !== 0 ? ` · ${delta > 0 ? "▲" : "▼"}${Math.abs(delta)} pts across shown` : ""}</div>
      <svg class="pc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Accuracy over recent quizzes">
        ${grid}
        <path d="${area}" class="pc-area"/>
        <path d="${line}" class="pc-line"/>
        ${dots}
      </svg>
    </div>`;
  }
  function viewStats() {
    const s = getStats(), o = overall(), list = activeData();
    const rows = list.map((c) => {
      const p = s.per[c.slug] || { seen: 0, correct: 0 };
      const acc = p.seen ? Math.round((p.correct / p.seen) * 100) : null;
      return { name: c.name, slug: c.slug, seen: p.seen, correct: p.correct, acc };
    });
    app.innerHTML = `
      <div class="section-head"><h2>Your Progress</h2><p class="eyebrow">Reach for the stars</p>
        </div>
      <div class="metrics">
        <div class="metric"><div class="mnum">${o.quizzes}</div><div class="mlbl">Quizzes taken</div></div>
        <div class="metric"><div class="mnum">${o.questions}</div><div class="mlbl">Questions answered</div></div>
        <div class="metric"><div class="mnum">${o.accuracy}%</div><div class="mlbl">Overall accuracy</div></div>
        <div class="metric"><div class="mnum">${o.bestStreak}</div><div class="mlbl">Best streak</div></div>
      </div>
      <div class="panel">
        <p class="eyebrow" style="text-align:left">Per constellation</p>
        <label class="field stats-sort"><span class="lbl">Sort by</span>
          <select id="statSort">
            <option value="name:1">Name (A–Z)</option>
            <option value="name:-1">Name (Z–A)</option>
            <option value="seen:-1">Seen (most first)</option>
            <option value="seen:1">Seen (fewest first)</option>
            <option value="correct:-1">Correct (most first)</option>
            <option value="correct:1">Correct (fewest first)</option>
            <option value="acc:-1">Accuracy (high to low)</option>
            <option value="acc:1">Accuracy (low to high)</option>
          </select>
        </label>
        <div style="overflow-x:auto">
        <table class="data" id="statTable">
          <thead><tr>
            <th data-col="name">Constellation <span class="sarrow" data-arrow></span></th>
            <th class="num" data-col="seen">Seen <span class="sarrow" data-arrow></span></th>
            <th class="num" data-col="correct">Correct <span class="sarrow" data-arrow></span></th>
            <th class="num" data-col="acc">Accuracy <span class="sarrow" data-arrow></span></th>
          </tr></thead><tbody id="statBody"></tbody>
        </table></div>
        <p class="faint" style="font-size:.8rem;margin-top:12px">Rows tinted red are trouble spots - never answered correctly, or seen at least twice with accuracy under 70%. Click a header (or use Sort by) to reorder.</p>
        <button class="btn ghost small danger" id="resetStats">Reset all data</button>
        </div>
      <div class="mt-lg">${progressChartHTML()}</div>`;

    function markHeaders() {
      app.querySelectorAll("#statTable th").forEach((th) => {
        const active = th.dataset.col === statsSort.col;
        th.classList.toggle("active", active);
        const arrow = th.querySelector("[data-arrow]");
        if (arrow) arrow.textContent = active ? (statsSort.dir === 1 ? "↑" : "↓") : "";
      });
      const sel = document.getElementById("statSort");
      if (sel) sel.value = `${statsSort.col}:${statsSort.dir}`;
    }
    function renderRows() {
      const { col, dir } = statsSort;
      const sorted = rows.slice().sort((a, b) => {
        if (col === "name") return dir * a.name.localeCompare(b.name);
        let av = a[col], bv = b[col];
        if (col === "acc") { av = av == null ? -1 : av; bv = bv == null ? -1 : bv; }
        return dir * (av - bv);
      });
      document.getElementById("statBody").innerHTML = sorted.map((r) => {
        const trouble = r.seen > 0 && (r.correct === 0 || (r.acc != null && r.seen >= 2 && r.acc < 70));
        const accColor = r.acc == null ? "var(--ink-faint)" : r.acc >= 80 ? "var(--verdigris)" : r.acc >= 50 ? "var(--brass)" : "var(--oxblood)";
        return `<tr class="${trouble ? "trouble" : ""}">
          <td class="st-name">${esc(r.name)}</td>
          <td class="num" data-l="Seen">${r.seen}</td>
          <td class="num" data-l="Correct">${r.correct}</td>
          <td class="num st-acc" data-l="Accuracy">${r.acc == null ? "-" : r.acc + "%"}
            <span class="acc-bar"><span style="width:${r.acc || 0}%;background:${accColor}"></span></span></td></tr>`;
      }).join("") || `<tr><td colspan="4" class="dim">No data yet - take a quiz.</td></tr>`;
      markHeaders();
    }
    renderRows();
    app.querySelectorAll("#statTable th").forEach((th) => th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (statsSort.col === col) statsSort.dir *= -1; else statsSort = { col, dir: col === "name" ? 1 : -1 };
      save(KEY.statsSort, statsSort);
      renderRows();
    }));
    document.getElementById("statSort").addEventListener("change", (e) => {
      const [col, dir] = e.target.value.split(":");
      statsSort = { col, dir: Number(dir) };
      save(KEY.statsSort, statsSort);
      renderRows();
    });
    document.getElementById("resetStats").addEventListener("click", () => {
      if (confirm("Erase all quiz history and stats? This can't be undone.")) { del(KEY.stats); toast("Stats cleared."); viewStats(); }
    });
    enhanceSelects(app);
  }

  /* ================================================================ MANAGE */
  function ensureDraft() { let d = load(KEY.draft, null); if (!d) { d = publishedData(); save(KEY.draft, d); } return normalize(d); }
  function setDraft(d) { save(KEY.draft, d); }

  function viewManage() {
    const draft = ensureDraft(), preview = previewOn();
    app.innerHTML = `
      <div class="section-head"><p class="eyebrow">Manage</p><h2>Constellations</h2>
        <button class="btn primary small" id="addBtn">+ Add constellation</button></div>
      <div class="draft-note">
        <span>You're editing a <b>draft</b>, saved in this browser only. To publish for everyone, <b>Export data.js</b> and commit it (with your images) to the repo.</span>
        <label class="switch" style="margin-left:auto"><input type="checkbox" id="previewToggle" ${preview ? "checked" : ""}>
          <span class="track"></span><span>Preview draft in app</span></label>
      </div>
      <div class="toolbar" style="justify-content:flex-start">
        <button class="btn gold small" id="exportBtn">⬇ Export data.js</button>
        <button class="btn ghost small" id="copyBtn">Copy to clipboard</button>
        <button class="btn ghost small" id="resetDraft">Reset to published</button>
      </div>
      <div id="rows"></div>
      <div class="panel mt-lg">
        <p class="eyebrow" style="text-align:left">Naming your images</p>
        <p class="dim" style="font-size:.92rem;margin:0 0 8px">Give each constellation a folder named after its slug, and put photo pairs inside it. For slug <span class="mono">orion</span>:</p>
        <p class="dim mono" style="font-size:.82rem;margin:0;line-height:1.7">
          images/orion/V1.png &nbsp;- photo 1, no lines (also the atlas thumbnail)<br>
          images/orion/V1Lines.png &nbsp;- photo 1, with lines<br>
          images/orion/V1Hover.png &nbsp;- optional custom hover thumbnail<br>
          images/orion/V2.png, V2Lines.png … &nbsp;- extra photos (set "Image versions")
        </p>
        <p class="dim" style="font-size:.88rem;margin:10px 0 0">The badge on each row turns green once V1 and V1Lines load. Extra photos are detected automatically - just drop V2/V2Lines, V3… into the folder (no need to set a count). The quiz shows a random photo each time; the atlas card lets you flip between photos.</p>
      </div>`;
    renderManageRows(draft);
    document.getElementById("addBtn").addEventListener("click", () => openEditor(null));
    document.getElementById("exportBtn").addEventListener("click", () => exportData(draft));
    document.getElementById("copyBtn").addEventListener("click", () => copyData(draft));
    document.getElementById("resetDraft").addEventListener("click", () => { if (confirm("Discard draft edits and reload the published list?")) { del(KEY.draft); toast("Draft reset to published."); viewManage(); } });
    document.getElementById("previewToggle").addEventListener("change", (e) => { save(KEY.preview, e.target.checked); syncPreviewBanner(); toast(e.target.checked ? "Previewing draft." : "Using published data."); });
  }

  function renderManageRows(draft) {
    const rows = document.getElementById("rows");
    if (draft.length === 0) { rows.innerHTML = `<p class="dim">No constellations yet. Click “Add constellation”.</p>`; return; }
    rows.innerHTML = draft.map((c, i) => `
      <div class="manage-row" data-i="${i}">
        <div class="mr-main">
          <span class="imgcheck load" data-check="${esc(c.slug)}">checking…</span>
          <div style="min-width:0">
            <div class="mr-name">${esc(c.name)} ${Number.isFinite(c.week) ? `<span class="tag" style="margin-left:6px">Wk ${c.week}</span>` : ""}</div>
            <div class="mr-slug">${esc(c.slug)}</div>
          </div>
        </div>
        <div class="mr-actions">
          <button class="icon-btn" data-act="up" title="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="icon-btn" data-act="down" title="Move down" ${i === draft.length - 1 ? "disabled" : ""}>↓</button>
          <button class="btn ghost small" data-act="edit">Edit</button>
          <button class="btn ghost small danger" data-act="del">Delete</button>
        </div>
      </div>`).join("");

    rows.querySelectorAll(".manage-row").forEach((row) => {
      const i = Number(row.dataset.i);
      row.querySelectorAll("[data-act]").forEach((btn) => btn.addEventListener("click", () => {
        const act = btn.dataset.act, d = ensureDraft();
        if (act === "edit") return openEditor(i);
        if (act === "del") { if (confirm(`Delete ${d[i].name}? (Images are not removed.)`)) { d.splice(i, 1); setDraft(d); viewManage(); } }
        else if (act === "up" && i > 0) { [d[i - 1], d[i]] = [d[i], d[i - 1]]; setDraft(d); viewManage(); }
        else if (act === "down" && i < d.length - 1) { [d[i + 1], d[i]] = [d[i], d[i + 1]]; setDraft(d); viewManage(); }
      }));
    });

    draft.forEach((c) => {
      const badge = rows.querySelector(`[data-check="${CSS.escape(c.slug)}"]`);
      if (!badge) return;
      let done = 0, okCount = 0;
      const finish = () => { done++; if (done < 2) return; badge.classList.remove("load"); if (okCount === 2) { badge.classList.add("ok"); badge.textContent = "✓ both images"; } else { badge.classList.add("bad"); badge.textContent = okCount === 1 ? "1 image missing" : "images missing"; } };
      [false, true].forEach((lines) => { const im = new Image(); im.onload = () => { okCount++; finish(); }; im.onerror = finish; im.src = imgSrc(c, lines); });
    });
  }

  function openEditor(index) {
    const draft = ensureDraft();
    const editing = index != null;
    const c = editing ? draft[index] : { slug: "", name: "", week: "", abbr: "", hemisphere: "", location: "", lat: "", lon: "", notes: "" };

    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${editing ? "Edit constellation" : "Add constellation"}</h3>
          <button class="icon-btn" data-close aria-label="Close">✕</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="field"><span class="lbl">Name *</span><input type="text" id="f-name" value="${esc(c.name)}" placeholder="Orion"></label>
            <label class="field"><span class="lbl">Slug (image filename) *</span><input type="text" id="f-slug" value="${esc(c.slug)}" placeholder="orion"></label>
            <label class="field"><span class="lbl">Week</span><input type="number" id="f-week" value="${c.week ?? ""}" placeholder="1" min="1"></label>
            <label class="field"><span class="lbl">Abbreviation</span><input type="text" id="f-abbr" value="${esc(c.abbr || "")}" placeholder="Ori"></label>
            <label class="field"><span class="lbl">Hemisphere</span>
              <select id="f-hemi">${["", "Northern", "Southern", "Equatorial"].map((h) => `<option value="${h}" ${((c.hemisphere || "") === h) ? "selected" : ""}>${h || "-"}</option>`).join("")}</select></label>
            <label class="field full"><span class="lbl">Observation location</span><input type="text" id="f-loc" value="${esc(c.location || "")}" placeholder="Dearborn, Michigan, USA"></label>
            <label class="field"><span class="lbl">Latitude</span><input type="text" id="f-lat" value="${c.lat ?? ""}" placeholder="42.32" inputmode="decimal"></label>
            <label class="field"><span class="lbl">Longitude</span><input type="text" id="f-lon" value="${c.lon ?? ""}" placeholder="-83.18" inputmode="decimal"></label>
            <label class="field"><span class="lbl">Image versions (auto-detected; optional)</span><input type="number" id="f-versions" value="${c.versions ?? ""}" placeholder="auto" min="1" max="20"></label>
          </div>
          <div class="geo-row">
            <button type="button" class="btn ghost small" id="geoBtn">Look up ↔</button>
            <span class="faint" id="geoStatus" style="font-size:.8rem">Type a place, or enter coordinates, and I'll fill in the other.</span>
          </div>
          <label class="field full"><span class="lbl">Notes</span><textarea id="f-notes" placeholder="Short fact shown on the atlas card and after answering.">${esc(c.notes || "")}</textarea></label>
          <p class="faint" style="font-size:.82rem">Expected images: <span class="mono" id="preview-paths"></span></p>
          <div class="row-gap mt">
            <button class="btn primary" id="saveBtn">${editing ? "Save changes" : "Add constellation"}</button>
            <button class="btn ghost" data-close>Cancel</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(back);
    lockScroll();
    enhanceSelects(back);

    const nameEl = back.querySelector("#f-name");
    const slugEl = back.querySelector("#f-slug");
    const paths = back.querySelector("#preview-paths");
    let slugTouched = editing;
    function updatePaths() { const slug = slugEl.value || "<slug>"; paths.textContent = `${cfg.imageDir}/${slug}/V1.${cfg.imageExt}, V1Lines.${cfg.imageExt}, optional V1Hover.${cfg.imageExt}  (V2, V3 … for more photos)`; }
    nameEl.addEventListener("input", () => { if (!slugTouched) { slugEl.value = slugify(nameEl.value); updatePaths(); } });
    slugEl.addEventListener("input", () => { slugTouched = true; slugEl.value = slugify(slugEl.value); updatePaths(); });
    updatePaths();

    // geocoding
    const locEl = back.querySelector("#f-loc");
    const latEl = back.querySelector("#f-lat");
    const lonEl = back.querySelector("#f-lon");
    const geoBtn = back.querySelector("#geoBtn");
    const geoStatus = back.querySelector("#geoStatus");
    const setStatus = (t) => { geoStatus.textContent = t; };
    let geoBusy = false;
    async function doForward() {
      const q = locEl.value.trim(); if (!q) { setStatus("Enter a place name first."); return; }
      if (geoBusy) return; geoBusy = true; setStatus("Looking up coordinates…");
      try { const res = await geocodeForward(q); if (res) { latEl.value = res.lat; lonEl.value = res.lon; setStatus(`Found: ${res.lat}, ${res.lon}`); } else setStatus("No match for that place."); }
      catch (e) { setStatus("Lookup unavailable - enter coordinates manually."); }
      geoBusy = false;
    }
    async function doReverse() {
      const lat = parseFloat(latEl.value), lon = parseFloat(lonEl.value);
      if (isNaN(lat) || isNaN(lon)) { setStatus("Enter both latitude and longitude first."); return; }
      if (geoBusy) return; geoBusy = true; setStatus("Looking up place…");
      try { const res = await geocodeReverse(lat, lon); if (res && res.label) { locEl.value = res.label; setStatus("Found: " + res.label); } else setStatus("No place found for those coordinates."); }
      catch (e) { setStatus("Lookup unavailable - enter a place manually."); }
      geoBusy = false;
    }
    geoBtn.addEventListener("click", () => { if (locEl.value.trim()) doForward(); else doReverse(); });
    locEl.addEventListener("blur", () => { if (locEl.value.trim() && (!latEl.value || !lonEl.value)) doForward(); });
    const coordsBlur = () => { if (latEl.value && lonEl.value && !locEl.value.trim()) doReverse(); };
    latEl.addEventListener("blur", coordsBlur);
    lonEl.addEventListener("blur", coordsBlur);

    function close() { back.remove(); unlockScroll(); }
    back.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
    back.addEventListener("click", (e) => { if (e.target === back) close(); });

    back.querySelector("#saveBtn").addEventListener("click", () => {
      const name = nameEl.value.trim(), slug = slugify(slugEl.value);
      if (!name || !slug) { toast("Name and slug are required."); return; }
      if (draft.findIndex((x, i) => x.slug === slug && i !== index) !== -1) { toast("That slug is already used."); return; }
      const entry = { slug, name };
      const wk = back.querySelector("#f-week").value; if (wk !== "") entry.week = Number(wk);
      const abbr = back.querySelector("#f-abbr").value.trim(); if (abbr) entry.abbr = abbr;
      const hemi = back.querySelector("#f-hemi").value; if (hemi) entry.hemisphere = hemi;
      const loc = locEl.value.trim(); if (loc) entry.location = loc;
      const lat = parseFloat(latEl.value); if (!isNaN(lat)) entry.lat = +lat.toFixed(4);
      const lon = parseFloat(lonEl.value); if (!isNaN(lon)) entry.lon = +lon.toFixed(4);
      const ver = parseInt(back.querySelector("#f-versions").value, 10); if (!isNaN(ver) && ver > 1) entry.versions = Math.min(20, ver);
      const notes = back.querySelector("#f-notes").value.trim(); if (notes) entry.notes = notes;
      const d = ensureDraft();
      if (editing) d[index] = entry; else d.push(entry);
      setDraft(d); close(); toast(editing ? "Saved to draft." : "Added to draft."); viewManage();
    });
    nameEl.focus();
  }

  function serializeDataJs(list) {
    const items = normalize(list).map((c) => {
      const o = { slug: c.slug, name: c.name };
      ["week", "abbr", "hemisphere", "location", "lat", "lon", "versions", "notes", "ext"]
        .forEach((k) => { if (c[k] !== undefined && c[k] !== "" && c[k] !== null) o[k] = c[k]; });
      return "  " + JSON.stringify(o);
    }).join(",\n");
    return `/* Uranographia data - exported ${new Date().toISOString().slice(0, 10)}.
   Replace data.js with this file, commit it and your images/ folder, then push. */
window.CONSTELLATIONS = [
${items}
];

window.QUIZ_CONFIG = ${JSON.stringify(cfg, null, 2)};
`;
  }
  function exportData(draft) {
    const blob = new Blob([serializeDataJs(draft)], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "data.js";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("data.js downloaded - commit it to publish.");
  }
  function copyData(draft) {
    const text = serializeDataJs(draft);
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("Copied data.js contents.")).catch(() => toast("Copy failed - use Export."));
    else toast("Clipboard unavailable - use Export.");
  }

  /* ================================================================ ROUTER */
  const SUN_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
  const MOON_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    const btn = document.getElementById("theme-toggle");
    if (btn) { btn.innerHTML = t === "dark" ? SUN_ICON : MOON_ICON; btn.setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode"); }
  }
  function initTheme() {
    applyTheme(load(KEY.theme, "light") === "dark" ? "dark" : "light");
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      save(KEY.theme, next); applyTheme(next);
    });
  }

  const routes = { "/": viewHome, "/guide": viewGuide, "/quiz": viewQuizSetup, "/browse": viewBrowse, "/stats": viewStats, "/manage": viewManage };
  function setActiveNav(path) { document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === path)); }
  function syncPreviewBanner() { document.getElementById("preview-banner").hidden = !previewOn(); }
  function router() {
    const raw = (location.hash || "#/").replace(/^#/, "");
    const path = raw.split("?")[0] || "/";
    setActiveNav(path); syncPreviewBanner();
    (routes[path] || viewHome)();
    window.scrollTo(0, 0);
  }
  document.getElementById("exit-preview").addEventListener("click", () => { save(KEY.preview, false); syncPreviewBanner(); router(); toast("Using published data."); });
  window.addEventListener("hashchange", router);
  initTheme();
  router();
})();
