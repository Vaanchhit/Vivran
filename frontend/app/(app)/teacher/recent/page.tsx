"use client";

import React from "react";
import { Clock } from "lucide-react";
import { RecentProjects } from "@/app/components/recent-projects";

export default function RecentPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
          <Clock className="w-6 h-6 text-accent" /> Your saved work
        </h1>
        <p className="text-sm text-muted mt-1">
          Everything you create is saved here automatically. Open, rename or delete it any time.
        </p>
      </div>

      {/* Same component the dashboard preview uses, so the two lists can never disagree. */}
      <RecentProjects manage />
    </div>
  );
}
