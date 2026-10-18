"use client";

import Link from "next/link";
import { ArrowRight, FolderOpen, PenLine } from "lucide-react";
import { FeatureExplainer } from "@/app/components/feature-explainer";
import { stage, type CatalogItem } from "@/lib/catalog";

/** Shortcuts that aren't things Vivran makes, but set up everything it makes. */
const SETUP: CatalogItem[] = [
  {
    key: "materials",
    title: "My materials",
    desc: "Your textbook, notes and slides.",
    explain: "Upload the chapters, notes and slides you teach from. Everything Vivran makes can then point to the page it came from.",
    href: "/teacher/materials",
    icon: FolderOpen,
    color: "text-chrome",
  },
  {
    key: "teaching_style",
    title: "Teaching memory",
    desc: "How you usually work.",
    explain: "Vivran learns from your past papers and from what you ask for, and suggests your usual settings and style. Nothing is used until you accept it, and you can remove any of it.",
    href: "/teacher/memory",
    icon: PenLine,
    color: "text-tint-clay",
  },
];

const COLUMNS = [
  { ...stage("plan"), items: [...stage("plan").items, ...SETUP] },
  stage("teach"),
  stage("assess"),
];

/** The dashboard's shortcuts: Plan, Teach, Assess as one even grid. */
export function ShortcutGrid() {
  return (
    <>
        {/* The teacher's cycle, left to right: plan the term, teach it, check
          it. Teach has twice the items, so it gets twice the width, and Plan
          carries the two things that set everything else up (material and
          teaching style). Every column is then three tiles tall: one even
          grid, no ragged rows. */}
      <div className="rounded-2xl bg-surface border border-border grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-border">
        {COLUMNS.map((col, n) => (
          <div key={col.key} className={`p-4 space-y-3 ${col.key === "teach" ? "lg:col-span-2" : ""}`}>
            <Link href={col.href} className="group flex items-start gap-2.5">
              <span className="w-6 h-6 shrink-0 rounded-full border border-accent-line text-accent text-[11px] font-bold font-display flex items-center justify-center">
                {n + 1}
              </span>
              <span className="min-w-0">
                <span className="font-bold text-sm text-foreground font-display flex items-center gap-1.5">
                  {col.label}
                  <ArrowRight className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 transition-all" />
                </span>
                <span className="block text-[11px] text-muted mt-0.5 leading-snug">{col.blurb}</span>
              </span>
            </Link>
            <div className={`grid gap-2 ${col.key === "teach" ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-1"}`}>
              {col.items.map((it) => {
                const Icon = it.icon;
                return (
                  <FeatureExplainer key={it.key} title={it.title} text={it.explain} className="h-full">
                    {(describedBy) => (
                      <Link
                        href={it.href}
                        aria-describedby={describedBy}
                        className="min-h-11 h-full w-full flex items-center gap-2.5 px-3 py-2 [@media(hover:none)]:pr-9 rounded-xl bg-card border border-border hover:border-accent-line hover:-translate-y-0.5 transition-all"
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${it.color}`} />
                        <span className="text-[13px] font-semibold text-foreground leading-tight">{it.title}</span>
                      </Link>
                    )}
                  </FeatureExplainer>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
