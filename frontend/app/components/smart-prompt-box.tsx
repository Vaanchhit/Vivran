"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Sparkles, Sliders, CheckCircle2, AlertCircle, ArrowRight, Loader2, X, Plus } from "lucide-react";
import {
  parseTeacherIntent,
  transcribeAudio,
  generateAssessmentPaper,
  generateCoursePlan,
  generateSlides,
  generateWorksheet,
  generateLessonNotes,
  generateInteractiveCoursework,
  listMaterials,
  type Material,
} from "@/services/api";
import {
  GRADE_LEVEL_OPTIONS,
  SUBJECT_OPTIONS,
  DIFFICULTY_OPTIONS,
  ARTIFACT_TYPE_OPTIONS,
  DURATION_WEEKS_OPTIONS,
  DURATION_MINUTES_OPTIONS,
  SLIDE_COUNT_OPTIONS,
  WORKSHEET_QUESTION_COUNT_OPTIONS,
  TOTAL_MARKS_OPTIONS,
} from "@/lib/constants";

function micApiAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined"
  );
}

/** Maps the AI's guessed requested_artifacts (free-form strings) onto our
 * closed set of generatable types. Falls back to "course_plan" only when
 * nothing recognizable was requested — always shown, always editable, never
 * silently substituted for a wrong content guess. */
function inferArtifactType(requested: string[]): string {
  const known = new Set(ARTIFACT_TYPE_OPTIONS.map((o) => o.value));
  const alias: Record<string, string> = { quiz: "assessment", test: "assessment", lesson: "lesson_notes" };
  for (const r of requested) {
    if (known.has(r)) return r;
    if (alias[r]) return alias[r];
  }
  return "course_plan";
}

interface Interpretation {
  raw_prompt: string;
  grade: string;
  subject: string;
  topics: string[];
  difficulty: string;
  application_weight: number;
  artifactType: string;
}

export function SmartPromptBox() {
  const [promptText, setPromptText] = useState("");
  const [loading, setLoading] = useState(false);
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [topicDraft, setTopicDraft] = useState("");
  const [marks, setMarks] = useState(40);
  const [durationWeeks, setDurationWeeks] = useState(3);
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [slideCount, setSlideCount] = useState(12);
  const [questionCount, setQuestionCount] = useState(10);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{ ok: boolean; message: string; href?: string } | null>(null);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setMicSupported(micApiAvailable());
    listMaterials().then(setMaterials).catch(() => setMaterials([]));
  }, []);

  const toggleMic = async () => {
    if (listening) {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (!micApiAvailable()) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        setTranscribing(true);
        setErrorMsg(null);
        try {
          const text = await transcribeAudio(blob);
          if (text.trim()) {
            setPromptText((prev) => (prev.trim() ? `${prev.trim()} ${text.trim()}` : text.trim()));
          }
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : "Voice transcription failed.");
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setListening(true);
    } catch {
      setErrorMsg("Microphone access was denied or is unavailable.");
    }
  };

  const shortcutChips = [
    { label: "Case Study Test", sample: "Create a difficult 40-mark College 2nd Year Business Studies paper on Porter's Five Forces with case-study application questions." },
    { label: "Economics Quiz", sample: "Give me a 10-question exit quiz on demand and supply for College 1st Year Economics." },
    { label: "Finance Worksheet", sample: "Create a worksheet for College 3rd Year Accounting & Finance on reading balance sheets and financial statements." },
    { label: "Lesson Plan", sample: "Plan four lessons on the marketing mix (4Ps) for College 2nd Year Marketing next week." },
    { label: "Slides", sample: "Create a 12-slide presentation on Porter's Five Forces for College 2nd Year Business Studies using real company examples." },
    { label: "Explainer Video", sample: "Create a video explaining Porter's Five Forces for college commerce students." },
    { label: "Course Plan", sample: "Plan 3 weeks of College 1st Year Economics covering Demand, Supply, and Market Equilibrium." },
    { label: "Test Paper", sample: "Create a difficult 80-mark Class 12 Economics paper for Chapters 1-5 with 50% application questions." },
    { label: "Quiz", sample: "Give me a 10-question exit quiz on photosynthesis for Class 8." },
    { label: "Worksheet", sample: "Create a worksheet for Class 10 Biology on plant tissues with diagrams." },
    { label: "Interactive Course", sample: "Create a 15-minute interactive lesson on Newton's Laws for Class 9." },
  ];

  const resetControls = () => {
    setMarks(40);
    setDurationWeeks(3);
    setDurationMinutes(15);
    setSlideCount(12);
    setQuestionCount(10);
    setMaterialId("");
  };

  const handleRunSmartPrompt = async (textToSubmit?: string) => {
    const text = textToSubmit || promptText;
    if (!text.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    setInterpretation(null);
    setGenerateResult(null);
    resetControls();

    try {
      const data = await parseTeacherIntent(text);
      const parsed = data.intent;
      setDegraded(data.degraded);

      // Never assume grade/subject/topics the AI didn't actually extract —
      // leave blank so the dropdowns below make the gap visible and force an
      // explicit pick, instead of silently defaulting to an unrelated example.
      setInterpretation({
        raw_prompt: text,
        grade: parsed.grade || "",
        subject: parsed.subject || "",
        topics: parsed.topics?.length ? parsed.topics : [],
        difficulty: parsed.difficulty || "medium",
        application_weight: parsed.application_weight,
        artifactType: inferArtifactType(parsed.requested_artifacts || []),
      });
      if (parsed.marks) setMarks(parsed.marks);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not reach the Vivran backend. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const addTopic = () => {
    const t = topicDraft.trim();
    if (!t || !interpretation) return;
    if (!interpretation.topics.includes(t)) {
      setInterpretation({ ...interpretation, topics: [...interpretation.topics, t] });
    }
    setTopicDraft("");
  };

  const removeTopic = (topic: string) => {
    if (!interpretation) return;
    setInterpretation({ ...interpretation, topics: interpretation.topics.filter((t) => t !== topic) });
  };

  const readyToGenerate = !!interpretation && !!interpretation.grade.trim() && !!interpretation.subject.trim();

  const handleConfirmAndGenerate = async () => {
    if (!interpretation || !readyToGenerate) return;
    setGenerating(true);
    setGenerateResult(null);

    const { grade, subject, artifactType, difficulty, raw_prompt } = interpretation;
    const topicStr = interpretation.topics.length ? interpretation.topics.join(", ") : raw_prompt;

    try {
      switch (artifactType) {
        case "assessment": {
          const { assessment, validation } = await generateAssessmentPaper(
            grade,
            subject,
            interpretation.topics.length ? interpretation.topics : [raw_prompt],
            marks,
            difficulty,
            materialId || undefined,
          );
          if (!assessment) {
            setGenerateResult({ ok: false, message: `Generation failed: ${validation.errors.join("; ")}` });
          } else {
            setGenerateResult({ ok: true, message: `Assessment "${(assessment as { title: string }).title}" generated.`, href: "/teacher/assess" });
          }
          break;
        }
        case "slides": {
          const result = await generateSlides(topicStr, slideCount, grade, subject);
          if (result.error) setGenerateResult({ ok: false, message: `Generation failed: ${result.error}` });
          else setGenerateResult({ ok: true, message: `Slide deck "${result.title}" (${result.slide_count} slides) generated.`, href: "/teacher/create" });
          break;
        }
        case "worksheet": {
          const result = await generateWorksheet(topicStr, questionCount, grade, subject);
          if (result.error) setGenerateResult({ ok: false, message: `Generation failed: ${result.error}` });
          else setGenerateResult({ ok: true, message: `Worksheet "${result.title}" (${result.question_count} questions) generated.`, href: "/teacher/create" });
          break;
        }
        case "lesson_notes": {
          const result = await generateLessonNotes(topicStr, grade, subject);
          if (result.error) setGenerateResult({ ok: false, message: `Generation failed: ${result.error}` });
          else setGenerateResult({ ok: true, message: `Lesson notes "${result.title}" generated.`, href: "/teacher/create" });
          break;
        }
        case "interactive": {
          const result = await generateInteractiveCoursework(topicStr, durationMinutes, grade, subject);
          if (result.error) setGenerateResult({ ok: false, message: `Generation failed: ${result.error}` });
          else setGenerateResult({ ok: true, message: `Interactive coursework "${result.title}" generated.`, href: "/teacher/create" });
          break;
        }
        default: {
          const { course_plan } = await generateCoursePlan({
            title: `${grade} ${subject} — ${topicStr}`,
            grade,
            subject,
            topics: interpretation.topics.length ? interpretation.topics : [raw_prompt],
            durationWeeks,
          });
          if (course_plan.error) setGenerateResult({ ok: false, message: `Generation failed: ${course_plan.error}` });
          else setGenerateResult({ ok: true, message: `Course plan "${course_plan.title}" generated.`, href: "/teacher/plan" });
        }
      }
    } catch (err) {
      setGenerateResult({ ok: false, message: err instanceof Error ? err.message : "Generation failed." });
    } finally {
      setGenerating(false);
    }
  };

  const focusLabel = interpretation
    ? interpretation.application_weight >= 0.7
      ? "Application-focused"
      : interpretation.application_weight >= 0.55
        ? "Balanced · Application-heavy"
        : "Conceptual focus"
    : "Balanced";

  return (
    <div className="w-full space-y-6">
      {/* Main Smart Prompt Box Container */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold font-display text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#7C6EFA]" />
            What would you like to create?
          </label>
          <span className="text-xs text-muted">Natural Language Intent Engine</span>
        </div>

        {/* Textarea Input Box */}
        <div className="relative">
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Tell Vivran what you need... e.g. 'Teach College 2nd Year Business Studies — Porter's Five Forces tomorrow. Make a 45-minute lesson, 8 slides, a worksheet, and a 5-question exit quiz.'"
            className="w-full h-32 p-4 bg-card border border-border rounded-xl text-foreground placeholder-[#55555F] text-sm focus:outline-none focus:border-[#7C6EFA] transition-all resize-none leading-relaxed"
          />
          <button
            type="button"
            onClick={toggleMic}
            disabled={!micSupported || transcribing}
            title={
              !micSupported
                ? "Voice input not supported in this browser"
                : transcribing
                  ? "Transcribing…"
                  : listening
                    ? "Stop voice input"
                    : "Voice input"
            }
            className={`absolute right-3 bottom-4 p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              listening ? "bg-red-500/20 text-red-400" : "text-muted hover:text-foreground hover:bg-white/10"
            }`}
          >
            {transcribing ? (
              <Loader2 className="w-4 h-4 text-[#4FC3F7] animate-spin" />
            ) : (
              <Mic className={`w-4 h-4 ${listening ? "text-red-400 animate-pulse" : "text-[#4FC3F7]"}`} />
            )}
          </button>
        </div>

        {/* Action Button & Shortcuts */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {shortcutChips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => {
                  setPromptText(chip.sample);
                  handleRunSmartPrompt(chip.sample);
                }}
                className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-muted hover:text-foreground hover:border-[#7C6EFA]/40 hover:bg-[#7C6EFA]/10 transition-all"
              >
                {chip.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleRunSmartPrompt()}
            disabled={loading || !promptText.trim()}
            className="grad-btn px-5 py-2.5 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? "Interpreting..." : "Interpret Intent"} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* "I understood" Requirements Block — every field below is editable */}
      {interpretation && (
        <div className="bg-surface/90 border border-[#7C6EFA]/30 rounded-2xl p-6 shadow-xl space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2 text-foreground font-display text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Vivran Understood — Review &amp; Adjust:
            </div>
            <span className="text-xs text-[#7C6EFA] font-medium bg-[#7C6EFA]/10 px-2.5 py-1 rounded-full border border-[#7C6EFA]/20">
              {focusLabel}
            </span>
          </div>

          {degraded && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-[11px] text-amber-300">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              AI intent parsing was unavailable — this used a simpler keyword-based fallback.
            </div>
          )}

          {/* Core fields: real, editable dropdowns — nothing here is assumed silently */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <div className="text-[10px] text-muted mb-1">Create</div>
              <select
                value={interpretation.artifactType}
                onChange={(e) => setInterpretation({ ...interpretation, artifactType: e.target.value })}
                className="w-full px-2.5 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-[#7C6EFA]"
              >
                {ARTIFACT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[10px] text-muted mb-1">Grade / Year</div>
              <input
                value={interpretation.grade}
                onChange={(e) => setInterpretation({ ...interpretation, grade: e.target.value })}
                list="smart-prompt-grade-options"
                placeholder="Pick or type…"
                className="w-full px-2.5 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-[#7C6EFA]"
              />
              <datalist id="smart-prompt-grade-options">
                {GRADE_LEVEL_OPTIONS.map((g) => <option key={g} value={g} />)}
              </datalist>
            </div>

            <div>
              <div className="text-[10px] text-muted mb-1">Subject</div>
              <input
                value={interpretation.subject}
                onChange={(e) => setInterpretation({ ...interpretation, subject: e.target.value })}
                list="smart-prompt-subject-options"
                placeholder="Pick or type…"
                className="w-full px-2.5 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-[#7C6EFA]"
              />
              <datalist id="smart-prompt-subject-options">
                {SUBJECT_OPTIONS.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>

            {interpretation.artifactType === "assessment" && (
              <div>
                <div className="text-[10px] text-muted mb-1">Difficulty</div>
                <select
                  value={interpretation.difficulty}
                  onChange={(e) => setInterpretation({ ...interpretation, difficulty: e.target.value })}
                  className="w-full px-2.5 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-[#7C6EFA]"
                >
                  {DIFFICULTY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {(!interpretation.grade.trim() || !interpretation.subject.trim()) && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-xs text-amber-300">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              Pick a grade/year and subject above — Vivran won&rsquo;t guess these for you.
            </div>
          )}

          {/* Editable topic chips */}
          <div>
            <div className="text-[10px] text-muted mb-1.5">Topics</div>
            <div className="flex flex-wrap gap-2 items-center">
              {interpretation.topics.map((topic) => (
                <span
                  key={topic}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 text-xs text-[#4FC3F7] font-medium"
                >
                  {topic}
                  <button type="button" onClick={() => removeTopic(topic)} aria-label={`Remove ${topic}`}>
                    <X className="w-3 h-3 hover:text-red-400" />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <input
                  value={topicDraft}
                  onChange={(e) => setTopicDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTopic();
                    }
                  }}
                  placeholder="Add a topic…"
                  className="px-2.5 py-1 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-[#7C6EFA] w-32"
                />
                <button type="button" onClick={addTopic} className="p-1 rounded-lg border border-border text-muted hover:text-foreground hover:border-white/20">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Secondary controls — scoped to what's actually being created */}
          <div className="pt-2 border-t border-border">
            <div className="text-xs text-muted font-medium mb-3 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#7C6EFA]" /> Additional Controls:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {interpretation.artifactType === "assessment" && (
                <>
                  <div>
                    <div className="text-[10px] text-muted mb-1">Total Marks</div>
                    <input
                      type="number"
                      min={5}
                      value={marks}
                      onChange={(e) => setMarks(Number(e.target.value) || 0)}
                      list="smart-prompt-marks-options"
                      className="w-full px-2.5 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-[#7C6EFA]"
                    />
                    <datalist id="smart-prompt-marks-options">
                      {TOTAL_MARKS_OPTIONS.map((m) => <option key={m} value={m} />)}
                    </datalist>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-[10px] text-muted mb-1">Source Material (optional)</div>
                    <select
                      value={materialId}
                      onChange={(e) => setMaterialId(e.target.value)}
                      className="w-full px-2.5 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-[#7C6EFA]"
                    >
                      <option value="">None — not grounded in an uploaded material</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.title}{m.processing_status !== "READY" ? ` (${m.processing_status.toLowerCase()})` : ""}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {interpretation.artifactType === "course_plan" && (
                <div>
                  <div className="text-[10px] text-muted mb-1">Duration (weeks)</div>
                  <input
                    type="number"
                    min={1}
                    value={durationWeeks}
                    onChange={(e) => setDurationWeeks(Number(e.target.value) || 1)}
                    list="smart-prompt-weeks-options"
                    className="w-full px-2.5 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-[#7C6EFA]"
                  />
                  <datalist id="smart-prompt-weeks-options">
                    {DURATION_WEEKS_OPTIONS.map((w) => <option key={w} value={w} />)}
                  </datalist>
                </div>
              )}

              {interpretation.artifactType === "slides" && (
                <div>
                  <div className="text-[10px] text-muted mb-1">Slide Count</div>
                  <input
                    type="number"
                    min={3}
                    value={slideCount}
                    onChange={(e) => setSlideCount(Number(e.target.value) || 1)}
                    list="smart-prompt-slides-options"
                    className="w-full px-2.5 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-[#7C6EFA]"
                  />
                  <datalist id="smart-prompt-slides-options">
                    {SLIDE_COUNT_OPTIONS.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>
              )}

              {interpretation.artifactType === "worksheet" && (
                <div>
                  <div className="text-[10px] text-muted mb-1">Question Count</div>
                  <input
                    type="number"
                    min={1}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value) || 1)}
                    list="smart-prompt-worksheet-options"
                    className="w-full px-2.5 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-[#7C6EFA]"
                  />
                  <datalist id="smart-prompt-worksheet-options">
                    {WORKSHEET_QUESTION_COUNT_OPTIONS.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
              )}

              {interpretation.artifactType === "interactive" && (
                <div>
                  <div className="text-[10px] text-muted mb-1">Duration (minutes)</div>
                  <input
                    type="number"
                    min={5}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value) || 5)}
                    list="smart-prompt-minutes-options"
                    className="w-full px-2.5 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-[#7C6EFA]"
                  />
                  <datalist id="smart-prompt-minutes-options">
                    {DURATION_MINUTES_OPTIONS.map((m) => <option key={m} value={m} />)}
                  </datalist>
                </div>
              )}

              {interpretation.artifactType === "lesson_notes" && (
                <div className="text-xs text-muted italic self-center">No extra settings — lesson notes follow the topics above.</div>
              )}
            </div>
          </div>

          {generateResult && (
            <div
              className={`p-3 rounded-xl flex items-center justify-between gap-3 text-xs border ${
                generateResult.ok
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : "bg-red-500/10 border-red-500/20 text-red-300"
              }`}
            >
              <span>{generateResult.message}</span>
              {generateResult.ok && generateResult.href && (
                <Link href={generateResult.href} className="underline shrink-0">
                  View result →
                </Link>
              )}
            </div>
          )}

          {/* Confirm & Generate trigger */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleConfirmAndGenerate}
              disabled={generating || !readyToGenerate}
              title={!readyToGenerate ? "Pick a grade/year and subject first" : undefined}
              className="grad-btn px-6 py-2.5 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {generating ? "Generating..." : "Confirm & Generate Outputs"} <Sparkles className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
