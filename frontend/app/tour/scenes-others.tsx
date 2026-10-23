"use client";

// Student and Institution: previews of what comes next, built on the same lesson.
// Everything here is drawn from what the teacher made in the teacher scenes.
import React from "react";
import { motion } from "framer-motion";
import { BarChart3, BookOpen, Clock, Layers, Lightbulb, ListChecks, RotateCcw, Share2, Target, TrendingUp } from "lucide-react";
import { STORY as S } from "./story";
import type { Scene } from "./engine";

const rise = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } };
const Head = ({ title, sub }: { title: string; sub: string }) => (
  <div className="mb-4"><div className="text-lg font-extrabold font-display text-foreground">{title}</div><div className="text-xs text-muted mt-0.5">{sub}</div></div>
);
const From = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-accent-line text-[10px] text-accent"><BookOpen className="w-3 h-3" />{children}</span>
);

// ── Student ─────────────────────────────────────────────────
const cards: Scene = {
  id: "cards", title: "Revise what was taught", url: "app.vivran.co.in/student/revise",
  caption: `Revision cards built from ${S.teacher.short}'s own deck, so students revise exactly what was taught in class.`,
  steps: [1400, 1700, 1700, 2400],
  render: (st) => (
    <div>
      <Head title={`Hi ${S.student.name} 👋`} sub={`${S.teacher.short} taught “The French Revolution” on Monday · ${S.student.class}`} />
      <div className="grid sm:grid-cols-3 gap-3">
        {S.flashcards.map((c, i) => {
          const flipped = st >= i + 1;
          return (
            <div key={c.q} className="relative h-44 [perspective:900px]">
              <motion.div className="absolute inset-0 [transform-style:preserve-3d]" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.6 }}>
                <div className="absolute inset-0 p-4 rounded-xl bg-surface border border-border flex flex-col justify-between [backface-visibility:hidden]">
                  <div className="text-[10px] uppercase tracking-wider text-muted">Card {i + 1} of 12</div>
                  <div className="text-sm font-semibold text-foreground">{c.q}</div>
                  <div className="text-[10px] text-faint">Tap to reveal</div>
                </div>
                <div className="absolute inset-0 p-4 rounded-xl bg-accent-soft border border-accent-line flex flex-col justify-between [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <div className="text-xs text-foreground leading-relaxed">{c.a}</div>
                  <From>{c.from} of {S.teacher.short}&rsquo;s deck</From>
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  ),
};

const practice: Scene = {
  id: "practice", title: "Practice that explains", url: "app.vivran.co.in/student/practice",
  caption: "A wrong answer gets the reason, not just a red cross, and a link back to the page and slide.",
  steps: [1600, 1500, 2600, 2000],
  render: (st) => {
    const P = S.practice;
    return (
      <div>
        <Head title="Practice · The French Revolution" sub="5 questions · written from the same chapter your teacher used" />
        <div className="p-4 rounded-xl bg-surface border border-border">
          <div className="text-sm font-semibold text-foreground">{P.q}</div>
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            {P.options.map((o, i) => {
              const chosenWrong = st >= 1 && i === P.wrong, right = st >= 3 && i === P.answer;
              return (
                <motion.div key={o} animate={chosenWrong && st === 1 ? { x: [0, -5, 5, -3, 0] } : {}} transition={{ duration: 0.4 }}
                  className={`p-2.5 rounded-lg border text-xs flex gap-2 ${right ? "border-success-line bg-success-soft text-foreground" : chosenWrong ? "border-danger-line bg-danger-soft text-foreground" : "border-border bg-card text-foreground"}`}>
                  <b className="text-muted">{"ABCD"[i]}</b>{o}
                </motion.div>
              );
            })}
          </div>
          {st >= 2 && (
            <motion.div {...rise} className="mt-3 p-3 rounded-lg bg-warning-soft border border-warning-line text-xs space-y-1.5">
              <div className="font-semibold text-foreground">Not quite, and it&rsquo;s a common mix-up</div>
              <div className="text-muted leading-relaxed">{P.misconception}</div>
              <From>{P.see}</From>
            </motion.div>
          )}
          {st >= 3 && <motion.div {...rise} className="mt-2 text-xs text-success font-semibold">Second try: correct. This topic moves up on your progress.</motion.div>}
        </div>
      </div>
    );
  },
};

const stuck: Scene = {
  id: "stuck", title: "Stuck? Explain it simply", url: "app.vivran.co.in/student/explain",
  caption: "The same everyday example the teacher used, one tap away, at the moment a student is stuck.",
  steps: [1400, 2800],
  render: (st) => (
    <div>
      <Head title="Why did bread start a revolution?" sub="You asked while revising Slide 3" />
      <motion.span animate={st === 0 ? { scale: [1, 0.95, 1] } : {}} transition={{ delay: 0.8 }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl btn-primary text-xs font-semibold"><Lightbulb className="w-3.5 h-3.5" /> Explain it simply</motion.span>
      {st >= 1 && (
        <motion.div {...rise} className="mt-4 p-4 rounded-xl bg-accent-soft border border-accent-line max-w-xl">
          <p className="text-sm text-foreground leading-relaxed">{S.explain.story}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            {S.explain.rows.map((r) => (
              <div key={r.label} className="p-2 rounded-lg bg-surface border border-border"><div className="text-muted text-[10px] leading-tight">{r.label}</div><div className="mt-1 font-bold text-foreground">{r.before} → <span className={r.after === "₹0" ? "text-danger" : ""}>{r.after}</span></div></div>
            ))}
          </div>
          <p className="text-xs text-muted mt-3">{S.explain.oneLine}</p>
        </motion.div>
      )}
    </div>
  ),
};

const progress: Scene = {
  id: "progress", title: "Know what to revisit", url: "app.vivran.co.in/student/progress",
  caption: "Students see what they've got and what to revisit before the test, in minutes, not chapters.",
  steps: [2200, 2400],
  render: (st) => (
    <div>
      <Head title="Your progress" sub="From your practice this week" />
      <div className="space-y-3 max-w-xl">
        {S.progress.map((p, i) => (
          <div key={p.topic}>
            <div className="flex justify-between text-xs"><span className="text-foreground font-medium">{p.topic}</span><span className={p.revisit ? "text-warning font-semibold" : "text-muted"}>{p.pct}%</span></div>
            <div className="mt-1 h-2.5 rounded-full bg-border overflow-hidden">
              <motion.div className={`h-full rounded-full ${p.revisit ? "bg-warning" : "bg-success"}`} initial={{ width: 0 }} animate={{ width: `${p.pct}%` }} transition={{ delay: i * 0.15, duration: 0.7 }} />
            </div>
          </div>
        ))}
      </div>
      {st >= 1 && (
        <motion.div {...rise} className="mt-5 inline-flex items-center gap-2 p-3 rounded-xl bg-surface border border-border text-xs">
          <RotateCcw className="w-4 h-4 text-accent" /><span><b className="text-foreground">Revisit next:</b> Timeline of events · 6 minutes · from Slide 4</span>
        </motion.div>
      )}
    </div>
  ),
};

// ── Institution ─────────────────────────────────────────────
const coverage: Scene = {
  id: "coverage", title: "Taught vs planned", url: "app.vivran.co.in/school/coverage",
  caption: "See how far each section has got through the syllabus, without asking for a report.",
  steps: [2400, 2200],
  render: (st) => (
    <div>
      <Head title={`${S.school} · History, Class 9`} sub="Unit 4 · The French Revolution · this term" />
      <div className="space-y-3 max-w-2xl">
        {S.coverage.map((c, i) => (
          <div key={c.cls} className="p-3 rounded-xl bg-surface border border-border">
            <div className="flex justify-between text-xs"><span className="font-semibold text-foreground">{c.cls}</span><span className="text-muted">{c.taught} of {c.planned} lessons taught</span></div>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: c.planned }, (_, k) => (
                <motion.div key={k} className={`h-2.5 flex-1 rounded ${k < c.taught ? "bg-accent" : "bg-border"}`} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ originX: 0 }} transition={{ delay: i * 0.2 + k * 0.05 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {st >= 1 && <motion.div {...rise} className="mt-4 text-xs text-muted">9C is two lessons behind: the Terror and the recap are still to come.</motion.div>}
    </div>
  ),
};

const struggle: Scene = {
  id: "struggle", title: "Where students struggle", url: "app.vivran.co.in/school/insights",
  caption: `Built from ${S.answersThisWeek} practice answers this week, so help arrives before the final marks, not after.`,
  steps: [2200, 2800],
  render: (st) => {
    const tone = (v: number) => (v >= 80 ? "bg-success-soft text-success" : v >= 60 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger");
    return (
      <div>
        <Head title="Understanding by topic" sub="% correct in practice · Class 9 · History" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-1">
            <thead><tr><th></th>{S.units.map((u) => <th key={u} className="font-medium text-muted text-[11px] px-1 text-left">{u}</th>)}</tr></thead>
            <tbody>{S.heat.map((r, ri) => (
              <tr key={r.cls}><td className="font-semibold text-foreground pr-2">{r.cls}</td>
                {r.v.map((v, ci) => (
                  <td key={ci}><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: (ri * 5 + ci) * 0.04 }}
                    className={`px-2 py-2.5 rounded-lg text-center font-semibold ${tone(v)} ${st >= 1 && r.cls === "9B" && ci === 4 ? "ring-2 ring-danger" : ""}`}>{v}%</motion.div></td>
                ))}
              </tr>
            ))}</tbody>
          </table>
        </div>
        {st >= 1 && (
          <motion.div {...rise} className="mt-3 p-3 rounded-xl bg-surface border border-border text-xs flex items-start gap-2 max-w-xl">
            <Target className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <span><b className="text-foreground">9B, the Reign of Terror: 41%.</b> Most chose “bread prices” for why the deputies took the oath. Suggested: a 10-minute recap with the everyday example before the unit test.</span>
          </motion.div>
        )}
      </div>
    );
  },
};

const time: Scene = {
  id: "time", title: "Time back for teaching", url: "app.vivran.co.in/school/overview",
  caption: "Preparation time saved across the department, so teachers spend it with students instead.",
  steps: [2600],
  render: () => (
    <div>
      <Head title="Preparation time saved" sub="Per teacher, per week · History department" />
      <div className="flex flex-wrap items-end gap-6">
        <div><div className="text-6xl font-extrabold font-display text-foreground leading-none">~{S.hours.total}<span className="text-2xl text-muted"> hrs</span></div><div className="text-[11px] text-muted mt-2 italic">Illustrative, for a sample department</div></div>
        <div className="flex-1 min-w-[14rem] space-y-2">
          {S.hours.parts.map((p, i) => (
            <div key={p.label}><div className="flex justify-between text-xs"><span className="text-foreground">{p.label}</span><span className="text-muted">{p.h} h</span></div>
              <div className="mt-1 h-2 rounded-full bg-border overflow-hidden"><motion.div className="h-full bg-accent rounded-full" initial={{ width: 0 }} animate={{ width: `${(p.h / S.hours.total) * 100}%` }} transition={{ delay: 0.2 + i * 0.15, duration: 0.6 }} /></div></div>
          ))}
        </div>
      </div>
    </div>
  ),
};

const standard: Scene = {
  id: "standard", title: "One standard, shared", url: "app.vivran.co.in/school/standards",
  caption: `${S.teacher.short}'s paper format becomes the department's, adopted in one click, so every section is tested the same way.`,
  steps: [1800, 2600],
  render: (st) => (
    <div>
      <Head title="Department standards" sub="Formats teachers have shared with the department" />
      <div className="p-4 rounded-xl bg-surface border border-accent-line max-w-xl">
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-sm font-semibold text-foreground">{S.standard.title}</div><div className="text-xs text-muted mt-1">{S.standard.detail}</div><div className="text-[11px] text-muted mt-1">Shared by {S.teacher.name}</div></div>
          <Layers className="w-5 h-5 text-accent shrink-0" />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex -space-x-1.5">{Array.from({ length: S.standard.of }, (_, i) => (
            <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.08 }} className={`w-6 h-6 rounded-full border-2 border-surface ${i < (st >= 1 ? S.standard.adopted : 3) ? "bg-accent" : "bg-border"}`} />
          ))}</div>
          <span className="text-xs text-muted">{st >= 1 ? S.standard.adopted : 3} of {S.standard.of} teachers use it</span>
        </div>
        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg btn-primary text-xs font-semibold"><Share2 className="w-3.5 h-3.5" /> Share with department</div>
      </div>
    </div>
  ),
};

export const STUDENT_SCENES = [cards, practice, stuck, progress];
export const STUDENT_NAV = [
  { label: "Revise", icon: <BookOpen className="w-3.5 h-3.5" /> },
  { label: "Practice", icon: <ListChecks className="w-3.5 h-3.5" /> },
  { label: "Explain simply", icon: <Lightbulb className="w-3.5 h-3.5" /> },
  { label: "Progress", icon: <TrendingUp className="w-3.5 h-3.5" /> },
];
export const INSTITUTION_SCENES = [coverage, struggle, time, standard];
export const INSTITUTION_NAV = [
  { label: "Coverage", icon: <ListChecks className="w-3.5 h-3.5" /> },
  { label: "Insights", icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { label: "Overview", icon: <Clock className="w-3.5 h-3.5" /> },
  { label: "Standards", icon: <Layers className="w-3.5 h-3.5" /> },
];
