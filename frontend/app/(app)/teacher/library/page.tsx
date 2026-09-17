"use client";

import React from "react";
import { Library } from "lucide-react";
import { EmptyState } from "@/app/components/empty-state";

export default function LibraryPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
          <Library className="w-6 h-6 text-[#7C6EFA]" /> Library & Curriculum Repository
        </h1>
        <p className="text-sm text-muted mt-1">
          Browse saved course templates, standardized syllabus structures, and shared educational material.
        </p>
      </div>

      <EmptyState
        icon={Library}
        title="Your library is empty for now"
        description="Saved course templates and shared curriculum material will show up here once you've built a few. Uploaded materials already live under Materials — this is for reusable templates across courses, coming soon."
      />
    </div>
  );
}
