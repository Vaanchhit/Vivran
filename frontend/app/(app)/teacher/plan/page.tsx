"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, AlertCircle } from "lucide-react";
import { getLibraryItem, type CoursePlan } from "@/services/api";
import { SmartCreationBox } from "@/app/components/smart-creation-box";
import { BookLoader } from "@/app/components/book-loader";
import { useTabState } from "@/lib/tab-state";
import { stage } from "@/lib/catalog";

export default function PlanPage() {
  return (
    <Suspense fallback={null}>
      <PlanPageInner />
    </Suspense>
  );
}

function PlanPageInner() {
  const router = useRouter();
  const itemParam = useSearchParams().get("item");
  // Kept per browser tab, so leaving this page doesn't clear the plan on screen.
  const [error, setError] = useTabState<string | null>("plan:error", null);
  const [plan, setPlan] = useTabState<CoursePlan | null>("plan:result", null);
  const [openedTitle, setOpenedTitle] = useTabState<string | null>("plan:opened", null);
  const [opening, setOpening] = useState(false);
  const meta = stage("plan");

  // Reopening a saved plan: shown through the same display as a fresh one.
  useEffect(() => {
    if (!itemParam) return;
    let cancelled = false;
    setOpening(true);
    getLibraryItem(itemParam)
      .then((item) => {
        if (cancelled) return;
        if (item.type !== "course_plan" || !item.content) {
          setError("This item can't be opened here.");
          return;
        }
        setError(null);
        setPlan(item.content as CoursePlan);
        setOpenedTitle(item.title);
        // The plan now lives in this tab's state; dropping ?item keeps a later
        // visit from reloading it over whatever the teacher does next.
        router.replace("/teacher/plan");
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not open that plan."); })
      .finally(() => { if (!cancelled) setOpening(false); });
    return () => { cancelled = true; };
  }, [itemParam, router, setError, setPlan, setOpenedTitle]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
          <CalendarRange className="w-6 h-6 text-accent" /> Plan
        </h1>
        <p className="text-sm text-muted mt-1">
          {meta.blurb}: topics in order, lessons for each week, and what students should be able to do by the end.
        </p>
      </div>

      <SmartCreationBox
        scope="plan"
        scopeHref="/teacher/plan"
        lockedArtifactType="course_plan"
        showInlineResult={false}
        heading="What course would you like to plan?"
        promptPlaceholder="Just the ground you want to cover — e.g. 'Demand, Supply and Market Equilibrium, building up to a unit test'. Set the grade, subject and length below."
        onGenerated={(result) => {
          if (result.artifactType !== "course_plan") return;
          setError(null);
          setOpenedTitle(null);
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
              <div className="text-xs text-accent font-semibold uppercase tracking-wider">{openedTitle ? "Saved plan" : "Generated Plan"}</div>
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
