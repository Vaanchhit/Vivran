// The five showcase decks. Content is hand-written to textbook accuracy; any
// figure is either well established or labelled as illustrative.
//   node decks.js            → out/<id>.pptx
const fs = require("fs");
const path = require("path");
const K = require("./kit");
const { applyTheme } = require(process.env.PPTX_SKILL + "/scripts/apply_theme.js");
const fa = require("react-icons/fa6");
const md = require("react-icons/md");
const C = require("./img/credits.json");
const IMG = (k) => path.join(__dirname, "img", k + ".jpg");
const { W, H, M, txt } = K;

const PAL = {
  photosynthesis: { head: "Arial", body: "Calibri", bg: "FFFFFF", ink: "17301F", muted: "51645A", primary: "2E7D4F", accent: "F2C14E", accentInk: "B8860B", tint: "E7F3EA", line: "D5E6DA", dark: "0F2A1B", darkCard: "1B3D2A", codeBg: "0F2A1B", codeInk: "E7F3EA" },
  french: { head: "Cambria", body: "Calibri", bg: "FFFFFF", ink: "1B1F3B", muted: "5A5F78", primary: "9E2A2B", accent: "D4AF37", accentInk: "9E2A2B", tint: "F4EAEA", line: "E6D3D3", dark: "14172E", darkCard: "232848", codeBg: "14172E", codeInk: "FFFFFF" },
  cells: { head: "Arial", body: "Calibri", bg: "FFFFFF", ink: "13293D", muted: "52657A", primary: "0F8B8D", accent: "7FD6D0", accentInk: "0F8B8D", tint: "E3F4F4", line: "CFE8E8", dark: "0E2433", darkCard: "18374B", violet: "6A4C9C", violetTint: "EEE8F6", codeBg: "0E2433", codeInk: "FFFFFF" },
  econ: { head: "Arial", body: "Calibri", bg: "FFFFFF", ink: "1F2A55", muted: "58618A", primary: "E2574C", accent: "F5C451", accentInk: "C0392B", tint: "FDECEA", line: "F3D3CF", dark: "1F2A55", darkCard: "2D3A70", blue: "2F5DA8", codeBg: "1F2A55", codeInk: "FFFFFF" },
  python: { head: "Arial", body: "Calibri", bg: "FFFFFF", ink: "0D1B2A", muted: "4F5D6E", primary: "2F6DB5", accent: "FFD43B", accentInk: "2F6DB5", tint: "E8F0FA", line: "D3E0F0", dark: "0D1117", darkCard: "1A2230", codeBg: "0D1117", codeInk: "E6EDF3" },
};

// ── custom compositions ─────────────────────────────────────

/** Inputs → (light, chlorophyll) → outputs, as icon tiles. */
async function equation(pres, P, d) {
  const s = pres.addSlide({ masterName: "Content" });
  s.addText(d.title, { placeholder: "title" });
  const tile = async (x, y, ic, head, sub, fill, col) => {
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 2.3, h: 2.45, rectRadius: 0.12, fill: { color: fill }, line: { type: "none" } });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.725, y: y + 0.3, w: 0.85, h: 0.85, fill: { color: "FFFFFF" }, line: { type: "none" } });
    s.addImage({ data: await K.icon(ic, col), x: x + 0.935, y: y + 0.51, w: 0.43, h: 0.43 });
    txt(s, head, { x: x + 0.1, y: y + 1.3, w: 2.1, h: 0.5, fontSize: 19, bold: true, color: P.ink, align: "center", fontFace: P.head });
    txt(s, sub, { x: x + 0.15, y: y + 1.8, w: 2.0, h: 0.55, fontSize: 13, color: P.muted, align: "center", fontFace: P.body });
  };
  const y = 2.0, tw = 2.3;
  await tile(M, y, fa.FaDroplet, "Water", "taken up by the roots", P.tint, P.primary);
  txt(s, "+", { x: M + tw, y: y + 0.75, w: 0.45, h: 0.8, fontSize: 40, bold: true, color: P.muted, align: "center" });
  await tile(M + tw + 0.45, y, fa.FaWind, "Carbon dioxide", "from the air, via stomata", P.tint, P.primary);
  s.addShape(pres.ShapeType.rightArrow, { x: M + 2 * tw + 0.65, y: y + 0.85, w: 1.1, h: 0.75, fill: { color: P.accent }, line: { type: "none" } });
  txt(s, "sunlight +\nchlorophyll", { x: M + 2 * tw + 0.45, y: y + 1.75, w: 1.5, h: 0.7, fontSize: 13, bold: true, color: P.accentInk, align: "center", fontFace: P.body });
  await tile(M + 2 * tw + 1.95, y, fa.FaCubesStacked, "Glucose", "food the plant uses and stores", "FFF6DC", P.accentInk);
  txt(s, "+", { x: M + 3 * tw + 1.95, y: y + 0.75, w: 0.45, h: 0.8, fontSize: 40, bold: true, color: P.muted, align: "center" });
  await tile(M + 3 * tw + 2.4, y, fa.FaLeaf, "Oxygen", "released into the air", "FFF6DC", P.accentInk);
  s.addShape(pres.ShapeType.roundRect, { x: M, y: 5.0, w: W - 2 * M, h: 0.95, rectRadius: 0.08, fill: { color: "F6F8F7" }, line: { type: "none" } });
  txt(s, [{ text: "As a chemical equation:   ", options: { color: P.muted } }, { text: "6CO₂ + 6H₂O  →  C₆H₁₂O₆ + 6O₂", options: { bold: true, color: P.ink, fontFace: "Cambria" } }],
    { x: M + 0.35, y: 5.0, w: W - 2 * M - 0.7, h: 0.95, fontSize: 20, valign: "middle", fontFace: P.body });
  txt(s, d.foot, { x: M, y: 6.2, w: W - 2 * M, h: 0.45, fontSize: 15, italic: true, color: P.muted, fontFace: P.body });
  s.addNotes(d.notes);
}

/** Dated events on a horizontal line, alternating above and below. */
function timeline(pres, P, d) {
  const s = pres.addSlide({ masterName: "Content" });
  s.addText(d.title, { placeholder: "title" });
  const y0 = 4.05, x0 = M + 0.9, x1 = W - M - 0.9;
  s.addShape(pres.ShapeType.line, { x: x0, y: y0, w: x1 - x0, h: 0, line: { color: P.ink, width: 2 } });
  const n = d.events.length, step = (x1 - x0) / (n - 1);
  d.events.forEach((e, i) => {
    const x = x0 + i * step, up = i % 2 === 0, cw = 1.75;
    s.addShape(pres.ShapeType.ellipse, { x: x - 0.13, y: y0 - 0.13, w: 0.26, h: 0.26, fill: { color: e.key ? P.primary : "FFFFFF" }, line: { color: P.primary, width: 2.5 } });
    s.addShape(pres.ShapeType.line, { x, y: up ? y0 - 0.75 : y0 + 0.13, w: 0, h: 0.62, line: { color: P.line, width: 1.25 } });
    const ty = up ? y0 - 2.35 : y0 + 0.8;
    txt(s, e.date, { x: x - cw / 2, y: ty, w: cw, h: 0.4, fontSize: 15, bold: true, color: P.primary, align: "center", fontFace: P.head });
    txt(s, e.label, { x: x - cw / 2, y: ty + 0.4, w: cw, h: 1.2, fontSize: 13.5, color: P.ink, align: "center", fontFace: P.body });
  });
  s.addNotes(d.notes);
}

/** Cells dividing: one mitosis, one meiosis, drawn as shapes. */
function divisionDiagram(pres, P, d) {
  const s = pres.addSlide({ masterName: "Content" });
  s.addText(d.title, { placeholder: "title" });
  const cell = (x, y, r, color, chroms) => {
    s.addShape(pres.ShapeType.ellipse, { x: x - r, y: y - r, w: 2 * r, h: 2 * r, fill: { color: "FFFFFF" }, line: { color, width: 2.25 } });
    chroms.forEach((c, k) => {
      const cx = x - r * 0.45 + (k % 2) * r * 0.55, cy = y - r * 0.35 + Math.floor(k / 2) * r * 0.5;
      s.addShape(pres.ShapeType.roundRect, { x: cx, y: cy, w: r * 0.16, h: r * 0.42, rectRadius: 0.05, fill: { color: c }, line: { type: "none" }, rotate: k % 2 ? 18 : -14 });
    });
  };
  const arrow = (x1, y1, x2, y2, color) => s.addShape(pres.ShapeType.line, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.01, h: Math.abs(y2 - y1) || 0.01, flipV: y2 < y1, line: { color, width: 1.5, endArrowType: "triangle" } });
  const A = "E2574C", B = "2F5DA8";
  // mitosis panel
  const mx = M, mw = 5.6, my = 1.65, mh = 4.95;
  s.addShape(pres.ShapeType.roundRect, { x: mx, y: my, w: mw, h: mh, rectRadius: 0.1, fill: { color: P.tint }, line: { type: "none" } });
  txt(s, "Mitosis", { x: mx + 0.35, y: my + 0.25, w: 3, h: 0.5, fontSize: 24, bold: true, color: P.primary, fontFace: P.head });
  txt(s, "1 division · 2 identical cells", { x: mx + 0.35, y: my + 0.75, w: 4.8, h: 0.4, fontSize: 15, color: P.muted, fontFace: P.body });
  cell(mx + 1.35, my + 2.85, 0.75, P.primary, [A, B, A, B]);
  arrow(mx + 2.2, my + 2.85, mx + 3.1, my + 2.0, P.primary); arrow(mx + 2.2, my + 2.85, mx + 3.1, my + 3.7, P.primary);
  cell(mx + 3.95, my + 1.9, 0.62, P.primary, [A, B, A, B]); cell(mx + 3.95, my + 3.8, 0.62, P.primary, [A, B, A, B]);
  txt(s, "2n → 2n", { x: mx + 0.35, y: my + mh - 0.65, w: 3, h: 0.45, fontSize: 18, bold: true, color: P.ink, fontFace: "Cambria" });
  // meiosis panel
  const ex = M + mw + 0.45, ew = W - M - ex;
  s.addShape(pres.ShapeType.roundRect, { x: ex, y: my, w: ew, h: mh, rectRadius: 0.1, fill: { color: P.violetTint }, line: { type: "none" } });
  txt(s, "Meiosis", { x: ex + 0.35, y: my + 0.25, w: 3, h: 0.5, fontSize: 24, bold: true, color: P.violet, fontFace: P.head });
  txt(s, "2 divisions · 4 different cells", { x: ex + 0.35, y: my + 0.75, w: 4.8, h: 0.4, fontSize: 15, color: P.muted, fontFace: P.body });
  cell(ex + 1.0, my + 2.85, 0.7, P.violet, [A, B, A, B]);
  arrow(ex + 1.8, my + 2.85, ex + 2.45, my + 2.15, P.violet); arrow(ex + 1.8, my + 2.85, ex + 2.45, my + 3.55, P.violet);
  cell(ex + 2.95, my + 2.0, 0.48, P.violet, [A, A]); cell(ex + 2.95, my + 3.7, 0.48, P.violet, [B, B]);
  const four = [[my + 1.55, [A]], [my + 2.45, ["C9735E"]], [my + 3.25, [B]], [my + 4.15, ["7A93C9"]]];
  four.forEach(([y, c], k) => { arrow(ex + 3.5, k < 2 ? my + 2.0 : my + 3.7, ex + 4.35, y, P.violet); cell(ex + 4.75, y, 0.36, P.violet, c); });
  txt(s, "2n → n", { x: ex + 0.35, y: my + mh - 0.65, w: 3, h: 0.45, fontSize: 18, bold: true, color: P.ink, fontFace: "Cambria" });
  txt(s, d.foot, { x: M, y: 6.75, w: W - 2 * M, h: 0.35, fontSize: 12, italic: true, color: P.muted, fontFace: P.body });
  s.addNotes(d.notes);
}

/** A real (native, editable) PowerPoint chart of demand and supply. */
function demandSupplyChart(pres, P, d) {
  const s = pres.addSlide({ masterName: "Content" });
  s.addText(d.title, { placeholder: "title" });
  // Drawn with shapes (not a chart object) so it looks the same in PowerPoint, Keynote, Google Slides and on the web,
  // and a teacher can still drag any point or relabel any axis.
  const cx = M + 0.9, cy = 1.75, cw = 6.4, chh = 4.0; // plot area
  const X = (i) => cx + (i / 4) * cw, Y = (q) => cy + chh - (q / 110) * chh;
  s.addShape(pres.ShapeType.line, { x: cx, y: cy, w: 0, h: chh, line: { color: P.muted, width: 1.25 } });
  s.addShape(pres.ShapeType.line, { x: cx, y: cy + chh, w: cw, h: 0, line: { color: P.muted, width: 1.25 } });
  [20, 40, 60, 80, 100].forEach((q) => {
    s.addShape(pres.ShapeType.line, { x: cx, y: Y(q), w: cw, h: 0, line: { color: "E5E7EB", width: 0.75 } });
    txt(s, String(q), { x: cx - 0.6, y: Y(q) - 0.14, w: 0.5, h: 0.28, fontSize: 12, color: P.muted, align: "right" });
  });
  ["₹10", "₹20", "₹30", "₹40", "₹50"].forEach((t, i) => txt(s, t, { x: X(i) - 0.4, y: cy + chh + 0.1, w: 0.8, h: 0.3, fontSize: 13, color: P.muted, align: "center" }));
  txt(s, "Price per kg", { x: cx, y: cy + chh + 0.45, w: cw, h: 0.3, fontSize: 13, color: P.muted, align: "center" });
  txt(s, "Quantity (kg)", { x: M - 0.15, y: cy - 0.42, w: 2, h: 0.3, fontSize: 13, color: P.muted });
  const series = [[P.primary, [100, 80, 60, 40, 20], "Demand"], [P.blue, [20, 40, 60, 80, 100], "Supply"]];
  for (const [col, vals, name] of series) {
    for (let i = 0; i < 4; i++) {
      const xa = X(i), ya = Y(vals[i]), xb = X(i + 1), yb = Y(vals[i + 1]);
      s.addShape(pres.ShapeType.line, { x: xa, y: Math.min(ya, yb), w: xb - xa, h: Math.abs(yb - ya), flipV: yb < ya, line: { color: col, width: 3.5 } });
    }
    vals.forEach((v, i) => s.addShape(pres.ShapeType.ellipse, { x: X(i) - 0.08, y: Y(v) - 0.08, w: 0.16, h: 0.16, fill: { color: col }, line: { color: "FFFFFF", width: 1.5 } }));
    // label each line at its start, clear of the text beside the chart
    txt(s, name, { x: X(0) + 0.2, y: Y(vals[0]) + (vals[0] > 50 ? -0.42 : 0.1), w: 1.2, h: 0.32, fontSize: 15, bold: true, color: col });
  }
  // equilibrium marker
  s.addShape(pres.ShapeType.line, { x: X(2), y: Y(60), w: 0, h: cy + chh - Y(60), line: { color: P.ink, width: 1, dashType: "dash" } });
  s.addShape(pres.ShapeType.ellipse, { x: X(2) - 0.15, y: Y(60) - 0.15, w: 0.3, h: 0.3, fill: { color: P.accent }, line: { color: P.ink, width: 1.5 } });
  const x = M + 8.0, w = W - M - x;
  s.addShape(pres.ShapeType.roundRect, { x, y: 1.7, w, h: 2.1, rectRadius: 0.1, fill: { color: P.dark }, line: { type: "none" } });
  txt(s, "EQUILIBRIUM", { x: x + 0.3, y: 1.92, w: w - 0.6, h: 0.3, fontSize: 12, bold: true, color: P.accent, charSpacing: 3 });
  txt(s, "₹30 / kg", { x: x + 0.3, y: 2.25, w: w - 0.6, h: 0.75, fontSize: 40, bold: true, color: "FFFFFF", fontFace: P.head });
  txt(s, "60 kg bought and sold", { x: x + 0.3, y: 3.05, w: w - 0.6, h: 0.45, fontSize: 16, color: "D7DCE3" });
  txt(s, [
    { text: "Below ₹30, ", options: { bold: true, color: P.ink } }, { text: "buyers want more than sellers offer: a shortage pushes the price up.", options: { color: P.muted, breakLine: true } },
    { text: " ", options: { breakLine: true, fontSize: 8 } },
    { text: "Above ₹30, ", options: { bold: true, color: P.ink } }, { text: "sellers are left holding stock: a surplus pushes it down.", options: { color: P.muted } },
  ], { x, y: 4.05, w, h: 2.3, fontSize: 16, fontFace: P.body });
  txt(s, "Illustrative numbers for a local tomato market.", { x: M, y: 6.6, w: 7.6, h: 0.3, fontSize: 11, italic: true, color: P.muted });
  s.addNotes(d.notes);
}

// ── the decks ───────────────────────────────────────────────

const DECKS = [
  {
    id: "photosynthesis", title: "Photosynthesis", level: "Class 7", subject: "Science", template: "How It Works", P: PAL.photosynthesis,
    build: async (p, P) => {
      await K.cover(p, P, { img: IMG("leaf"), pos: "centre", kicker: "Class 7 · Science", title: "Photosynthesis", subtitle: "How a leaf makes food out of light, water and air", credit: C.leaf, alt: "Sunlight on a green leaf",
        notes: "Open by holding up a leaf. Ask: where does this plant get its food? Collect three answers before moving on." });
      await K.iconRows(p, P, { title: "By the end of this lesson, you can…", rows: [
        { icon: fa.FaArrowRightArrowLeft, head: "Name what goes in and what comes out", body: "Water and carbon dioxide in; glucose and oxygen out." },
        { icon: fa.FaMagnifyingGlass, head: "Point to where it happens", body: "Inside chloroplasts, mostly in the cells of the leaf." },
        { icon: fa.FaSeedling, head: "Explain why every food chain needs it", body: "The energy in almost all our food first entered through a leaf." },
      ], img: IMG("chloroplasts"), pos: "centre", alt: "Chloroplasts inside moss cells under a microscope", credit: C.chloroplasts, notes: "Read the three goals aloud. Come back to them at the recap." });
      await equation(p, P, { title: "What goes in, what comes out", foot: "Chlorophyll is the green pigment that traps light. It is why leaves look green.",
        notes: "Build the equation on the board tile by tile. Ask where each input comes from before revealing the label." });
      await K.split(p, P, { img: IMG("chloroplasts"), side: "right", pos: "centre", kicker: "Inside the leaf", title: "Tiny green factories", credit: C.chloroplasts, alt: "Chloroplasts in moss cells",
        points: [
          { head: "Chloroplasts", body: "the small green bodies in leaf cells where food is made." },
          { head: "Chlorophyll", body: "the pigment inside them that captures sunlight." },
          { head: "Stomata", body: "tiny pores on the leaf that let carbon dioxide in and oxygen out." },
        ], callout: "Each green dot in this photo is one chloroplast, seen through a microscope.", notes: "If you have a microscope and a moss leaf, show the real thing. Otherwise, zoom into this photo." });
      await K.steps(p, P, { title: "How a leaf does it, step by step", steps: [
        { icon: fa.FaDroplet, head: "Roots absorb water", body: "It travels up the stem to the leaves." },
        { icon: fa.FaWind, head: "Stomata take in CO₂", body: "Carbon dioxide enters from the air." },
        { icon: fa.FaSun, head: "Chlorophyll traps light", body: "Light energy is captured in the chloroplasts." },
        { icon: fa.FaCubesStacked, head: "Glucose is made", body: "Water and CO₂ are joined using that energy." },
        { icon: fa.FaLeaf, head: "Oxygen is released", body: "It leaves through the stomata." },
      ], foot: "Plants also use some of the glucose straight away, and store the rest as starch.", notes: "Ask pairs to act out the five steps in order, one student per step." });
      await K.split(p, P, { img: IMG("paddy"), side: "left", pos: "centre", kicker: "In real life", title: "Your rice is stored sunlight", credit: C.paddy, alt: "Women harvesting rice in a paddy field",
        points: [
          { head: "Leaves make glucose", body: "all season long, from sunlight, water and air." },
          { head: "The plant stores it", body: "as starch in the grain." },
          { head: "We eat the grain", body: "and use that stored energy to move, grow and think." },
        ], callout: "Every food chain on land starts with photosynthesis.", notes: "Ask: name a food that did not start with a plant. Discuss why even milk and eggs trace back to plants." });
      K.quiz(p, P, { q: "Which gas do leaves take in to make their food?", options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"], answer: 1,
        why: "Leaves take in carbon dioxide through stomata and combine it with water to make glucose. Oxygen is what they give out." });
      K.recap(p, P, { title: "Remember", items: ["Water + carbon dioxide go in", "Sunlight and chlorophyll power it", "Glucose and oxygen come out", "It feeds almost every food chain"],
        task: "Put a potted plant in a dark cupboard for two days. What happens to its leaves, and why?", notes: "Close by returning to the three goals from slide 2." });
    },
  },
  {
    id: "french-revolution", title: "The French Revolution", level: "Class 9", subject: "History", template: "Story of an Era", P: PAL.french,
    build: async (p, P) => {
      await K.cover(p, P, { img: IMG("bastille"), pos: "centre", shade: 30, kicker: "Class 9 · History", title: "The French Revolution", subtitle: "1789–1799: how a kingdom became a republic", credit: C.bastille, alt: "Painting of the storming of the Bastille, 1789",
        notes: "Ask: what would make ordinary people storm a fortress? Note their answers to revisit at the end." });
      await K.columns(p, P, { title: "One kingdom, three estates", cols: [
        { icon: fa.FaChurch, head: "First Estate", sub: "The clergy", items: ["Owned a large share of land", "Collected a tithe from peasants", "Paid almost no taxes"], color: "7B6D8D", fill: "F1EEF5" },
        { icon: fa.FaCrown, head: "Second Estate", sub: "The nobility", items: ["Held the top posts", "Collected feudal dues", "Also exempt from most taxes"], color: P.accentInk, fill: P.tint },
        { icon: fa.FaPeopleGroup, head: "Third Estate", sub: "Everyone else", items: ["Peasants, workers, merchants, lawyers", "The vast majority of people", "Paid nearly all the taxes"], color: P.ink, fill: "ECEDF3" },
      ], foot: "The few who paid least had most of the power. That imbalance is where the story starts.", notes: "Divide the class into three groups by estate and hand out 'tax bills' to the Third Estate only." });
      await K.columns(p, P, { title: "Why it boiled over in 1789", cols: [
        { icon: fa.FaCoins, head: "Empty treasury", items: ["Costly wars, including help for the American Revolution", "The king needed new taxes"], color: P.primary, fill: P.tint },
        { icon: fa.FaWheatAwn, head: "Hunger", items: ["Poor harvests", "The price of bread rose sharply", "Families spent most of their income on food"], color: P.primary, fill: P.tint },
        { icon: fa.FaBookOpen, head: "New ideas", items: ["Philosophers such as Rousseau and Montesquieu", "Questioned the divine right of kings", "Argued for rights and the separation of powers"], color: P.primary, fill: P.tint },
      ], notes: "Ask which of the three causes students think mattered most, and why. There is no single right answer." });
      timeline(p, P, { title: "The revolution in eight moments", events: [
        { date: "May 1789", label: "Estates-General meets at Versailles" }, { date: "20 Jun 1789", label: "Tennis Court Oath" },
        { date: "14 Jul 1789", label: "Storming of the Bastille", key: true }, { date: "Aug 1789", label: "Declaration of the Rights of Man" },
        { date: "1791", label: "First written constitution" }, { date: "Sep 1792", label: "France becomes a republic" },
        { date: "Jan 1793", label: "Louis XVI executed" }, { date: "1799", label: "Napoleon seizes power" },
      ], notes: "Students copy the timeline and mark one moment they would have wanted to witness, with a reason." });
      await K.split(p, P, { img: IMG("oath"), side: "right", pos: "centre", kicker: "20 June 1789", title: "The Tennis Court Oath", credit: C.oath, alt: "Jacques-Louis David's drawing of the Tennis Court Oath",
        points: [
          { head: "Locked out", body: "of their meeting hall, deputies of the Third Estate gathered at an indoor tennis court." },
          { head: "They swore", body: "not to separate until France had a constitution." },
          { head: "It was the first open challenge", body: "to the king's absolute power." },
        ], callout: "Look at the arms raised in David's picture. What is he trying to make you feel?", notes: "Use the image for a two-minute 'see, think, wonder'." });
      await K.split(p, P, { img: IMG("declaration"), side: "left", pos: "north", kicker: "August 1789", title: "Liberty, equality, fraternity", credit: C.declaration, alt: "The Declaration of the Rights of Man and of the Citizen",
        points: [
          { head: "Article 1:", body: "“Men are born and remain free and equal in rights.”" },
          { head: "Natural rights:", body: "liberty, property, security and resistance to oppression." },
          { head: "Power belongs", body: "to the nation, not to the king." },
        ], callout: "India's Preamble also promises liberty, equality and fraternity.", notes: "Read Article 1 aloud. Ask who it left out at the time (women, the enslaved in French colonies)." });
      K.bigIdea(p, P, { kicker: "Discuss", big: "Was the Reign of Terror the revolution defending itself, or betraying itself?", body: "In 1793–94 thousands were executed as 'enemies of the revolution'. Take a side, and use one event from the timeline as evidence.",
        notes: "Give 3 minutes in pairs, then take one view from each side. Push for evidence, not opinion." });
      K.recap(p, P, { title: "What the revolution left behind", items: ["The end of absolute monarchy in France", "The idea that power comes from citizens", "Written rights for individuals", "Ideals that shaped constitutions, including India's"],
        task: "Write five lines: which idea from 1789 matters most in your life today?", notes: "Return to the opening question: what makes ordinary people revolt?" });
    },
  },
  {
    id: "mitosis-meiosis", title: "Mitosis vs Meiosis", level: "Class 11", subject: "Biology", template: "Compare & Contrast", P: PAL.cells,
    build: async (p, P) => {
      await K.cover(p, P, { img: IMG("onion_mitosis"), pos: { l: 0.5, t: 0.0, w: 0.5, h: 0.62 }, shade: 30, kicker: "Class 11 · Biology", title: "Mitosis vs Meiosis", subtitle: "Two ways a cell divides, and why your body needs both", credit: C.onion_mitosis, alt: "Onion root tip cells in mitosis under a microscope",
        notes: "Show the micrograph: these are real onion root cells caught mid-division. Ask what stage a few of them are in." });
      await K.columns(p, P, { title: "Same start, different jobs", cols: [
        { icon: fa.FaClone, head: "Mitosis", sub: "for growth and repair", items: ["One division", "Two daughter cells", "Genetically identical to the parent", "Chromosome number stays the same (2n)"], color: P.primary, fill: P.tint },
        { icon: fa.FaShuffle, head: "Meiosis", sub: "for making gametes", items: ["Two divisions in a row", "Four daughter cells", "Each genetically different", "Chromosome number halves (2n → n)"], color: P.violet, fill: P.violetTint },
      ], notes: "Ask for one example of each from the human body: skin repair (mitosis), sperm and egg (meiosis)." });
      divisionDiagram(p, P, { title: "What happens to the chromosomes", foot: "Simplified: one pair of homologous chromosomes shown, coloured by parent.",
        notes: "Trace one red chromosome through each process. Where does it end up?" });
      K.table(p, P, { title: "Side by side", header: ["", "Mitosis", "Meiosis"], headColors: [P.primary, P.violet], colW: [3.3, 4.4, 4.4], rows: [
        ["Divisions", "One", "Two (meiosis I and II)"], ["Daughter cells", "Two", "Four"], ["Chromosome number", "Unchanged (diploid)", "Halved (haploid)"],
        ["Genetic makeup", "Identical to the parent", "Different, due to crossing over"], ["Where", "Body (somatic) cells", "Reproductive organs"], ["Purpose", "Growth, repair, asexual reproduction", "Gametes for sexual reproduction"],
      ], notes: "Cover one column and quiz the class on the other." });
      K.bigIdea(p, P, { kicker: "Why siblings look different", big: "In meiosis I, paired chromosomes swap pieces.", body: "This crossing over, plus the random way pairs line up, means each gamete carries a new mix of genes. That is why no two siblings (except identical twins) are alike.",
        notes: "Use two strips of coloured paper to show crossing over physically." });
      await K.columns(p, P, { title: "A common mix-up", cols: [
        { icon: fa.FaXmark, head: "Not quite", items: ["“Meiosis is just mitosis done twice.”"], color: "C0392B", fill: "FBEAEA" },
        { icon: fa.FaCheck, head: "Actually", items: ["Meiosis I separates homologous pairs: that is what halves the number.", "Meiosis II separates sister chromatids, like mitosis.", "DNA is not copied again between the two divisions."], color: "1A7F5A", fill: "E6F4EC" },
      ], notes: "Ask students to explain to a partner why the DNA isn't copied again. Listen for 'it would double the number back'." });
      K.quiz(p, P, { q: "A human cell with 46 chromosomes undergoes meiosis. How many chromosomes does each gamete have?", options: ["46", "23", "92", "12"], answer: 1,
        why: "Meiosis halves the chromosome number: 2n = 46 becomes n = 23. Fertilisation then restores 46." });
      K.recap(p, P, { title: "Remember", items: ["Mitosis: 1 division, 2 identical cells", "Meiosis: 2 divisions, 4 different cells", "Meiosis halves the chromosome number", "Crossing over creates variation"],
        task: "Draw both processes for a cell with 2n = 4, labelling each stage.", notes: "Exit ticket: one difference, one similarity." });
    },
  },
  {
    id: "demand-supply", title: "Demand and Supply", level: "Class 11", subject: "Economics", template: "Concept Explorer", P: PAL.econ,
    build: async (p, P) => {
      await K.cover(p, P, { img: IMG("veg_vendor"), pos: "centre", shade: 32, kicker: "Class 11 · Economics", title: "Demand and Supply", subtitle: "Why the price of onions can jump in a single month", credit: C.veg_vendor, alt: "A vegetable vendor at an Indian market",
        notes: "Ask students what they paid for onions or tomatoes recently, and whether the price changes through the year." });
      await K.iconRows(p, P, { title: "Two forces, one price", rows: [
        { icon: fa.FaCartShopping, head: "Demand: what buyers want", body: "When the price rises, people buy less (other things staying the same)." },
        { icon: fa.FaTruck, head: "Supply: what sellers offer", body: "When the price rises, sellers offer more." },
        { icon: fa.FaScaleBalanced, head: "Equilibrium: where they meet", body: "The price at which the amount wanted equals the amount offered." },
      ], img: IMG("market"), pos: "centre", alt: "A busy vegetable market in Hyderabad", credit: C.market, notes: "Write the three words on the board: demand, supply, equilibrium." });
      demandSupplyChart(p, P, { title: "Where demand meets supply", notes: "Ask: at ₹20, how many kilos are wanted and how many are offered? What happens next?" });
      await K.columns(p, P, { title: "What moves the curves", cols: [
        { icon: fa.FaUsers, head: "Demand shifts when…", items: ["Incomes change", "Tastes and fashions change", "Prices of substitutes change (tea vs coffee)", "People expect prices to rise"], color: P.primary, fill: P.tint },
        { icon: fa.FaIndustry, head: "Supply shifts when…", items: ["Costs of inputs change", "The weather hits a harvest", "Technology improves", "Taxes or subsidies change"], color: P.blue, fill: "E8EEF8" },
      ], foot: "A change in price moves along a curve. A change in anything else shifts the whole curve.", notes: "Give each pair a news headline and ask: does it shift demand or supply, and which way?" });
      await K.split(p, P, { img: IMG("onions"), side: "right", pos: "centre", kicker: "In real life", title: "When the monsoon fails", credit: C.onions, alt: "An onion vendor resting on sacks of onions",
        points: [
          { head: "Less rain,", body: "smaller onion harvest." },
          { head: "Supply shifts left:", body: "fewer onions at every price." },
          { head: "The price rises", body: "until buyers cut back enough to match what's available." },
        ], callout: "Demand barely changed. The whole price jump came from supply.", notes: "Sketch the left shift on the board over the chart from slide 3." });
      K.quiz(p, P, { q: "A bumper harvest increases the supply of tomatoes. If demand doesn't change, what happens to the equilibrium price?", options: ["It rises", "It falls", "It stays the same", "It can't be known"], answer: 1,
        why: "Supply shifts right: more tomatoes at every price, so sellers lower the price to sell them. Equilibrium price falls and quantity rises." });
      K.recap(p, P, { title: "Remember", items: ["Demand falls as price rises", "Supply rises as price rises", "Equilibrium: wanted = offered", "Shocks shift curves, then price adjusts"],
        task: "Track the price of one vegetable at your local market for a week and explain any change.", notes: "Exit ticket: draw a supply shift and label the new price." });
    },
  },
  {
    id: "python-loops", title: "for loops in Python", level: "BCA, Year 1", subject: "Computer Science", template: "Code Walkthrough", P: PAL.python,
    build: async (p, P) => {
      await K.cover(p, P, { img: IMG("lab"), pos: "centre", shade: 30, kicker: "BCA · Programming in Python", title: "for loops in Python", subtitle: "Write it once, let Python repeat it", credit: C.lab, alt: "Students working in a computer lab",
        notes: "Ask: what's the most boring thing you've had to repeat on a computer? That's what loops are for." });
      K.code(p, P, { title: "The same job, two ways", code: [["# Without a loop", "8B949E"], ["print(\"Welcome, Asha\")"], ["print(\"Welcome, Ravi\")"], ["print(\"Welcome, Meera\")"], [" "], ["# With a loop", "8B949E"], ["for name in [\"Asha\", \"Ravi\", \"Meera\"]:", "FFD43B"], ["    print(\"Welcome,\", name)"]], h: 4.3, size: 19,
        notesSide: [{ head: "Same output", body: "Both print three greetings." }, { head: "Less to change", body: "Add a name to the list, not a new line." }, { head: "Scales", body: "Works the same for 3 names or 3,000." }],
        notes: "Run both versions live. Then add a fourth name to each and compare the effort." });
      K.code(p, P, { title: "Anatomy of a for loop", code: [["for item in collection:", "FFD43B"], ["    # runs once per item", "8B949E"], ["    do_something(item)"]], h: 1.9, size: 24,
        notesSide: [{ head: "for … in", body: "Python's keywords. Read it as 'for each item in…'." }, { head: "item", body: "A name you choose. It holds the current value." }, { head: "collection", body: "A list, a string, a range: anything you can step through." }, { head: ":  and indent", body: "Everything indented under the colon is the loop body." }],
        notes: "Have students say the loop out loud in English before writing it." });
      K.table(p, P, { title: "Counting with range()", header: ["You write", "Python gives you", "Why"], colW: [3.6, 3.9, 4.6], rows: [
        ["range(5)", "0, 1, 2, 3, 4", "Starts at 0, stops before 5"], ["range(2, 8)", "2, 3, 4, 5, 6, 7", "Starts at 2, stops before 8"],
        ["range(0, 10, 3)", "0, 3, 6, 9", "Steps of 3"], ["range(5, 0, -1)", "5, 4, 3, 2, 1", "Counts down"],
      ], foot: "The stop value is never included. That one rule prevents most off-by-one bugs.", notes: "Ask students to predict each row before revealing it." });
      K.code(p, P, { title: "Worked example: class average", code: [["marks = [72, 85, 64, 90, 58]"], ["total = 0"], ["for m in marks:", "FFD43B"], ["    total = total + m"], ["average = total / len(marks)"], ["print(\"Average:\", average)"]], h: 3.3, size: 20,
        output: "Average: 73.8",
        notesSide: [{ head: "total = 0", body: "Start the running sum before the loop." }, { head: "total + m", body: "Each pass adds one mark." }, { head: "len(marks)", body: "Divide after the loop, not inside it." }],
        notes: "Trace the loop on the board in a table: m, total. 72→72, 85→157, 64→221, 90→311, 58→369; 369 / 5 = 73.8." });
      K.codeCompare(p, P, { title: "The bug everyone writes once", panels: [
        { label: "Looks right", color: "C0392B", code: ["for i in range(1, 10):", "    print(i)"], prints: "1 … 9", note: "Meant to print 1 to 10, but the stop value is never included." },
        { label: "Fixed", color: "1A7F5A", code: ["for i in range(1, 11):", "    print(i)"], prints: "1 … 10", note: "Make the stop value one past the last number you want." },
      ], notes: "Ask students to find the bug before showing the fix." });
      K.quiz(p, P, { q: "What does this print?   for i in range(1, 6, 2): print(i)", options: ["1 3 5", "1 2 3 4 5", "2 4 6", "1 3 5 7"], answer: 0,
        why: "Start at 1, step by 2, stop before 6: 1, 3, 5." });
      K.recap(p, P, { title: "Remember", items: ["for item in collection: repeats the body", "range(start, stop, step) stops before stop", "Set totals before the loop", "Indentation is the loop body"],
        task: "Write a loop that prints the 7 times table from 7 × 1 to 7 × 10.", notes: "Exit ticket: predict the output of range(10, 0, -3)." });
    },
  },
];

(async () => {
  fs.mkdirSync(path.join(__dirname, "out"), { recursive: true });
  const only = process.argv[2];
  const manifest = [];
  for (const d of DECKS) {
    if (only && d.id !== only) continue;
    const pres = K.deck(d.P, { title: `${d.title} · ${d.level}`, footer: `${d.title} · ${d.level} ${d.subject}` });
    await d.build(pres, d.P);
    const file = path.join(__dirname, "out", `${d.id}.pptx`);
    await pres.writeFile({ fileName: file });
    await applyTheme(file, { name: `Vivran ${d.title}`, headFontFace: d.P.head, bodyFontFace: d.P.body, colors: {
      dk1: d.P.ink, lt1: "FFFFFF", dk2: d.P.dark, lt2: d.P.tint, accent1: d.P.primary, accent2: d.P.accent, accent3: d.P.blue ?? d.P.muted,
      accent4: d.P.violet ?? d.P.accentInk, accent5: d.P.muted, accent6: d.P.line, hlink: d.P.primary, folHlink: d.P.muted } });
    manifest.push({ id: d.id, title: d.title, level: d.level, subject: d.subject, template: d.template, accent: d.P.primary, dark: d.P.dark });
    console.log("built", file);
  }
  if (!only) fs.writeFileSync(path.join(__dirname, "out", "manifest.json"), JSON.stringify(manifest, null, 1));
})();
