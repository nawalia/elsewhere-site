// The map behind elsewheres.live's home page.
//
// A made-up city, drawn from scratch every frame through a tilted camera, the
// way the app's own map tilts when it follows a route. The pin keeps choosing
// somewhere new: sometimes it jumps there (a fixed spot), sometimes it drives
// there along the roads (a route), and the roads it used stay lit for a while.
// The status pill above the headline says what the app would say.
//
// No libraries and no map tiles. Pauses when the map is scrolled away or the
// tab is hidden, and draws one still frame for people who prefer less motion.

(() => {
  const canvas = document.getElementById("map");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { alpha: false });
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Seeded randomness, so the city looks the same on every visit.
  let seed = 20261225;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const between = (a, b) => a + (b - a) * rand();

  // The city ---------------------------------------------------------------
  const BLOCK = 120;           // metres between streets
  const HALF = 16;             // streets each way from the centre
  const nodes = [];            // {x, y}
  const index = (i, j) => (i + HALF) * (2 * HALF + 1) + (j + HALF);
  for (let i = -HALF; i <= HALF; i++) {
    for (let j = -HALF; j <= HALF; j++) {
      nodes.push({ x: i * BLOCK + between(-16, 16), y: j * BLOCK + between(-16, 16) });
    }
  }
  const edges = [];            // {a, b, major, lit}
  const links = nodes.map(() => []);
  const join = (a, b, major) => {
    const e = edges.length;
    edges.push({ a, b, major, lit: 0 });
    links[a].push({ to: b, e });
    links[b].push({ to: a, e });
  };
  for (let i = -HALF; i <= HALF; i++) {
    for (let j = -HALF; j <= HALF; j++) {
      const majorCol = i % 5 === 0, majorRow = j % 5 === 0;
      if (i < HALF && (majorRow || rand() > 0.14)) join(index(i, j), index(i + 1, j), majorRow);
      if (j < HALF && (majorCol || rand() > 0.14)) join(index(i, j), index(i, j + 1), majorCol);
    }
  }
  // Blocks and parks between the streets.
  const cells = [];
  for (let i = -HALF; i < HALF; i++) {
    for (let j = -HALF; j < HALF; j++) {
      const corners = [index(i, j), index(i + 1, j), index(i + 1, j + 1), index(i, j + 1)];
      cells.push({ corners, park: rand() < 0.06, shade: between(0.75, 1) });
    }
  }
  // A river curving through.
  const river = [];
  for (let t = -HALF * BLOCK - 400; t <= HALF * BLOCK + 400; t += 60) {
    river.push({ x: t, y: 260 + Math.sin(t / 520) * 330 + Math.sin(t / 190) * 40 });
  }

  // Camera -----------------------------------------------------------------
  const PITCH = 54 * Math.PI / 180;
  const cosP = Math.cos(PITCH), sinP = Math.sin(PITCH);
  const FOCAL = 950;
  const cam = { x: 0, y: 0, bearing: -0.18, zoom: 1 };
  const pointer = { x: 0, y: 0 };
  let W = 0, H = 0, DPR = 1, anchorX = 0, anchorY = 0;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const narrow = W < 760;
    anchorX = narrow ? W * 0.5 : W * 0.66;
    anchorY = narrow ? H * 0.62 : H * 0.56;
    cam.zoom = narrow ? 0.62 : Math.max(0.75, Math.min(1.25, W / 1400));
  }

  // World metres -> screen pixels. Returns null behind the camera.
  function project(px, py) {
    const dx = px - cam.x, dy = py - cam.y;
    const b = cam.bearing + pointer.x * 0.06;
    const rx = dx * Math.cos(b) - dy * Math.sin(b);
    const ry = dx * Math.sin(b) + dy * Math.cos(b);
    const depth = FOCAL - ry * sinP * cam.zoom;
    if (depth < 80) return null;
    const s = FOCAL / depth;
    return { x: anchorX + rx * cam.zoom * s, y: anchorY + ry * cosP * cam.zoom * s - pointer.y * 14, s };
  }

  // Coordinates the status pill shows: 1 map metre = 1 real metre near Davis.
  const ORIGIN = { lat: 38.5449, lon: -121.7405 };
  const toLatLon = (p) => {
    const lat = ORIGIN.lat - p.y / 111320;
    const lon = ORIGIN.lon + p.x / (111320 * Math.cos(ORIGIN.lat * Math.PI / 180));
    return lat.toFixed(5) + ", " + lon.toFixed(5);
  };

  // The pin's story ----------------------------------------------------------
  const statusDot = document.querySelector(".status .dot");
  const statusWord = document.querySelector(".status b");
  const statusCoords = document.querySelector(".status .coords");
  function say(word, coords, waiting) {
    if (!statusWord) return;
    statusWord.textContent = word;
    statusCoords.textContent = coords;
    statusDot.classList.toggle("wait", !!waiting);
  }

  let at = index(2, 1);        // the node the pin is on
  const pin = { x: nodes[at].x, y: nodes[at].y, lift: 0, alpha: 1 };
  let plan = null;             // what the pin is doing now
  let heldFrom = 0;
  const ripples = [];

  function shortestPath(from, to) {
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length) {
      const n = queue.shift();
      if (n === to) break;
      for (const { to: m, e } of links[n]) {
        if (!prev.has(m)) { prev.set(m, { n, e }); queue.push(m); }
      }
    }
    if (!prev.has(to)) return null;
    const path = [];
    for (let n = to; prev.get(n); n = prev.get(n).n) path.unshift({ node: n, edge: prev.get(n).e });
    return path;
  }

  function pickTarget(minSteps, maxSteps) {
    for (let tries = 0; tries < 40; tries++) {
      const i = Math.round(between(-HALF + 3, HALF - 3));
      const j = Math.round(between(-HALF + 3, HALF - 3));
      const n = index(i, j);
      const d = Math.abs(nodes[n].x - nodes[at].x) + Math.abs(nodes[n].y - nodes[at].y);
      if (d > minSteps * BLOCK && d < maxSteps * BLOCK) return n;
    }
    return index(0, 0);
  }

  function next(now) {
    if (rand() < 0.5) {
      const target = pickTarget(4, 9);
      const path = shortestPath(at, target);
      if (path && path.length) {
        let length = 0;
        const legs = path.map(({ node, edge }, k) => {
          const from = k === 0 ? at : path[k - 1].node;
          const l = Math.hypot(nodes[node].x - nodes[from].x, nodes[node].y - nodes[from].y);
          length += l;
          return { from, node, edge, l };
        });
        plan = { kind: "drive", legs, length, start: now, duration: Math.min(5200, 1400 + length * 1.5), target };
        say("Driving to", toLatLon(nodes[target]), true);
        return;
      }
    }
    const target = pickTarget(6, 14);
    plan = { kind: "jump", start: now, target };
    say("Setting", toLatLon(nodes[target]), true);
  }

  function arrive(now, target) {
    at = target;
    pin.x = nodes[at].x; pin.y = nodes[at].y; pin.lift = 0; pin.alpha = 1;
    ripples.push({ x: pin.x, y: pin.y, born: now });
    heldFrom = now;
    say("Applied", toLatLon(nodes[at]));
    plan = { kind: "hold", start: now, until: now + between(2600, 4200) };
  }

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function update(now) {
    if (!plan) arrive(now, at);
    if (plan.kind === "hold") {
      const held = Math.floor((now - heldFrom) / 1000);
      if (held >= 1) say("Holding", toLatLon(nodes[at]) + "   0:0" + Math.min(held, 9));
      if (now > plan.until) next(now);
    } else if (plan.kind === "drive") {
      const t = Math.min(1, (now - plan.start) / plan.duration);
      let along = ease(t) * plan.length;
      for (const leg of plan.legs) {
        if (along <= leg.l) {
          const f = leg.l ? along / leg.l : 1;
          pin.x = nodes[leg.from].x + (nodes[leg.node].x - nodes[leg.from].x) * f;
          pin.y = nodes[leg.from].y + (nodes[leg.node].y - nodes[leg.from].y) * f;
          edges[leg.edge].lit = 1;
          break;
        }
        edges[leg.edge].lit = 1;
        along -= leg.l;
      }
      if (t >= 1) arrive(now, plan.target);
    } else if (plan.kind === "jump") {
      const t = (now - plan.start) / 1500;
      if (t < 0.35) {                       // lift off where it was
        const k = t / 0.35;
        pin.lift = ease(k) * 60; pin.alpha = 1 - k;
      } else if (t < 0.65) {                // gone; the camera travels
        pin.alpha = 0;
        pin.x = nodes[plan.target].x; pin.y = nodes[plan.target].y;
      } else if (t < 1) {                   // drop in at the new place
        const k = (t - 0.65) / 0.35;
        pin.lift = (1 - ease(k)) * 90; pin.alpha = k;
      } else {
        arrive(now, plan.target);
      }
    }
    for (const e of edges) if (e.lit > 0) e.lit = Math.max(0, e.lit - 0.0022);

    cam.x += (pin.x - cam.x) * 0.035;
    cam.y += (pin.y - cam.y) * 0.035;
    cam.bearing = -0.18 + Math.sin(now / 9000) * 0.07;
  }

  // Drawing ------------------------------------------------------------------
  function polygon(points) {
    ctx.beginPath();
    points.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  }

  const off = (a, b) =>
    (a.x < -40 && b.x < -40) || (a.x > W + 40 && b.x > W + 40) ||
    (a.y > H + 40 && b.y > H + 40) || (a.y < -40 && b.y < -40);

  function draw(now) {
    ctx.fillStyle = "#070912";
    ctx.fillRect(0, 0, W, H);

    const pp = nodes.map((n) => project(n.x, n.y));

    for (const c of cells) {
      const q = c.corners.map((k) => pp[k]);
      if (q.some((p) => !p)) continue;
      if (q.every((p) => p.x < -60 || p.x > W + 60) || q.every((p) => p.y < -60 || p.y > H + 60)) continue;
      // Inset the block so the streets show between blocks.
      const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
      polygon(q.map((p) => ({ x: cx + (p.x - cx) * 0.8, y: cy + (p.y - cy) * 0.8 })));
      ctx.fillStyle = c.park ? "rgba(52, 211, 153, 0.10)" : `rgba(120, 135, 200, ${0.07 * c.shade})`;
      ctx.fill();
    }

    const rv = river.map((p) => project(p.x, p.y)).filter(Boolean);
    if (rv.length > 1) {
      ctx.beginPath();
      rv.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(56, 92, 190, 0.32)";
      ctx.lineWidth = 46 * cam.zoom * rv[Math.floor(rv.length / 2)].s;
      ctx.stroke();
    }

    ctx.lineCap = "round";
    for (const major of [false, true]) {
      ctx.beginPath();
      for (const e of edges) {
        if (e.major !== major) continue;
        const a = pp[e.a], b = pp[e.b];
        if (!a || !b || off(a, b)) continue;
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = major ? "rgba(170, 182, 235, 0.26)" : "rgba(150, 160, 210, 0.13)";
      ctx.lineWidth = (major ? 3.2 : 1.6) * cam.zoom;
      ctx.stroke();
    }

    // Roads the pin used, still glowing.
    ctx.globalCompositeOperation = "lighter";
    for (const e of edges) {
      if (e.lit <= 0) continue;
      const a = pp[e.a], b = pp[e.b];
      if (!a || !b || off(a, b)) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(79, 105, 242, ${0.95 * e.lit})`;
      ctx.lineWidth = 5 * cam.zoom * a.s;
      ctx.shadowColor = "rgba(79, 105, 242, 0.9)";
      ctx.shadowBlur = 16 * e.lit;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // The area around a held place lights up.
    const here = project(pin.x, pin.y);
    if (here) {
      const held = plan && plan.kind === "hold" ? Math.min(1, (now - plan.start) / 700) : 0.35;
      const r = 230 * cam.zoom * here.s;
      const glow = ctx.createRadialGradient(here.x, here.y, 0, here.x, here.y, r);
      glow.addColorStop(0, `rgba(79, 105, 242, ${0.42 * held})`);
      glow.addColorStop(1, "rgba(79, 105, 242, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(here.x - r, here.y - r, r * 2, r * 2);
    }

    // Rings where the pin landed, flat on the ground.
    for (let k = ripples.length - 1; k >= 0; k--) {
      const rp = ripples[k];
      const age = (now - rp.born) / 1600;
      if (age > 1) { ripples.splice(k, 1); continue; }
      const p = project(rp.x, rp.y);
      if (!p) continue;
      const radius = (20 + 150 * age) * p.s * cam.zoom;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, radius, radius * cosP, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(125, 145, 255, ${0.8 * (1 - age)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";

    // The pin, standing up from the map, with its faint echo like the app icon.
    if (here && pin.alpha > 0) {
      const size = 34 * Math.max(0.8, here.s) * (W < 760 ? 0.85 : 1);
      const x = here.x, y = here.y - pin.lift;
      ctx.globalAlpha = pin.alpha;
      ctx.beginPath();
      ctx.ellipse(here.x, here.y, size * 0.42, size * 0.16, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.fill();
      drawPin(x - size * 0.22, y - size * 0.12, size, "rgba(255, 255, 255, 0.28)");
      drawPin(x, y, size, "#ffffff");
      ctx.beginPath();
      ctx.arc(x, y - size * 1.18, size * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = "#4f69f2";
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // A teardrop pin whose tip sits on (x, y).
  function drawPin(x, y, size, colour) {
    const r = size * 0.5, cy = y - size * 1.18;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - r * 0.35, y - size * 0.45, x - r, cy + r * 0.55, x - r, cy);
    ctx.arc(x, cy, r, Math.PI, 0);
    ctx.bezierCurveTo(x + r, cy + r * 0.55, x + r * 0.35, y - size * 0.45, x, y);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
  }

  // Running --------------------------------------------------------------------
  let running = false, raf = 0;
  function frame(now) {
    update(now);
    draw(now);
    if (running) raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running || still) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  window.addEventListener("resize", () => { resize(); if (!running) draw(performance.now()); });
  window.addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / W - 0.5) * 2;
    pointer.y = (e.clientY / H - 0.5) * 2;
  }, { passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

  // As the page scrolls the map sinks back, and stops once it can't be seen.
  const header = document.querySelector("header");
  const onScroll = () => {
    const k = Math.min(1, window.scrollY / (H * 0.9));
    canvas.style.opacity = String(1 - k * 0.85);
    canvas.style.transform = `scale(${1 + k * 0.08})`;
    if (header) header.classList.toggle("solid", window.scrollY > 40);
    if (window.scrollY > H * 1.4) stop(); else start();
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  resize();
  if (still) {
    // One still frame: the pin, held, with the roads around it lit.
    update(0);
    for (const { e } of links[at]) edges[e].lit = 0.8;
    draw(4000);
    say("Holding", toLatLon(nodes[at]));
  } else {
    start();
  }
  onScroll();
})();

// Sections fade up as they arrive.
(() => {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) { items.forEach((el) => el.classList.add("in")); return; }
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) { entry.target.classList.add("in"); seen.unobserve(entry.target); }
    }
  }, { rootMargin: "0px 0px -10% 0px" });
  items.forEach((el) => seen.observe(el));
})();
