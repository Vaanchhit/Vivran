"use client";

import React from "react";
import { FolderOpen, Upload, FileText, Youtube, CheckCircle2, Clock } from "lucide-react";

export default function MaterialsPage() {
  const materials = [
    { title: "NCERT Class 10 Biology Chapter 6 — Tissues.pdf", type: "PDF", size: "4.2 MB", status: "READY", chunks: 42 },
    { title: "Class 10 Science Syllabus & Marking Scheme.docx", type: "DOCX", size: "1.1 MB", status: "READY", chunks: 18 },
    { title: "Photosynthesis & Plant Respiration Lecture Notes.pptx", type: "PPTX", size: "8.5 MB", status: "PROCESSING", chunks: 0 },
    { title: "https://youtube.com/watch?v=sample-biology-lecture", type: "YouTube URL", size: "Transcript", status: "READY", chunks: 25 },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="border-b border-white/5 pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-white flex items-center gap-2.5">
            <FolderOpen className="w-6 h-6 text-[#7C6EFA]" /> Teacher Materials & Knowledge Base
          </h1>
          <p className="text-sm text-[#8B8B99] mt-1">
            Upload PDFs, DOCX, PPTX, and YouTube URLs. Ground generated content in teacher-owned materials.
          </p>
        </div>

        <button className="px-4 py-2 bg-[#7C6EFA] hover:bg-[#684af3] text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors">
          <Upload className="w-4 h-4" /> Upload New Material
        </button>
      </div>

      {/* Drag and Drop Zone */}
      <div className="p-8 rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.01] flex flex-col items-center justify-center text-center space-y-3">
        <div className="p-3 rounded-full bg-[#7C6EFA]/10 text-[#7C6EFA]">
          <Upload className="w-6 h-6" />
        </div>
        <div className="text-sm font-semibold text-white">Drag and drop teaching material files here</div>
        <div className="text-xs text-[#8B8B99]">Supported formats: PDF, DOCX, PPTX, or YouTube URLs</div>
      </div>

      {/* Material List (Spec §18) */}
      <div className="space-y-3">
        <div className="text-sm font-bold text-white font-display">Indexed Materials</div>

        <div className="space-y-2">
          {materials.map((mat) => (
            <div
              key={mat.title}
              className="p-4 rounded-xl bg-[#0F0F16] border border-white/10 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 text-[#4FC3F7] shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">{mat.title}</div>
                  <div className="text-[#8B8B99] text-[11px] mt-0.5">{mat.type} · {mat.size} · {mat.chunks} source chunks</div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {mat.status === "READY" ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full text-[11px] font-medium">
                    <CheckCircle2 className="w-3 h-3" /> READY
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full text-[11px] font-medium">
                    <Clock className="w-3 h-3 animate-spin" /> PROCESSING
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

