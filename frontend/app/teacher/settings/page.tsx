"use client";

import React from "react";
import { Settings, User, Sliders } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="border-b border-white/5 pb-6">
        <h1 className="text-2xl font-extrabold font-display text-white flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-[#7C6EFA]" /> Teacher Profile & Workspace Settings
        </h1>
        <p className="text-sm text-[#8B8B99] mt-1">
          Manage your teacher profile, subject preferences, and AI routing configuration.
        </p>
      </div>

      <div className="p-6 rounded-2xl bg-[#0F0F16] border border-white/10 space-y-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#7C6EFA]/20 border border-[#7C6EFA]/30 flex items-center justify-center text-white text-lg font-bold">
            VA
          </div>
          <div>
            <div className="font-bold text-white text-base">{user?.name || "Vaanchhit Agarwal"}</div>
            <div className="text-xs text-[#8B8B99]">{user?.school || "Delhi Public School"} · Senior Biology & Science Teacher</div>
          </div>
        </div>

        <div className="pt-4 border-t border-white/5 space-y-3 text-xs">
          <div>
            <span className="text-[#8B8B99]">Assigned Subjects:</span>
            <div className="text-white font-medium mt-0.5">Biology, Science, Economics</div>
          </div>

          <div>
            <span className="text-[#8B8B99]">Assigned Grades:</span>
            <div className="text-white font-medium mt-0.5">Class 9, Class 10, Class 12</div>
          </div>

          <div>
            <span className="text-[#8B8B99]">AI Model Router Tiering:</span>
            <div className="text-[#4FC3F7] font-medium mt-0.5">Ollama (Open/Local) → Cheap Cloud → Premium (Three-Tier Routing Active)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

