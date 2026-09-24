"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Clock, FolderKanban, Loader2 } from "lucide-react";
import { listProjects, type Project } from "@/services/api";

/** Reads the teacher's real saved projects from GET /api/projects. This
 * deliberately renders an empty state rather than sample content: a live
 * product must never show fabricated work back to the person who didn't do
 * it. Shared by the dashboard preview and the full /teacher/recent list so
 * the two can't drift apart again. */

const TYPE_LABELS: Record<string, string> = {
  course_plan: "Course Plan",
  slides: "Slides",
  worksheet: "Worksheet",
  lesson_notes: "Lesson Notes",
  assessment: "Test / Quiz Paper",
  interactive: "Interactive Coursework",
};

function relativeTime(iso?: string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

export function RecentProjects({ limit }: { limit?: number }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load your projects.");
        setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (projects === null) {
    return (
      <div className="p-6 rounded-2xl bg-surface border border-border text-sm text-muted flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your projects…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-2xl bg-warning-soft border border-warning-line text-xs text-warning flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="p-8 rounded-2xl bg-surface border border-dashed border-border text-center text-sm text-muted flex flex-col items-center gap-2">
        <FolderKanban className="w-5 h-5 text-muted" />
        <div>You haven&rsquo;t saved a project yet.</div>
        <Link href="/teacher/plan" className="text-accent font-medium hover:underline">
          Plan your first course →
        </Link>
      </div>
    );
  }

  const shown = limit ? projects.slice(0, limit) : projects;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {shown.map((project) => {
        const spec = project.specification_json ?? undefined;
        const topics = spec?.topics ?? [];
        const when = relativeTime(project.updated_at || project.created_at);
        const weeks = spec?.course_plan?.duration_weeks;
        return (
          <div
            key={project.id}
            className="p-5 rounded-2xl bg-surface border border-border space-y-3 hover:border-border-hi transition-all"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-accent bg-accent-soft px-2 py-0.5 rounded-md border border-accent-line">
                {TYPE_LABELS[project.type] ?? project.type}
              </span>
              {when && (
                <span className="text-[11px] text-muted flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" /> {when}
                </span>
              )}
            </div>

            <div className="font-bold text-sm text-foreground font-display">{project.title}</div>

            {(spec?.grade || spec?.subject) && (
              <div className="text-[11px] text-muted">
                {[spec?.grade, spec?.subject].filter(Boolean).join(" · ")}
              </div>
            )}

            {(topics.length > 0 || weeks) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {weeks ? (
                  <span className="px-2 py-0.5 rounded-md bg-card text-[11px] text-muted border border-border">
                    {weeks} week{weeks === 1 ? "" : "s"}
                  </span>
                ) : null}
                {topics.map((topic) => (
                  <span key={topic} className="px-2 py-0.5 rounded-md bg-card text-[11px] text-muted border border-border">
                    {topic}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
