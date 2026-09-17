"use client";

import React, { useState } from "react";
import { CalendarRange, BookOpen, Clock, Target, AlertCircle } from "lucide-react";
import { type CoursePlan } from "@/services/api";
import { SmartCreationBox } from "@/app/components/smart-creation-box";

export default function PlanPage() {
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<CoursePlan | null>(null);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
            <CalendarRange className="w-6 h-6 text-[#7C6EFA]" /> Pillar 1 — Course & Lesson Planning
          </h1>
          <p className="text-sm text-muted mt-1">
            Help teachers plan coursework, units, weekly structures, lesson sequences, and objectives.
          </p>
        </div>
      </div>

      {/* Plan Capabilities Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
          <div className="p-2 rounded-lg bg-[#7C6EFA]/10 text-[#7C6EFA] w-fit">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="font-bold text-sm text-foreground font-display">Course Planning</div>
          <p className="text-xs text-muted leading-relaxed">
            Multi-week syllabus breakdown, topic sequencing, and high-level milestones.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
          <div className="p-2 rounded-lg bg-[#4FC3F7]/10 text-[#4FC3F7] w-fit">
            <Clock className="w-4 h-4" />
          </div>
          <div className="font-bold text-sm text-foreground font-display">Unit & Lesson Sequencing</div>
          <p className="text-xs text-muted leading-relaxed">
            Time allocations per topic, classroom activities, revision windows, and homework.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
          <div className="p-2 rounded-lg bg-emerald-400/10 text-emerald-400 w-fit">
            <Target className="w-4 h-4" />
          </div>
          <div className="font-bold text-sm text-foreground font-display">Learning Objectives</div>
          <p className="text-xs text-muted leading-relaxed">
            Bloom&apos;s taxonomy aligned objectives, suggested classroom artifacts, and assessments.
          </p>
        </div>
      </div>

      {/* Smart Prompt Box, locked to course_plan — same free-text + mic +
          Interpret Intent + editable grade/subject/topics pattern as the
          dashboard, feeding this page's own weekly-plan display below. */}
      <SmartCreationBox
        lockedArtifactType="course_plan"
        showInlineResult={false}
        showShortcuts={false}
        heading="What course would you like to plan?"
        promptPlaceholder="Tell Vivran what you want to plan... e.g. 'Plan 3 weeks of College 1st Year Economics covering Demand, Supply, and Market Equilibrium.'"
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

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {plan && plan.weekly_structure?.length > 0 && (
        <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <div className="text-xs text-[#7C6EFA] font-semibold uppercase tracking-wider">Generated Plan</div>
              <div className="font-bold text-base text-foreground font-display">{plan.title}</div>
            </div>
            <span className="text-xs text-muted bg-white/5 px-2.5 py-1 rounded-lg">
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
                  <span className="text-[#4FC3F7] font-medium">{s.source_material}{s.page_number ? ` · p.${s.page_number}` : ""}</span> — {s.excerpt}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
