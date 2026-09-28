"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarRange, BookOpen, Clock, Target, AlertCircle } from "lucide-react";
import { getLibraryItem, type CoursePlan } from "@/services/api";
import { SmartCreationBox } from "@/app/components/smart-creation-box";
import { BookLoader } from "@/app/components/book-loader";

export default function PlanPage() {
  return (
    <Suspense fallback={null}>
      <PlanPageInner />
    </Suspense>
  );
}

function PlanPageInner() {
  const itemParam = useSearchParams().get("item");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [opening, setOpening] = useState(false);

  // Reopening a saved plan: shown through the same display as a fresh one.
  useEffect(() => {
    if (!itemParam) return;
    let cancelled = false;
    setOpening(true);
    getLibraryItem(itemParam)
      .then((item) => {
        if (cancelled) return;
        if (item.type !== "course_plan" || !item.content) setError("This item can't be opened here.");
        else setPlan(item.content as CoursePlan);
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not open that plan."); })
      .finally(() => { if (!cancelled) setOpening(false); });
    return () => { cancelled = true; };
  }, [itemParam]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
            <CalendarRange className="w-6 h-6 text-accent" /> Pillar 1 — Course & Lesson Planning
          </h1>
          <p className="text-sm text-muted mt-1">
            Help teachers plan coursework, units, weekly structures, lesson sequences, and objectives.
          </p>
        </div>
      </div>

      {/* Plan Capabilities Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
          <div className="p-2 rounded-lg bg-accent-soft text-accent w-fit">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="font-bold text-sm text-foreground font-display">Course Planning</div>
          <p className="text-xs text-muted leading-relaxed">
            Multi-week syllabus breakdown, topic sequencing, and high-level milestones.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
          <div className="p-2 rounded-lg bg-chrome-soft text-chrome w-fit">
            <Clock className="w-4 h-4" />
          </div>
          <div className="font-bold text-sm text-foreground font-display">Unit & Lesson Sequencing</div>
          <p className="text-xs text-muted leading-relaxed">
            Time allocations per topic, classroom activities, revision windows, and homework.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
          <div className="p-2 rounded-lg bg-success-soft text-success w-fit">
            <Target className="w-4 h-4" />
          </div>
          <div className="font-bold text-sm text-foreground font-display">Learning Objectives</div>
          <p className="text-xs text-muted leading-relaxed">
            Bloom&apos;s taxonomy aligned objectives, suggested classroom artifacts, and assessments.
          </p>
        </div>
      </div>

      {/* Smart Prompt Box, locked to course_plan — same free-text + mic +
          customization dropdowns + editable topics pattern as the dashboard,
          feeding this page's own weekly-plan display below. */}
      <SmartCreationBox
        lockedArtifactType="course_plan"
        showInlineResult={false}
        heading="What course would you like to plan?"
        promptPlaceholder="Just the ground you want to cover — e.g. 'Demand, Supply and Market Equilibrium, building up to a unit test'. Set the grade, subject and length below."
        onGenerated={(result) => {
          if (result.artifactType !== "course_plan") return;
          setError(null);
          if (!result.ok) {
            setError(result.error);
            setPlan(null);
            return;
          }
          if (result.data.error) setError(result.data.error);
          setPlan(result.data);
        }}
      />

      {opening && (
        <div className="p-3 rounded-xl bg-card border border-border flex items-center gap-2 text-xs text-muted">
          <BookLoader className="w-3.5 h-3.5" /> Opening your saved plan…
        </div>
      )}

      {error && (
        <div className="p-3 bg-danger-soft border border-danger-line rounded-xl flex items-center gap-2 text-xs text-danger">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {plan && plan.weekly_structure?.length > 0 && (
        <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <div className="text-xs text-accent font-semibold uppercase tracking-wider">{itemParam ? "Saved plan" : "Generated Plan"}</div>
              <div className="font-bold text-base text-foreground font-display">{plan.title}</div>
            </div>
            <span className="text-xs text-muted bg-card px-2.5 py-1 rounded-lg">
              {plan.duration_weeks} Weeks {plan.grounded_on ? `· Grounded on ${plan.grounded_on} excerpts` : ""}
            </span>
          </div>

          <div className="space-y-3">
            {plan.weekly_structure.map((w) => (
              <div key={w.week} className="p-3.5 rounded-xl bg-card border border-border text-xs">
                <span className="text-foreground font-semibold">Week {w.week}: {w.topic}</span>
                <div className="text-muted mt-1">{w.lessons?.join(" · ")}</div>
                {w.objectives && w.objectives.length > 0 && (
                  <div className="text-muted mt-1">Objectives: {w.objectives.join("; ")}</div>
                )}
              </div>
            ))}
          </div>

          {plan.sources && plan.sources.length > 0 && (
            <div className="pt-3 border-t border-border space-y-1.5">
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">Grounded in your materials</div>
              {plan.sources.map((s) => (
                <div key={s.chunk_id} className="text-[11px] text-muted">
                  <span className="text-chrome font-medium">{s.source_material}{s.page_number ? ` · p.${s.page_number}` : ""}</span> — {s.excerpt}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
