"use client";

import React from "react";
import Link from "next/link";
import { SmartPromptBox } from "@/app/components/smart-prompt-box";
import { RecentProjects } from "@/app/components/recent-projects";
import { useAuth } from "@/lib/auth-context";
import {
  CalendarRange,
  BookOpenCheck,
  Presentation,
  Video,
  FileSpreadsheet,
  HelpCircle,
  FileCheck,
  FolderKanban,
  Sparkles,
  ArrowRight,
} from "lucide-react";

export default function TeacherDashboard() {
  const { user } = useAuth();

  // Each shortcut deep-links to the page that actually does the job, with the
  // artifact type the teacher clicked already selected. That's their explicit
  // choice travelling across a navigation — nothing about their content
  // (grade, subject, topic, length) is pre-filled by it.
  const suggestedActions = [
    { title: "Plan a Course", desc: "Sequence topics, units & weekly objectives", href: "/teacher/plan", icon: CalendarRange, color: "text-accent" },
    { title: "Create Lesson", desc: "Draft full lesson plan with notes & activities", href: "/teacher/create?type=lesson_notes", icon: BookOpenCheck, color: "text-chrome" },
    { title: "Create Slides", desc: "Generate presentation slides structure", href: "/teacher/create?type=slides", icon: Presentation, color: "text-tint-bronze" },
    { title: "Create Video", desc: "Script and generate educational video", href: "/teacher/create?type=video", icon: Video, color: "text-tint-umber" },
    { title: "Create Worksheet", desc: "Generate practice problems & answer keys", href: "/teacher/create?type=worksheet", icon: FileSpreadsheet, color: "text-tint-olive" },
    { title: "Create Quiz", desc: "Short exit tickets, MCQs & quick checks", href: "/teacher/assess?mode=quiz", icon: HelpCircle, color: "text-tint-rose" },
    { title: "Create Test", desc: "Full structured exam paper with rubrics", href: "/teacher/assess?mode=test", icon: FileCheck, color: "text-tint-olive" },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      {/* Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-foreground tracking-tight">
            Welcome back, {user?.name || "Teacher"} 👋
          </h1>
          <p className="text-sm text-muted mt-1">
            Turn your teaching intent and materials into classroom-ready outputs.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-xs text-chrome font-medium">
          <Sparkles className="w-3.5 h-3.5" /> Teacher Beta Workspace
        </div>
      </div>

      {/* Prominent Smart Prompt Box (Spec §5 & §10) */}
      <section className="space-y-3">
        <SmartPromptBox />
      </section>

      {/* Suggested Actions Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-display text-foreground tracking-tight">
            Suggested Actions & Shortcuts
          </h2>
          <span className="text-xs text-muted">Pillar Shortcuts</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {suggestedActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.title}
                href={action.href}
                className="p-4 rounded-2xl bg-surface border border-border hover:border-accent-line hover:bg-card transition-all group relative overflow-hidden hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2.5 rounded-xl bg-card ${action.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="font-semibold text-sm text-foreground font-display">
                  {action.title}
                </div>
                <div className="text-xs text-muted mt-1 line-clamp-2 leading-relaxed">
                  {action.desc}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent Projects Section (Spec §7 & §10) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-display text-foreground tracking-tight flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-accent" />
            Recent Teaching Projects
          </h2>
          <Link
            href="/teacher/recent"
            className="text-xs font-medium text-accent hover:underline"
          >
            View all projects →
          </Link>
        </div>

        <RecentProjects limit={3} />
      </section>

      {/* Future Capabilities Notice (Spec §2) */}
      <section className="p-4 rounded-xl border border-border bg-card flex items-center justify-between text-xs text-muted">
        <div>
          🚀 <strong className="text-foreground">Future Features:</strong> AI Teacher Twin & AI Automated Student Grading are currently marked as <span className="text-chrome bg-card px-2 py-0.5 rounded border border-border">Coming Soon</span> per specification.
        </div>
      </section>
    </div>
  );
}