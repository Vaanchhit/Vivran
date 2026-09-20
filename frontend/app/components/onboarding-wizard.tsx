"use client";

import React, { useState } from "react";
import { Sparkles, BookOpen, GraduationCap, Languages, Gauge, ArrowRight, ArrowLeft, Check, Plus, X, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { GRADE_LEVEL_OPTIONS, SUBJECT_OPTIONS, LANGUAGE_OPTIONS, DIFFICULTY_OPTIONS } from "@/lib/constants";

/** First-time-only wizard: subject → grade → language → (optional) default
 * difficulty. Rendered by TeacherLayout in place of the page children
 * whenever `!user.onboardingCompleted` — plain client-side gating, no
 * middleware (see TeacherLayout for why that matters here). */
export function OnboardingWizard() {
  const { user, completeOnboarding, logout } = useAuth();
  const [step, setStep] = useState(0);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [language, setLanguage] = useState("");
  const [customLanguage, setCustomLanguage] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [subjectDraft, setSubjectDraft] = useState("");
  const [gradeDraft, setGradeDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const steps = [
    { key: "subjects", label: "Subjects", icon: BookOpen },
    { key: "grades", label: "Grade Levels", icon: GraduationCap },
    { key: "language", label: "Language", icon: Languages },
    { key: "difficulty", label: "Difficulty", icon: Gauge },
  ];

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const addCustom = (draft: string, setDraft: (v: string) => void, list: string[], setList: (v: string[]) => void) => {
    const v = draft.trim();
    if (!v) return;
    if (!list.includes(v)) setList([...list, v]);
    setDraft("");
  };

  const effectiveLanguage = language === "Other" ? customLanguage.trim() : language;

  const canAdvance =
    step === 0 ? subjects.length > 0 : step === 1 ? grades.length > 0 : step === 2 ? !!effectiveLanguage : true;

  const goNext = () => {
    if (!canAdvance) return;
    if (step < steps.length - 1) setStep(step + 1);
    else handleFinish();
  };

  const goBack = () => {
    setError("");
    if (step > 0) setStep(step - 1);
  };

  const handleFinish = async () => {
    setSaving(true);
    setError("");
    const ok = await completeOnboarding({
      subjects,
      grades,
      preferred_language: effectiveLanguage || undefined,
      preferred_difficulty: difficulty || undefined,
    });
    setSaving(false);
    if (!ok) {
      setError("Could not save your preferences. Check your connection and try again.");
    }
    // On success, `user.onboardingCompleted` flips to true and TeacherLayout
    // re-renders the real page in place of this wizard — no navigation needed.
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-10">
      <div className="w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[#7C6EFA]/10 border border-[#7C6EFA]/20 text-[#7C6EFA]">
            <Sparkles className="w-3.5 h-3.5" /> Quick Setup
          </div>
          <h1 className="text-2xl font-extrabold font-display text-foreground tracking-tight">
            Welcome{user?.name ? `, ${user.name}` : ""} — let&rsquo;s personalize Vivran
          </h1>
          <p className="text-sm text-muted">
            A few quick preferences so Vivran can suggest the right grade, subject &amp; language by default — you can always change these later.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const state = i < step ? "done" : i === step ? "active" : "upcoming";
            return (
              <div key={s.key} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs font-semibold transition-colors ${
                    state === "done"
                      ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                      : state === "active"
                        ? "bg-[#7C6EFA]/20 border-[#7C6EFA] text-[#7C6EFA]"
                        : "bg-white/5 border-border text-muted"
                  }`}
                  aria-label={s.label}
                  title={s.label}
                >
                  {state === "done" ? <Check className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                </div>
                {i < steps.length - 1 && <div className={`w-6 h-px ${i < step ? "bg-emerald-500/40" : "bg-border"}`} />}
              </div>
            );
          })}
        </div>
        <div className="text-center text-[11px] uppercase tracking-wider text-muted font-semibold">
          Step {step + 1} of {steps.length} — {steps[step].label}
        </div>

        {/* Step 1: Subjects */}
        {step === 0 && (
          <div className="space-y-3" data-testid="onboarding-step-subjects">
            <p className="text-sm text-foreground font-medium">Which subject(s) do you teach?</p>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(subjects, setSubjects, s)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    subjects.includes(s)
                      ? "bg-[#7C6EFA]/15 border-[#7C6EFA] text-foreground"
                      : "bg-card border-border text-muted hover:border-white/20 hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                value={subjectDraft}
                onChange={(e) => setSubjectDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom(subjectDraft, setSubjectDraft, subjects, setSubjects);
                  }
                }}
                placeholder="Add another subject…"
                className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-[#7C6EFA]"
              />
              <button
                type="button"
                onClick={() => addCustom(subjectDraft, setSubjectDraft, subjects, setSubjects)}
                className="p-2 rounded-lg border border-border text-muted hover:text-foreground hover:border-white/20"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {subjects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {subjects.map((s) => (
                  <span key={s} className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 text-[11px] text-[#4FC3F7]">
                    {s}
                    <button type="button" onClick={() => toggle(subjects, setSubjects, s)} aria-label={`Remove ${s}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Grades */}
        {step === 1 && (
          <div className="space-y-3" data-testid="onboarding-step-grades">
            <p className="text-sm text-foreground font-medium">Which grade/year level(s) do you teach?</p>
            <div className="flex flex-wrap gap-2">
              {GRADE_LEVEL_OPTIONS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggle(grades, setGrades, g)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    grades.includes(g)
                      ? "bg-[#7C6EFA]/15 border-[#7C6EFA] text-foreground"
                      : "bg-card border-border text-muted hover:border-white/20 hover:text-foreground"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                value={gradeDraft}
                onChange={(e) => setGradeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom(gradeDraft, setGradeDraft, grades, setGrades);
                  }
                }}
                placeholder="Add another grade/year…"
                className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-[#7C6EFA]"
              />
              <button
                type="button"
                onClick={() => addCustom(gradeDraft, setGradeDraft, grades, setGrades)}
                className="p-2 rounded-lg border border-border text-muted hover:text-foreground hover:border-white/20"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {grades.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {grades.map((g) => (
                  <span key={g} className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 text-[11px] text-[#4FC3F7]">
                    {g}
                    <button type="button" onClick={() => toggle(grades, setGrades, g)} aria-label={`Remove ${g}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Language */}
        {step === 2 && (
          <div className="space-y-3" data-testid="onboarding-step-language">
            <p className="text-sm text-foreground font-medium">What language should Vivran use with you?</p>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLanguage(l)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    language === l
                      ? "bg-[#7C6EFA]/15 border-[#7C6EFA] text-foreground"
                      : "bg-card border-border text-muted hover:border-white/20 hover:text-foreground"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            {language === "Other" && (
              <input
                value={customLanguage}
                onChange={(e) => setCustomLanguage(e.target.value)}
                placeholder="Type your preferred language…"
                autoFocus
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-[#7C6EFA]"
              />
            )}
          </div>
        )}

        {/* Step 4: Difficulty (optional bonus preference) */}
        {step === 3 && (
          <div className="space-y-3" data-testid="onboarding-step-difficulty">
            <p className="text-sm text-foreground font-medium">
              Default difficulty for tests &amp; quizzes <span className="text-muted font-normal">(optional)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTY_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDifficulty(d.value)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    difficulty === d.value
                      ? "bg-[#7C6EFA]/15 border-[#7C6EFA] text-foreground"
                      : "bg-card border-border text-muted hover:border-white/20 hover:text-foreground"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted">Used as a starting point when creating assessments — always editable per-creation.</p>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0 || saving}
            className="px-4 py-2 rounded-xl text-xs font-medium text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>

          <button
            type="button"
            onClick={() => logout()}
            className="text-[11px] text-muted hover:text-red-400 underline"
          >
            Sign out
          </button>

          <button
            type="button"
            onClick={goNext}
            disabled={!canAdvance || saving}
            className="grad-btn px-5 py-2.5 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
              </>
            ) : step < steps.length - 1 ? (
              <>
                Next <ArrowRight className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Finish Setup <Check className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
