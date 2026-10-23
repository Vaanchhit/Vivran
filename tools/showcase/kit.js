// Design kit for the showcase decks: a 13.33 × 7.5 in canvas, a small set of
// slide compositions, real photos cropped to their frames, icons in circles.
// Every deck passes a palette; the compositions never hard-code a colour.
const pptxgen = require("pptxgenjs");
const sharp = require("sharp");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const W = 13.333, H = 7.5, M = 0.6;

/** Crop a photo to exactly the frame it will fill (no stretching), as base64. */
async function photo(file, w, h, position = "attention") {
  const px = Math.round(w * 160), py = Math.round(h * 160);
  let img = sharp(file);
  if (position && typeof position === "object") {
    // crop a region first (fractions of the original), e.g. to leave out labels drawn on a micrograph
    const m = await sharp(file).metadata();
    img = sharp(await img.extract({ left: Math.round(position.l * m.width), top: Math.round(position.t * m.height), width: Math.round(position.w * m.width), height: Math.round(position.h * m.height) }).toBuffer());
    position = "centre";
  }
  const buf = await img.resize(px, py, { fit: "cover", position }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return "image/jpeg;base64," + buf.toString("base64");
}

/** An icon from react-icons as a PNG, coloured. */
async function icon(Comp, color, px = 256) {
  const svg = renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: px }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

function deck(P, meta) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "Vivran";
  pres.company = "Vivran";
  pres.title = meta.title;
  pres.theme = { headFontFace: P.head, bodyFontFace: P.body };
  // Layouts: the frame only. Content is composed per slide.
  pres.defineSlideMaster({
    title: "Content", background: { color: P.bg },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: M, y: 0.45, w: W - 2 * M, h: 0.9, fontFace: P.head, fontSize: 34, bold: true, color: P.ink, valign: "middle", align: "left", margin: 0 }, text: "" } },
      { text: { text: meta.footer, options: { x: M, y: H - 0.42, w: 8, h: 0.3, fontFace: P.body, fontSize: 10, color: P.muted, margin: 0 } } },
    ],
    slideNumber: { x: W - M - 0.6, y: H - 0.42, w: 0.6, h: 0.3, fontFace: P.body, fontSize: 10, color: P.muted, align: "right" },
  });
  pres.defineSlideMaster({ title: "Dark", background: { color: P.dark },
    objects: [{ placeholder: { options: { name: "title", type: "title", x: M, y: 0.45, w: W - 2 * M, h: 0.9, fontFace: P.head, fontSize: 34, bold: true, color: "FFFFFF", valign: "middle", align: "left", margin: 0 }, text: "" } }],
    slideNumber: { x: W - M - 0.6, y: H - 0.42, w: 0.6, h: 0.3, fontFace: P.body, fontSize: 10, color: "BFC6D1", align: "right" },
  });
  pres.defineSlideMaster({ title: "Blank", background: { color: P.bg } });
  return pres;
}

const shadow = () => ({ type: "outer", color: "000000", opacity: 0.14, blur: 10, offset: 3, angle: 90 });
const txt = (s, t, o) => s.addText(t, { isTextBox: true, margin: 0, valign: "top", ...o });
/** Photo credit in a small dark pill, placed inside the photo's own corner so it never meets the footer. */
const credit = (s, c, P, at = { right: W, bottom: H }) => {
  const t = `Photo: ${c.author.split(/[,(;]/)[0].trim().slice(0, 34)} · ${c.license}`;
  const w = Math.min(3.6, 0.075 * t.length + 0.3);
  s.addShape("roundRect", { x: at.right - w - 0.12, y: at.bottom - 0.36, w, h: 0.24, rectRadius: 0.06, fill: { color: "000000", transparency: 45 }, line: { type: "none" } });
  txt(s, t, { x: at.right - w - 0.12, y: at.bottom - 0.36, w, h: 0.24, fontSize: 8, color: "FFFFFF", align: "center", valign: "middle", fontFace: P.body });
};

// ── compositions ────────────────────────────────────────────

/** Full-bleed photo, darkened, with a big title. */
async function cover(pres, P, d) {
  const s = pres.addSlide({ masterName: "Blank" });
  s.background = { color: P.dark };
  s.addImage({ data: await photo(d.img, W, H, d.pos), x: 0, y: 0, w: W, h: H, altText: d.alt });
  s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: P.dark, transparency: d.shade ?? 30 }, line: { type: "none" } });
  txt(s, d.kicker.toUpperCase(), { x: M + 0.1, y: 2.2, w: 6.8, h: 0.4, fontSize: 14, bold: true, color: P.accent, charSpacing: 3, fontFace: P.body });
  txt(s, d.title, { x: M + 0.1, y: 2.65, w: 6.9, h: 1.8, fontSize: 54, bold: true, color: "FFFFFF", fontFace: P.head, valign: "bottom", fit: "shrink" });
  txt(s, d.subtitle, { x: M + 0.1, y: 4.6, w: 6.4, h: 1.0, fontSize: 20, color: "E9ECEF", fontFace: P.body });
  credit(s, d.credit, P);
  s.addNotes(d.notes);
  return s;
}

/** Title + icon rows ("By the end of this lesson…"). */
async function iconRows(pres, P, d) {
  const s = pres.addSlide({ masterName: "Content" });
  s.addText(d.title, { placeholder: "title" });
  const rowH = 1.35, top = 1.75;
  for (const [i, r] of d.rows.entries()) {
    const y = top + i * (rowH + 0.2);
    s.addShape(pres.ShapeType.ellipse, { x: M, y: y + 0.12, w: 1.0, h: 1.0, fill: { color: P.tint }, line: { type: "none" } });
    s.addImage({ data: await icon(r.icon, P.primary), x: M + 0.25, y: y + 0.37, w: 0.5, h: 0.5 });
    txt(s, r.head, { x: M + 1.35, y: y + 0.12, w: 7.4, h: 0.5, fontSize: 22, bold: true, color: P.ink, fontFace: P.head });
    txt(s, r.body, { x: M + 1.35, y: y + 0.6, w: 7.4, h: 0.7, fontSize: 16, color: P.muted, fontFace: P.body });
  }
  if (d.img) {
    s.addImage({ data: await photo(d.img, 3.4, 4.6, d.pos), x: W - M - 3.4, y: 1.75, w: 3.4, h: 4.6, altText: d.alt });
    credit(s, d.credit, P, { right: W - M, bottom: 1.75 + 4.6 });
  }
  s.addNotes(d.notes);
}

/** Half-bleed photo on one side, points on the other. */
async function split(pres, P, d) {
  const s = pres.addSlide({ masterName: "Blank" });
  const right = d.side === "right";
  const iw = 5.9;
  s.addImage({ data: await photo(d.img, iw, H, d.pos), x: right ? W - iw : 0, y: 0, w: iw, h: H, altText: d.alt });
  const x0 = right ? M : iw + 0.7, cw = W - iw - 0.7 - M;
  if (d.kicker) txt(s, d.kicker.toUpperCase(), { x: x0, y: 0.75, w: cw, h: 0.35, fontSize: 12, bold: true, color: P.primary, charSpacing: 3, fontFace: P.body });
  txt(s, d.title, { x: x0, y: 1.1, w: cw, h: 1.3, fontSize: 34, bold: true, color: P.ink, fontFace: P.head, valign: "top", fit: "shrink" });
  let y = 2.55;
  for (const p of d.points) {
    s.addShape(pres.ShapeType.ellipse, { x: x0, y: y + 0.1, w: 0.16, h: 0.16, fill: { color: P.primary }, line: { type: "none" } });
    txt(s, [{ text: p.head ?? "", options: { bold: true, color: P.ink, breakLine: true } }, { text: p.body, options: { color: P.muted } }],
      { x: x0 + 0.35, y: y - 0.04, w: cw - 0.35, h: 0.95, fontSize: 17, fontFace: P.body });
    y += 1.05;
  }
  if (d.callout) {
    s.addShape(pres.ShapeType.roundRect, { x: x0, y: H - 1.55, w: cw, h: 0.95, rectRadius: 0.08, fill: { color: P.tint }, line: { type: "none" } });
    txt(s, d.callout, { x: x0 + 0.25, y: H - 1.45, w: cw - 0.5, h: 0.75, fontSize: 15, italic: true, color: P.ink, fontFace: P.body, valign: "middle" });
  }
  credit(s, d.credit, P, { right: right ? W : iw, bottom: H });
  s.addNotes(d.notes);
}

/** Numbered steps joined by arrows. */
async function steps(pres, P, d) {
  const s = pres.addSlide({ masterName: "Content" });
  s.addText(d.title, { placeholder: "title" });
  const n = d.steps.length, gap = 0.35, cw = (W - 2 * M - gap * (n - 1)) / n, y = 1.9, ch = 3.55;
  for (const [i, st] of d.steps.entries()) {
    const x = M + i * (cw + gap);
    s.addShape(pres.ShapeType.roundRect, { x, y, w: cw, h: ch, rectRadius: 0.1, fill: { color: "FFFFFF" }, line: { color: P.line, width: 1 }, shadow: shadow() });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.3, y: y + 0.3, w: 0.9, h: 0.9, fill: { color: P.tint }, line: { type: "none" } });
    s.addImage({ data: await icon(st.icon, P.primary), x: x + 0.52, y: y + 0.52, w: 0.46, h: 0.46 });
    txt(s, String(i + 1).padStart(2, "0"), { x: x + cw - 0.9, y: y + 0.35, w: 0.6, h: 0.4, fontSize: 14, bold: true, color: P.accentInk, align: "right", fontFace: P.body });
    txt(s, st.head, { x: x + 0.3, y: y + 1.45, w: cw - 0.6, h: 1.0, fontSize: n > 4 ? 17 : 19, bold: true, color: P.ink, fontFace: P.head, valign: "top" });
    txt(s, st.body, { x: x + 0.3, y: y + 2.55, w: cw - 0.6, h: 1.25, fontSize: 14, color: P.muted, fontFace: P.body });
    if (i < n - 1) s.addShape(pres.ShapeType.rightArrow, { x: x + cw + 0.05, y: y + ch / 2 - 0.15, w: 0.25, h: 0.3, fill: { color: P.primary }, line: { type: "none" } });
  }
  if (d.foot) txt(s, d.foot, { x: M, y: y + ch + 0.3, w: W - 2 * M, h: 0.45, fontSize: 15, italic: true, color: P.muted, fontFace: P.body });
  s.addNotes(d.notes);
}

/** Two (or three) columns that compare. */
async function columns(pres, P, d) {
  const s = pres.addSlide({ masterName: "Content" });
  s.addText(d.title, { placeholder: "title" });
  const n = d.cols.length, gap = 0.4, cw = (W - 2 * M - gap * (n - 1)) / n, y = 1.75;
  // as tall as the fullest column needs (roughly), never taller than the slide allows
  const need = Math.max(...d.cols.map(c => c.items.reduce((a, t) => a + (t.length > (n > 2 ? 30 : 48) ? 0.78 : 0.48), 0)));
  const ch = Math.min(4.55, Math.max(2.9, 1.75 + need + 0.3));
  for (const [i, c] of d.cols.entries()) {
    const x = M + i * (cw + gap), col = c.color ?? P.primary;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: cw, h: ch, rectRadius: 0.1, fill: { color: c.fill ?? P.tint }, line: { type: "none" } });
    if (c.icon) {
      s.addShape(pres.ShapeType.ellipse, { x: x + 0.35, y: y + 0.35, w: 0.85, h: 0.85, fill: { color: col }, line: { type: "none" } });
      s.addImage({ data: await icon(c.icon, "FFFFFF"), x: x + 0.56, y: y + 0.56, w: 0.43, h: 0.43 });
    }
    const tx = c.icon ? x + 1.4 : x + 0.35;
    txt(s, c.head, { x: tx, y: y + 0.38, w: cw - (tx - x) - 0.3, h: 0.5, fontSize: 22, bold: true, color: col, fontFace: P.head });
    if (c.sub) txt(s, c.sub, { x: tx, y: y + 0.85, w: cw - (tx - x) - 0.3, h: 0.4, fontSize: 13, color: P.muted, fontFace: P.body });
    txt(s, c.items.map((t, k) => ({ text: t, options: { bullet: { indent: 16 }, breakLine: k < c.items.length - 1 } })),
      { x: x + 0.35, y: y + 1.5, w: cw - 0.7, h: ch - 1.7, fontSize: 16, color: P.ink, fontFace: P.body, paraSpaceAfter: 10 });
  }
  if (d.foot) txt(s, d.foot, { x: M, y: y + ch + 0.25, w: W - 2 * M, h: 0.4, fontSize: 14, italic: true, color: P.muted, fontFace: P.body });
  s.addNotes(d.notes);
}

/** A table with a shaded header. */
function table(pres, P, d) {
  const s = pres.addSlide({ masterName: "Content" });
  s.addText(d.title, { placeholder: "title" });
  const head = d.header.map((h, i) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: i === 0 ? P.ink : d.headColors?.[i - 1] ?? P.primary }, fontSize: 16, fontFace: P.head } }));
  const rows = d.rows.map((r, ri) => r.map((c, i) => ({ text: c, options: { bold: i === 0, color: P.ink, fontSize: 15, fontFace: P.body, fill: { color: ri % 2 ? "FFFFFF" : P.tint } } })));
  s.addTable([head, ...rows], { x: M, y: 1.7, w: W - 2 * M, colW: d.colW, rowH: 0.62, border: { type: "solid", color: "FFFFFF", pt: 2 }, valign: "middle", margin: 0.12 });
  if (d.foot) txt(s, d.foot, { x: M, y: 6.45, w: W - 2 * M, h: 0.4, fontSize: 14, italic: true, color: P.muted, fontFace: P.body });
  s.addNotes(d.notes);
}

/** One idea, very large, on the dark background. */
function bigIdea(pres, P, d) {
  const s = pres.addSlide({ masterName: "Dark" });
  txt(s, d.kicker.toUpperCase(), { x: M, y: 1.4, w: W - 2 * M, h: 0.4, fontSize: 14, bold: true, color: P.accent, charSpacing: 3, fontFace: P.body });
  txt(s, d.big, { x: M, y: 1.9, w: W - 2 * M - 1, h: 1.9, fontSize: 44, bold: true, color: "FFFFFF", fontFace: P.head, fit: "shrink" });
  s.addShape(pres.ShapeType.rect, { x: M, y: 4.05, w: 0.9, h: 0.06, fill: { color: P.accent }, line: { type: "none" } });
  txt(s, d.body, { x: M, y: 4.35, w: 8.8, h: 1.6, fontSize: 19, color: "D7DCE3", fontFace: P.body });
  s.addNotes(d.notes);
}

/** A question with four option cards. The answer is in the speaker notes. */
function quiz(pres, P, d) {
  const s = pres.addSlide({ masterName: "Content" });
  s.addText("Quick check", { placeholder: "title" });
  txt(s, d.q, { x: M, y: 1.5, w: W - 2 * M, h: 1.1, fontSize: 26, color: P.ink, fontFace: P.head, valign: "middle" });
  const gw = (W - 2 * M - 0.4) / 2, gh = 1.4;
  d.options.forEach((o, i) => {
    const x = M + (i % 2) * (gw + 0.4), y = 2.9 + Math.floor(i / 2) * (gh + 0.3);
    s.addShape(pres.ShapeType.roundRect, { x, y, w: gw, h: gh, rectRadius: 0.1, fill: { color: "FFFFFF" }, line: { color: P.line, width: 1.25 }, shadow: shadow() });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.3, y: y + 0.37, w: 0.66, h: 0.66, fill: { color: P.primary }, line: { type: "none" } });
    txt(s, "ABCD"[i], { x: x + 0.3, y: y + 0.37, w: 0.66, h: 0.66, fontSize: 20, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: P.body });
    txt(s, o, { x: x + 1.2, y: y + 0.2, w: gw - 1.45, h: gh - 0.4, fontSize: 20, color: P.ink, valign: "middle", fontFace: P.body });
  });
  s.addNotes(`Answer: ${"ABCD"[d.answer]}. ${d.options[d.answer]}. ${d.why}`);
}

/** Closing slide: takeaways on dark. */
function recap(pres, P, d) {
  const s = pres.addSlide({ masterName: "Dark" });
  s.addText(d.title, { placeholder: "title" });
  const n = d.items.length, gap = 0.3, cw = (W - 2 * M - gap * (n - 1)) / n;
  d.items.forEach((t, i) => {
    const x = M + i * (cw + gap);
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.85, w: cw, h: 2.9, rectRadius: 0.1, fill: { color: P.darkCard }, line: { type: "none" } });
    txt(s, String(i + 1), { x: x + 0.35, y: 2.15, w: 1, h: 0.8, fontSize: 40, bold: true, color: P.accent, fontFace: P.head });
    txt(s, t, { x: x + 0.35, y: 3.05, w: cw - 0.7, h: 2.0, fontSize: 18, color: "FFFFFF", fontFace: P.body });
  });
  if (d.task) {
    txt(s, [{ text: "Before next class  ", options: { bold: true, color: P.accent } }, { text: d.task, options: { color: "D7DCE3" } }],
      { x: M, y: 5.25, w: W - 2 * M, h: 0.8, fontSize: 17, fontFace: P.body });
  }
  s.addNotes(d.notes);
}

/** Code on a dark panel, with notes beside it. */
function code(pres, P, d) {
  const s = pres.addSlide({ masterName: "Content" });
  s.addText(d.title, { placeholder: "title" });
  const cw = d.notesSide ? 7.2 : W - 2 * M;
  s.addShape(pres.ShapeType.roundRect, { x: M, y: 1.7, w: cw, h: d.h ?? 3.9, rectRadius: 0.08, fill: { color: P.codeBg }, line: { type: "none" } });
  txt(s, d.code.map(([t, color]) => ({ text: t, options: { color: color ?? P.codeInk, breakLine: true } })),
    { x: M + 0.35, y: 1.95, w: cw - 0.7, h: (d.h ?? 3.9) - 0.5, fontSize: d.size ?? 20, fontFace: "Courier New" });
  if (d.output) {
    const oy = 1.7 + (d.h ?? 3.9) + 0.25;
    txt(s, "OUTPUT", { x: M, y: oy, w: 2, h: 0.3, fontSize: 11, bold: true, color: P.muted, charSpacing: 3, fontFace: P.body });
    txt(s, d.output, { x: M, y: oy + 0.32, w: cw, h: 0.6, fontSize: 18, color: P.ink, fontFace: "Courier New" });
  }
  if (d.notesSide) {
    let y = 1.75;
    for (const n of d.notesSide) {
      s.addShape(pres.ShapeType.roundRect, { x: M + cw + 0.4, y, w: W - 2 * M - cw - 0.4, h: 1.15, rectRadius: 0.08, fill: { color: P.tint }, line: { type: "none" } });
      txt(s, [{ text: n.head + "\n", options: { bold: true, color: P.primary, fontFace: "Courier New" } }, { text: n.body, options: { color: P.ink } }],
        { x: M + cw + 0.6, y: y + 0.12, w: W - 2 * M - cw - 0.8, h: 0.95, fontSize: 14, fontFace: P.body });
      y += 1.3;
    }
  }
  s.addNotes(d.notes);
}

/** Two code panels side by side (wrong vs right). */
function codeCompare(pres, P, d) {
  const s = pres.addSlide({ masterName: "Content" });
  s.addText(d.title, { placeholder: "title" });
  const cw = (W - 2 * M - 0.4) / 2;
  d.panels.forEach((p, i) => {
    const x = M + i * (cw + 0.4);
    txt(s, p.label, { x, y: 1.65, w: cw, h: 0.45, fontSize: 18, bold: true, color: p.color, fontFace: P.head });
    s.addShape(pres.ShapeType.roundRect, { x, y: 2.15, w: cw, h: 2.0, rectRadius: 0.08, fill: { color: P.codeBg }, line: { type: "none" } });
    txt(s, p.code.map((t, k) => ({ text: t, options: { breakLine: k < p.code.length - 1 } })), { x: x + 0.35, y: 2.4, w: cw - 0.7, h: 1.5, fontSize: 20, color: P.codeInk, fontFace: "Courier New" });
    txt(s, [{ text: "Prints  ", options: { bold: true, color: P.muted } }, { text: p.prints, options: { color: P.ink, fontFace: "Courier New" } }], { x, y: 4.35, w: cw, h: 0.45, fontSize: 17, fontFace: P.body });
    txt(s, p.note, { x, y: 4.9, w: cw, h: 0.9, fontSize: 16, color: P.muted, fontFace: P.body });
  });
  s.addNotes(d.notes);
}

module.exports = { codeCompare, W, H, M, deck, cover, iconRows, split, steps, columns, table, bigIdea, quiz, recap, code, photo, icon, txt, credit, shadow };
