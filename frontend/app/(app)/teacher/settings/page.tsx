"use client";

import React from "react";
import { Settings, User, Sliders } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-[#7C6EFA]" /> Teacher Profile & Workspace Settings
        </h1>
        <p className="text-sm text-muted mt-1">
          Manage your teacher profile, subject preferences, and AI routing configuration.
        </p>
      </div>

      <div className="p-6 rounded-2xl bg-surface border border-border space-y-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#7C6EFA]/20 border border-[#7C6EFA]/30 flex items-center justify-center text-[#7C6EFA] text-lg font-bold">
            {(user?.name || "T")
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-foreground text-base">{user?.name || "Teacher"}</div>
            <div className="text-xs text-muted">{user?.school || "Your institution"}</div>
          </div>
        </div>

        <div className="pt-4 border-t border-border space-y-3 text-xs">
          <div>
            <span className="text-muted">Subjects &amp; Grades:</span>
            <div className="text-foreground font-medium mt-0.5">Not set yet — inferred automatically from what you generate.</div>
          </div>

          <div>
            <span className="text-muted">AI Model:</span>
            <div className="text-[#4FC3F7] font-medium mt-0.5">Google Gemini, with automatic fallback if a request is rate-limited.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

