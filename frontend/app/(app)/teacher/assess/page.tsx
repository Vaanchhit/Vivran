"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BookMarked, Download, ExternalLink, FileCheck2, PenLine, RefreshCw, AlertCircle } from "lucide-react";
import { BookLoader } from "@/app/components/book-loader";
import {
  downloadAssessmentPdf,
  exportAssessmentToTally,
  generateAssessmentPaper,
  getLibraryItem,
  regenerateQuestion,
  type AssessmentGenerateResponse,
  type Source,
  type WorksheetResult,
} from "@/services/api";
import { SmartCreationBox } from "@/app/components/smart-creation-box";
import { FeatureExplainer } from "@/app/components/feature-explainer";
import { getLiveValue, setLiveValue, setTabValue, useLiveState, useTabState } from "@/lib/tab-state";
import { stage } from "@/lib/catalog";

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
  source_ids?: string[];
}

const REGEN_OPTIONS = ["harder", "easier", "application", "conceptual", "case"];

type Mode = "quiz" | "test" | "worksheet";
const MODE_KEYS = new Set<string>(["quiz", "test", "worksheet"]);

/** Copy for each card. Quiz and test only reframe the box — they never
 * pre-fill a mark count, difficulty or topic, which stay the teacher's to pick. */
const MODES: Record<Mode, { heading: string; placeholder: string }> = {
  quiz: {
    heading: "What quick quiz would you like?",
    placeholder:
      "Just the topic and the angle — e.g. 'Demand and supply, exit-ticket level, mostly MCQs'. Set the grade, subject and marks below.",
  },
  test: {
    heading: "What full test paper would you like?",
    placeholder:
      "Just the topic and the angle — e.g. 'Porter's Five Forces with case-study application questions'. Set the grade, subject, marks and difficulty below.",
  },
  worksheet: {
    heading: "What should the worksheet practise?",
    placeholder:
      "Just the topic and the angle — e.g. 'Simple interest word problems set in a village market'. Set the grade, subject and number of questions below.",
  },
};

/** A paper as shown on screen: kept whole in the tab store so it survives leaving the page. */
interface Paper {
  grade: string;
  subject: string;
  totalMarks: number;
  title: string | null;
  durationMinutes: number | null;
  questions: UIQuestion[];
  questionIds: string[];
  groundedOn: number;
  sources: Source[];
  validationErrors: string[];
  openedTitle: string | null;
  /** Accepted teaching-style traits that shaped this paper. */
  styleApplied?: { key: string; summary: string }[];
  /** What was asked for, so the paper can be made again without the teacher's style. */
  request?: { grade: string; subject: string; topics: string[]; marks: number; difficulty: string; materialId?: string };
}

function toPaper(
  data: AssessmentGenerateResponse,
  params: { grade: string; subject: string; marks: number; topics?: string[]; difficulty?: string; materialId?: string },
  openedTitle: string | null = null,
): Paper {
  const { assessment, validation, grounded_on, question_ids, sources } = data;
  const base = {
    styleApplied: data.style_applied ?? [],
    request: params.topics
      ? { grade: params.grade, subject: params.subject, topics: params.topics, marks: params.marks, difficulty: params.difficulty ?? "medium", materialId: params.materialId }
      : undefined,
    grade: params.grade,
    subject: params.subject,
    totalMarks: params.marks,
    groundedOn: (grounded_on as number) ?? 0,
    sources: sources ?? [],
    validationErrors: validation.errors,
    openedTitle,
  };
  if (!assessment) return { ...base, title: null, durationMinutes: null, questions: [], questionIds: [] };
  const a = assessment as { title: string; duration_minutes: number; sections: { name: string; questions: UIQuestion[] }[] };
  return {
    ...base,
    title: a.title,
    durationMinutes: a.duration_minutes,
    questions: a.sections.flatMap((s) => s.questions),
    // question_ids (if persisted) line up 1:1 with the flattened question order.
    questionIds: question_ids ?? [],
  };
}

export default function AssessPage() {
  return (
    <Suspense fallback={null}>
      <AssessPageInner />
    </Suspense>
  );
}

function AssessPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const modeParam = searchParams.get("mode");
  const itemParam = searchParams.get("item");

  const [mode, setMode] = useTabState<Mode>("assess:mode", MODE_KEYS.has(modeParam ?? "") ? (modeParam as Mode) : "test");
  const scope = `assess:${mode}`;
  const copy = MODES[mode];

  const [paper, setPaper] = useTabState<Paper | null>(`${scope}:paper`, null);
  const [worksheet, setWorksheet] = useTabState<(WorksheetResult & { openedTitle?: string | null }) | null>("assess:worksheet:result", null);
  const [error, setError] = useTabState<string | null>(`${scope}:error`, null);
  const [selected, setSelected] = useTabState<number | null>(`${scope}:selected`, null);
  const [regenOption, setRegenOption] = useState("harder");
  const [regenerating] = useLiveState(`${scope}:regenerating`, false);
  const [exporting, setExporting] = useState(false);
  const [exportingTally, setExportingTally] = useState(false);
  const [tallyResult, setTallyResult] = useState<{ form_url: string; mcq_count: number; skipped_non_mcq: number } | null>(null);
  const [opening, setOpening] = useState(false);
  const [restyling, setRestyling] = useState(false);

  useEffect(() => {
    if (modeParam && MODE_KEYS.has(modeParam)) setMode(modeParam as Mode);
  }, [modeParam, setMode]);

  const questions = paper?.questions ?? [];
  const title = paper?.title ?? null;
  const q = selected !== null ? questions[selected] : null;

  // The same request again with the teacher's style switched off, for the
  // times they want Vivran's default shape instead of their own.
  const makeWithoutStyle = async () => {
    const req = paper?.request;
    if (!req || restyling) return;
    setRestyling(true);
    setError(null);
    try {
      const data = await generateAssessmentPaper(req.grade, req.subject, req.topics, req.marks, req.difficulty, req.materialId, false);
      const next = toPaper(data, req);
      setPaper(next);
      setSelected(next.questions.length ? 0 : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make the paper again.");
    } finally {
      setRestyling(false);
    }
  };

  const runRegenerate = async () => {
    if (selected === null || !paper) return;
    const at = `${scope}:regenerating`;
    if (getLiveValue(at, false)) return;
    const qid = paper.questionIds[selected];
    if (!qid) {
      setError("This question wasn't persisted, so it can't be regenerated individually. Regenerate the whole paper instead.");
      return;
    }
    const index = selected;
    setLiveValue(at, true, false);
    setError(null);
    try {
      const { new_question } = await regenerateQuestion(qid, regenOption);
      const nq = new_question as { question_text: string; answer: string; solution?: string; marks?: number };
      setPaper((prev) =>
        prev && {
          ...prev,
          questions: prev.questions.map((x, i) =>
            i === index
              ? { ...x, question_text: nq.question_text, answer: nq.answer, solution: nq.solution ?? x.solution, marks: nq.marks ?? x.marks }
              : x,
          ),
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed.");
    } finally {
      setLiveValue(at, false, false);
    }
  };

  const buildAssessmentPayload = () => {
    const sectionOrder: string[] = [];
    const bySection = new Map<string, UIQuestion[]>();
    for (const x of questions) {
      const key = x.section || "Section";
      if (!bySection.has(key)) {
        bySection.set(key, []);
        sectionOrder.push(key);
      }
      bySection.get(key)!.push(x);
    }
    return {
      title,
      grade: paper?.grade,
      subject: paper?.subject,
      total_marks: paper?.totalMarks,
      duration_minutes: paper?.durationMinutes,
      sections: sectionOrder.map((name) => ({ name, questions: bySection.get(name) })),
    };
  };

  const exportPdf = async () => {
    if (!title) return;
    setExporting(true);
    setError(null);
    try {
      await downloadAssessmentPdf(buildAssessmentPayload());
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF export failed.");
    } finally {
      setExporting(false);
    }
  };

  const exportTally = async () => {
    if (!title) return;
    setExportingTally(true);
    setError(null);
    setTallyResult(null);
    try {
      setTallyResult(await exportAssessmentToTally(buildAssessmentPayload()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tally export failed.");
    } finally {
      setExportingTally(false);
    }
  };

  // Reopening saved work: it gets the same display as a fresh one, under the
  // card it belongs to.
  useEffect(() => {
    if (!itemParam) return;
    let cancelled = false;
    setOpening(true);
    getLibraryItem(itemParam)
      .then((item) => {
        if (cancelled) return;
        if (item.type === "worksheet" && item.content) {
          setTabValue("assess:worksheet:result", { ...(item.content as WorksheetResult), openedTitle: item.title }, null);
          setTabValue("assess:worksheet:error", null, null);
          setMode("worksheet");
          router.replace("/teacher/assess?mode=worksheet");
          return;
        }
        if (item.type !== "assessment" || !item.content) {
          setError("This item can't be opened here.");
          return;
        }
        const target: Mode = mode === "worksheet" ? "test" : mode;
        const p = item.params as { grade?: string; subject?: string; total_marks?: number };
        const opened = toPaper(item.content as AssessmentGenerateResponse, { grade: p.grade ?? "", subject: p.subject ?? "", marks: p.total_marks ?? 0 }, item.title);
        setTabValue(`assess:${target}:paper`, opened, null);
        setTabValue(`assess:${target}:selected`, opened.questions.length ? 0 : null, null);
        setTabValue(`assess:${target}:error`, null, null);
        setMode(target);
        router.replace(`/teacher/assess?mode=${target}`);
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not open that item."); })
      .finally(() => { if (!cancelled) setOpening(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemParam]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
          <FileCheck2 className="w-6 h-6 text-accent" /> Assess
        </h1>
        <p className="text-sm text-muted mt-1">
          {stage("assess").blurb}: quizzes, full tests and practice worksheets. Regenerate single questions without redoing the paper.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stage("assess").items.map((it) => {
          const Icon = it.icon;
          const isActive = mode === it.key;
          return (
            <FeatureExplainer key={it.key} title={it.title} text={it.explain}>
              {(describedBy) => (
                <button
                  type="button"
                  aria-describedby={describedBy}
                  onClick={() => setMode(it.key as Mode)}
                  className={`w-full h-full text-left p-5 rounded-2xl bg-surface border space-y-3 transition-all cursor-pointer ${
                    isActive ? "border-accent" : "border-border hover:border-accent-line"
                  }`}
                >
                  <div className={`p-2.5 rounded-xl bg-card w-fit ${it.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="font-bold text-base text-foreground font-display">{it.title}</div>
                  <p className="text-xs text-muted leading-relaxed">{it.desc}</p>
                </button>
              )}
            </FeatureExplainer>
          );
        })}
      </div>

      {/* One box per card, each keeping its own draft. Quiz and test make an
          exam paper (the editor below); worksheet makes practice questions. */}
      <SmartCreationBox
        key={mode}
        scope={scope}
        scopeHref={`/teacher/assess?mode=${mode}`}
        lockedArtifactType={mode === "worksheet" ? "worksheet" : "assessment"}
        showInlineResult={false}
        heading={copy.heading}
        promptPlaceholder={copy.placeholder}
        onGenerated={(result) => {
          if (result.artifactType === "worksheet") {
            setTabValue("assess:worksheet:error", result.ok ? null : result.error, null);
            if (result.ok) setWorksheet(result.data);
            return;
          }
          if (result.artifactType !== "assessment") return;
          setError(null);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          const next = toPaper(result.data, result.params);
          setPaper(next);
          setSelected(next.questions.length ? 0 : null);
        }}
      />

      {opening && (
        <div className="p-3 rounded-xl bg-card border border-border flex items-center gap-2 text-xs text-muted">
          <BookLoader className="w-3.5 h-3.5" /> Opening your saved paper…
        </div>
      )}
      {mode !== "worksheet" && paper?.openedTitle && title && (
        <div className="text-xs text-muted">
          Opened from your saved work: <span className="text-foreground font-medium">{paper.openedTitle}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-danger-soft border border-danger-line rounded-xl flex items-center gap-2 text-xs text-danger">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {mode === "worksheet" && worksheet && (
        <div className="p-6 rounded-2xl bg-surface border border-border space-y-3">
          {worksheet.openedTitle && (
            <div className="text-xs text-muted">
              Opened from your saved work: <span className="text-foreground font-medium">{worksheet.openedTitle}</span>
            </div>
          )}
          <div className="font-bold text-base text-foreground font-display">{worksheet.title}</div>
          <div className="text-xs text-muted">{worksheet.instructions}</div>
          {worksheet.questions?.map((wq, i) => (
            <div key={i} className="p-3 rounded-lg bg-card border border-border text-xs">
              <div className="text-foreground">{i + 1}. {wq.question_text}</div>
              <div className="text-muted mt-1">Answer: {wq.answer}</div>
            </div>
          ))}
          {worksheet.sources && worksheet.sources.length > 0 && (
            <div className="pt-2 border-t border-border space-y-1.5">
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">Grounded in your materials</div>
              {worksheet.sources.map((src) => (
                <div key={src.chunk_id} className="text-[11px] text-muted">
                  <span className="text-chrome font-medium">{src.source_material}{src.page_number ? ` · p.${src.page_number}` : ""}</span> — {src.excerpt}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mode !== "worksheet" && paper && paper.validationErrors.length > 0 && (
        <div className="p-3 bg-warning-soft border border-warning-line rounded-xl text-xs text-warning space-y-1">
          <div className="font-semibold flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Validation issues:</div>
          {paper.validationErrors.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}

      {mode !== "worksheet" && paper && questions.length > 0 && (paper.styleApplied?.length ?? 0) > 0 && (
        <div className="p-4 rounded-xl bg-card border border-border text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-foreground flex items-center gap-2">
              <PenLine className="w-4 h-4 text-accent" /> Shaped by your teaching style
            </div>
            <div className="flex items-center gap-3">
              <Link href="/teacher/memory" className="text-accent hover:underline">Manage</Link>
              {paper.request && (
                <button type="button" onClick={makeWithoutStyle} disabled={restyling} className="text-muted hover:text-foreground disabled:opacity-50 inline-flex items-center gap-1.5">
                  {restyling && <BookLoader className="w-3 h-3" />} Make it without my style
                </button>
              )}
            </div>
          </div>
          <ul className="space-y-1 text-muted list-disc pl-5">
            {paper.styleApplied!.map((s) => <li key={s.key}>{s.summary}</li>)}
          </ul>
        </div>
      )}

      {mode !== "worksheet" && paper && questions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold font-display text-foreground">Generated Paper Preview {title ? `(${title})` : ""}</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-chrome font-semibold bg-chrome-soft px-2.5 py-1 rounded-lg border border-chrome-line">
                  Total: {paper.totalMarks} Marks {paper.groundedOn > 0 ? `· Grounded on ${paper.groundedOn} excerpts` : ""}
                </span>
                <button
                  type="button"
                  onClick={exportPdf}
                  disabled={exporting}
                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border border-border bg-card text-foreground hover:border-accent-line disabled:opacity-50"
                >
                  {exporting ? <BookLoader className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                  Export PDF
                </button>
                {questions.some((q) => q.question_type === "mcq") && (
                  <button
                    type="button"
                    onClick={exportTally}
                    disabled={exportingTally}
                    className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border border-border bg-card text-foreground hover:border-accent-line disabled:opacity-50"
                  >
                    {exportingTally ? <BookLoader className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                    Export to Tally
                  </button>
                )}
              </div>
            </div>

            {tallyResult && (
              <div className="p-3 bg-success-soft border border-success-line rounded-xl flex items-center justify-between gap-3 text-xs text-success">
                <span>
                  Tally quiz created with {tallyResult.mcq_count} MCQ{tallyResult.mcq_count !== 1 ? "s" : ""}
                  {tallyResult.skipped_non_mcq > 0 ? ` (${tallyResult.skipped_non_mcq} non-MCQ question${tallyResult.skipped_non_mcq !== 1 ? "s" : ""} skipped)` : ""}.
                </span>
                <a href={tallyResult.form_url} target="_blank" rel="noopener noreferrer" className="underline shrink-0">
                  Open form →
                </a>
              </div>
            )}

            <div className="space-y-3">
              {questions.map((question, i) => (
                <div
                  key={i}
                  onClick={() => setSelected(i)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    selected === i
                      ? "bg-accent-soft border-accent text-foreground shadow-soft"
                      : "bg-surface border-border text-muted hover:border-border-hi"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground bg-card px-2 py-0.5 rounded">Q{question.question_number}</span>
                      <span className="text-chrome font-medium">{question.question_type}</span>
                      <span>({question.marks} Mark{question.marks > 1 ? "s" : ""})</span>
                    </div>
                  </div>
                  <div className="text-sm text-foreground">{question.question_text}</div>
                  {question.options && (
                    <div className="mt-2 text-xs text-muted space-y-0.5">
                      {question.options.map((o) => <div key={o}>{o}</div>)}
                    </div>
                  )}
                  {question.source_ids && question.source_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {question.source_ids.map((sid) => {
                        const src = paper.sources.find((s) => s.chunk_id === sid);
                        if (!src) return null;
                        return (
                          <span key={sid} className="inline-flex items-center gap-1 text-[10px] text-chrome bg-chrome-soft border border-chrome-line px-2 py-0.5 rounded-full">
                            <BookMarked className="w-2.5 h-2.5" />
                            {src.source_material}{src.page_number ? ` p.${src.page_number}` : ""}
                          </span>
                        );
                      })}
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
                    className="w-full px-3 py-2 btn-primary text-xs font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {regenerating ? <BookLoader className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />} Regenerate
                  </button>
                </>
              ) : (
                <div className="text-xs text-muted">Select a question to regenerate it.</div>
              )}
            </div>

            {paper.sources.length > 0 && (
              <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
                <div className="text-sm font-bold text-foreground font-display flex items-center gap-2">
                  <BookMarked className="w-4 h-4 text-chrome" /> Sources Used
                </div>
                {paper.sources.map((s) => (
                  <div key={s.chunk_id} className="p-2.5 rounded-lg bg-card border border-border text-[11px]">
                    <div className="font-semibold text-foreground">{s.source_material}{s.page_number ? ` · p.${s.page_number}` : ""}</div>
                    <div className="text-muted mt-0.5 line-clamp-2">{s.excerpt}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
