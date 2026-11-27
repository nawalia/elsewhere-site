// The working demo at the top of elsewheres.live: Elsewhere's map screen on an
// iPhone. Tap anywhere on the map and the pin goes there, the status goes
// Setting, Applied, Holding, and the timer runs, the way the real app behaves.
// "Back to real" returns to the blue dot. Left alone, it demonstrates itself.

(() => {
  const screen = document.querySelector(".screen");
  if (!screen) return;
  const canvas = screen.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const status = screen.querySelector(".app-status");
  const statusWord = status.querySelector("b");
  const statusSmall = status.querySelector("small");
  const coordsLine = screen.querySelector(".app-coords");
  const button = screen.querySelector(".app-btn");
  const hint = screen.querySelector(".tap-hint");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, DPR = 1;

  // An endless city seen from above, like the app's map in dark mode. Every
  // street and block comes from its own grid position, so the map never ends
  // and always looks the same in the same place.
  const STEP = 64;
  const hash = (a, b) => {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const colX = (i) => i * STEP + (hash(i, 7) - 0.5) * 22;
  const rowY = (j) => j * STEP + (hash(11, j) - 0.5) * 22;
  function build() {}

  // Map units are metres from the user's real spot; shown as coordinates near Davis.
  const real = { x: 0, y: 0 };
  const view = { x: 0, y: 0 };
  let aim = { x: 0, y: 0 };
  let pin = null, pinDrop = 0, ring = 0;
  let phase = "real", since = 0, phaseAt = 0;
  let touched = false;
  const ORIGIN = { lat: 38.5449, lon: -121.7405 };
  const toLL = (p) => (ORIGIN.lat - p.y / 111320).toFixed(5) + ", " + (ORIGIN.lon + p.x / 87120).toFixed(5);

  function size() {
    const r = screen.getBoundingClientRect();
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  const toScreen = (p) => ({ x: W / 2 + (p.x - view.x) * 1.4, y: H * 0.46 + (p.y - view.y) * 1.4 });
  const toWorld = (sx, sy) => ({ x: view.x + (sx - W / 2) / 1.4, y: view.y + (sy - H * 0.46) / 1.4 });

  function show(word, detail, kind) {
    statusWord.textContent = word;
    statusSmall.textContent = detail || "";
    status.classList.toggle("held", kind === "held");
    status.classList.toggle("busy", kind === "busy");
  }

  function setAt(world, now) {
    pin = world; pinDrop = now; ring = 0;
    phase = "setting"; phaseAt = now;
    aim = { x: world.x, y: world.y };
    show("Setting…", toLL(world), "busy");
    coordsLine.textContent = toLL(world);
    button.textContent = "Back to real";
    button.classList.add("real");
    hint.classList.add("gone");
  }

  function backToReal(now) {
    pin = null; phase = "real"; phaseAt = now;
    aim = { x: real.x, y: real.y };
    show("Using your real location", "", null);
    coordsLine.textContent = "Tap the map to pick a place";
    button.textContent = "Set";
    button.classList.remove("real");
    if (!touched) hint.classList.remove("gone");
  }

  function update(now) {
    if (phase === "setting" && now - phaseAt > 650) { phase = "applied"; phaseAt = now; since = now; ring = now; show("Applied", "Every app now sees this place", "held"); }
    if (phase === "applied" && now - phaseAt > 1300) { phase = "holding"; }
    if (phase === "holding") {
      const s = Math.floor((now - since) / 1000);
      show("Holding", toLL(pin) + "   " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"), "held");
    }
    view.x += (aim.x - view.x) * 0.08;
    view.y += (aim.y - view.y) * 0.08;
  }

  function drawPin(x, y, s, alpha) {
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.ellipse(x, y, 9 * s, 3.5 * s, 0, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fill();
    const r = 13 * s, cy = y - 30 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - r * 0.4, y - 12 * s, x - r, cy + r * 0.6, x - r, cy);
    ctx.arc(x, cy, r, Math.PI, 0);
    ctx.bezierCurveTo(x + r, cy + r * 0.6, x + r * 0.4, y - 12 * s, x, y);
    ctx.fillStyle = "#ef4b4b"; ctx.fill();
    ctx.beginPath(); ctx.arc(x, cy, r * 0.38, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.globalAlpha = 1;
  }

  function draw(now) {
    ctx.fillStyle = "#1b1d22"; ctx.fillRect(0, 0, W, H);
    const Z = 1.4;
    const left = view.x - W / 2 / Z, right = view.x + W / 2 / Z;
    const top = view.y - H * 0.46 / Z, bottom = view.y + H * 0.54 / Z;
    const i0 = Math.floor(left / STEP) - 1, i1 = Math.ceil(right / STEP) + 1;
    const j0 = Math.floor(top / STEP) - 1, j1 = Math.ceil(bottom / STEP) + 1;
    const sx = (x) => W / 2 + (x - view.x) * Z, sy = (y) => H * 0.46 + (y - view.y) * Z;

    for (let i = i0; i < i1; i++) {
      for (let j = j0; j < j1; j++) {
        const x0 = colX(i), x1 = colX(i + 1), y0 = rowY(j), y1 = rowY(j + 1);
        const r = hash(i * 31 + 5, j * 17 + 3);
        if (r < 0.06) {
          ctx.fillStyle = "#1f3a2c";
          ctx.fillRect(sx(x0 + 4), sy(y0 + 4), (x1 - x0 - 8) * Z, (y1 - y0 - 8) * Z);
          continue;
        }
        if (r > 0.985) {
          ctx.fillStyle = "#1c2c45";
          ctx.fillRect(sx(x0 + 4), sy(y0 + 4), (x1 - x0 - 8) * Z, (y1 - y0 - 8) * Z);
          continue;
        }
        ctx.fillStyle = "#24272e";
        const n = 1 + Math.floor(hash(i, j * 3 + 1) * 3);
        for (let k = 0; k < n; k++) {
          const bx = x0 + 8 + hash(i + k, j) * (x1 - x0 - 30), by = y0 + 8 + hash(i, j + k) * (y1 - y0 - 30);
          ctx.fillRect(sx(bx), sy(by), (12 + hash(k, i + j) * 16) * Z, (10 + hash(j, k + i) * 14) * Z);
        }
      }
    }
    ctx.lineCap = "butt";
    for (let i = i0; i < i1; i++) {
      const major = ((i % 5) + 5) % 5 === 0;
      ctx.beginPath(); ctx.moveTo(sx(colX(i)), 0); ctx.lineTo(sx(colX(i)), H);
      ctx.strokeStyle = major ? "#4a4e5a" : "#353843"; ctx.lineWidth = (major ? 9 : 4) * Z / 1.4; ctx.stroke();
    }
    for (let j = j0; j < j1; j++) {
      const major = ((j % 5) + 5) % 5 === 0;
      ctx.beginPath(); ctx.moveTo(0, sy(rowY(j))); ctx.lineTo(W, sy(rowY(j)));
      ctx.strokeStyle = major ? "#4a4e5a" : "#353843"; ctx.lineWidth = (major ? 9 : 4) * Z / 1.4; ctx.stroke();
    }

    // The real location: the familiar blue dot, greyed while elsewhere.
    const d = toScreen(real);
    ctx.beginPath(); ctx.arc(d.x, d.y, 16, 0, Math.PI * 2); ctx.fillStyle = "rgba(58, 130, 247, 0.18)"; ctx.fill();
    ctx.beginPath(); ctx.arc(d.x, d.y, 8, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, Math.PI * 2); ctx.fillStyle = pin ? "#7c8596" : "#3a82f7"; ctx.fill();

    if (pin) {
      const p = toScreen(pin);
      if (ring) {
        const age = (now - ring) / 1400;
        if (age < 1) { ctx.beginPath(); ctx.arc(p.x, p.y, 10 + age * 70, 0, Math.PI * 2); ctx.strokeStyle = `rgba(61, 220, 151, ${1 - age})`; ctx.lineWidth = 2; ctx.stroke(); }
      }
      const t = Math.min(1, (now - pinDrop) / 420);
      const bounce = t < 1 ? (1 - t) * (1 - t) * 60 : 0;
      drawPin(p.x, p.y - bounce, 1, Math.min(1, t * 2));
    }
  }

  // Interaction ------------------------------------------------------------
  let autoAt = 0;
  function tap(clientX, clientY) {
    const r = screen.getBoundingClientRect();
    const sx = clientX - r.left, sy = clientY - r.top;
    if (sy < H * 0.2 || sy > H * 0.74) return;        // the search bar and sheet aren't map
    touched = true;
    hint.classList.add("gone");
    setAt(toWorld(sx, sy), performance.now());
  }
  screen.addEventListener("click", (e) => {
    if (e.target === button) return;
    tap(e.clientX, e.clientY);
  });
  button.addEventListener("click", () => {
    touched = true;
    hint.classList.add("gone");
    const now = performance.now();
    if (pin) backToReal(now);
    else setAt({ x: real.x + 260, y: real.y - 180 }, now);
  });

  // Left alone, it shows itself: set, hold, go back, somewhere else.
  const demoSpots = [{ x: 240, y: -210 }, { x: -190, y: 160 }, { x: 120, y: 260 }];
  let demoIndex = 0;
  function attract(now) {
    if (touched || now < autoAt) return;
    if (!pin) { setAt(demoSpots[demoIndex++ % demoSpots.length], now); autoAt = now + 5200; }
    else { backToReal(now); autoAt = now + 1600; }
  }

  // The phone turns towards the pointer, and flattens as the page scrolls.
  const phone = document.querySelector(".iphone");
  let px = 0, py = 0;
  addEventListener("pointermove", (e) => { px = e.clientX / innerWidth - 0.5; py = e.clientY / innerHeight - 0.5; }, { passive: true });
  function tilt() {
    if (!phone || still) return;
    const k = Math.min(1, scrollY / (innerHeight * 0.7));
    const narrow = innerWidth < 680;
    const ry = (narrow ? -10 : -22) * (1 - k) + px * 10;
    const rx = (narrow ? 8 : 14) * (1 - k) - py * 8;
    phone.style.setProperty("--ry", ry.toFixed(2) + "deg");
    phone.style.setProperty("--rx", rx.toFixed(2) + "deg");
    phone.style.setProperty("--rz", ((narrow ? 2 : 3) * (1 - k)).toFixed(2) + "deg");
  }

  let running = false;
  function frame(now) {
    attract(now); update(now); draw(now); tilt();
    if (running) requestAnimationFrame(frame);
  }
  build(); size(); backToReal(0);
  addEventListener("resize", size);
  autoAt = performance.now() + 2600;
  if (still) {
    setAt(demoSpots[0], 0); phase = "holding"; since = 0; update(1000); draw(1000);
  } else {
    // Only animate while the phone is on screen.
    new IntersectionObserver(([e]) => {
      const was = running; running = e.isIntersecting;
      if (running && !was) requestAnimationFrame(frame);
    }).observe(screen);
  }
})();

// The headline rises in once the fonts are ready, then sections as they arrive.
(() => {
  // The opening plays once per visit, then gets out of the way.
  const loader = document.querySelector(".loader");
  let went = false;
  const go = () => {
    if (went) return; went = true;
    const reveal = () => { document.body.classList.add("ready"); if (loader) loader.classList.add("done"); };
    if (loader && !document.documentElement.classList.contains("no-loader")) {
      sessionStorage.setItem("seenIntro", "1");
      setTimeout(reveal, 1150);
      setTimeout(() => loader.remove(), 2200);
    } else reveal();
  };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(go));
  setTimeout(go, 900);

  const items = document.querySelectorAll(".reveal, .mask");
  if (!("IntersectionObserver" in window)) { items.forEach((el) => el.classList.add("in")); return; }
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("in"); seen.unobserve(entry.target); }
  }, { rootMargin: "0px 0px -8% 0px" });
  items.forEach((el) => seen.observe(el));

  const header = document.querySelector("header");
  addEventListener("scroll", () => header && header.classList.toggle("solid", scrollY > 30), { passive: true });

  // Countdown to the launch, then to the price rise. Real dates only.
  for (const el of document.querySelectorAll("[data-countdown]")) {
    const launch = new Date("2026-12-25T00:00:00-08:00"), rise = new Date("2027-02-01T00:00:00-08:00");
    const tick = () => {
      const now = new Date();
      const [target, what] = now < launch ? [launch, "until launch"] : now < rise ? [rise, "until prices go up"] : [null, ""];
      if (!target) { el.textContent = ""; return; }
      const s = Math.max(0, Math.floor((target - now) / 1000));
      el.textContent = `${Math.floor(s / 86400)}d ${String(Math.floor(s / 3600) % 24).padStart(2, "0")}h ${String(Math.floor(s / 60) % 60).padStart(2, "0")}m ${what}`;
    };
    tick(); setInterval(tick, 30000);
  }
})();

// A visit count, no cookies: only the page and the site that linked here.
(() => {
  try {
    const key = "sb_publishable_En8uODvP57LWueV1FxlH_g_5PRa0jqw";
    let referrer = null;
    try { const r = new URL(document.referrer); if (r.host !== location.host) referrer = r.host; } catch {}
    fetch("https://btatbozstmkrfsfphriy.supabase.co/rest/v1/page_views", {
      method: "POST", keepalive: true,
      headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ path: location.pathname.slice(0, 200), referrer }),
    }).catch(() => {});
  } catch {}
})();

// Scroll-driven depth: the floating phones turn and spread, the poster grows,
// and the counted numbers tick up when they arrive. Plain math, no library.
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scenes = [...document.querySelectorAll("[data-scroll]")];
  const minis = [...document.querySelectorAll("[data-float]")];
  const poster = document.querySelector(".poster");
  let px = 0;
  addEventListener("pointermove", (e) => { px = e.clientX / innerWidth - 0.5; }, { passive: true });
  const progress = (el) => {
    const r = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height)));
  };
  function frame() {
    if (!still && innerWidth > 680) {
      const stage = document.getElementById("screens");
      if (stage) {
        const p = progress(stage);
        for (const m of minis) {
          const k = Number(m.dataset.float);
          const spread = 150 + p * 190;
          m.style.setProperty("--x", (k * spread) + "px");
          m.style.setProperty("--z", (k === 0 ? 60 : -40) + "px");
          m.style.setProperty("--y", ((k === 0 ? -20 : 30) - p * 30) + "px");
          m.style.setProperty("--ry", (k * -24 * (1 - p) + k * -8 + px * 14) + "deg");
          m.style.setProperty("--rx", (10 * (1 - p)) + "deg");
        }
      }
      if (poster) poster.style.setProperty("--p", Math.min(1, progress(poster.parentElement) * 1.6).toFixed(3));
    }
    requestAnimationFrame(frame);
  }
  if (scenes.length) requestAnimationFrame(frame);

  const counters = document.querySelectorAll("[data-count]");
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      seen.unobserve(entry.target);
      const el = entry.target, end = Number(el.dataset.count);
      if (still) continue;
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / 1400), eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(end * eased).toLocaleString("en-US");
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }, { threshold: 0.4 });
  counters.forEach((el) => seen.observe(el));
})();
