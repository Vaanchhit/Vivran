"use client";

import React from "react";
import Link from "next/link";
import { SmartPromptBox } from "@/app/components/smart-prompt-box";
import { RecentProjects } from "@/app/components/recent-projects";
import { ShortcutGrid } from "@/app/components/shortcut-grid";
import { useAuth } from "@/lib/auth-context";
import { FolderKanban, Sparkles } from "lucide-react";

export default function TeacherDashboard() {
  const { user } = useAuth();

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

      {/* Shortcuts, grouped the same way as the sidebar: Plan, Teach, Assess.
          Each deep-links to the card of the same name on that page. That's the
          teacher's explicit choice travelling across a navigation; nothing
          about their content is pre-filled by it. */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold font-display text-foreground tracking-tight">Or start from a shortcut</h2>

        <ShortcutGrid />
      </section>

      {/* Recent Projects Section (Spec §7 & §10) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-display text-foreground tracking-tight flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-accent" />
            Recent work
          </h2>
          <Link
            href="/teacher/library"
            className="text-xs font-medium text-accent hover:underline"
          >
            Open library →
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