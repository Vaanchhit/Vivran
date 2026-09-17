"use client";

import React from "react";
import { Clock, FolderKanban } from "lucide-react";

// Mirrors the "Recent Teaching Projects" preview shown on the dashboard
// (frontend/app/(app)/teacher/page.tsx) so clicking through from "View all
// projects" doesn't lose the examples just shown. Mock data until projects
// are persisted and listable via a real API.
const recentProjects = [
  {
    title: "College 2nd Year Business Studies — Porter's Five Forces",
    updated: "2 hours ago",
    artifacts: ["Course Plan", "5 Lessons", "12 Slides", "Worksheet", "40-Mark Case Study Test"],
    type: "Course Pack",
  },
  {
    title: "College 1st Year Economics — Demand & Supply",
    updated: "Yesterday",
    artifacts: ["Lesson Plan", "Slides", "Video Script", "80-Mark Test Paper"],
    type: "Assessment Pack",
  },
  {
    title: "Class 9 Physics — Newton's Laws",
    updated: "3 days ago",
    artifacts: ["Interactive Coursework", "Video Segment", "3 Quizzes"],
    type: "Interactive Coursework",
  },
];

export default function RecentPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
          <Clock className="w-6 h-6 text-[#7C6EFA]" /> Recent Projects & History
        </h1>
        <p className="text-sm text-muted mt-1">
          Access your recent teaching projects, generated assessments, and editable slides.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {recentProjects.map((project) => (
          <div
            key={project.title}
            className="p-5 rounded-2xl bg-surface/90 border border-border space-y-3 hover:border-white/20 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-[#7C6EFA] bg-[#7C6EFA]/10 px-2 py-0.5 rounded-md border border-[#7C6EFA]/20">
                {project.type}
              </span>
              <span className="text-[11px] text-muted flex items-center gap-1">
                <Clock className="w-3 h-3" /> {project.updated}
              </span>
            </div>
            <div className="font-bold text-sm text-foreground font-display">{project.title}</div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {project.artifacts.map((art) => (
                <span key={art} className="px-2 py-0.5 rounded-md bg-card text-[11px] text-muted border border-border">
                  {art}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="p-6 rounded-2xl bg-surface/60 border border-dashed border-border text-center text-sm text-muted flex flex-col items-center gap-2">
        <FolderKanban className="w-5 h-5 text-muted" />
        Everything you generate from here will start showing up in this list.
      </div>
    </div>
  );
}
