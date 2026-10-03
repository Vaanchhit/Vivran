"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, FileText, PenLine, Trash2, Upload, XCircle } from "lucide-react";
import { BookLoader } from "@/app/components/book-loader";
import {
  decideStyleTrait,
  deleteHistoryDocument,
  forgetTeachingMemory,
  getTeachingMemory,
  uploadHistoryDocument,
  type HistoryDocument,
  type HistoryKind,
  type StyleTrait,
} from "@/services/api";
import { SUBJECT_OPTIONS } from "@/lib/constants";

const KIND_OPTIONS: { value: HistoryKind | "auto"; label: string }[] = [
  { value: "auto", label: "Work it out for me" },
  { value: "exam_paper", label: "Exam paper" },
  { value: "worksheet", label: "Worksheet" },
  { value: "slides", label: "Slides" },
  { value: "lesson_plan", label: "Lesson plan" },
  { value: "notes", label: "Notes" },
];

const STATUS_ORDER: StyleTrait["status"][] = ["active", "suggested", "stale"];

type UploadResult = { name: string; ok: boolean; message: string };

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function facts(doc: HistoryDocument) {
  const parts = [doc.kind_label];
  if (doc.subject) parts.push(titleCase(doc.subject));
  if (doc.question_count) parts.push(`${doc.question_count} questions`);
  if (doc.total_marks) parts.push(`${doc.total_marks} marks`);
  if (doc.duration_minutes) parts.push(`${doc.duration_minutes} min`);
  if (doc.slide_count) parts.push(`${doc.slide_count} slides`);
  if (!doc.authored_by_me) parts.push("not counted: not your own");
  return parts.join(" · ");
}

export default function TeachingStylePage() {
  const [documents, setDocuments] = useState<HistoryDocument[] | null>(null);
  const [traits, setTraits] = useState<StyleTrait[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [kind, setKind] = useState<HistoryKind | "auto">("auto");
  const [ownWork, setOwnWork] = useState(true);
  const [noStudentData, setNoStudentData] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [busyTrait, setBusyTrait] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);

  const refresh = useCallback(() => {
    getTeachingMemory()
      .then((m) => {
        setDocuments(m.documents);
        setTraits(m.traits);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load your teaching style."));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadFiles = async (files: File[]) => {
    if (!files.length || uploading) return;
    if (!noStudentData) {
      setResults([{ name: "", ok: false, message: "Please confirm there is no student work or student names in these files." }]);
      return;
    }
    const out: UploadResult[] = [];
    for (const file of files) {
      setUploading(file.name);
      try {
        const doc = await uploadHistoryDocument({ file, subject: subject || undefined, kind, authoredByMe: ownWork, confirmNoStudentData: true });
        out.push({
          name: file.name,
          ok: true,
          message: doc.status === "ready" ? `Read as ${doc.kind_label.toLowerCase()}.` : doc.status_reason || "Kept, but not used yet.",
        });
      } catch (err) {
        out.push({ name: file.name, ok: false, message: err instanceof Error ? err.message : "Could not read this file." });
      }
      setResults([...out]);
    }
    setUploading(null);
    refresh();
  };

  const decide = async (trait: StyleTrait, action: "use" | "dismiss") => {
    setBusyTrait(trait.id);
    try {
      await decideStyleTrait(trait.id, action);
      refresh();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "That didn't save. Please try again.");
    } finally {
      setBusyTrait(null);
    }
  };

  const removeDocument = async (doc: HistoryDocument) => {
    if (!window.confirm(`Remove "${doc.title}"? What Vivran learned from it is recalculated without it.`)) return;
    await deleteHistoryDocument(doc.id).catch(() => undefined);
    refresh();
  };

  const forgetAll = async () => {
    if (!window.confirm("Forget everything Vivran learned about your teaching style? This removes every file's record and every pattern, and can't be undone.")) return;
    await forgetTeachingMemory().catch(() => undefined);
    setResults([]);
    refresh();
  };

  const visible = traits.filter((t) => t.status !== "dismissed");
  const dismissed = traits.filter((t) => t.status === "dismissed");
  const subjects = Array.from(new Set(visible.map((t) => t.subject)));

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
          <PenLine className="w-6 h-6 text-accent" /> Your teaching style
        </h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Add papers you&rsquo;ve set before. Vivran reads how they&rsquo;re built (sections, marks, the kind of thinking each
          question asks for) and suggests what to keep. Nothing is used until you say so, and it only ever shapes the
          format of a new paper, never its facts.
        </p>
      </div>

      {loadError && (
        <div className="p-3 bg-danger-soft border border-danger-line rounded-xl flex items-center gap-2 text-xs text-danger">
          <AlertCircle className="w-4 h-4 shrink-0" /> {loadError}
        </div>
      )}

      {/* Upload */}
      <section className="p-5 rounded-2xl bg-surface border border-border space-y-4">
        <div className="text-sm font-bold text-foreground font-display">Add past papers</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-muted space-y-1.5">
            <span className="block">Subject</span>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground">
              <option value="">Choose a subject</option>
              {SUBJECT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted space-y-1.5">
            <span className="block">What are these?</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as HistoryKind | "auto")} className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground">
              {KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
        </div>

        <div className="space-y-2 text-xs">
          <label className="flex items-start gap-2.5 text-foreground cursor-pointer">
            <input type="checkbox" checked={ownWork} onChange={(e) => setOwnWork(e.target.checked)} className="mt-0.5" />
            <span>These are my own papers (or my department&rsquo;s). <span className="text-muted">Board papers and other people&rsquo;s papers are kept but don&rsquo;t count towards your style.</span></span>
          </label>
          <label className="flex items-start gap-2.5 text-foreground cursor-pointer">
            <input type="checkbox" checked={noStudentData} onChange={(e) => setNoStudentData(e.target.checked)} className="mt-0.5" />
            <span>
              There is no student work and no student names in these files.{" "}
              <span className="text-muted">Blank papers and answer keys only. See the <Link href="/terms" className="underline">terms</Link>.</span>
            </span>
          </label>
        </div>

        <label
          className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed text-center ${
            noStudentData && !uploading ? "border-border bg-card cursor-pointer hover:border-accent-line" : "border-border bg-card opacity-60 cursor-not-allowed"
          }`}
        >
          <div className="p-2.5 rounded-full bg-accent-soft text-accent">
            {uploading ? <BookLoader className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
          </div>
          <div className="text-sm font-semibold text-foreground">
            {uploading ? `Reading "${uploading}"…` : "Choose PDF, Word or PowerPoint files"}
          </div>
          <div className="text-[11px] text-muted">Typed files only for now; scans and photos can&rsquo;t be read yet.</div>
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.pptx"
            className="hidden"
            disabled={!noStudentData || !!uploading}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              uploadFiles(files);
            }}
          />
        </label>

        {results.length > 0 && (
          <ul className="space-y-1.5 text-xs">
            {results.map((r, i) => (
              <li key={i} className={`flex items-start gap-2 ${r.ok ? "text-foreground" : "text-danger"}`}>
                {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-success shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                <span>{r.name && <span className="font-medium">{r.name}: </span>}{r.message}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-muted leading-relaxed">
          Your files aren&rsquo;t kept. Vivran keeps what it read from them (structure, marks and short question excerpts,
          with any names redacted). Neither the files nor the excerpts go to an AI model; when you use a pattern, only
          its description does, as part of the request for a new paper.
        </p>
      </section>

      {/* What Vivran noticed */}
      <section className="space-y-4">
        <div className="text-sm font-bold text-foreground font-display">What Vivran noticed</div>
        {documents !== null && visible.length === 0 && (
          <div className="p-4 rounded-xl bg-card border border-border text-xs text-muted">
            Add at least two exam papers from the same subject. One paper is a document; two start to show a habit.
          </div>
        )}
        {subjects.map((subj) => (
          <div key={subj || "any"} className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {subj ? `${titleCase(subj)} papers` : "Papers with no subject"}
            </div>
            {visible
              .filter((t) => t.subject === subj)
              .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
              .map((t) => (
                <TraitCard key={t.id} trait={t} busy={busyTrait === t.id} onDecide={decide} />
              ))}
          </div>
        ))}
        {dismissed.length > 0 && (
          <div className="text-xs">
            <button type="button" onClick={() => setShowDismissed((v) => !v)} className="text-muted hover:text-foreground">
              {showDismissed ? "Hide" : "Show"} what you said no to ({dismissed.length})
            </button>
            {showDismissed && (
              <div className="mt-2 space-y-2">
                {dismissed.map((t) => <TraitCard key={t.id} trait={t} busy={busyTrait === t.id} onDecide={decide} />)}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Files */}
      <section className="space-y-3">
        <div className="text-sm font-bold text-foreground font-display">Your files</div>
        {documents === null && !loadError && <div className="text-xs text-muted">Loading…</div>}
        {documents?.length === 0 && <div className="text-xs text-muted">Nothing added yet.</div>}
        <div className="space-y-2">
          {documents?.map((doc) => (
            <div key={doc.id} className="p-3.5 rounded-xl bg-surface border border-border flex items-start justify-between gap-3 text-xs">
              <div className="flex items-start gap-3 min-w-0">
                <FileText className="w-4 h-4 text-chrome shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-foreground truncate">{doc.title}</div>
                  <div className="text-muted text-[11px] mt-0.5">{facts(doc)}</div>
                  {doc.status === "needs_review" && doc.status_reason && (
                    <div className="text-warning text-[11px] mt-1">{doc.status_reason}</div>
                  )}
                </div>
              </div>
              <button type="button" onClick={() => removeDocument(doc)} aria-label={`Remove ${doc.title}`} className="p-1.5 rounded-lg text-muted hover:text-danger shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {(documents?.length ?? 0) > 0 && (
        <section className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-muted">Remove every file record and every pattern Vivran found.</span>
          <button type="button" onClick={forgetAll} className="px-3 py-1.5 rounded-lg border border-danger-line text-danger hover:bg-danger-soft">
            Forget everything
          </button>
        </section>
      )}
    </div>
  );
}

function TraitCard({ trait, busy, onDecide }: { trait: StyleTrait; busy: boolean; onDecide: (t: StyleTrait, a: "use" | "dismiss") => void }) {
  const chip = {
    active: { label: "In use", cls: "text-success bg-success-soft border-success-line" },
    suggested: { label: "Suggested", cls: "text-chrome bg-chrome-soft border-chrome-line" },
    stale: { label: "Files removed", cls: "text-warning bg-warning-soft border-warning-line" },
    dismissed: { label: "Not used", cls: "text-muted bg-card border-border" },
  }[trait.status];

  return (
    <div className={`p-4 rounded-xl border text-xs space-y-2.5 ${trait.status === "active" ? "bg-surface border-accent-line" : "bg-surface border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-foreground leading-relaxed">{trait.summary}</p>
        <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[10.5px] font-medium ${chip.cls}`}>{chip.label}</span>
      </div>

      {trait.evidence.length > 0 && (
        <details className="text-muted">
          <summary className="cursor-pointer select-none">Based on {trait.n_evidence} of your {trait.n_documents} papers</summary>
          <ul className="mt-1.5 pl-4 list-disc space-y-0.5">
            {trait.evidence.map((e) => <li key={e.document_id}>{e.title}</li>)}
          </ul>
        </details>
      )}
      {trait.status === "stale" && (
        <div className="text-muted">The files this came from were removed, so it isn&rsquo;t being used.</div>
      )}
      {trait.status === "active" && trait.update && (
        <div className="p-2.5 rounded-lg bg-card border border-border text-muted">
          Your newer files suggest something different: <span className="text-foreground">{trait.update}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {busy && <BookLoader className="w-3.5 h-3.5" />}
        {(trait.status === "suggested" || trait.status === "dismissed") && (
          <button type="button" disabled={busy} onClick={() => onDecide(trait, "use")} className="px-3 py-1.5 rounded-lg btn-primary font-semibold disabled:opacity-50">
            Use this
          </button>
        )}
        {trait.status === "active" && trait.update && (
          <button type="button" disabled={busy} onClick={() => onDecide(trait, "use")} className="px-3 py-1.5 rounded-lg btn-primary font-semibold disabled:opacity-50">
            Use the newer pattern
          </button>
        )}
        {trait.status === "stale" && (
          <button type="button" disabled={busy} onClick={() => onDecide(trait, "use")} className="px-3 py-1.5 rounded-lg border border-border bg-card text-foreground disabled:opacity-50">
            Keep using it
          </button>
        )}
        {trait.status !== "dismissed" && (
          <button type="button" disabled={busy} onClick={() => onDecide(trait, "dismiss")} className="px-3 py-1.5 rounded-lg border border-border bg-card text-muted hover:text-foreground disabled:opacity-50">
            {trait.status === "active" ? "Stop using" : "Not for me"}
          </button>
        )}
      </div>
    </div>
  );
}
