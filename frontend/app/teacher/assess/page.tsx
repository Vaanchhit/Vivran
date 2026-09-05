"use client";

import React, { useState } from "react";
import { FileCheck2, RefreshCw, Layers, CheckCircle2, ChevronRight } from "lucide-react";

export default function AssessPage() {
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(1);
  const [regenOption, setRegenOption] = useState<string>("harder");

  const sampleQuestions = [
    {
      id: 1,
      num: "Q1",
      type: "MCQ",
      marks: 1,
      text: "Which of the following tissues is responsible for secondary growth in dicotyledonous stems?",
      options: ["A) Apical meristem", "B) Lateral meristem (Vascular cambium)", "C) Intercalary meristem", "D) Parenchyma"],
      answer: "B) Lateral meristem (Vascular cambium)",
      difficulty: "Medium",
      bloom: "Understand",
      source: "Class 10 Biology.pdf p.45",
    },
    {
      id: 2,
      num: "Q2",
      type: "Short Answer",
      marks: 3,
      text: "Differentiate between xylem and phloem based on function and direction of transport.",
      answer: "Xylem transports water unidirectionally upwards. Phloem transports food bidirectionally.",
      difficulty: "Hard",
      bloom: "Analyze",
      source: "Class 10 Biology.pdf p.48",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="border-b border-white/5 pb-6">
        <h1 className="text-2xl font-extrabold font-display text-white flex items-center gap-2.5">
          <FileCheck2 className="w-6 h-6 text-[#7C6EFA]" /> Pillar 3 — Assessment & Test Generation
        </h1>
        <p className="text-sm text-[#8B8B99] mt-1">
          Create structured tests, quizzes, and question banks. Regenerate individual questions without re-creating the paper.
        </p>
      </div>

      {/* Assessment Spec Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Generated Question Paper */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold font-display text-white">
              Generated Paper Preview (Class 10 Biology — Tissues)
            </h2>
            <span className="text-xs text-[#4FC3F7] font-semibold bg-[#4FC3F7]/10 px-2.5 py-1 rounded-lg border border-[#4FC3F7]/20">
              Total: 40 Marks · Validated
            </span>
          </div>

          <div className="space-y-3">
            {sampleQuestions.map((q) => (
              <div
                key={q.id}
                onClick={() => setSelectedQuestion(q.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  selectedQuestion === q.id
                    ? "bg-[#7C6EFA]/10 border-[#7C6EFA] text-white shadow-lg shadow-[#7C6EFA]/10"
                    : "bg-[#0F0F16] border-white/10 text-[#8B8B99] hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white bg-white/10 px-2 py-0.5 rounded">{q.num}</span>
                    <span className="text-[#4FC3F7] font-medium">{q.type}</span>
                    <span>({q.marks} Mark{q.marks > 1 ? "s" : ""})</span>
                  </div>
                  <span className="text-[10px] text-[#8B8B99] bg-white/5 px-2 py-0.5 rounded">
                    Source: {q.source}
                  </span>
                </div>

                <div className="text-sm text-white font-medium mb-2">{q.text}</div>

                {q.options && (
                  <div className="grid grid-cols-2 gap-2 text-xs text-[#8B8B99] mb-2">
                    {q.options.map((opt) => (
                      <div key={opt} className="p-2 rounded bg-white/[0.02] border border-white/5">{opt}</div>
                    ))}
                  </div>
                )}

                <div className="text-xs text-emerald-400 font-medium">
                  Answer: {q.answer}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Individual Question Regeneration (Spec §15) */}
        <div className="p-5 rounded-2xl bg-[#0F0F16] border border-white/10 space-y-4 h-fit">
          <div className="flex items-center gap-2 text-white font-display text-sm font-bold border-b border-white/5 pb-3">
            <RefreshCw className="w-4 h-4 text-[#7C6EFA]" />
            Regenerate Selected Question
          </div>

          <p className="text-xs text-[#8B8B99] leading-relaxed">
            Never force regeneration of an entire assessment for one bad question. Only selected question is replaced while preserving assessment constraints.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#8B8B99]">Regeneration Option:</label>
            {[
              { id: "harder", label: "Make harder" },
              { id: "easier", label: "Make easier" },
              { id: "app", label: "More application-based" },
              { id: "concept", label: "More conceptual" },
              { id: "case", label: "Make case-based" },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRegenOption(opt.id)}
                className={`w-full p-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                  regenOption === opt.id
                    ? "bg-[#7C6EFA]/15 border-[#7C6EFA] text-white"
                    : "bg-white/[0.02] border-white/5 text-[#8B8B99] hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => alert(`Regenerating ${selectedQuestion ? `Q${selectedQuestion}` : 'Question'} with option: ${regenOption}`)}
            className="w-full py-2.5 bg-[#7C6EFA] hover:bg-[#684af3] text-white text-xs font-semibold rounded-xl shadow-md shadow-[#7C6EFA]/20 flex items-center justify-center gap-2 transition-all"
          >
            Replace Question Only <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

