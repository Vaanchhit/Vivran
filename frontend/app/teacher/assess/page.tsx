"use client";

import React, { useEffect, useState } from "react";
import { FileCheck2, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { generateAssessmentPaper, listMaterials, regenerateQuestion, type Material } from "@/services/api";

interface UIQuestion {
  question_number: number;
  section: string;
  question_type: string;
  question_text: string;
  marks: number;
  difficulty: string;
  bloom_level?: string;
  options?: string[] | null;
  answer: string;
  solution?: string;
}

const REGEN_OPTIONS = ["harder", "easier", "application", "conceptual", "case"];

export default function AssessPage() {
  const [grade, setGrade] = useState("Class 10");
  const [subject, setSubject] = useState("Biology");
  const [topics, setTopics] = useState("Tissues");
  const [totalMarks, setTotalMarks] = useState(40);
  const [difficulty, setDifficulty] = useState("medium");
  const [materialId, setMaterialId] = useState<string>("");
  const [materials, setMaterials] = useState<Material[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [questions, setQuestions] = useState<UIQuestion[]>([]);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [groundedOn, setGroundedOn] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [regenOption, setRegenOption] = useState("harder");
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    listMaterials().then(setMaterials).catch(() => setMaterials([]));
  }, []);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setValidationErrors([]);
    try {
      const { assessment, validation, grounded_on, question_ids } = await generateAssessmentPaper(
        grade,
        subject,
        topics.split(",").map((t) => t.trim()).filter(Boolean),
        totalMarks,
        difficulty,
        materialId || undefined,
      );
      setGroundedOn((grounded_on as number) ?? 0);
      if (!assessment) {
        setValidationErrors(validation.errors);
        setQuestions([]);
        setTitle(null);
        return;
      }
      const a = assessment as { title: string; sections: { name: string; questions: UIQuestion[] }[] };
      setTitle(a.title);
      const flatQuestions = a.sections.flatMap((s) => s.questions);
      setQuestions(flatQuestions);
      setValidationErrors(validation.errors);
      // question_ids (if persisted) line up 1:1 with the flattened question order.
      setQuestionIds(question_ids ?? []);
      setSelected(flatQuestions.length ? 0 : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const runRegenerate = async () => {
    if (selected === null) return;
    const qid = questionIds[selected];
    if (!qid) {
      setError("This question wasn't persisted, so it can't be regenerated individually. Regenerate the whole paper instead.");
      return;
    }
    setRegenerating(true);
    setError(null);
    try {
      const { new_question } = await regenerateQuestion(qid, regenOption);
      const nq = new_question as { question_text: string; answer: string; solution?: string; marks?: number };
      setQuestions((prev) =>
        prev.map((q, i) =>
          i === selected
            ? { ...q, question_text: nq.question_text, answer: nq.answer, solution: nq.solution ?? q.solution, marks: nq.marks ?? q.marks }
            : q,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed.");
    } finally {
      setRegenerating(false);
    }
  };

  const q = selected !== null ? questions[selected] : null;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
          <FileCheck2 className="w-6 h-6 text-[#7C6EFA]" /> Pillar 3 — Assessment & Test Generation
        </h1>
        <p className="text-sm text-muted mt-1">
          Create structured tests, quizzes, and question banks. Regenerate individual questions without re-creating the paper.
        </p>
      </div>

      {/* Generation form */}
      <div className="p-5 rounded-2xl bg-surface border border-border grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
        <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade" className="px-3 py-2 bg-card border border-border rounded-lg text-foreground" />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="px-3 py-2 bg-card border border-border rounded-lg text-foreground" />
        <input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Topics (comma-separated)" className="px-3 py-2 bg-card border border-border rounded-lg text-foreground md:col-span-2" />
        <input type="number" value={totalMarks} onChange={(e) => setTotalMarks(Number(e.target.value))} placeholder="Total marks" className="px-3 py-2 bg-card border border-border rounded-lg text-foreground" />
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="px-3 py-2 bg-card border border-border rounded-lg text-foreground">
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="px-3 py-2 bg-card border border-border rounded-lg text-foreground md:col-span-3">
          <option value="">Ground in: none (general knowledge)</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>Ground in: {m.title}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="grad-btn px-4 py-2 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 md:col-span-3"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {loading ? "Generating…" : "Generate Assessment"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {validationErrors.length > 0 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 space-y-1">
          <div className="font-semibold flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Validation issues:</div>
          {validationErrors.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}

      {questions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold font-display text-foreground">Generated Paper Preview {title ? `(${title})` : ""}</h2>
              <span className="text-xs text-[#4FC3F7] font-semibold bg-[#4FC3F7]/10 px-2.5 py-1 rounded-lg border border-[#4FC3F7]/20">
                Total: {totalMarks} Marks {groundedOn > 0 ? `· Grounded on ${groundedOn} excerpts` : ""}
              </span>
            </div>

            <div className="space-y-3">
              {questions.map((question, i) => (
                <div
                  key={i}
                  onClick={() => setSelected(i)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    selected === i
                      ? "bg-[#7C6EFA]/10 border-[#7C6EFA] text-white shadow-lg shadow-[#7C6EFA]/10"
                      : "bg-surface border-border text-muted hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground bg-white/10 px-2 py-0.5 rounded">Q{question.question_number}</span>
                      <span className="text-[#4FC3F7] font-medium">{question.question_type}</span>
                      <span>({question.marks} Mark{question.marks > 1 ? "s" : ""})</span>
                    </div>
                  </div>
                  <div className="text-sm text-foreground">{question.question_text}</div>
                  {question.options && (
                    <div className="mt-2 text-xs text-muted space-y-0.5">
                      {question.options.map((o) => <div key={o}>{o}</div>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-surface border border-border space-y-3">
              <div className="text-sm font-bold text-foreground font-display">Regenerate Selected Question</div>
              {q ? (
                <>
                  <div className="text-xs text-muted">Answer: <span className="text-foreground">{q.answer}</span></div>
                  {q.solution && <div className="text-xs text-muted">Solution: {q.solution}</div>}
                  <select value={regenOption} onChange={(e) => setRegenOption(e.target.value)} className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground">
                    {REGEN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={runRegenerate}
                    disabled={regenerating}
                    className="w-full px-3 py-2 bg-[#7C6EFA] hover:bg-[#684af3] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} /> Regenerate
                  </button>
                </>
              ) : (
                <div className="text-xs text-muted">Select a question to regenerate it.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
