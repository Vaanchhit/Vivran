"use client";

import React from "react";
import { Sparkles, Presentation, FileSpreadsheet, BookOpenCheck, Video, MessageSquare } from "lucide-react";

export default function CreatePage() {
  const artifacts = [
    { title: "Presentation Slides", icon: Presentation, color: "text-amber-400", desc: "Editable slide deck outline, key hooks, diagrams & speaker notes." },
    { title: "Worksheets", icon: FileSpreadsheet, color: "text-emerald-400", desc: "Practice questions, fill-in-the-blanks, lab prompts & answer keys." },
    { title: "Lesson Notes", icon: BookOpenCheck, color: "text-[#4FC3F7]", desc: "Structured teaching notes with clear explanations, real-life examples & recaps." },
    { title: "Educational Video", icon: Video, color: "text-purple-400", desc: "Structured video scripts, scene structure, voice selection & preview." },
    { title: "Classroom Activities", icon: MessageSquare, color: "text-pink-400", desc: "Interactive group discussions, debate topics & hands-on exercises." },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="border-b border-white/5 pb-6">
        <h1 className="text-2xl font-extrabold font-display text-white flex items-center gap-2.5">
          <Sparkles className="w-6 h-6 text-[#7C6EFA]" /> Pillar 2 — Classroom Content Creation
        </h1>
        <p className="text-sm text-[#8B8B99] mt-1">
          Generate classroom-ready teaching artifacts directly from your teacher intent and source material.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {artifacts.map((art) => {
          const Icon = art.icon;
          return (
            <div
              key={art.title}
              className="p-5 rounded-2xl bg-[#0F0F16] border border-white/10 space-y-3 hover:border-[#7C6EFA]/40 transition-all cursor-pointer group"
            >
              <div className={`p-2.5 rounded-xl bg-white/5 w-fit ${art.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="font-bold text-base text-white font-display flex items-center justify-between">
                {art.title}
                <span className="text-xs text-[#7C6EFA] opacity-0 group-hover:opacity-100 transition-opacity">Create →</span>
              </div>
              <p className="text-xs text-[#8B8B99] leading-relaxed">
                {art.desc}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

