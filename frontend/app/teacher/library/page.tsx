"use client";

import React from "react";
import { Library } from "lucide-react";

export default function LibraryPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="border-b border-white/5 pb-6">
        <h1 className="text-2xl font-extrabold font-display text-white flex items-center gap-2.5">
          <Library className="w-6 h-6 text-[#7C6EFA]" /> Library & Curriculum Repository
        </h1>
        <p className="text-sm text-[#8B8B99] mt-1">
          Browse saved course templates, standardized syllabus structures, and shared educational material.
        </p>
      </div>
    </div>
  );
}

