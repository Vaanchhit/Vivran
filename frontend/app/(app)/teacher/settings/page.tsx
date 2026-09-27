"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, LogOut, Moon, Plus, Sun, X, ExternalLink } from "lucide-react";
import { BookLoader } from "@/app/components/book-loader";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { DIFFICULTY_OPTIONS, GRADE_LEVEL_OPTIONS, LANGUAGE_OPTIONS, SUBJECT_OPTIONS, WAITLIST_EMAIL } from "@/lib/constants";

function Section({ title, description, children, tone }: { title: string; description?: string; children: React.ReactNode; tone?: "danger" }) {
  return (
    <section className={`rounded-2xl bg-surface border ${tone === "danger" ? "border-danger-line" : "border-border"}`}>
      <div className="px-6 pt-5 pb-4 border-b border-border">
        <h2 className={`text-sm font-semibold ${tone === "danger" ? "text-danger" : "text-foreground"}`}>{title}</h2>
        {description && <p className="text-xs text-muted mt-1">{description}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid sm:grid-cols-[180px_1fr] gap-1 sm:gap-6 py-2.5 text-sm">
      <div className="text-muted text-xs sm:pt-0.5">{label}</div>
      <div className="text-foreground min-w-0">{children}</div>
    </div>
  );
}

function ChipPicker({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const all = [...options, ...value.filter((v) => !options.includes(v))];
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {all.map((o) => {
          const on = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                on ? "border-accent bg-accent-soft text-accent font-semibold" : "border-border bg-card text-muted hover:text-foreground"
              }`}
            >
              {on && <Check className="w-3 h-3" />}
              {o}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 max-w-sm">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-accent"
        />
        <button type="button" onClick={add} disabled={!draft.trim()} className="px-2.5 rounded-lg border border-border text-muted hover:text-foreground disabled:opacity-40" aria-label="Add">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, logout, deleteAccount, completeOnboarding } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [subjects, setSubjects] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [language, setLanguage] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  const [signingOut, setSigningOut] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setSubjects(user?.preferredSubjects ?? []);
    setGrades(user?.preferredGrades ?? []);
    setLanguage(user?.preferredLanguage ?? "English");
    setDifficulty(user?.preferredDifficulty ?? "medium");
  }, [user?.preferredSubjects, user?.preferredGrades, user?.preferredLanguage, user?.preferredDifficulty]);

  const dirty =
    JSON.stringify(subjects) !== JSON.stringify(user?.preferredSubjects ?? []) ||
    JSON.stringify(grades) !== JSON.stringify(user?.preferredGrades ?? []) ||
    language !== (user?.preferredLanguage ?? "English") ||
    difficulty !== (user?.preferredDifficulty ?? "medium");

  const savePreferences = async () => {
    setSaving(true);
    setSaveState("idle");
    const ok = await completeOnboarding({
      subjects,
      grades,
      preferred_language: language || undefined,
      preferred_difficulty: difficulty || undefined,
    });
    setSaving(false);
    setSaveState(ok ? "saved" : "error");
  };

  const signOut = async () => {
    setSigningOut(true);
    await logout();
    window.location.href = "/";
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    setDeleteError("");
    const ok = await deleteAccount();
    if (!ok) {
      setDeleting(false);
      setDeleteError(`Could not delete your account. Check your connection and try again, or contact ${WAITLIST_EMAIL}.`);
      return;
    }
    await logout();
    // A hard navigation: clearing the session also trips TeacherLayout's own
    // redirect to /login, and racing that against a client-side push is
    // unreliable. This is a one-off terminal redirect for an irreversible action.
    window.location.href = "/";
  };

  const initials = (user?.name || "T").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const languages = LANGUAGE_OPTIONS.filter((l) => l !== "Other");
  if (language && !languages.includes(language)) languages.push(language);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-extrabold font-display text-foreground">Settings</h1>
        <p className="text-sm text-muted mt-1">Your profile, teaching preferences and account.</p>
      </div>

      <Section title="Profile">
        <div className="flex items-center gap-3 pb-3">
          <div className="w-12 h-12 rounded-xl bg-accent-soft border border-accent-line flex items-center justify-center text-accent text-lg font-bold">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-foreground text-base truncate">{user?.name || "Teacher"}</div>
            <div className="text-xs text-muted truncate">{user?.email}</div>
          </div>
        </div>
        <Row label="Institution">{user?.school || <span className="text-muted">Not set</span>}</Row>
        <Row label="Role"><span className="capitalize">{user?.role || "teacher"}</span></Row>
      </Section>

      <Section title="Teaching preferences" description="Used as defaults when you create plans, slides and papers. You can still change them per request.">
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="text-xs font-medium text-foreground">Subjects</div>
            <ChipPicker options={SUBJECT_OPTIONS} value={subjects} onChange={setSubjects} placeholder="Add another subject" />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-foreground">Grade levels</div>
            <ChipPicker options={GRADE_LEVEL_OPTIONS} value={grades} onChange={setGrades} placeholder="Add another grade or year" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-foreground">Language</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground">
                {languages.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-foreground">Default difficulty</span>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground">
                {DIFFICULTY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={savePreferences}
              disabled={!dirty || saving || !subjects.length || !grades.length}
              className="btn-primary px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <BookLoader className="w-3.5 h-3.5" />}
              {saving ? "Saving…" : "Save preferences"}
            </button>
            {saveState === "saved" && !dirty && <span className="text-xs text-success flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Saved</span>}
            {saveState === "error" && <span className="text-xs text-danger">Could not save. Please try again.</span>}
            {(!subjects.length || !grades.length) && <span className="text-xs text-muted">Pick at least one subject and grade.</span>}
          </div>
        </div>
      </Section>

      <Section title="Appearance">
        <div className="inline-flex rounded-xl border border-border p-1 bg-card" role="radiogroup" aria-label="Theme">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              onClick={() => theme !== t && toggleTheme()}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                theme === t ? "bg-surface text-foreground border border-border" : "text-muted hover:text-foreground border border-transparent"
              }`}
            >
              {t === "light" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {t === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Account">
        <Row label="Signed in as">{user?.email}</Row>
        <div className="pt-3">
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-card flex items-center gap-2 disabled:opacity-50"
          >
            {signingOut ? <BookLoader className="w-3.5 h-3.5" /> : <LogOut className="w-3.5 h-3.5" />}
            Sign out
          </button>
        </div>
      </Section>

      <Section title="Privacy & legal">
        <div className="flex flex-col gap-2.5 text-sm">
          <Link href="/privacy" className="text-foreground hover:text-accent inline-flex items-center gap-1.5 w-fit">Privacy policy <ExternalLink className="w-3 h-3" /></Link>
          <Link href="/terms" className="text-foreground hover:text-accent inline-flex items-center gap-1.5 w-fit">Terms &amp; conditions <ExternalLink className="w-3 h-3" /></Link>
          <a href={`mailto:${WAITLIST_EMAIL}`} className="text-foreground hover:text-accent w-fit">Contact support — {WAITLIST_EMAIL}</a>
        </div>
      </Section>

      <Section tone="danger" title="Delete account" description="Permanently removes your profile, workspace, uploaded files and everything you've created. This cannot be undone.">
        <div className="space-y-3 max-w-md">
          <label className="block space-y-1.5">
            <span className="text-xs text-muted">Type <b className="text-foreground">DELETE</b> to confirm</span>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-danger"
            />
          </label>
          {deleteError && <div className="p-3 rounded-xl bg-danger-soft border border-danger-line text-danger text-xs flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{deleteError}</div>}
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={deleting || confirmText !== "DELETE"}
            className="px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-line text-danger text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {deleting ? <><BookLoader className="w-3.5 h-3.5" /> Deleting account…</> : <><X className="w-3.5 h-3.5" /> Delete my account</>}
          </button>
        </div>
      </Section>
    </div>
  );
}
