"use client";

import React from "react";
import Link from "next/link";
import { SmartPromptBox } from "@/app/components/smart-prompt-box";
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
  Clock,
} from "lucide-react";

export default function TeacherDashboard() {
  const { user } = useAuth();

  const suggestedActions = [
    { title: "Plan a Course", desc: "Sequence topics, units & weekly objectives", href: "/teacher/plan", icon: CalendarRange, color: "text-[#7C6EFA]" },
    { title: "Create Lesson", desc: "Draft full lesson plan with notes & activities", href: "/teacher/create", icon: BookOpenCheck, color: "text-[#4FC3F7]" },
    { title: "Create Slides", desc: "Generate presentation slides structure", href: "/teacher/create", icon: Presentation, color: "text-amber-400" },
    { title: "Create Video", desc: "Script and generate educational video", href: "/teacher/create", icon: Video, color: "text-purple-400" },
    { title: "Create Worksheet", desc: "Generate practice problems & answer keys", href: "/teacher/create", icon: FileSpreadsheet, color: "text-emerald-400" },
    { title: "Create Quiz", desc: "Short exit tickets, MCQs & quick checks", href: "/teacher/assess", icon: HelpCircle, color: "text-pink-400" },
    { title: "Create Test", desc: "Full structured exam paper with rubrics", href: "/teacher/assess", icon: FileCheck, color: "text-indigo-400" },
  ];

  const recentProjects = [
    {
      title: "Class 10 Biology — Tissues",
      updated: "2 hours ago",
      artifacts: ["Course Plan", "5 Lessons", "12 Slides", "Worksheet", "20-Mark Quiz"],
      type: "Course Pack",
    },
    {
      title: "Class 12 Economics — Money & Credit",
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

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      {/* Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-white tracking-tight">
            Welcome back, {user?.name || "Teacher"} 👋
          </h1>
          <p className="text-sm text-[#8B8B99] mt-1">
            Turn your teaching intent and materials into classroom-ready outputs.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/10 text-xs text-[#4FC3F7] font-medium">
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
          <h2 className="text-lg font-bold font-display text-white tracking-tight">
            Suggested Actions & Shortcuts
          </h2>
          <span className="text-xs text-[#8B8B99]">Pillar Shortcuts</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {suggestedActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.title}
                href={action.href}
                className="p-4 rounded-2xl bg-[#0F0F16]/80 border border-white/10 hover:border-[#7C6EFA]/40 hover:bg-white/[0.04] transition-all group relative overflow-hidden"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2.5 rounded-xl bg-white/5 ${action.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#8B8B99] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="font-semibold text-sm text-white font-display">
                  {action.title}
                </div>
                <div className="text-xs text-[#8B8B99] mt-1 line-clamp-2 leading-relaxed">
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
          <h2 className="text-lg font-bold font-display text-white tracking-tight flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-[#7C6EFA]" />
            Recent Teaching Projects
          </h2>
          <Link
            href="/teacher/recent"
            className="text-xs font-medium text-[#4FC3F7] hover:underline"
          >
            View all projects →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {recentProjects.map((project) => (
            <div
              key={project.title}
              className="p-5 rounded-2xl bg-[#0F0F16]/90 border border-white/10 space-y-3 hover:border-white/20 transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-[#7C6EFA] bg-[#7C6EFA]/10 px-2 py-0.5 rounded-md border border-[#7C6EFA]/20">
                  {project.type}
                </span>
                <span className="text-[11px] text-[#8B8B99] flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {project.updated}
                </span>
              </div>
              
              <div className="font-bold text-sm text-white font-display">
                {project.title}
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {project.artifacts.map((art) => (
                  <span
                    key={art}
                    className="px-2 py-0.5 rounded-md bg-white/5 text-[11px] text-[#8B8B99] border border-white/5"
                  >
                    {art}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Future Capabilities Notice (Spec §2) */}
      <section className="p-4 rounded-xl border border-white/5 bg-white/[0.01] flex items-center justify-between text-xs text-[#8B8B99]">
        <div>
          🚀 <strong className="text-white">Future Features:</strong> AI Teacher Twin & AI Automated Student Grading are currently marked as <span className="text-[#4FC3F7] bg-white/10 px-2 py-0.5 rounded">Coming Soon</span> per specification.
        </div>
      </section>
    </div>
  );
}

