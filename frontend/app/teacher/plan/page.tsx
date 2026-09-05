"use client";

import React from "react";
import { CalendarRange, Plus, BookOpen, Clock, Target } from "lucide-react";

export default function PlanPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-white flex items-center gap-2.5">
            <CalendarRange className="w-6 h-6 text-[#7C6EFA]" /> Pillar 1 — Course & Lesson Planning
          </h1>
          <p className="text-sm text-[#8B8B99] mt-1">
            Help teachers plan coursework, units, weekly structures, lesson sequences, and objectives.
          </p>
        </div>

        <button className="px-4 py-2 bg-[#7C6EFA] hover:bg-[#684af3] text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> New Course Plan
        </button>
      </div>

      {/* Plan Capabilities Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#0F0F16] border border-white/10 space-y-2">
          <div className="p-2 rounded-lg bg-[#7C6EFA]/10 text-[#7C6EFA] w-fit">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="font-bold text-sm text-white font-display">Course Planning</div>
          <p className="text-xs text-[#8B8B99] leading-relaxed">
            Multi-week syllabus breakdown, topic sequencing, and high-level milestones.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0F0F16] border border-white/10 space-y-2">
          <div className="p-2 rounded-lg bg-[#4FC3F7]/10 text-[#4FC3F7] w-fit">
            <Clock className="w-4 h-4" />
          </div>
          <div className="font-bold text-sm text-white font-display">Unit & Lesson Sequencing</div>
          <p className="text-xs text-[#8B8B99] leading-relaxed">
            Time allocations per topic, classroom activities, revision windows, and homework.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0F0F16] border border-white/10 space-y-2">
          <div className="p-2 rounded-lg bg-emerald-400/10 text-emerald-400 w-fit">
            <Target className="w-4 h-4" />
          </div>
          <div className="font-bold text-sm text-white font-display">Learning Objectives</div>
          <p className="text-xs text-[#8B8B99] leading-relaxed">
            Bloom's taxonomy aligned objectives, suggested classroom artifacts, and assessments.
          </p>
        </div>
      </div>

      {/* Sample Editable Course Plan (Spec §12) */}
      <div className="p-6 rounded-2xl bg-[#0F0F16] border border-white/10 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div>
            <div className="text-xs text-[#7C6EFA] font-semibold uppercase tracking-wider">Sample Plan</div>
            <div className="font-bold text-base text-white font-display">Class 9 Biology — Tissues & Food Resources</div>
          </div>
          <span className="text-xs text-[#8B8B99] bg-white/5 px-2.5 py-1 rounded-lg">3 Weeks · 12 Lessons</span>
        </div>

        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs">
            <div>
              <span className="text-white font-semibold">Week 1: Plant Tissues (Meristematic & Permanent)</span>
              <div className="text-[#8B8B99] mt-0.5">4 lessons · Objectives: Understand cell division & tissue specialization</div>
            </div>
            <button className="text-[#4FC3F7] hover:underline">Edit Sequence</button>
          </div>

          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs">
            <div>
              <span className="text-white font-semibold">Week 2: Animal Tissues (Epithelial, Connective, Muscular, Nervous)</span>
              <div className="text-[#8B8B99] mt-0.5">4 lessons · Suggested artifact: Slide presentation & Worksheet</div>
            </div>
            <button className="text-[#4FC3F7] hover:underline">Edit Sequence</button>
          </div>
        </div>
      </div>
    </div>
  );
}

