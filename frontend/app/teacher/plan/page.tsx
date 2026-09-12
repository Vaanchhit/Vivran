"use client";

import React, { useState } from "react";
import { CalendarRange, BookOpen, Clock, Target, Loader2, AlertCircle } from "lucide-react";
import { generateCoursePlan, type CoursePlan } from "@/services/api";

export default function PlanPage() {
  const [grade, setGrade] = useState("Class 9");
  const [subject, setSubject] = useState("Biology");
  const [topics, setTopics] = useState("Tissues, Food Resources");
  const [durationWeeks, setDurationWeeks] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<CoursePlan | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const topicList = topics.split(",").map((t) => t.trim()).filter(Boolean);
      const { course_plan } = await generateCoursePlan({
        title: `${grade} ${subject} — ${topicList.join(", ")}`,
        grade,
        subject,
        topics: topicList,
        durationWeeks,
      });
      if (course_plan.error) setError(course_plan.error);
      setPlan(course_plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  };

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

      {/* Generation form */}
      <div className="p-5 rounded-2xl bg-surface border border-border grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
        <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade" className="px-3 py-2 bg-card border border-border rounded-lg text-foreground" />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="px-3 py-2 bg-card border border-border rounded-lg text-foreground" />
        <input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Topics (comma-separated)" className="px-3 py-2 bg-card border border-border rounded-lg text-foreground md:col-span-2" />
        <input type="number" value={durationWeeks} onChange={(e) => setDurationWeeks(Number(e.target.value))} placeholder="Weeks" className="px-3 py-2 bg-card border border-border rounded-lg text-foreground" />
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="grad-btn px-4 py-2 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 md:col-span-5"
        >
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {loading ? "Generating…" : "Generate Course Plan"}
        </button>
      </div>

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
        </div>
      )}
    </div>
  );
}
