"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { BookOpenCheck, GraduationCap, Building2, type LucideIcon } from "lucide-react";

interface Stakeholder {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  eyebrow: string;
  headline: string;
  body: string;
  footnote: string;
}

const STAKEHOLDERS: Stakeholder[] = [
  {
    key: "teacher",
    label: "Teachers",
    icon: BookOpenCheck,
    color: "#7C6EFA",
    eyebrow: "Live today",
    headline: "Give your intent back its time.",
    body: "You already know what you want to teach — the syllabus, the sequence, the emphasis, the real-world case you want students to wrestle with. Vivran turns that intent directly into course plans, slides, worksheets and assessments, grounded in the material you already teach with, in minutes instead of evenings.",
    footnote: "\"A teacher's real skill isn't writing worksheets — it's knowing what a class needs next. Vivran just handles the writing.\"",
  },
  {
    key: "student",
    label: "Students",
    icon: GraduationCap,
    color: "#4FC3F7",
    eyebrow: "Coming next",
    headline: "Learning that meets you where you actually are.",
    body: "Every worksheet, quiz and explainer Vivran generates for a class is already grounded in what that class is studying — not a generic template pulled off the shelf. A student-facing space, built on that same syllabus-aware engine, is next on the roadmap.",
    footnote: "A student space that already knows your syllabus before you ask it a question.",
  },
  {
    key: "institution",
    label: "Institutions",
    icon: Building2,
    color: "#A78BFA",
    eyebrow: "Coming next",
    headline: "Consistency across every classroom, without losing your syllabus.",
    body: "Give every department the same AI leverage — planning, content and assessment quality that stays aligned to your institution's own curriculum, not a one-size-fits-all template imported from somewhere else.",
    footnote: "Institution-wide rollout, analytics and syllabus governance — built once your teachers have proven the workflow.",
  },
];

export function StakeholderScroller() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = Math.min(STAKEHOLDERS.length - 1, Math.floor(v * STAKEHOLDERS.length));
    setActive(next);
  });

  const current = STAKEHOLDERS[active];
  const Icon = current.icon;

  return (
    <section
      ref={containerRef}
      className="relative"
      style={{ height: `${STAKEHOLDERS.length * 100}vh` }}
      aria-label="Who Vivran is built for"
    >
      {/* top offset accounts for the sticky GlobalHeader (measured ~69px) so
          this panel's content isn't clipped underneath it. Content is
          top-aligned rather than centered: the copy block can be taller than
          some viewports, and top-aligned overflow spills harmlessly toward
          the bottom of the panel instead of clipping under the header. */}
      <div className="sticky top-[72px] h-[calc(100vh-72px)] flex items-start overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 w-full grid md:grid-cols-[280px_1fr] gap-12 items-start pt-10 sm:pt-14">
          {/* Dynamic indicator — the visual that changes as you scroll */}
          <div className="hidden md:flex flex-col items-start gap-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.key}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="w-20 h-20 rounded-3xl flex items-center justify-center border"
                style={{
                  background: `radial-gradient(circle, ${current.color}22 0%, transparent 70%)`,
                  borderColor: `${current.color}40`,
                }}
              >
                <Icon className="w-9 h-9" style={{ color: current.color }} />
              </motion.div>
            </AnimatePresence>

            <div className="flex flex-col gap-3">
              {STAKEHOLDERS.map((s, i) => (
                <div key={s.key} className="flex items-center gap-3">
                  <span
                    className="w-2 h-2 rounded-full transition-all duration-300"
                    style={{
                      background: i === active ? s.color : "var(--border)",
                      transform: i === active ? "scale(1.4)" : "scale(1)",
                    }}
                  />
                  <span
                    className="text-sm font-semibold tracking-tight transition-colors duration-300"
                    style={{ color: i === active ? "var(--text-1)" : "var(--text-2)" }}
                  >
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Content that crossfades with the indicator */}
          <div className="min-h-[280px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.key}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <span
                  className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] mb-3 border"
                  style={{ color: current.color, borderColor: `${current.color}40`, background: `${current.color}14` }}
                >
                  {current.eyebrow} · {current.label}
                </span>
                <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground leading-tight">
                  {current.headline}
                </h3>
                <p className="mt-4 text-sm sm:text-base text-muted leading-relaxed max-w-xl">{current.body}</p>
                <p className="mt-4 text-sm italic text-foreground/70 max-w-xl border-l-2 pl-4" style={{ borderColor: `${current.color}60` }}>
                  {current.footnote}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Mobile progress dots (sticky column is hidden below md) */}
            <div className="flex md:hidden items-center gap-2 mt-8">
              {STAKEHOLDERS.map((s, i) => (
                <span
                  key={s.key}
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: i === active ? "28px" : "8px",
                    background: i === active ? s.color : "var(--border)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
