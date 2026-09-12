"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Sparkles, Sliders, CheckCircle2, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { generateAssessmentPaper, generateCoursePlan, parseTeacherIntent, transcribeAudio } from "@/services/api";

function micApiAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined"
  );
}

interface IntentInterpretation {
  raw_prompt: string;
  grade: string;
  subject: string;
  topics: string[];
  marks: number | null;
  difficulty: string;
  application_weight: number;
  requested_artifacts: string[];
}

export function SmartPromptBox() {
  const [promptText, setPromptText] = useState("");
  const [loading, setLoading] = useState(false);
  const [interpretation, setInterpretation] = useState<IntentInterpretation | null>(null);
  const [missingInfoMsg, setMissingInfoMsg] = useState<string | null>(null);
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
    { label: "Test Paper", sample: "Create a difficult 80-mark Class 12 Economics paper for Chapters 1-5 with 50% application questions." },
    { label: "Quiz", sample: "Give me a 10-question exit quiz on photosynthesis for Class 8." },
    { label: "Worksheet", sample: "Create a worksheet for Class 10 Biology on plant tissues with diagrams." },
    { label: "Lesson Plan", sample: "Plan four lessons on tissues for Class 10 Biology next week." },
    { label: "Slides", sample: "Create a 12-slide presentation on Newton's Laws for Class 9 using simple examples." },
    { label: "Interactive Course", sample: "Create a 15-minute interactive lesson on Newton's Laws for Class 9." },
    { label: "Course Plan", sample: "Plan 3 weeks of Class 9 Biology covering Tissues and Food Resources." },
  ];

  const handleRunSmartPrompt = async (textToSubmit?: string) => {
    const text = textToSubmit || promptText;
    if (!text.trim()) return;

    setLoading(true);
    setMissingInfoMsg(null);
    setErrorMsg(null);
    setInterpretation(null);

    try {
      const data = await parseTeacherIntent(text);

      const parsed = data.intent;
      const promptLower = text.toLowerCase();

      setDegraded(data.degraded);

      // Simple clarification check per Spec §5
      if (!promptLower.includes("class") && !promptLower.includes("grade") && !parsed.grade) {
        setMissingInfoMsg("What class/grade is this requirement for?");
      }

      setInterpretation({
        raw_prompt: text,
        grade: parsed.grade || "Class 10",
        subject: parsed.subject || "Biology",
        topics: parsed.topics?.length ? parsed.topics : ["Tissues", "Cell Structure"],
        marks: parsed.marks ?? (promptLower.includes("80") ? 80 : promptLower.includes("40") ? 40 : 20),
        difficulty: parsed.difficulty
          ? parsed.difficulty.charAt(0).toUpperCase() + parsed.difficulty.slice(1)
          : "Medium",
        application_weight: parsed.application_weight,
        requested_artifacts: parsed.requested_artifacts || [],
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not reach the Vivran backend. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAndGenerate = async () => {
    if (!interpretation) return;
    setGenerating(true);
    setGenerateResult(null);

    const wantsAssessment = interpretation.requested_artifacts.some((a) => ["assessment", "quiz"].includes(a));

    try {
      if (wantsAssessment) {
        const { assessment, validation } = await generateAssessmentPaper(
          interpretation.grade,
          interpretation.subject,
          interpretation.topics,
          interpretation.marks ?? 40,
          interpretation.difficulty.toLowerCase(),
        );
        if (!assessment) {
          setGenerateResult({ ok: false, message: `Generation failed: ${validation.errors.join("; ")}` });
        } else {
          setGenerateResult({ ok: true, message: `Assessment "${(assessment as { title: string }).title}" generated.`, href: "/teacher/assess" });
        }
      } else {
        const { course_plan } = await generateCoursePlan({
          title: `${interpretation.grade} ${interpretation.subject} — ${interpretation.topics.join(", ")}`,
          grade: interpretation.grade,
          subject: interpretation.subject,
          topics: interpretation.topics,
        });
        if (course_plan.error) {
          setGenerateResult({ ok: false, message: `Generation failed: ${course_plan.error}` });
        } else {
          setGenerateResult({ ok: true, message: `Course plan "${course_plan.title}" generated.`, href: "/teacher/plan" });
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
            placeholder="Tell Vivran what you need... e.g. 'Teach Class 10 Economics — Money and Credit tomorrow. Make a 45-minute lesson, 8 slides, a worksheet, and a 5-question exit quiz.'"
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

      {/* "I understood" Requirements Block (Spec §5) */}
      {interpretation && (
        <div className="bg-surface/90 border border-[#7C6EFA]/30 rounded-2xl p-6 shadow-xl space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2 text-foreground font-display text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Vivran Understood Your Requirements:
            </div>
            <span className="text-xs text-[#7C6EFA] font-medium bg-[#7C6EFA]/10 px-2.5 py-1 rounded-full border border-[#7C6EFA]/20">
              Ready for Generation
            </span>
          </div>

          {degraded && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-[11px] text-amber-300">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              AI intent parsing was unavailable — this used a simpler keyword-based fallback.
            </div>
          )}

          {/* Extracted requirement chips */}
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground font-medium">
              Grade: <strong className="text-[#4FC3F7]">{interpretation.grade}</strong>
            </span>
            <span className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground font-medium">
              Subject: <strong className="text-[#4FC3F7]">{interpretation.subject}</strong>
            </span>
            <span className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground font-medium">
              Marks: <strong className="text-[#4FC3F7]">{interpretation.marks || 40}</strong>
            </span>
            <span className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground font-medium">
              Difficulty: <strong className="text-[#4FC3F7]">{interpretation.difficulty}</strong>
            </span>
            <span className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground font-medium">
              Focus: <strong className="text-[#4FC3F7]">{focusLabel}</strong>
            </span>
          </div>

          {/* Extracted topics + artifacts */}
          {interpretation.topics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {interpretation.topics.map((topic) => (
                <span
                  key={topic}
                  className="px-2.5 py-1 rounded-lg bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 text-xs text-[#4FC3F7] font-medium"
                >
                  {topic}
                </span>
              ))}
              {interpretation.requested_artifacts.map((artifact) => (
                <span
                  key={artifact}
                  className="px-2.5 py-1 rounded-lg bg-white/5 border border-border text-xs text-muted"
                >
                  {artifact.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}

          {/* Missing info prompt if needed */}
          {missingInfoMsg && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-xs text-amber-300">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              {missingInfoMsg}
            </div>
          )}

          {/* Additional Editable Controls */}
          <div className="pt-2 border-t border-border">
            <div className="text-xs text-muted font-medium mb-3 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#7C6EFA]" /> Additional Controls & Scoping:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button className="px-3 py-2 bg-card border border-border rounded-xl text-left text-xs text-muted hover:text-foreground hover:border-white/20 transition-all">
                <div className="text-[10px] text-foreground/50">Question Mix</div>
                <div className="font-semibold text-foreground mt-0.5">MCQ + Short + Numericals</div>
              </button>

              <button className="px-3 py-2 bg-card border border-border rounded-xl text-left text-xs text-muted hover:text-foreground hover:border-white/20 transition-all">
                <div className="text-[10px] text-foreground/50">Duration</div>
                <div className="font-semibold text-foreground mt-0.5">45 Mins</div>
              </button>

              <button className="px-3 py-2 bg-card border border-border rounded-xl text-left text-xs text-muted hover:text-foreground hover:border-white/20 transition-all">
                <div className="text-[10px] text-foreground/50">Bloom's Taxonomy</div>
                <div className="font-semibold text-foreground mt-0.5">Apply & Analyze</div>
              </button>

              <button className="px-3 py-2 bg-card border border-border rounded-xl text-left text-xs text-muted hover:text-foreground hover:border-white/20 transition-all">
                <div className="text-[10px] text-foreground/50">Source Material</div>
                <div className="font-semibold text-[#4FC3F7] mt-0.5 truncate">Uploaded Textbook PDF</div>
              </button>
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
              disabled={generating}
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