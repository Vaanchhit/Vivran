"use client";

// My sources: everything a teacher gives Vivran, in one place.
//
//   Files   one upload that can do two jobs. FACTS: the file is searchable, so
//           generated work cites its pages. STYLE: if it is a paper, deck or
//           lesson plan the teacher made, Vivran learns its layout (nothing is
//           used until they accept it). Each row says which jobs it does.
//   Style   the patterns learned from those files, to accept or decline.
//   Habits  patterns learned from what the teacher asks for, and those requests.
//
// Style never overrides facts: it shapes the container (sections, marks,
// length), the sources fill it.
import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle, BookOpenCheck, CheckCircle2, FileText, FolderOpen, Link2, PenLine, RotateCcw, Sparkles, Trash2, Upload, XCircle, Youtube,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { BookLoader } from "@/app/components/book-loader";
import { TraitCard } from "@/app/components/trait-card";
import { PREFILL_KEY } from "@/app/components/ask-vivran";
import { SUBJECT_OPTIONS } from "@/lib/constants";
import { getLiveValue, noticeIfAway, setLiveValue, useLeaveWarning, useLiveState, useOnScreen } from "@/lib/tab-state";
import {
  addSource, clearRecentPrompts, decideStyleTrait, deleteRecentPrompt, deleteSource, forgetTeachingMemory, getRecentPrompts,
  getTeachingMemory, listSources, stopLearningStyle, type RecentPrompt, type Source, type StyleTrait,
} from "@/services/api";

type Tab = "files" | "style" | "habits";
type Result = { name: string; ok: boolean; lines: string[] };

const UPLOADING = "sources:uploading";
const VERSION = "sources:version";
const KIND_LABEL: Record<string, string> = { exam_paper: "exam paper", worksheet: "worksheet", slides: "slide deck", lesson_plan: "lesson plan", notes: "notes" };
const STATUS_ORDER: StyleTrait["status"][] = ["active", "suggested", "stale"];
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function inferType(filename: string): "pdf" | "docx" | "pptx" | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext === "pdf" || ext === "docx" || ext === "pptx" ? ext : null;
}

export default function SourcesPage() {
  return (
    <Suspense fallback={null}>
      <Sources />
    </Suspense>
  );
}

function Sources() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = (params.get("tab") as Tab) || "files";
  const [tab, setTab] = useState<Tab>(["files", "style", "habits"].includes(initial) ? initial : "files");

  const [sources, setSources] = useState<Source[] | null>(null);
  const [traits, setTraits] = useState<StyleTrait[]>([]);
  const [prompts, setPrompts] = useState<RecentPrompt[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyTrait, setBusyTrait] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);

  // upload options
  const [subject, setSubject] = useState("");
  const [useForFacts, setUseForFacts] = useState(true);
  const [learnStyle, setLearnStyle] = useState<"auto" | "yes" | "no">("auto");
  const [ownWork, setOwnWork] = useState(true);
  const [noStudentData, setNoStudentData] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  const [uploading] = useLiveState<string | null>(UPLOADING, null);
  const [version] = useLiveState(VERSION, 0);
  useOnScreen("sources");
  useLeaveWarning(!!uploading, "Your file is still uploading. Leaving now will stop it.", { links: false });

  const refresh = useCallback(() => {
    listSources()
      .then((r) => { setSources(r.sources); setLoadError(null); })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load your sources."));
    getTeachingMemory().then((m) => setTraits(m.traits)).catch(() => undefined);
    getRecentPrompts().then((r) => setPrompts(r.prompts)).catch(() => undefined);
  }, []);
  useEffect(() => { refresh(); }, [refresh, version]);

  const switchTab = (t: Tab) => {
    setTab(t);
    router.replace(`/teacher/materials${t === "files" ? "" : `?tab=${t}`}`, { scroll: false });
  };

  const upload = async (items: { name: string; type: "pdf" | "docx" | "pptx" | "youtube"; file?: File; url?: string }[]) => {
    if (!items.length || getLiveValue(UPLOADING, null)) return;
    if (!noStudentData) {
      setResults([{ name: "", ok: false, lines: ["Please confirm there is no student work or student names in these files."] }]);
      return;
    }
    if (!useForFacts && learnStyle === "no") {
      setResults([{ name: "", ok: false, lines: ["Choose at least one: use for facts, or learn my style."] }]);
      return;
    }
    const out: Result[] = [];
    for (const it of items) {
      setLiveValue<string | null>(UPLOADING, it.name, null);
      try {
        const r = await addSource({
          title: it.name.replace(/\.(pdf|docx|pptx)$/i, ""), type: it.type, file: it.file, externalUrl: it.url,
          subject: subject || undefined, useForFacts, learnStyle, authoredByMe: ownWork, confirmNoStudentData: true,
        });
        out.push({ name: it.name, ok: true, lines: [
          r.facts.used ? "Facts: searchable, so new work can cite its pages." : `Facts: not used. ${r.facts.reason}`,
          r.style.learned ? `Style: read as ${KIND_LABEL[r.style.kind ?? "notes"]}. Check the Style tab to accept what it found.` : `Style: ${r.style.reason}`,
        ] });
      } catch (err) {
        out.push({ name: it.name, ok: false, lines: [err instanceof Error ? err.message : "Could not add this file."] });
      }
      setResults([...out]);
    }
    setLiveValue<string | null>(UPLOADING, null, null);
    setLiveValue(VERSION, (v: number) => v + 1, 0);
    noticeIfAway("sources", { tone: out.every((o) => o.ok) ? "success" : "error", message: `${out.filter((o) => o.ok).length} of ${out.length} file(s) added to your sources.`, href: "/teacher/materials", linkLabel: "See sources" });
  };

  const onFiles = (files: File[]) => {
    const ok = files.map((f) => ({ f, t: inferType(f.name) }));
    const bad = ok.filter((x) => !x.t);
    if (bad.length) setResults(bad.map((b) => ({ name: b.f.name, ok: false, lines: ["Use a PDF, Word (.docx) or PowerPoint (.pptx) file."] })));
    upload(ok.filter((x) => x.t).map((x) => ({ name: x.f.name, type: x.t!, file: x.f })));
  };

  const remove = async (s: Source) => {
    const what = s.facts && s.style ? "its search index and the style learned from it" : s.facts ? "its search index" : "the style learned from it";
    if (!window.confirm(`Remove "${s.title}"? This also removes ${what}.`)) return;
    await deleteSource(s.id).catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't remove that."));
    refresh();
  };
  const stopStyle = async (s: Source) => {
    if (!window.confirm(`Stop learning style from "${s.title}"? It stays searchable for facts.`)) return;
    await stopLearningStyle(s.id).catch(() => undefined);
    refresh();
  };

  const decide = async (trait: StyleTrait, action: "use" | "dismiss") => {
    setBusyTrait(trait.id);
    try { await decideStyleTrait(trait.id, action); refresh(); }
    catch (err) { setLoadError(err instanceof Error ? err.message : "That didn't save. Please try again."); }
    finally { setBusyTrait(null); }
  };

  const visible = traits.filter((t) => t.status !== "dismissed");
  const dismissed = traits.filter((t) => t.status === "dismissed");
  const habits = visible.filter((t) => t.kind === "profile");
  const styleTraits = visible.filter((t) => t.kind !== "profile");
  const styleSubjects = Array.from(new Set(styleTraits.map((t) => t.subject)));
  const counts = useMemo(() => ({
    facts: sources?.filter((s) => s.facts?.status === "READY").length ?? 0,
    style: sources?.filter((s) => s.style).length ?? 0,
    pending: traits.filter((t) => t.status === "suggested").length,
    inUse: traits.filter((t) => t.status === "active").length,
  }), [sources, traits]);

  const sortByStatus = (a: StyleTrait, b: StyleTrait) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="border-b border-border pb-5">
        <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
          <FolderOpen className="w-6 h-6 text-accent" /> My sources
        </h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Add a file once. Vivran uses it for <strong className="text-foreground">facts</strong> (new work cites its
          pages) and, if it&rsquo;s a paper, deck or lesson plan you made, learns your <strong className="text-foreground">style</strong>.
          Style only shapes the format. The facts always come from your sources.
        </p>
        <div className="flex flex-wrap gap-2 mt-4 text-xs">
          <Stat icon={<BookOpenCheck className="w-3.5 h-3.5" />} label={`${counts.facts} used for facts`} />
          <Stat icon={<PenLine className="w-3.5 h-3.5" />} label={`${counts.style} teaching your style`} />
          <Stat icon={<Sparkles className="w-3.5 h-3.5" />} label={`${counts.inUse} pattern${counts.inUse === 1 ? "" : "s"} in use${counts.pending ? ` · ${counts.pending} to review` : ""}`} highlight={counts.pending > 0} />
        </div>
      </div>

      {loadError && (
        <div className="p-3 bg-danger-soft border border-danger-line rounded-xl flex items-center gap-2 text-xs text-danger">
          <AlertCircle className="w-4 h-4 shrink-0" /> {loadError}
        </div>
      )}

      <div role="tablist" className="flex gap-1 p-1 rounded-xl bg-card border border-border w-full sm:w-fit">
        {([["files", "Files"], ["style", `Style${counts.pending ? ` (${counts.pending})` : ""}`], ["habits", "Habits"]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => switchTab(id)}
            className={`relative flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === id ? "text-foreground" : "text-muted hover:text-foreground"}`}>
            {tab === id && <motion.span layoutId="sources-tab" className="absolute inset-0 rounded-lg bg-surface shadow-sm border border-border" transition={{ type: "spring", damping: 30, stiffness: 380 }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {tab === "files" && (
        <>
          <section className="p-5 rounded-2xl bg-surface border border-border space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(Array.from(e.dataTransfer.files ?? [])); }}
              className={`p-6 rounded-xl border-2 border-dashed flex flex-col items-center text-center gap-2 transition-colors ${dragOver ? "border-accent bg-accent-soft" : "border-border bg-card"} ${!noStudentData ? "opacity-70" : ""}`}
            >
              <div className="p-2.5 rounded-full bg-accent-soft text-accent">{uploading ? <BookLoader className="w-5 h-5" /> : <Upload className="w-5 h-5" />}</div>
              <div className="text-sm font-semibold text-foreground">
                {uploading ? `Adding "${uploading}"… you can keep working elsewhere.` : "Drop textbooks, notes, past papers or decks"}
              </div>
              <label className={`text-xs ${noStudentData && !uploading ? "text-accent cursor-pointer hover:underline" : "text-faint cursor-not-allowed"}`}>
                or choose files
                <input type="file" multiple accept=".pdf,.docx,.pptx" className="hidden" disabled={!noStudentData || !!uploading}
                  onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; onFiles(f); }} />
              </label>
              <div className="flex items-center gap-2 pt-1 w-full max-w-md">
                <Youtube className="w-4 h-4 text-muted shrink-0" />
                <input type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="Or paste a YouTube link (facts only)"
                  className="flex-1 min-w-0 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-foreground placeholder:text-faint focus:outline-none focus:border-accent" />
                <button type="button" disabled={!!uploading || !youtubeUrl.trim()}
                  onClick={() => { const u = youtubeUrl.trim(); upload([{ name: u, type: "youtube", url: u }]); setYoutubeUrl(""); }}
                  className="px-3 py-2 btn-primary text-xs font-semibold rounded-lg disabled:opacity-50">Add</button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <label className="space-y-1.5 text-muted">
                <span className="block">Subject (helps Vivran file it)</span>
                <select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground">
                  <option value="">Any subject</option>
                  {SUBJECT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-muted">
                <span className="block">Use for facts</span>
                <select value={useForFacts ? "yes" : "no"} onChange={(e) => setUseForFacts(e.target.value === "yes")} className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground">
                  <option value="yes">Yes, make it searchable</option>
                  <option value="no">No, style only</option>
                </select>
              </label>
              <label className="space-y-1.5 text-muted">
                <span className="block">Learn my style</span>
                <select value={learnStyle} onChange={(e) => setLearnStyle(e.target.value as "auto" | "yes" | "no")} className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground">
                  <option value="auto">When it&rsquo;s a paper, deck or lesson plan</option>
                  <option value="yes">Always</option>
                  <option value="no">Never</option>
                </select>
              </label>
            </div>
            <div className="space-y-2 text-xs">
              <label className="flex items-start gap-2.5 text-foreground cursor-pointer">
                <input type="checkbox" checked={ownWork} onChange={(e) => setOwnWork(e.target.checked)} className="mt-0.5" />
                <span>I (or my department) made these. <span className="text-muted">Board papers and other people&rsquo;s files are used for facts but don&rsquo;t teach your style.</span></span>
              </label>
              <label className="flex items-start gap-2.5 text-foreground cursor-pointer">
                <input type="checkbox" checked={noStudentData} onChange={(e) => setNoStudentData(e.target.checked)} className="mt-0.5" />
                <span>No student work and no student names in these files. <span className="text-muted">Required. See the <Link href="/terms" className="underline">terms</Link>.</span></span>
              </label>
            </div>

            {results.length > 0 && (
              <ul className="space-y-2 text-xs">
                {results.map((r, i) => (
                  <li key={i} className={`flex items-start gap-2 ${r.ok ? "text-foreground" : "text-danger"}`}>
                    {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-success shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                    <span>{r.name && <span className="font-medium">{r.name}</span>}{r.lines.map((l, j) => <span key={j} className="block text-muted">{l}</span>)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-muted leading-relaxed">
              For facts, the file is stored privately and its text is indexed. For style, Vivran keeps only what it read
              (structure, marks, short excerpts with names redacted), and that never goes to an AI model; when you use a
              pattern, only its description does.
            </p>
          </section>

          <section className="space-y-2">
            {sources === null && !loadError && <div className="flex items-center gap-2 text-xs text-muted"><BookLoader className="w-4 h-4" /> Loading your sources…</div>}
            {sources?.length === 0 && (
              <div className="p-4 rounded-xl bg-card border border-border text-xs text-muted">
                Nothing here yet. Start with the chapter you&rsquo;re teaching next, and one paper you set last term.
              </div>
            )}
            <AnimatePresence initial={false}>
            {sources?.map((s, i) => (
              <motion.div key={s.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.03 } }}
                exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.18 } }} className="p-3.5 rounded-xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-3 min-w-0">
                  {s.type === "youtube" ? <Link2 className="w-4 h-4 text-chrome shrink-0 mt-0.5" /> : <FileText className="w-4 h-4 text-chrome shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground truncate">{s.title}</div>
                    <div className="text-muted text-[11px] mt-0.5">{[s.type?.toUpperCase(), s.subject && titleCase(s.subject), s.grade].filter(Boolean).join(" · ")}</div>
                    {s.style?.status === "needs_review" && s.style.reason && <div className="text-warning text-[11px] mt-1">{s.style.reason}</div>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <JobChip on={!!s.facts} label={s.facts?.status === "PROCESSING" ? "Facts: indexing" : s.facts?.status === "FAILED" ? "Facts: failed" : `Facts${s.facts?.chunks ? ` · ${s.facts.chunks} passages` : ""}`}
                    tone={s.facts?.status === "PROCESSING" ? "warning" : s.facts?.status === "FAILED" ? "danger" : "success"}
                    busy={s.facts?.status === "PROCESSING"} />
                  <JobChip on={!!s.style} label={s.style ? `Style · ${KIND_LABEL[s.style.kind] ?? s.style.kind}` : "Style"} tone="accent" />
                  {s.facts && s.style && (
                    <button type="button" onClick={() => stopStyle(s)} className="px-2 py-1 rounded-lg text-muted hover:text-foreground">Stop style</button>
                  )}
                  <button type="button" onClick={() => remove(s)} aria-label={`Remove ${s.title}`} className="p-1.5 rounded-lg text-muted hover:text-danger"><Trash2 className="w-4 h-4" /></button>
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
          </section>
        </>
      )}

      {tab === "style" && (
        <section className="space-y-4">
          <p className="text-xs text-muted max-w-2xl">Patterns from papers, decks and lesson plans you added. Accept one and new work uses it; decline and it stays quiet.</p>
          {styleTraits.length === 0 && (
            <div className="p-4 rounded-xl bg-card border border-border text-xs text-muted">
              Add two or more papers from the same subject on the Files tab, and how you build them shows up here.
            </div>
          )}
          {styleSubjects.map((subj) => (
            <div key={subj || "any"} className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{subj ? titleCase(subj) : "Any subject"}</div>
              {styleTraits.filter((t) => t.subject === subj).sort(sortByStatus).map((t) => <TraitCard key={t.id} trait={t} busy={busyTrait === t.id} onDecide={decide} />)}
            </div>
          ))}
          {dismissed.length > 0 && (
            <div className="text-xs">
              <button type="button" onClick={() => setShowDismissed((v) => !v)} className="text-muted hover:text-foreground">
                {showDismissed ? "Hide" : "Show"} what you said no to ({dismissed.length})
              </button>
              {showDismissed && <div className="mt-2 space-y-2">{dismissed.map((t) => <TraitCard key={t.id} trait={t} busy={busyTrait === t.id} onDecide={decide} />)}</div>}
            </div>
          )}
          {traits.length > 0 && (
            <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-muted">Forget every learned pattern and request. Your files stay for facts.</span>
              <button type="button" className="px-3 py-1.5 rounded-lg border border-danger-line text-danger hover:bg-danger-soft"
                onClick={async () => {
                  if (!window.confirm("Forget everything Vivran learned about your style and habits? This can't be undone.")) return;
                  await forgetTeachingMemory().catch(() => undefined);
                  refresh();
                }}>Forget my style</button>
            </div>
          )}
        </section>
      )}

      {tab === "habits" && (
        <section className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs text-muted max-w-2xl">Learned from what you ask for: the marks you set, the class you teach, how long your decks are. Nothing is used until you accept it.</p>
            {habits.length === 0 && <div className="p-4 rounded-xl bg-card border border-border text-xs text-muted">Keep using Vivran and your habits show up here.</div>}
            {habits.sort(sortByStatus).map((t) => <TraitCard key={t.id} trait={t} busy={busyTrait === t.id} onDecide={decide} />)}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-foreground font-display">Your recent requests</div>
              {prompts.length > 0 && (
                <button type="button" className="text-xs text-muted hover:text-danger" onClick={async () => {
                  if (!window.confirm("Remove every request Vivran has kept? Habits learned from them are recalculated without them.")) return;
                  await clearRecentPrompts().catch(() => undefined); refresh();
                }}>Remove all</button>
              )}
            </div>
            {prompts.length === 0 && <div className="text-xs text-muted">Requests you type on Home appear here. Emails, phone numbers and links are removed before anything is kept.</div>}
            {prompts.map((p) => (
              <div key={p.id} className="p-3.5 rounded-xl bg-surface border border-border flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="text-foreground leading-relaxed">{p.text}</div>
                  <div className="text-muted text-[11px] mt-0.5">{[p.grade, p.subject && titleCase(p.subject)].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => { try { localStorage.setItem(PREFILL_KEY, p.text); } catch {} router.push("/teacher"); }}
                    className="px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground hover:border-accent-line inline-flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" /> Reuse
                  </button>
                  <button type="button" onClick={async () => { await deleteRecentPrompt(p.id).catch(() => undefined); refresh(); }} aria-label="Remove this request" className="p-1.5 rounded-lg text-muted hover:text-danger">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ icon, label, highlight }: { icon: React.ReactNode; label: string; highlight?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${highlight ? "bg-accent-soft border-accent-line text-accent" : "bg-card border-border text-muted"}`}>
      {icon} {label}
    </span>
  );
}

function JobChip({ on, label, tone, busy }: { on: boolean; label: string; tone: "success" | "accent" | "warning" | "danger"; busy?: boolean }) {
  const cls = !on ? "text-faint bg-card border-border line-through decoration-faint/50"
    : tone === "success" ? "text-success bg-success-soft border-success-line"
    : tone === "warning" ? "text-warning bg-warning-soft border-warning-line"
    : tone === "danger" ? "text-danger bg-danger-soft border-danger-line"
    : "text-accent bg-accent-soft border-accent-line";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-medium ${cls}`}>
      {busy && <BookLoader className="w-3 h-3" />}
      {label}
    </span>
  );
}
