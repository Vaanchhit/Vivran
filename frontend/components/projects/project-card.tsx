"use client";

import React from "react";
import { Clock } from "lucide-react";
import { Project } from "@/types";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="p-5 rounded-2xl bg-[#0F0F16]/90 border border-white/10 space-y-3 hover:border-white/20 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-semibold tracking-wider text-[#7C6EFA] bg-[#7C6EFA]/10 px-2 py-0.5 rounded-md border border-[#7C6EFA]/20">
          {project.type}
        </span>
        <span className="text-[11px] text-[#8B8B99] flex items-center gap-1">
          <Clock className="w-3 h-3" /> {project.updatedAt}
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
  );
}

