"use client";

import React from "react";
import Link from "next/link";
import { SmartPromptBox } from "@/app/components/smart-prompt-box";
import { RecentProjects } from "@/app/components/recent-projects";
import { FeatureExplainer } from "@/app/components/feature-explainer";
import { useAuth } from "@/lib/auth-context";
import { STAGES } from "@/lib/catalog";
import { FolderKanban, Sparkles, ArrowRight } from "lucide-react";

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

        {/* One row per stage: the stage on the left, its items as compact tiles
            on the right. Stages have 1, 6 and 3 items, so columns left big gaps. */}
        <div className="rounded-2xl bg-surface border border-border divide-y divide-border">
          {STAGES.map((st) => (
            <div key={st.key} className="p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
              <Link href={st.href} className="md:w-44 shrink-0 group">
                <div className="font-bold text-sm text-foreground font-display flex items-center gap-1.5">
                  {st.label}
                  <ArrowRight className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 transition-all" />
                </div>
                <div className="text-[11px] text-muted mt-0.5 leading-snug">{st.blurb}</div>
              </Link>
              <div className="flex-1 flex flex-wrap gap-2">
                {st.items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <FeatureExplainer key={it.key} title={it.title} text={it.explain}>
                      {(describedBy) => (
                        <Link
                          href={it.href}
                          aria-describedby={describedBy}
                          className="flex items-center gap-2.5 px-3 py-2.5 [@media(hover:none)]:pr-9 rounded-xl bg-card border border-border hover:border-accent-line hover:-translate-y-0.5 transition-all"
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${it.color}`} />
                          <span className="text-[13px] font-semibold text-foreground whitespace-nowrap">{it.title}</span>
                        </Link>
                      )}
                    </FeatureExplainer>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
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