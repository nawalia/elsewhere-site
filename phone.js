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
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // A small city seen from above, like the app's map in dark mode.
  const roads = [], blocks = [], parks = [];
  function build() {
    seed = 7; roads.length = blocks.length = parks.length = 0;
    const step = 64;
    for (let x = -step; x < 900; x += step + (rand() * 26 - 13)) roads.push({ x1: x, y1: -50, x2: x + rand() * 30 - 15, y2: 1300, w: rand() < 0.2 ? 9 : 4 });
    for (let y = -step; y < 1300; y += step + (rand() * 30 - 15)) roads.push({ x1: -50, y1: y, x2: 900, y2: y + rand() * 30 - 15, w: rand() < 0.2 ? 9 : 4 });
    for (let k = 0; k < 420; k++) blocks.push({ x: rand() * 900, y: rand() * 1300, w: 14 + rand() * 30, h: 10 + rand() * 26 });
    for (let k = 0; k < 5; k++) parks.push({ x: rand() * 800, y: rand() * 1200, r: 30 + rand() * 50 });
  }

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
    const o = toScreen({ x: 0, y: 0 });
    ctx.save(); ctx.translate(o.x - 450 * 1.4, o.y - 650 * 1.4); ctx.scale(1.4, 1.4);
    for (const p of parks) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = "#1f3a2c"; ctx.fill(); }
    ctx.fillStyle = "#24272e";
    for (const b of blocks) ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.lineCap = "round";
    for (const r of roads) { ctx.beginPath(); ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); ctx.strokeStyle = r.w > 5 ? "#4a4e5a" : "#353843"; ctx.lineWidth = r.w; ctx.stroke(); }
    ctx.restore();

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
  const go = () => document.body.classList.add("ready");
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(go));
  setTimeout(go, 1200);

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
