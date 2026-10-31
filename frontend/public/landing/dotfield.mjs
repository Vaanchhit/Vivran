// ─────────────────────────────────────────────────────────────
// Vivran dot field: a live dot matrix drawn on a canvas.
//
// One engine for the landing page (public/home.html) and the product
// (app/components/dot-field.tsx). Colours come from CSS custom properties on
// the page, so it follows the theme:
//   --dot      the resting dots (the rule colour)
//   --dot-hi   lit dots (the accent)
//   --dot-mark the blueprint crosshairs
//
// What moves:
//   terrain   dots swell and fade with a slow interference wave
//   cursor    dots near the pointer part around it and light up
//   signals   short pulses of light run along grid lines
//   rings     a ring of light spreads from a point now and then (and on click)
// Dots under the section's text (opts.quiet, a selector) are dimmed, so the
// field never runs through words.
// Reduced motion draws a single still frame. Nothing runs off screen.
// ─────────────────────────────────────────────────────────────

const rgba = (s) => {
  const m = (s || "").match(/[\d.]+/g) || [0, 0, 0, 0];
  return [+m[0], +m[1], +m[2], m[3] == null ? 1 : +m[3]];
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Draw a dot field into `host` (an absolutely positioned box). The pointer is
 * tracked on `track` (default: the host's parent).
 * opts: gap, mask [cx, cy, rx, ry] as fractions of the box, rings, signals,
 *       marks, quiet (selector for text to keep clear). Returns a function that stops it.
 */
export function mount(host, opts = {}) {
  const o = {
    gap: 22, mask: [0.5, 0.42, 0.8, 0.72], rings: true, signals: true, marks: true,
    quiet: "h1, h2, h3, p, .eyebrow, .btn, .hero-meta, textarea, label, input", ...opts,
  };
  const track = o.track || host.parentElement;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover)").matches;

  const cv = document.createElement("canvas");
  cv.setAttribute("aria-hidden", "true");
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
  host.appendChild(cv);
  const ctx = cv.getContext("2d");

  let W = 0, H = 0, dpr = 1, maxDpr = 2, gap = o.gap, cols = 0, rows = 0, ox = 0, oy = 0;
  let base, hi, mark, boost = new Float32Array(0), clear = [];
  // per-dot values that only change on resize: visibility (edge fade x text
  // clearing), the text-clearing factor, and the wave phases, as sin/cos pairs
  let E, Q, EE, SD, CD, SX, CX, SY, CY;
  // boxes of text to keep clear, relative to the host, with a little padding
  const measure = () => {
    if (!o.quiet || !track) { clear = []; return; }
    const h = host.getBoundingClientRect(), pad = 10;
    clear = [...track.querySelectorAll(o.quiet)].map((el) => el.getBoundingClientRect())
      .filter((r) => r.width && r.height)
      .map((r) => [r.left - h.left - pad, r.top - h.top - pad, r.right - h.left + pad, r.bottom - h.top + pad]);
  };
  const hush = (x, y) => {
    for (let k = 0; k < clear.length; k++) { const c = clear[k]; if (x > c[0] && x < c[2] && y > c[1] && y < c[3]) return 0.12; }
    return 1;
  };
  const colours = () => {
    const cs = getComputedStyle(host);
    base = rgba(cs.getPropertyValue("--dot"));
    hi = rgba(cs.getPropertyValue("--dot-hi"));
    mark = rgba(cs.getPropertyValue("--dot-mark") || cs.getPropertyValue("--dot"));
  };
  const size = () => {
    const r = host.getBoundingClientRect();
    W = r.width; H = r.height; dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gap = W < 640 ? Math.round(o.gap * 0.85) : o.gap;
    cols = Math.ceil(W / gap) + 1; rows = Math.ceil(H / gap) + 1;
    ox = (W - (cols - 1) * gap) / 2; oy = (gap / 2) % gap;
    boost = new Float32Array(cols * rows);
  };
  const prepare = () => {
    const n = cols * rows;
    E = new Float32Array(n); Q = new Float32Array(n); EE = new Float32Array(n); SD = new Float32Array(n); CD = new Float32Array(n);
    SX = new Float32Array(cols); CX = new Float32Array(cols); SY = new Float32Array(rows); CY = new Float32Array(rows);
    for (let i = 0; i < cols; i++) { const x = ox + i * gap; SX[i] = Math.sin(x * 0.0105); CX[i] = Math.cos(x * 0.0105); }
    for (let j = 0; j < rows; j++) { const y = oy + j * gap; SY[j] = Math.sin(y * 0.0125); CY[j] = Math.cos(y * 0.0125); }
    for (let j = 0, k = 0; j < rows; j++) for (let i = 0; i < cols; i++, k++) {
      const x = ox + i * gap, y = oy + j * gap, q = hush(x, y), e = edge(x, y);
      E[k] = e * q; Q[k] = q; EE[k] = Math.sqrt(e) * q;
      SD[k] = Math.sin((x - y) * 0.006); CD[k] = Math.cos((x - y) * 0.006);
    }
  };

  // pointer, eased so the field follows rather than snaps
  const ptr = { x: -9999, y: -9999, tx: -9999, ty: -9999, on: 0, ton: 0 };
  const rings = [], signals = [];
  let t = 0, last = 0, nextRing = 1.2, nextSignal = 0.4, raf = 0, seen = false;

  const edge = (x, y) => {
    const dx = (x / W - o.mask[0]) / o.mask[2], dy = (y / H - o.mask[1]) / o.mask[3];
    return 1 - smooth(0.3, 1, Math.sqrt(dx * dx + dy * dy));
  };
  const spawnRing = (x, y, strong) => rings.push({ x, y, t0: t, strong: strong ? 1 : 0.7 });
  const spawnSignal = () => {
    // a line near the middle of the field, so pulses run where the dots are visible
    for (let k = 0; k < 6; k++) {
      const horiz = Math.random() < 0.6;
      const line = horiz ? Math.floor(rows * (0.2 + Math.random() * 0.6)) : Math.floor(cols * (0.15 + Math.random() * 0.7));
      const len = horiz ? cols : rows;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const start = dir > 0 ? Math.floor(len * Math.random() * 0.4) : Math.floor(len * (0.6 + Math.random() * 0.4));
      const mid = horiz ? edge(W / 2, oy + line * gap) : edge(ox + line * gap, H / 2);
      if (mid < 0.25) continue;
      signals.push({ horiz, line, pos: start, dir, speed: 7 + Math.random() * 6, tail: 5 + Math.floor(Math.random() * 4), life: 2 + Math.random() * 2.5, age: 0 });
      return;
    }
  };

  // A slow machine drops to 1x resolution rather than stutter.
  let slow = 0, timed = 0;
  const frame = (now) => {
    const raw = last ? (now - last) / 1000 : 0.016, dt = Math.min(0.05, raw);
    last = now; t += dt;
    if (maxDpr > 1 && timed < 120) {
      timed++; if (raw > 0.024) slow++;
      if (timed === 120 && slow > 60) { maxDpr = 1; size(); prepare(); }
    }
    draw(dt);
    raf = seen && !document.hidden ? requestAnimationFrame(frame) : 0;
  };

  const draw = (dt) => {
    ctx.clearRect(0, 0, W, H);
    if (!base || !E) return;

    ptr.x += (ptr.tx - ptr.x) * Math.min(1, dt * 10);
    ptr.y += (ptr.ty - ptr.y) * Math.min(1, dt * 10);
    ptr.on += (ptr.ton - ptr.on) * Math.min(1, dt * 5);

    if (!still) {
      if (o.rings && (nextRing -= dt) <= 0) {
        nextRing = 3.6 + Math.random() * 2.4;
        spawnRing(W * (o.mask[0] + (Math.random() - 0.5) * o.mask[2] * 0.8), H * (o.mask[1] + (Math.random() - 0.5) * o.mask[3] * 0.7));
      }
      if (o.signals && (nextSignal -= dt) <= 0 && signals.length < 4) { nextSignal = 0.5 + Math.random() * 0.9; spawnSignal(); }
    }

    boost.fill(0);
    for (let s = signals.length - 1; s >= 0; s--) {
      const g = signals[s];
      g.pos += g.dir * g.speed * dt; g.age += dt;
      const fade = Math.min(1, g.age * 4) * Math.min(1, (g.life - g.age) * 2);
      if (fade <= 0) { signals.splice(s, 1); continue; }
      const head = Math.round(g.pos), len = g.horiz ? cols : rows;
      for (let k = 0; k <= g.tail; k++) {
        const c = head - g.dir * k;
        if (c < 0 || c >= len) continue;
        const v = (1 - k / (g.tail + 1)) ** 1.6 * fade;
        const idx = g.horiz ? g.line * cols + c : c * cols + g.line;
        if (idx >= 0 && idx < boost.length) boost[idx] = Math.max(boost[idx], v);
      }
    }
    const maxR = Math.hypot(W, H) * 0.55, SPEED = 260;
    for (let r = rings.length - 1; r >= 0; r--) if ((t - rings[r].t0) * SPEED > maxR) rings.splice(r, 1);

    const R = gap * 7.5, R2 = R * R;
    const [br, bg, bb, ba] = base, [hr, hg, hb, ha] = hi;
    const baseFill = `rgb(${br},${bg},${bb})`;
    // resting dots are batched into a few alpha levels: one fill per level, not per dot
    const LEVELS = 10, topA = ba * 1.3, paths = Array.from({ length: LEVELS }, () => new Path2D());

    // terrain: two slow interfering waves, sin(p + wt) expanded so no sin runs per dot
    const s1 = Math.sin(t * 0.55), c1 = Math.cos(t * 0.55), s2 = Math.sin(t * 0.42), c2 = Math.cos(t * 0.42);
    const s3 = Math.sin(t * 0.8), c3 = Math.cos(t * 0.8);
    const near = ptr.on > 0.01, nr = rings.length;

    for (let j = 0; j < rows; j++) {
      const y0 = oy + j * gap, wy = SY[j] * c2 - CY[j] * s2;
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i, e = E[k];
        if (e < 0.015) continue;
        let x = ox + i * gap, y = y0;

        const w = 0.5 + 0.32 * (SX[i] * c1 + CX[i] * s1) * wy + 0.18 * (SD[k] * c3 + CD[k] * s3);
        let rad = 0.55 + w * 0.95;
        const a = ba * (0.35 + 0.95 * w) * e;
        let h = boost[k];

        if (near) {
          const dx = x - ptr.x, dy = y - ptr.y, d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            const d = Math.sqrt(d2) || 1, f = (1 - d / R) ** 2 * ptr.on;
            x += (dx / d) * f * gap * 0.55; y += (dy / d) * f * gap * 0.55;
            rad += f * 1.3; h = Math.max(h, f * 1.05);
          }
        }
        for (let r = 0; r < nr; r++) {
          const g = rings[r], front = (t - g.t0) * SPEED;
          const d = Math.hypot(x - g.x, y - g.y), off = (d - front) / (gap * 1.1);
          if (off > -3 && off < 3) {
            const k = Math.exp(-off * off) * (1 - front / maxR) * g.strong;
            h = Math.max(h, k); rad += k * 0.9;
          }
        }

        if (h > 0.02) {
          const m = Math.min(1, h), ee = EE[k];
          ctx.globalAlpha = Math.min(1, a * (1 - m) + ha * m * ee);
          ctx.fillStyle = `rgb(${br + (hr - br) * m | 0},${bg + (hg - bg) * m | 0},${bb + (hb - bb) * m | 0})`;
          ctx.beginPath(); ctx.arc(x, y, rad + m * 0.5, 0, 6.2832); ctx.fill();
        } else {
          const lv = Math.min(LEVELS - 1, (a / topA) * LEVELS | 0), path = paths[lv];
          if (rad < 1.1) path.rect(x - rad, y - rad, rad * 2, rad * 2);
          else { path.moveTo(x + rad, y); path.arc(x, y, rad, 0, 6.2832); }
        }
      }
    }
    ctx.fillStyle = baseFill;
    for (let lv = 0; lv < LEVELS; lv++) { ctx.globalAlpha = ((lv + 0.5) / LEVELS) * topA; ctx.fill(paths[lv]); }

    // blueprint crosshairs on a coarse lattice
    if (o.marks) {
      const [mr, mg, mb, ma] = mark;
      ctx.strokeStyle = `rgb(${mr},${mg},${mb})`; ctx.lineWidth = 1;
      const step = 8, arm = 4.5;
      for (let j = 3; j < rows; j += step) for (let i = 4 + (j % 2) * 4; i < cols; i += step * 2) {
        const x = ox + i * gap, y = oy + j * gap, e = E[j * cols + i];
        if (e < 0.2) continue;
        ctx.globalAlpha = ma * e;
        ctx.beginPath();
        ctx.moveTo(Math.round(x - arm) + 0.5, Math.round(y) + 0.5); ctx.lineTo(Math.round(x + arm) + 0.5, Math.round(y) + 0.5);
        ctx.moveTo(Math.round(x) + 0.5, Math.round(y - arm) + 0.5); ctx.lineTo(Math.round(x) + 0.5, Math.round(y + arm) + 0.5);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };

  const kick = () => { if (!raf && seen && !document.hidden && !still) { last = 0; raf = requestAnimationFrame(frame); } else if (still) draw(0); };

  const onMove = (e) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    const r = host.getBoundingClientRect();
    ptr.tx = e.clientX - r.left; ptr.ty = e.clientY - r.top;
    if (ptr.on < 0.01) { ptr.x = ptr.tx; ptr.y = ptr.ty; }
    ptr.ton = 1;
  };
  const onLeave = () => { ptr.ton = 0; };
  const onDown = (e) => {
    if (still) return;
    const r = host.getBoundingClientRect();
    spawnRing(e.clientX - r.left, e.clientY - r.top, true);
  };
  if (fine && track) { track.addEventListener("pointermove", onMove, { passive: true }); track.addEventListener("pointerleave", onLeave); }
  if (track && o.rings) track.addEventListener("pointerdown", onDown, { passive: true });

  const ro = new ResizeObserver(() => { size(); colours(); measure(); prepare(); if (still) draw(0); });
  ro.observe(host);
  // text can move after load (fonts, animations), so look again now and then
  const remeasure = setInterval(() => { if (seen) { measure(); prepare(); } }, 1500);
  // Off screen, the canvas gives its pixels back; tall sections would otherwise hold tens of MB each.
  const io = new IntersectionObserver(([en]) => {
    seen = en.isIntersecting;
    if (seen && !cv.width) { size(); prepare(); }
    if (!seen) { cv.width = 0; cv.height = 0; }
    kick();
  }, { rootMargin: "120px" });
  io.observe(host);
  const mo = new MutationObserver(() => { colours(); if (still) draw(0); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  const onVis = () => kick();
  document.addEventListener("visibilitychange", onVis);

  size(); colours(); measure(); prepare(); if (still) draw(0);

  return () => {
    cancelAnimationFrame(raf); raf = 0; seen = false;
    ro.disconnect(); io.disconnect(); mo.disconnect(); clearInterval(remeasure);
    document.removeEventListener("visibilitychange", onVis);
    if (track) { track.removeEventListener("pointermove", onMove); track.removeEventListener("pointerleave", onLeave); track.removeEventListener("pointerdown", onDown); }
    cv.remove();
  };
}
