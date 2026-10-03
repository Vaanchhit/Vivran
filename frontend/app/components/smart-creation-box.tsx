"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Sparkles, Sliders, CheckCircle2, AlertCircle, ArrowRight, X, Plus } from "lucide-react";
import { BookLoader } from "@/app/components/book-loader";
import { OutlineEditor } from "@/app/components/outline-editor";
import { useAuth } from "@/lib/auth-context";
import { getLiveValue, noticeIfAway, useLiveState, useOnScreen, useTabState } from "@/lib/tab-state";
import {
  parseTeacherIntent,
  transcribeAudio,
  generateAssessmentPaper,
  generateCoursePlan,
  generateDeck,
  generateOutline,
  generateWorksheet,
  generateLessonNotes,
  generateInteractiveCoursework,
  generateNarration,
  libraryHref,
  listMaterials,
  type Material,
  type CoursePlan,
  type AssessmentGenerateResponse,
  type DeckReady,
  type DeckOutline,
  type DeckParams,
  type LibraryKind,
  type OutlineSlide,
  type WorksheetResult,
  type LessonNotesResult,
  type InteractiveResult,
} from "@/services/api";
import {
  GRADE_LEVEL_OPTIONS,
  SUBJECT_OPTIONS,
  LANGUAGE_OPTIONS,
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

/** The dashboard's dropdown can create everything in ARTIFACT_TYPE_OPTIONS plus
 * narration (which previously only existed as a raw form on /teacher/create).
 * Kept local to this component — lib/constants.ts's ARTIFACT_TYPE_OPTIONS stays
 * as-is for anything else that reads it. */
const NARRATION_TYPE_OPTION = { value: "narration", label: "Narration audio" };
const ALL_ARTIFACT_TYPE_OPTIONS = [...ARTIFACT_TYPE_OPTIONS, NARRATION_TYPE_OPTION];

export type SmartCreationArtifactType =
  | "course_plan"
  | "slides"
  | "worksheet"
  | "lesson_notes"
  | "assessment"
  | "interactive"
  | "narration";

/** Maps the AI's guessed requested_artifacts (free-form strings) onto our
 * closed set of generatable types. Returns "" when nothing recognizable was
 * requested — the "Create" dropdown then stays on "— Select" and the teacher
 * picks. We never substitute a type they didn't ask for. */
function inferArtifactType(requested: string[]): string {
  const known = new Set(ALL_ARTIFACT_TYPE_OPTIONS.map((o) => o.value));
  const alias: Record<string, string> = {
    quiz: "assessment",
    test: "assessment",
    lesson: "lesson_notes",
    audio: "narration",
    voiceover: "narration",
    narrate: "narration",
  };
  for (const r of requested) {
    if (known.has(r)) return r;
    if (alias[r]) return alias[r];
  }
  return "";
}

/** Where a structured field's current value came from. "teacher" (an explicit
 * dropdown pick, a deep link, or a locked page) is authoritative and is never
 * overwritten; "prompt" and "profile" are *labelled suggestions* filled into
 * fields the teacher left blank, and stay fully editable. Anything with no
 * entry here was never filled at all. */
type FieldSource = "teacher" | "prompt" | "profile";

const SOURCE_NOTE: Record<FieldSource, string | null> = {
  teacher: null,
  prompt: "from your prompt",
  profile: "from your profile",
};

/** Fallbacks for count/duration fields the teacher left on "—". These are
 * product defaults, not guesses about the teacher's content — and they are
 * never applied silently: the review panel prints each one as
 * "· Vivran's default" before anything is generated. */
const COUNT_DEFAULTS = {
  marks: 40,
  durationWeeks: 3,
  durationMinutes: 15,
  slideCount: 8,
  questionCount: 10,
  difficulty: "medium",
} as const;

const FIELD_CLS =
  "w-full px-2.5 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-accent";

const CUSTOM_SENTINEL = "__custom__";

function FieldLabel({ children, note }: { children: React.ReactNode; note?: string | null }) {
  return (
    <div className="text-[10px] text-muted mb-1 flex flex-wrap items-center gap-x-1 leading-tight">
      {children}
      {note && <span className="text-[9px] text-accent font-normal normal-case">· {note}</span>}
    </div>
  );
}

/** A dropdown over a preset list that still lets a teacher type something the
 * list doesn't cover (the "preset + custom option live" rule used across the
 * app). Empty string always means "not set" — it never pre-selects a value. */
function PresetSelect({
  value,
  onChange,
  options,
  placeholder = "— Select",
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  ariaLabel: string;
}) {
  const [typing, setTyping] = useState(false);
  const offList = !!value && !options.includes(value);

  if (typing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTyping(false)}
          placeholder="Type it…"
          className={FIELD_CLS}
        />
        <button
          type="button"
          aria-label={`Clear ${ariaLabel}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange("");
            setTyping(false);
          }}
          className="p-1.5 rounded-lg border border-border text-muted hover:text-foreground shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => {
        if (e.target.value === CUSTOM_SENTINEL) {
          onChange("");
          setTyping(true);
          return;
        }
        onChange(e.target.value);
      }}
      className={FIELD_CLS}
    >
      <option value="">{placeholder}</option>
      {offList && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value={CUSTOM_SENTINEL}>Other — type it…</option>
    </select>
  );
}

/** Numeric sibling of PresetSelect. `null` means "not set" and renders as "—". */
function NumberSelect({
  value,
  onChange,
  options,
  suffix = "",
  ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  options: readonly number[];
  suffix?: string;
  ariaLabel: string;
}) {
  const offList = value !== null && !options.includes(value);
  return (
    <select
      aria-label={ariaLabel}
      value={value === null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={FIELD_CLS}
    >
      <option value="">— Any</option>
      {offList && <option value={String(value)}>{value}{suffix}</option>}
      {options.map((o) => (
        <option key={o} value={String(o)}>
          {o}
          {suffix}
        </option>
      ))}
    </select>
  );
}

interface Interpretation {
  raw_prompt: string;
  topics: string[];
  application_weight: number;
}

/** Result reported back to the host page after Confirm & Generate. `params`
 * carries the exact grade/subject/etc. that were actually used, so a host
 * page (e.g. the assessment page building a PDF export payload) doesn't have
 * to re-derive them. */
export type SmartCreationResult =
  | { artifactType: "course_plan"; ok: true; data: CoursePlan; params: { grade: string; subject: string; topics: string[]; durationWeeks: number } }
  | { artifactType: "assessment"; ok: true; data: AssessmentGenerateResponse; params: { grade: string; subject: string; topics: string[]; marks: number; difficulty: string; materialId?: string } }
  | { artifactType: "slides"; ok: true; data: DeckReady; params: { grade: string; subject: string; topic: string; slideCount: number } }
  | { artifactType: "worksheet"; ok: true; data: WorksheetResult; params: { grade: string; subject: string; topic: string; questionCount: number } }
  | { artifactType: "lesson_notes"; ok: true; data: LessonNotesResult; params: { grade: string; subject: string; topic: string } }
  | { artifactType: "interactive"; ok: true; data: InteractiveResult; params: { grade: string; subject: string; topic: string; durationMinutes: number } }
  | { artifactType: "narration"; ok: true; data: { provider: string; status: string; media_url: string; library_id?: string }; params: { script: string; provider: string } }
  | { artifactType: SmartCreationArtifactType; ok: false; error: string };

export interface SmartCreationBoxProps {
  /** Names where this box keeps its draft and result, e.g. "plan" or
   * "create:slides". Two boxes with the same scope share one draft. */
  scope: string;
  /** The page this box lives on, for a notice about work finished elsewhere. */
  scopeHref: string;
  /** When set, the "Create" type dropdown is hidden and every generation is
   * forced to this artifact type, regardless of what the AI guesses. Use this
   * on pages that are inherently single-purpose (course plan, assessment) or
   * that already have their own type picker (the create-page cards). */
  lockedArtifactType?: SmartCreationArtifactType;
  /** Called after every Confirm & Generate attempt (success or failure) so a
   * host page can drive its own result display instead of (or in addition
   * to) the box's built-in banner. */
  onGenerated?: (result: SmartCreationResult) => void;
  /** Show the box's own inline success/failure banner + "View result" link
   * after generating. Host pages that render their own result UI below
   * should pass false to avoid a duplicate banner. Defaults to true. */
  showInlineResult?: boolean;
  /** Override the label above the textarea. */
  heading?: string;
  /** Override the textarea placeholder. */
  promptPlaceholder?: string;
}

export function SmartCreationBox({
  scope,
  scopeHref,
  lockedArtifactType,
  onGenerated,
  showInlineResult = true,
  heading = "What would you like to create?",
  promptPlaceholder,
}: SmartCreationBoxProps) {
  const { user } = useAuth();
  // Everything the teacher has typed or picked lives in the tab store under
  // this box's scope, so leaving the page (or refreshing) never loses it.
  const k = (name: string) => `${scope}:${name}`;
  const [promptText, setPromptText] = useTabState(k("prompt"), "");
  const [loading, setLoading] = useLiveState(k("reading"), false);
  const [interpretation, setInterpretation] = useTabState<Interpretation | null>(k("interpretation"), null);
  const [topicDraft, setTopicDraft] = useTabState(k("topicDraft"), "");

  // ---- Structured customization -------------------------------------------
  // One source of truth for every non-prose parameter. "" / null always means
  // "the teacher hasn't set this"; nothing in here is ever populated from a
  // guess, only from an explicit pick, the teacher's own words, or their own
  // saved profile — and the last two are always labelled.
  const [pickedType, setArtifactType] = useTabState(k("artifactType"), "");
  const artifactType = lockedArtifactType ?? pickedType;
  const [grade, setGrade] = useTabState(k("grade"), "");
  const [subject, setSubject] = useTabState(k("subject"), "");
  const [language, setLanguage] = useTabState(k("language"), "");
  const [difficulty, setDifficulty] = useTabState(k("difficulty"), "");
  const [marks, setMarks] = useTabState<number | null>(k("marks"), null);
  const [durationWeeks, setDurationWeeks] = useTabState<number | null>(k("durationWeeks"), null);
  const [durationMinutes, setDurationMinutes] = useTabState<number | null>(k("durationMinutes"), null);
  const [slideCount, setSlideCount] = useTabState<number | null>(k("slideCount"), null);
  const [questionCount, setQuestionCount] = useTabState<number | null>(k("questionCount"), null);
  const [fieldSource, setFieldSource] = useTabState<Record<string, FieldSource | undefined>>(k("fieldSource"), {});

  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialId, setMaterialId] = useTabState(k("materialId"), "");
  const [errorMsg, setErrorMsg] = useTabState<string | null>(k("error"), null);
  const [degraded, setDegraded] = useTabState(k("degraded"), false);
  const [generating, setGenerating] = useLiveState(k("generating"), false);
  const [generateResult, setGenerateResult] = useTabState<{ ok: boolean; message: string; href?: string } | null>(k("result"), null);
  // Slides are planned, approved, then produced: the outline waits here for the teacher.
  const [outline, setOutline] = useTabState<DeckOutline | null>(k("outline"), null);
  const [deckParams, setDeckParams] = useTabState<DeckParams | null>(k("deckParams"), null);
  const [building, setBuilding] = useLiveState(k("building"), false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  useOnScreen(scope);

  /** A finished generation: the prompt is spent, so the box resets for the next
   * one (dropdown choices stay), and a teacher who has since left this page is
   * told where the result went. */
  const finish = (ok: boolean, message: string, href?: string) => {
    setGenerateResult({ ok, message, href });
    if (ok) {
      setPromptText("");
      setInterpretation(null);
      setTopicDraft("");
      setOutline(null);
      setDeckParams(null);
    }
    noticeIfAway(scope, ok
      ? { tone: "success", message: `${message} It's saved in your library.`, href, linkLabel: "Open it" }
      : { tone: "error", message, href: scopeHref, linkLabel: "Go back" });
  };

  useEffect(() => {
    setMicSupported(micApiAvailable());
    listMaterials().then(setMaterials).catch(() => setMaterials([]));
  }, []);

  /** Marks a field as an explicit teacher choice so intent parsing can never
   * overwrite it afterwards. */
  const markTeacherSet = (field: string) => setFieldSource((prev) => ({ ...prev, [field]: "teacher" }));

  const noteFor = (field: string) => {
    const src = fieldSource[field];
    return src ? SOURCE_NOTE[src] : null;
  };

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

  const handleRunSmartPrompt = async () => {
    const text = promptText;
    if (!text.trim() || getLiveValue(k("reading"), false)) return;

    setLoading(true);
    setErrorMsg(null);
    setInterpretation(null);
    setGenerateResult(null);

    try {
      // Whatever the teacher already picked below is passed straight through
      // as a hint, so the model doesn't have to re-derive it from prose.
      const data = await parseTeacherIntent(text, subject || undefined, grade || undefined);
      const parsed = data.intent;
      setDegraded(data.degraded);

      // Never assume grade/subject/topics the AI didn't actually extract —
      // those stay blank so the dropdowns make the gap visible and force an
      // explicit pick. Anything the teacher picked themselves wins outright;
      // anything the AI genuinely read out of their words fills a blank and
      // is labelled "from your prompt"; their own saved onboarding
      // preferences fill what's still blank and are labelled "from your
      // profile". All three stay fully editable.
      const nextSource: Record<string, FieldSource | undefined> = { ...fieldSource };

      const fillText = (
        field: string,
        current: string,
        fromPrompt: string | undefined,
        fromProfile: string | undefined,
        setter: (v: string) => void,
      ) => {
        if (fieldSource[field] === "teacher" && current) return;
        if (fromPrompt) {
          setter(fromPrompt);
          nextSource[field] = "prompt";
        } else if (fromProfile) {
          setter(fromProfile);
          nextSource[field] = "profile";
        }
      };

      if (!lockedArtifactType) {
        const inferred = inferArtifactType(parsed.requested_artifacts || []);
        fillText("artifactType", artifactType, inferred || undefined, undefined, setArtifactType);
      }
      fillText("grade", grade, parsed.grade || undefined, user?.preferredGrades?.[0] || undefined, setGrade);
      fillText("subject", subject, parsed.subject || undefined, user?.preferredSubjects?.[0] || undefined, setSubject);
      fillText("difficulty", difficulty, parsed.difficulty || undefined, user?.preferredDifficulty || undefined, setDifficulty);
      fillText("language", language, undefined, user?.preferredLanguage || undefined, setLanguage);

      if (parsed.marks && fieldSource["marks"] !== "teacher") {
        setMarks(parsed.marks);
        nextSource["marks"] = "prompt";
      }

      setFieldSource(nextSource);
      setInterpretation({
        raw_prompt: text,
        topics: parsed.topics?.length ? parsed.topics : [],
        application_weight: parsed.application_weight,
      });
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

  // Narration doesn't take grade/subject at all (the backend just narrates
  // the script text as-is), so it's exempt from the "pick a grade & subject"
  // gate that every other topic-driven artifact type needs.
  const requiresGradeSubject = !!artifactType && artifactType !== "narration";
  const missingFields = [
    !artifactType ? "what you want to create" : null,
    requiresGradeSubject && !grade.trim() ? "a grade/year" : null,
    requiresGradeSubject && !subject.trim() ? "a subject" : null,
  ].filter(Boolean) as string[];
  const readyToGenerate = !!interpretation && missingFields.length === 0;

  // Narration takes no structured parameters at all (the backend narrates the
  // script as-is), so on a page locked to it the whole row would be empty.
  const hasCustomizationControls = !lockedArtifactType || artifactType !== "narration";

  /** Values that will actually be sent, with where each one came from —
   * printed in the review panel so a product default is never applied behind
   * the teacher's back. */
  const resolvedSummary: { label: string; value: string; note: string | null }[] = (() => {
    const rows: { label: string; value: string; note: string | null }[] = [];
    const add = (label: string, value: string | number | null, field: string, fallback?: string | number) => {
      const unset = value === null || value === "";
      if (unset && fallback === undefined) return;
      rows.push({
        label,
        value: String(unset ? fallback : value),
        note: unset ? "Vivran's default" : noteFor(field),
      });
    };
    if (artifactType !== "narration") {
      add("Grade / Year", grade, "grade");
      add("Subject", subject, "subject");
    }
    if (artifactType === "assessment") {
      add("Total marks", marks, "marks", COUNT_DEFAULTS.marks);
      add("Difficulty", difficulty, "difficulty", COUNT_DEFAULTS.difficulty);
    }
    if (artifactType === "slides") add("Slides", slideCount, "slideCount", COUNT_DEFAULTS.slideCount);
    if (artifactType === "worksheet") add("Questions", questionCount, "questionCount", COUNT_DEFAULTS.questionCount);
    if (artifactType === "course_plan") add("Weeks", durationWeeks, "durationWeeks", COUNT_DEFAULTS.durationWeeks);
    if (artifactType === "interactive") add("Minutes", durationMinutes, "durationMinutes", COUNT_DEFAULTS.durationMinutes);
    if (artifactType !== "narration") add("Language", language, "language");
    return rows;
  })();

  /** Where a finished item opens: its saved copy when the save worked, else this page. */
  const hrefFor = (kind: string, libraryId: unknown) =>
    typeof libraryId === "string" && libraryId ? libraryHref({ id: libraryId, type: kind as LibraryKind }) : scopeHref;

  const handleConfirmAndGenerate = async () => {
    // One request per box at a time, even across a double click or a return visit mid-run.
    if (!interpretation || !readyToGenerate || getLiveValue(k("generating"), false)) return;
    setGenerating(true);
    setGenerateResult(null);

    const { raw_prompt } = interpretation;
    const resolvedDifficulty = difficulty || COUNT_DEFAULTS.difficulty;

    // The backend content endpoints have no `language` field yet, so an
    // explicitly-picked language rides along as a plain directive. Unset =>
    // nothing is added at all.
    const langDirective = language && language !== "English" ? `Write all content in ${language}.` : "";
    const baseTopics = interpretation.topics.length ? interpretation.topics : [raw_prompt];
    const topics = langDirective ? [...baseTopics, langDirective] : baseTopics;
    const baseTopicStr = interpretation.topics.length ? interpretation.topics.join(", ") : raw_prompt;
    const topicStr = langDirective ? `${baseTopicStr} — ${langDirective}` : baseTopicStr;

    try {
      switch (artifactType) {
        case "assessment": {
          const resolvedMarks = marks ?? COUNT_DEFAULTS.marks;
          const data = await generateAssessmentPaper(grade, subject, topics, resolvedMarks, resolvedDifficulty, materialId || undefined);
          onGenerated?.({
            artifactType: "assessment",
            ok: true,
            data,
            params: { grade, subject, topics, marks: resolvedMarks, difficulty: resolvedDifficulty, materialId: materialId || undefined },
          });
          if (!data.assessment) finish(false, `Generation failed: ${data.validation.errors.join("; ")}`);
          else finish(true, `Your paper "${(data.assessment as { title: string }).title}" is ready.`, hrefFor("assessment", data.library_id));
          break;
        }
        case "slides": {
          // PLAN only. Nothing is written until the teacher approves the outline (buildDeck).
          const params: DeckParams = {
            topic: baseTopicStr,
            grade,
            subject,
            slideCount: slideCount ?? COUNT_DEFAULTS.slideCount,
            language: language || undefined,
            materialId: materialId || undefined,
          };
          const data = await generateOutline(params);
          if (data.status === "needs_input") {
            const asks = data.questions.filter((q) => q.blocking).map((q) => q.ask);
            const message = `Before building this deck: ${(asks.length ? asks : data.questions.map((q) => q.ask)).join(" ")}`;
            onGenerated?.({ artifactType: "slides", ok: false, error: message });
            finish(false, message);
            break;
          }
          setDeckParams(params);
          setOutline(data);
          noticeIfAway(scope, { tone: "success", message: "Your slide outline is ready to review.", href: scopeHref, linkLabel: "Review it" });
          break;
        }
        case "worksheet": {
          const resolved = questionCount ?? COUNT_DEFAULTS.questionCount;
          const data = await generateWorksheet(topicStr, resolved, grade, subject);
          onGenerated?.({ artifactType: "worksheet", ok: true, data, params: { grade, subject, topic: topicStr, questionCount: resolved } });
          if (data.error) finish(false, `Generation failed: ${data.error}`);
          else finish(true, `Your worksheet "${data.title}" (${data.question_count} questions) is ready.`, hrefFor("worksheet", data.library_id));
          break;
        }
        case "lesson_notes": {
          const data = await generateLessonNotes(topicStr, grade, subject);
          onGenerated?.({ artifactType: "lesson_notes", ok: true, data, params: { grade, subject, topic: topicStr } });
          if (data.error) finish(false, `Generation failed: ${data.error}`);
          else finish(true, `Your lesson notes "${data.title}" are ready.`, hrefFor("lesson_notes", data.library_id));
          break;
        }
        case "interactive": {
          const resolved = durationMinutes ?? COUNT_DEFAULTS.durationMinutes;
          const data = await generateInteractiveCoursework(topicStr, resolved, grade, subject);
          onGenerated?.({ artifactType: "interactive", ok: true, data, params: { grade, subject, topic: topicStr, durationMinutes: resolved } });
          if (data.error) finish(false, `Generation failed: ${data.error}`);
          else finish(true, `Your class activity "${data.title}" is ready.`, hrefFor("interactive", data.library_id));
          break;
        }
        case "narration": {
          const data = await generateNarration(raw_prompt);
          onGenerated?.({ artifactType: "narration", ok: true, data, params: { script: raw_prompt, provider: data.provider } });
          finish(true, "Your narration audio is ready.", hrefFor("narration", data.library_id));
          break;
        }
        default: {
          const resolved = durationWeeks ?? COUNT_DEFAULTS.durationWeeks;
          const { course_plan, library_id } = await generateCoursePlan({
            title: `${grade} ${subject} — ${baseTopicStr}`,
            grade,
            subject,
            topics,
            durationWeeks: resolved,
          });
          onGenerated?.({ artifactType: "course_plan", ok: true, data: course_plan, params: { grade, subject, topics, durationWeeks: resolved } });
          if (course_plan.error) finish(false, `Generation failed: ${course_plan.error}`);
          else finish(true, `Your course plan "${course_plan.title}" is ready.`, hrefFor("course_plan", library_id));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed.";
      onGenerated?.({ artifactType: (artifactType || "course_plan") as SmartCreationArtifactType, ok: false, error: message });
      finish(false, message);
    } finally {
      setGenerating(false);
    }
  };

  /** PRODUCE: write the deck the teacher approved. */
  const buildDeck = async (slides: OutlineSlide[]) => {
    if (!deckParams || getLiveValue(k("building"), false)) return;
    setBuilding(true);
    setGenerateResult(null);
    try {
      const data = await generateDeck({ ...deckParams, outline: slides });
      if (data.status === "needs_input") {
        const message = `Before building this deck: ${data.questions.map((q) => q.ask).join(" ")}`;
        onGenerated?.({ artifactType: "slides", ok: false, error: message });
        finish(false, message);
        return;
      }
      onGenerated?.({
        artifactType: "slides",
        ok: true,
        data,
        params: { grade: deckParams.grade ?? "", subject: deckParams.subject ?? "", topic: deckParams.topic, slideCount: slides.length },
      });
      finish(true, `Your slide deck "${data.context.topic}" (${data.placements.length} slides) is ready.`, hrefFor("slides", data.libraryId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed.";
      onGenerated?.({ artifactType: "slides", ok: false, error: message });
      finish(false, message);
    } finally {
      setBuilding(false);
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
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-panel backdrop-blur-xl relative overflow-hidden">
        <div className="flex items-center justify-between gap-3 mb-3">
          <label className="text-sm font-semibold font-display text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            {heading}
          </label>
          <span className="text-xs text-muted hidden sm:inline">Write it the way you&rsquo;d say it out loud</span>
        </div>

        {/* Textarea Input Box */}
        <div className="relative">
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder={
              promptPlaceholder ||
              "Just the topic and the angle you want — e.g. 'Porter's Five Forces, using real Indian company examples, exam-focused'. Set the grade, subject and the rest below."
            }
            className="w-full h-28 sm:h-32 p-4 pr-12 bg-card border border-border rounded-xl text-foreground placeholder:text-faint text-sm focus:outline-none focus:border-accent transition-all resize-none leading-relaxed"
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
              listening ? "bg-danger-soft text-danger" : "text-muted hover:text-foreground hover:bg-card"
            }`}
          >
            {transcribing ? (
              <BookLoader className="w-4 h-4 text-chrome" />
            ) : (
              <Mic className={`w-4 h-4 ${listening ? "text-danger animate-pulse" : "text-chrome"}`} />
            )}
          </button>
        </div>

        {/* ---- Customization dropdowns ---------------------------------------
            Structured fields instead of prose: everything picked here is sent
            as a real parameter, so the prompt above only has to carry the
            topic and the angle. Every control starts unset — picking one is
            the teacher's choice, and leaving it alone never invents a value. */}
        <div className={`mt-4 pt-4 border-t border-border ${hasCustomizationControls ? "" : "hidden"}`}>
          <div className="text-[11px] text-muted font-medium mb-2.5 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-accent" />
            Customize — the more you set here, the less your prompt has to spell out
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {!lockedArtifactType && (
              <div>
                <FieldLabel note={noteFor("artifactType")}>Create</FieldLabel>
                <select
                  aria-label="What to create"
                  value={artifactType}
                  onChange={(e) => {
                    setArtifactType(e.target.value);
                    markTeacherSet("artifactType");
                  }}
                  className={FIELD_CLS}
                >
                  <option value="">— Select</option>
                  {ALL_ARTIFACT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}

            {artifactType !== "narration" && (
              <>
                <div>
                  <FieldLabel note={noteFor("grade")}>Grade / Year</FieldLabel>
                  <PresetSelect
                    ariaLabel="Grade or year"
                    value={grade}
                    onChange={(v) => {
                      setGrade(v);
                      markTeacherSet("grade");
                    }}
                    options={GRADE_LEVEL_OPTIONS}
                  />
                </div>

                <div>
                  <FieldLabel note={noteFor("subject")}>Subject</FieldLabel>
                  <PresetSelect
                    ariaLabel="Subject"
                    value={subject}
                    onChange={(v) => {
                      setSubject(v);
                      markTeacherSet("subject");
                    }}
                    options={SUBJECT_OPTIONS}
                  />
                </div>
              </>
            )}

            {artifactType === "assessment" && (
              <>
                <div>
                  <FieldLabel note={noteFor("marks")}>Total marks</FieldLabel>
                  <NumberSelect
                    ariaLabel="Total marks"
                    value={marks}
                    onChange={(v) => {
                      setMarks(v);
                      markTeacherSet("marks");
                    }}
                    options={TOTAL_MARKS_OPTIONS}
                  />
                </div>
                <div>
                  <FieldLabel note={noteFor("difficulty")}>Difficulty</FieldLabel>
                  <select
                    aria-label="Difficulty"
                    value={difficulty}
                    onChange={(e) => {
                      setDifficulty(e.target.value);
                      markTeacherSet("difficulty");
                    }}
                    className={FIELD_CLS}
                  >
                    <option value="">— Any</option>
                    {DIFFICULTY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {artifactType === "slides" && (
              <div>
                <FieldLabel note={noteFor("slideCount")}>Slides</FieldLabel>
                <NumberSelect
                  ariaLabel="Slide count"
                  value={slideCount}
                  onChange={(v) => {
                    setSlideCount(v);
                    markTeacherSet("slideCount");
                  }}
                  options={SLIDE_COUNT_OPTIONS}
                />
              </div>
            )}

            {artifactType === "worksheet" && (
              <div>
                <FieldLabel note={noteFor("questionCount")}>Questions</FieldLabel>
                <NumberSelect
                  ariaLabel="Question count"
                  value={questionCount}
                  onChange={(v) => {
                    setQuestionCount(v);
                    markTeacherSet("questionCount");
                  }}
                  options={WORKSHEET_QUESTION_COUNT_OPTIONS}
                />
              </div>
            )}

            {artifactType === "course_plan" && (
              <div>
                <FieldLabel note={noteFor("durationWeeks")}>Duration</FieldLabel>
                <NumberSelect
                  ariaLabel="Duration in weeks"
                  value={durationWeeks}
                  onChange={(v) => {
                    setDurationWeeks(v);
                    markTeacherSet("durationWeeks");
                  }}
                  options={DURATION_WEEKS_OPTIONS}
                  suffix=" weeks"
                />
              </div>
            )}

            {artifactType === "interactive" && (
              <div>
                <FieldLabel note={noteFor("durationMinutes")}>Duration</FieldLabel>
                <NumberSelect
                  ariaLabel="Duration in minutes"
                  value={durationMinutes}
                  onChange={(v) => {
                    setDurationMinutes(v);
                    markTeacherSet("durationMinutes");
                  }}
                  options={DURATION_MINUTES_OPTIONS}
                  suffix=" min"
                />
              </div>
            )}

            {artifactType !== "narration" && (
              <div>
                <FieldLabel note={noteFor("language")}>Language</FieldLabel>
                <PresetSelect
                  ariaLabel="Language"
                  value={language}
                  onChange={(v) => {
                    setLanguage(v);
                    markTeacherSet("language");
                  }}
                  options={LANGUAGE_OPTIONS.filter((l) => l !== "Other")}
                />
              </div>
            )}

            {artifactType === "assessment" && (
              <div className="col-span-2 lg:col-span-4">
                <FieldLabel>Source material (optional)</FieldLabel>
                <select
                  aria-label="Source material"
                  value={materialId}
                  onChange={(e) => setMaterialId(e.target.value)}
                  className={FIELD_CLS}
                >
                  <option value="">None — not grounded in an uploaded material</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}{m.processing_status !== "READY" ? ` (${m.processing_status.toLowerCase()})` : ""}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => handleRunSmartPrompt()}
            disabled={loading || !promptText.trim()}
            className="btn-primary px-5 py-2.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? "Reading your request…" : "Turn this into a plan"} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-danger-soft border border-danger-line rounded-xl flex items-center gap-2 text-xs text-danger">
          <AlertCircle className="w-4 h-4 text-danger shrink-0" />
          {errorMsg}
        </div>
      )}

      {showInlineResult && generateResult && (
        <div
          className={`p-3 rounded-xl flex items-center justify-between gap-3 text-xs border ${
            generateResult.ok
              ? "bg-success-soft border-success-line text-success"
              : "bg-danger-soft border-danger-line text-danger"
          }`}
        >
          <span className="flex-1">{generateResult.message}</span>
          {generateResult.ok && generateResult.href && (
            <Link href={generateResult.href} className="underline shrink-0">
              View result →
            </Link>
          )}
          <button type="button" onClick={() => setGenerateResult(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* "I understood" Requirements Block — every field below is editable */}
      {interpretation && (
        <div className="bg-surface border border-accent-line rounded-2xl p-4 sm:p-6 shadow-panel space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div className="flex items-center gap-2 text-foreground font-display text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Here&rsquo;s the plan — check it before we build it
            </div>
            <span className="text-xs text-accent font-medium bg-accent-soft px-2.5 py-1 rounded-full border border-accent-line">
              {focusLabel}
            </span>
          </div>

          {degraded && (
            <div className="p-2.5 bg-warning-soft border border-warning-line rounded-xl flex items-center gap-2 text-[11px] text-warning">
              <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0" />
              AI reading was unavailable — this used a simpler keyword-based fallback.
            </div>
          )}

          {missingFields.length > 0 && (
            <div className="p-3 bg-warning-soft border border-warning-line rounded-xl flex items-start gap-2 text-xs text-warning">
              <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <span>
                Pick {missingFields.join(" and ")} in the dropdowns above — Vivran won&rsquo;t guess these for you.
              </span>
            </div>
          )}

          {/* Editable topic chips */}
          <div>
            <div className="text-[10px] text-muted mb-1.5">Topics</div>
            <div className="flex flex-wrap gap-2 items-center">
              {interpretation.topics.map((topic) => (
                <span
                  key={topic}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-chrome-soft border border-chrome-line text-xs text-chrome font-medium"
                >
                  {topic}
                  <button type="button" onClick={() => removeTopic(topic)} aria-label={`Remove ${topic}`}>
                    <X className="w-3 h-3 hover:text-danger" />
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
                  className="px-2.5 py-1 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-accent w-32"
                />
                <button type="button" onClick={addTopic} className="p-1 rounded-lg border border-border text-muted hover:text-foreground hover:border-border-hi">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Exactly what will be sent, and where each value came from. A
              product default is shown as such — never applied silently. */}
          {resolvedSummary.length > 0 && (
            <div className="pt-2 border-t border-border">
              <div className="text-[10px] text-muted mb-2">Settings being used (change them in the dropdowns above)</div>
              <div className="flex flex-wrap gap-1.5">
                {resolvedSummary.map((row) => (
                  <span
                    key={row.label}
                    className="px-2.5 py-1 rounded-lg bg-card border border-border text-[11px] text-muted"
                  >
                    {row.label}: <span className="text-foreground font-medium capitalize">{row.value}</span>
                    {row.note && <span className="text-accent"> · {row.note}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {outline ? (
            <OutlineEditor
              key={outline.outline.map((s) => s.title).join("|")}
              outline={outline}
              building={building}
              onBuild={buildDeck}
              onCancel={() => setOutline(null)}
              storageKey={k("outlineEdits")}
            />
          ) : (
            /* Confirm & Generate trigger. For slides this plans an outline first. */
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleConfirmAndGenerate}
                disabled={generating || !readyToGenerate}
                title={!readyToGenerate ? `Pick ${missingFields.join(" and ")} first` : undefined}
                className="btn-primary px-6 py-2.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {generating
                  ? artifactType === "slides" ? "Planning the deck..." : "Generating..."
                  : artifactType === "slides" ? "Plan the deck" : "Confirm & Generate Outputs"}{" "}
                {generating ? <BookLoader className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
