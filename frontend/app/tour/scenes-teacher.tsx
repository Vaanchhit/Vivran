"use client";

// Teacher: features that are live today, shown as the app shows them.
import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpenCheck, Download, FileText, FolderOpen, GripVertical, Laugh, Lightbulb, PenLine, Presentation, Sparkles, Wand2 } from "lucide-react";
import { STORY as S } from "./story";
import { Typed, type Scene } from "./engine";

const DECK = (n: number, thumb = false) => `/landing/decks/${S.deckId}/${thumb ? "t" : ""}${String(n).padStart(2, "0")}.jpg`;
const rise = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } };

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <div className="text-lg font-extrabold font-display text-foreground">{title}</div>
      <div className="text-xs text-muted mt-0.5">{sub}</div>
    </div>
  );
}

function Chip({ on, tone, children }: { on: boolean; tone: "success" | "accent"; children: React.ReactNode }) {
  const cls = !on ? "text-faint bg-card border-border" : tone === "success" ? "text-success bg-success-soft border-success-line" : "text-accent bg-accent-soft border-accent-line";
  return <motion.span layout className={`px-2 py-0.5 rounded-full border text-[10.5px] font-medium transition-colors duration-500 ${cls}`}>{children}</motion.span>;
}

function FileRow({ name, meta, facts, style, styleLabel, passages }: { name: string; meta: string; facts: boolean; style: boolean; styleLabel?: string; passages: number }) {
  return (
    <motion.div {...rise} className="p-3 rounded-xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2.5 min-w-0">
        <FileText className="w-4 h-4 text-chrome shrink-0" />
        <div className="min-w-0"><div className="font-semibold text-foreground truncate">{name}</div><div className="text-[11px] text-muted">{meta}</div></div>
      </div>
      <div className="flex gap-1.5 shrink-0"><Chip on={facts} tone="success">{facts ? `Facts · ${passages} passages` : "Facts"}</Chip><Chip on={style} tone="accent">{style ? styleLabel ?? "Style" : "Style"}</Chip></div>
    </motion.div>
  );
}

const sources: Scene = {
  id: "sources", title: "Add your chapter", url: "app.vivran.co.in/teacher/sources",
  caption: "Add the chapter once: it becomes searchable for facts. A past paper you set teaches Vivran your format.",
  steps: [900, 1400, 1300, 1400, 2200, 2600],
  render: (st) => (
    <div>
      <Head title="My sources" sub="Add a file once. Vivran uses it for facts, and learns your style from papers you made." />
      <div className={`p-5 rounded-xl border-2 border-dashed text-center text-xs transition-colors ${st === 0 ? "border-accent bg-accent-soft" : "border-border bg-card"}`}>
        <FolderOpen className="w-5 h-5 mx-auto text-accent" />
        <div className="mt-1.5 font-semibold text-foreground">Drop textbooks, notes, past papers or decks</div>
      </div>
      <div className="mt-3 space-y-2">
        {st >= 1 && <FileRow name={S.chapter.file} meta={`PDF · ${S.chapter.pages} pages · History · Class 9`} facts={st >= 2} style={false} passages={S.chapter.passages} />}
        {st >= 3 && <FileRow name={S.pastPaper.file} meta="DOCX · History · Class 9" facts={st >= 3} style={st >= 4} styleLabel="Style · exam paper" passages={9} />}
      </div>
      <AnimatePresence>
        {st >= 4 && (
          <motion.div {...rise} className={`mt-4 p-4 rounded-xl border text-xs space-y-2.5 ${st >= 5 ? "bg-surface border-accent-line" : "bg-surface border-border"}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-foreground leading-relaxed">{S.styleTrait}</p>
              <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[10.5px] font-medium ${st >= 5 ? "text-success bg-success-soft border-success-line" : "text-chrome bg-chrome-soft border-chrome-line"}`}>{st >= 5 ? "In use" : "Suggested"}</span>
            </div>
            <div className="flex gap-2">
              <motion.span animate={st === 4 ? { scale: [1, 0.94, 1] } : {}} transition={{ delay: 1.5, duration: 0.3 }} className="px-3 py-1.5 rounded-lg btn-primary font-semibold">Use this</motion.span>
              <span className="px-3 py-1.5 rounded-lg border border-border bg-card text-muted">Not for me</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  ),
};

const ask: Scene = {
  id: "ask", title: "Ask in your words", url: "app.vivran.co.in/teacher",
  caption: "Say what you're teaching. Vivran picks the right lesson shape, explains why, and plans every slide for you to edit.",
  steps: [2200, 1500, 2400, 1800, 1600],
  render: (st) => {
    const order = st >= 3 ? [0, 1, 2, 4, 3, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
    return (
      <div>
        <div className="p-4 rounded-2xl bg-surface border border-border shadow-panel">
          <div className="text-sm font-semibold font-display text-foreground flex items-center gap-2"><Sparkles className="w-4 h-4 text-accent" /> What would you like to create?</div>
          <div className="mt-2.5 p-3 rounded-xl bg-card border border-border text-sm text-foreground min-h-[3rem]"><Typed text={S.request} on={st === 0} ms={1800} /></div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted">
            <span className="flex items-center gap-1.5"><BookOpenCheck className="w-3.5 h-3.5" /> Writes from <b className="text-foreground">Unit 4.pdf</b> in <b className="text-foreground">your style</b></span>
            <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${st >= 1 ? "btn-primary" : "bg-border text-muted"}`}>{st === 1 ? "Reading your request…" : "Turn this into a plan →"}</span>
          </div>
        </div>
        {st >= 2 && (
          <motion.div {...rise} className="mt-4 space-y-2">
            <div className="flex items-start gap-2 text-xs text-muted"><Wand2 className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" /><span>Using the <b className="text-foreground">{S.template.name}</b> template because {S.template.why}.</span></div>
            <div className="text-sm font-bold font-display text-foreground pt-1">Review the outline</div>
            <motion.ol layout className="grid sm:grid-cols-2 gap-1.5">
              {order.map((k, i) => {
                const o = S.outline[k];
                const moved = st >= 3 && k === 4;
                return (
                  <motion.li layout key={k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: st === 2 ? i * 0.07 : 0, layout: { duration: 0.5 } }}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${moved ? "border-accent bg-accent-soft shadow-sm" : "border-border bg-card"}`}>
                    <GripVertical className="w-3.5 h-3.5 text-faint shrink-0" />
                    <span className="w-4 text-right text-muted">{i + 1}</span>
                    <span className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] text-muted shrink-0">{o.type}</span>
                    <span className="truncate font-semibold text-foreground">{o.title}</span>
                  </motion.li>
                );
              })}
            </motion.ol>
            {st >= 4 && <motion.div {...rise} className="flex justify-end"><span className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5" /> Build slides</span></motion.div>}
          </motion.div>
        )}
      </div>
    );
  },
};

const deck: Scene = {
  id: "deck", title: "Slides, ready to teach", url: "app.vivran.co.in/teacher/create?type=slides",
  caption: "Eight slides from your own chapter, in a classroom design. Switch the style, add a meme, export to PowerPoint.",
  steps: [1800, 1600, 1500, 1500, 1500, 2600],
  render: (st) => {
    const big = st < 2 ? 1 : Math.min(8, [1, 1, 3, 4, 5, 6][st] ?? 6);
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div><div className="font-bold text-foreground font-display">The French Revolution</div><div className="text-[11px] text-muted">8 slides · Class 9 · cites 11 passages from Unit 4.pdf</div></div>
          <div className="flex gap-1.5 text-[11px]">
            <span className="px-2.5 py-1.5 rounded-lg border border-border bg-card inline-flex items-center gap-1"><Laugh className="w-3.5 h-3.5 text-accent" /> Add meme</span>
            <span className={`px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 font-semibold transition-colors ${st >= 5 ? "btn-primary" : "border border-border bg-card"}`}><Presentation className="w-3.5 h-3.5" /> Export PowerPoint</span>
          </div>
        </div>
        {st === 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {S.outline.map((o, i) => (
              <div key={i} className="relative aspect-video rounded-lg border border-border bg-card p-1.5 overflow-hidden">
                <div className="text-[9px] font-semibold text-foreground line-clamp-2">{i + 1}. {o.title}</div>
                <motion.div className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/50 to-transparent" animate={{ x: ["0%", "400%"] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="relative aspect-video rounded-xl overflow-hidden border border-border bg-black shadow-sm">
              <AnimatePresence mode="popLayout">
                <motion.img key={big} src={DECK(big)} alt={`Slide ${big}`} className="absolute inset-0 w-full h-full object-cover" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.35 }} />
              </AnimatePresence>
            </div>
            <div className="grid grid-cols-8 gap-1.5 mt-2">
              {Array.from({ length: 8 }, (_, i) => (
                <motion.img key={i} src={DECK(i + 1, true)} alt="" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: st === 1 ? i * 0.12 : 0 }}
                  className={`w-full aspect-video object-cover rounded-md border-2 ${i + 1 === big ? "border-accent" : "border-transparent"}`} />
              ))}
            </div>
            {st >= 5 && (
              <motion.a {...rise} href={`/landing/decks/${S.deckId}.pptx`} download target="_top" className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline">
                <Download className="w-3.5 h-3.5" /> Download this deck (.pptx, editable, with speaker notes)
              </motion.a>
            )}
          </>
        )}
      </div>
    );
  },
};

const paper: Scene = {
  id: "paper", title: "A paper, cited to the page", url: "app.vivran.co.in/teacher/assess?mode=test",
  caption: "Pick the question types. Every question points back to the page it came from; the one that can't is flagged, not hidden.",
  steps: [2000, 1800, 1600, 2600],
  render: (st) => (
    <div>
      <Head title={S.paper.title} sub={`${S.paper.marks} marks · ${S.paper.minutes} minutes · in your 3-section format`} />
      <div className="flex flex-wrap gap-1.5">
        {S.paper.plan.map((p, i) => (
          <motion.span key={p.type} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ delay: st === 0 ? i * 0.35 : 0 }}
            className="px-2.5 py-1.5 rounded-lg border border-accent-line bg-accent-soft text-[11px] text-foreground">{p.type} <b>× {p.n}</b> <span className="text-muted">· {p.each}m</span></motion.span>
        ))}
      </div>
      {st >= 1 && (
        <motion.div {...rise} className="mt-4 space-y-3">
          {S.paper.sections.map((sec, si) => (
            <div key={sec.name}>
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted mb-1.5">{sec.name}</div>
              <div className="rounded-xl border border-border overflow-hidden">
                {sec.questions.map((q, qi) => (
                  <motion.div key={q.n} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: st === 1 ? (si * 3 + qi) * 0.12 : 0 }}
                    className={`flex gap-3 px-3 py-2 text-xs border-b border-border last:border-0 ${!q.cite && st >= 2 ? "bg-warning-soft" : "bg-surface"}`}>
                    <span className="text-muted w-14 shrink-0">Q{q.n} · {q.m}m</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-foreground">{q.q}</div>
                      {q.cite ? <span className="inline-block mt-1 px-1.5 py-0.5 rounded border border-accent-line text-[10px] text-accent">{q.cite}</span>
                        : st >= 2 && <span className="inline-block mt-1 px-1.5 py-0.5 rounded border border-warning-line text-[10px] text-warning">Not in your chapter · written from general knowledge · review it</span>}
                    </div>
                    {st >= 3 && !q.cite && <span className="shrink-0 self-center px-2 py-1 rounded-lg border border-border bg-card text-[10px] text-foreground">Regenerate</span>}
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  ),
};

const explain: Scene = {
  id: "explain", title: "Explain it simply", url: "app.vivran.co.in/teacher/examples",
  caption: "When a class is stuck, Vivran turns the idea into an everyday example, with the arithmetic done for you.",
  steps: [2000, 1800, 1800, 2800],
  render: (st) => (
    <div>
      <div className="p-3 rounded-xl bg-card border border-border text-sm text-foreground flex items-center gap-2"><Lightbulb className="w-4 h-4 text-accent shrink-0" /><Typed text={S.explain.ask} on={st === 0} ms={1400} /></div>
      {st >= 1 && (
        <motion.div {...rise} className="mt-4 grid md:grid-cols-5 gap-3">
          <div className="md:col-span-3 p-4 rounded-xl bg-accent-soft border border-accent-line">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-accent">In one line</div>
            <p className="text-sm text-foreground mt-1 leading-relaxed">{S.explain.oneLine}</p>
            <p className="text-xs text-muted mt-3 leading-relaxed">{S.explain.story}</p>
            {st >= 2 && (
              <motion.table {...rise} className="mt-3 w-full text-xs">
                <thead><tr className="text-muted"><th className="text-left font-medium py-1"></th><th className="text-right font-medium">Before</th><th className="text-right font-medium">After the harvest fails</th></tr></thead>
                <tbody>{S.explain.rows.map((r) => (
                  <tr key={r.label} className="border-t border-accent-line"><td className="py-1.5 text-foreground">{r.label}</td><td className="text-right text-foreground">{r.before}</td><td className={`text-right font-semibold ${r.after === "₹0" ? "text-danger" : "text-foreground"}`}>{r.after}</td></tr>
                ))}</tbody>
              </motion.table>
            )}
            {st >= 2 && <div className="text-[10px] text-muted mt-2 italic">{S.explain.note}</div>}
          </div>
          <div className="md:col-span-2 space-y-2">
            {st >= 3 && S.explain.mapping.map((m, i) => (
              <motion.div key={m.term} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} className="p-2.5 rounded-lg bg-surface border border-border text-xs">
                <div className="font-semibold text-foreground">{m.term}</div><div className="text-muted">= {m.meaning}</div>
              </motion.div>
            ))}
            {st >= 3 && <motion.div {...rise} className="p-2.5 rounded-lg border border-dashed border-border text-[11px] text-muted"><b className="text-foreground">Where it breaks:</b> {S.explain.breaks}</motion.div>}
          </div>
        </motion.div>
      )}
    </div>
  ),
};

export const TEACHER_SCENES = [sources, ask, deck, paper, explain];
export const TEACHER_NAV = [
  { label: "My sources", icon: <FolderOpen className="w-3.5 h-3.5" /> },
  { label: "Home", icon: <Sparkles className="w-3.5 h-3.5" /> },
  { label: "Teach", icon: <Presentation className="w-3.5 h-3.5" /> },
  { label: "Assess", icon: <PenLine className="w-3.5 h-3.5" /> },
  { label: "Explain simply", icon: <Lightbulb className="w-3.5 h-3.5" /> },
];
