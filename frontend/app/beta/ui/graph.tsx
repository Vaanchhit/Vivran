"use client";
// The teaching-memory map: a 3D force layout drawn on a 2D canvas. No graph
// library; at a few dozen nodes a plain O(n²) layout and painter's-order
// drawing are plenty, and it keeps the look under our control.
import React, { useEffect, useRef } from "react";
import type { GEdge, GNode, NodeKind } from "../lib/memory";

export const KIND_COLOUR: Record<"light" | "dark", Record<NodeKind, string>> = {
  light: { you: "#FFFFFF", class: "#E9E1D6", topic: "#F06A3B", source: "#3CC29B", made: "#E9B44C", pattern: "#8F8CF2" },
  dark: { you: "#FFFFFF", class: "#EDE7DD", topic: "#F27A4E", source: "#52D1AC", made: "#F0C163", pattern: "#A19EF7" },
};
const SIZE: Record<NodeKind, number> = { you: 10, class: 7.5, topic: 6, source: 5, pattern: 5.5, made: 4.6 };

interface Body { id: string; x: number; y: number; z: number; vx: number; vy: number; vz: number }
interface Projected { id: string; sx: number; sy: number; r: number; depth: number; s: number }

export interface GraphHandle { zoom: (f: number) => void; reset: () => void; toggleSpin: () => boolean }

export function MemoryGraph({ nodes, edges, theme, hidden, selected, query, onSelect, handle }: {
  nodes: GNode[]; edges: GEdge[]; theme: "light" | "dark"; hidden: Set<NodeKind>;
  selected: string | null; query: string; onSelect: (id: string | null) => void;
  handle?: React.MutableRefObject<GraphHandle | null>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bodies = useRef(new Map<string, Body>());
  const live = useRef({ nodes, edges, theme, hidden, selected, query, onSelect });
  live.current = { nodes, edges, theme, hidden, selected, query, onSelect };
  const cam = useRef({ yaw: 0.6, pitch: -0.25, zoom: 1, zoomT: 1, ox: 0, oy: 0, cx: 0, cy: 0, cz: 0, spin: true, idleUntil: 0, alpha: 1, hover: null as string | null });

  // Keep positions across updates; new nodes are born beside a neighbour, then the layout reheats.
  useEffect(() => {
    const map = bodies.current;
    const ids = new Set(nodes.map((n) => n.id));
    Array.from(map.keys()).forEach((k) => { if (!ids.has(k)) map.delete(k); });
    let born = 0;
    nodes.forEach((n) => {
      if (map.has(n.id)) return;
      const e = edges.find((x) => (x.a === n.id && map.has(x.b)) || (x.b === n.id && map.has(x.a)));
      const at = e ? map.get(e.a === n.id ? e.b : e.a)! : { x: 0, y: 0, z: 0 };
      const j = () => (Math.random() - 0.5) * (map.size ? 14 : 30);
      map.set(n.id, { id: n.id, x: at.x + j(), y: at.y + j(), z: at.z + j(), vx: 0, vy: 0, vz: 0 });
      born++;
    });
    if (born) cam.current.alpha = Math.max(cam.current.alpha, born > 5 ? 1 : 0.5);
  }, [nodes, edges]);

  // Selecting a point flies in; clearing it eases back out.
  useEffect(() => { const c = cam.current; c.zoomT = selected ? Math.max(c.zoomT, 1.8) : 1; }, [selected]);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { cam.current.spin = false; for (let i = 0; i < 300; i++) tick(); cam.current.alpha = 0; }
    let w = 0, h = 0, raf = 0, proj: Projected[] = [];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => { w = el.clientWidth; h = el.clientHeight; el.width = w * dpr; el.height = h * dpr; };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);

    function tick() {
      const c = cam.current, { edges } = live.current;
      const list = Array.from(bodies.current.values());
      const a = c.alpha;
      if (a < 0.003) return;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const p = list[i], q = list[j];
        let dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
        const d2 = dx * dx + dy * dy + dz * dz + 0.5;
        if (d2 > 90000) continue;
        const f = (1400 * a) / d2 / Math.sqrt(d2);
        dx *= f; dy *= f; dz *= f;
        p.vx += dx; p.vy += dy; p.vz += dz; q.vx -= dx; q.vy -= dy; q.vz -= dz;
      }
      for (const e of edges) {
        const p = bodies.current.get(e.a), q = bodies.current.get(e.b);
        if (!p || !q) continue;
        const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const f = ((d - 26) / d) * 0.07 * a;
        p.vx += dx * f; p.vy += dy * f; p.vz += dz * f; q.vx -= dx * f; q.vy -= dy * f; q.vz -= dz * f;
      }
      for (const p of list) {
        p.vx -= p.x * 0.01 * a; p.vy -= p.y * 0.01 * a; p.vz -= p.z * 0.01 * a;
        p.vx *= 0.8; p.vy *= 0.8; p.vz *= 0.8;
        p.x += p.vx; p.y += p.vy; p.z += p.vz;
      }
      c.alpha *= 0.985;
    }

    function frame(t: number) {
      const c = cam.current, L = live.current;
      tick();
      if (c.spin && t > c.idleUntil && !reduce) c.yaw += 0.0016;
      // Ease the camera's centre onto the selected node.
      const target = L.selected ? bodies.current.get(L.selected) : null;
      const k = 0.08;
      c.zoom += (c.zoomT - c.zoom) * k;
      // Keep the selected point clear of the details card: to its left on wide screens, above it on phones.
      const wide = w > 640;
      c.ox += ((L.selected && wide ? -150 : 0) - c.ox) * k; c.oy += ((L.selected && !wide ? -h * 0.24 : 0) - c.oy) * k;
      c.cx += ((target?.x ?? 0) - c.cx) * k; c.cy += ((target?.y ?? 0) - c.cy) * k; c.cz += ((target?.z ?? 0) - c.cz) * k;

      const list = Array.from(bodies.current.values());
      // Fit to where most points are, so one straggler doesn't shrink the whole map.
      const ds = list.map((b) => Math.hypot(b.x, b.y, b.z)).sort((m, n) => m - n);
      const R = Math.max(40, ds[Math.floor(ds.length * 0.9)] ?? 40);
      const scale = (Math.min(w, h) / (2.1 * R)) * c.zoom;
      const F = 4 * R;
      const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
      const byId = new Map(L.nodes.map((n) => [n.id, n]));
      proj = [];
      for (const b of list) {
        const n = byId.get(b.id); if (!n || L.hidden.has(n.kind)) continue;
        const x = b.x - c.cx, y = b.y - c.cy, z = b.z - c.cz;
        const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
        const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
        const s = F / (F + z2);
        proj.push({ id: b.id, sx: w / 2 + c.ox + x1 * s * scale, sy: h / 2 + c.oy + y2 * s * scale, r: SIZE[n.kind] * s * Math.max(0.7, Math.min(1.6, scale / 2.2)), depth: z2, s });
      }
      const P = new Map(proj.map((p) => [p.id, p]));
      const focus = c.hover ?? L.selected;
      const near = new Set<string>();
      if (focus) { near.add(focus); for (const e of L.edges) { if (e.a === focus) near.add(e.b); if (e.b === focus) near.add(e.a); } }
      const q = L.query.trim().toLowerCase();
      const match = (n: GNode) => !!q && (n.label.toLowerCase().includes(q) || n.sub.toLowerCase().includes(q));
      const pal = KIND_COLOUR[L.theme];

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // Edges, far to near.
      const es = L.edges.map((e) => ({ e, p: P.get(e.a), q: P.get(e.b) })).filter((x) => x.p && x.q)
        .sort((m, n) => (n.p!.depth + n.q!.depth) - (m.p!.depth + m.q!.depth));
      for (const { e, p, q: r } of es) {
        const on = focus && (e.a === focus || e.b === focus);
        const fade = Math.max(0.25, Math.min(1, (p!.s + r!.s) / 2 - 0.35));
        ctx.strokeStyle = on ? pal[byId.get(focus === e.a ? e.b : e.a)!.kind] : L.theme === "dark" ? "rgba(237,231,221,1)" : "rgba(233,225,214,1)";
        ctx.globalAlpha = on ? 0.85 : (focus ? 0.05 : 0.16) * fade;
        ctx.lineWidth = on ? 1.4 : 1;
        ctx.beginPath(); ctx.moveTo(p!.sx, p!.sy); ctx.lineTo(r!.sx, r!.sy); ctx.stroke();
      }
      // Nodes, far to near, with a soft glow.
      proj.sort((m, n) => n.depth - m.depth);
      const pulse = (Math.sin(t / 380) + 1) / 2;
      for (const p of proj) {
        const n = byId.get(p.id)!;
        const col = pal[n.kind];
        const dim = focus && !near.has(p.id) ? 0.16 : 1;
        const fade = Math.max(0.35, Math.min(1, p.s - 0.2));
        ctx.globalAlpha = 0.22 * dim * fade;
        const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, p.r * 3.2);
        g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.sx, p.sy, p.r * 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = dim * fade;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.sx, p.sy, p.r, 0, Math.PI * 2); ctx.fill();
        if (p.id === L.selected || match(n)) {
          ctx.globalAlpha = p.id === L.selected ? 0.9 : 0.4 + 0.5 * pulse;
          ctx.strokeStyle = col; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p.sx, p.sy, p.r + 4 + (p.id === L.selected ? 0 : pulse * 3), 0, Math.PI * 2); ctx.stroke();
        }
      }
      // Labels last, most important first; any that would collide with one already drawn are skipped.
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      const rank = (p: Projected) => { const n = byId.get(p.id)!; return p.id === focus ? 0 : n.kind === "you" ? 1 : n.kind === "class" ? 2 : n.kind === "topic" ? 3 : 4; };
      const boxes: [number, number, number, number][] = [];
      for (const p of proj.slice().sort((m, n) => rank(m) - rank(n) || m.depth - n.depth)) {
        const n = byId.get(p.id)!;
        const always = n.kind === "you" || n.kind === "class" || n.kind === "topic";
        const show = focus ? near.has(p.id) : always || p.s > 1.18 || match(n);
        if (!show) continue;
        const big = n.kind === "class" || n.kind === "you" || p.id === focus;
        ctx.font = `${big ? 600 : 500} ${big ? 12.5 : 11.5}px Inter, system-ui, sans-serif`;
        const text = n.label.length > 34 ? n.label.slice(0, 33) + "…" : n.label;
        const tw = ctx.measureText(text).width, x0 = p.sx - tw / 2 - 3, y0 = p.sy + p.r + 4, x1 = x0 + tw + 6, y1 = y0 + 16;
        if (p.id !== focus && boxes.some(([a, b, c2, d]) => x0 < c2 && x1 > a && y0 < d && y1 > b)) continue;
        boxes.push([x0, y0, x1, y1]);
        ctx.globalAlpha = focus ? 1 : Math.max(0.5, Math.min(1, p.s - 0.15));
        ctx.lineWidth = 3; ctx.strokeStyle = L.theme === "dark" ? "rgba(14,13,12,0.9)" : "rgba(21,17,13,0.9)";
        ctx.strokeText(text, p.sx, y0 + 1);
        ctx.fillStyle = big ? "#FFFFFF" : "rgba(244,239,231,0.88)";
        ctx.fillText(text, p.sx, y0 + 1);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // Orbit with a drag, zoom with the wheel or a pinch, click to focus.
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0, pinch = 0;
    const hit = (x: number, y: number) => {
      let best: Projected | null = null, bd = Infinity;
      for (const p of proj) { const d = Math.hypot(p.sx - x, p.sy - y); if (d < p.r + 7 && d < bd) { best = p; bd = d; } }
      return best?.id ?? null;
    };
    const local = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const down = (e: PointerEvent) => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); moved = 0; if (pts.size === 2) { const [a, b] = Array.from(pts.values()); pinch = Math.hypot(a.x - b.x, a.y - b.y); } };
    const move = (e: PointerEvent) => {
      const p = local(e), c = cam.current;
      const prev = pts.get(e.pointerId);
      if (!prev) { c.hover = hit(p.x, p.y); el.style.cursor = c.hover ? "pointer" : "grab"; return; }
      if (pts.size === 2) {
        pts.set(e.pointerId, p);
        const [a, b] = Array.from(pts.values()); const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) c.zoom = c.zoomT = Math.max(0.4, Math.min(3.5, c.zoom * (d / pinch)));
        pinch = d; moved += 10; return;
      }
      const dx = p.x - prev.x, dy = p.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      c.yaw += dx * 0.006; c.pitch = Math.max(-1.3, Math.min(1.3, c.pitch + dy * 0.006));
      c.idleUntil = performance.now() + 3500; c.hover = null; el.style.cursor = "grabbing";
      pts.set(e.pointerId, p);
    };
    const up = (e: PointerEvent) => {
      const p = local(e);
      if (pts.size === 1 && moved < 5) live.current.onSelect(hit(p.x, p.y));
      pts.delete(e.pointerId); pinch = 0; el.style.cursor = "grab";
    };
    const leave = () => { if (!pts.size) cam.current.hover = null; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const c = cam.current; c.zoom = c.zoomT = Math.max(0.4, Math.min(3.5, c.zoom * Math.exp(-e.deltaY * 0.0015))); c.idleUntil = performance.now() + 2000; };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up); el.addEventListener("pointerleave", leave); el.addEventListener("wheel", wheel, { passive: false });

    if (handle) handle.current = {
      zoom: (f) => { cam.current.zoomT = Math.max(0.4, Math.min(3.5, cam.current.zoomT * f)); },
      reset: () => { Object.assign(cam.current, { yaw: 0.6, pitch: -0.25, zoomT: 1 }); live.current.onSelect(null); },
      toggleSpin: () => (cam.current.spin = !cam.current.spin),
    };
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up); el.removeEventListener("pointerleave", leave); el.removeEventListener("wheel", wheel);
    };
  }, [handle]);

  return <canvas ref={canvas} className="block w-full h-full touch-none select-none cursor-grab" aria-label="Teaching memory map. Drag to turn it, scroll to zoom, click a point to see its connections." role="img" />;
}
