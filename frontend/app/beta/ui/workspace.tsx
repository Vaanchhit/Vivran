"use client";
// The teacher's own material: the Library (everything made), My sources (files
// Vivran reads) and Teaching memory (what it has learned, as a 3D map). All
// three read the real backend: /api/library, /api/sources and /api/memory.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Loader2, Minus, Pause, Play, Plus, RotateCcw, Search, Trash2, Upload, X } from "lucide-react";
import {
  addSource, decideStyleTrait, deleteSource, getTeachingMemory, listLibrary, listSources,
  type LibraryEntry, type Source as SourceRow, type StyleTrait,
} from "@/services/api";
import { KIND_LABEL, KIND_ONE, TRAIT_STATUS, classOf, library, memoryGraph, type GNode, type ItemKind, type LibraryItem, type NodeKind } from "../lib/memory";
import type { ActiveSource } from "../lib/live";
import { Icon } from "./kit";
import { KIND_COLOUR, MemoryGraph, type GraphHandle } from "./graph";

const KIND_ICON: Record<ItemKind, string> = {
  Slides: "slides", Paper: "paper", Worksheet: "list", Explanation: "bulb", Plan: "calendar",
  Notes: "doc", Activity: "spark", Audio: "mic", Image: "spark", Video: "slides",
};
const ago = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d < 1) { const h = Math.floor((Date.now() - t) / 3600000); return h < 1 ? "Just now" : `${h} h ago`; }
  return d === 1 ? "Yesterday" : d < 7 ? `${d} days ago` : new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};
const errText = (e: unknown) => (e instanceof Error ? e.message : "Couldn't load this just now.");

function Field({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="vv-field flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 focus-within:border-accent-line">
      <Search className="w-3.5 h-3.5 text-faint" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-36 sm:w-44 bg-transparent text-[13px] outline-none text-foreground placeholder:text-faint" />
      {value && <button type="button" aria-label="Clear" onClick={() => onChange("")}><X className="w-3.5 h-3.5 text-muted" /></button>}
    </label>
  );
}

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-full text-[12.5px] border transition-colors ${on ? "bg-ink text-ink-fg border-transparent" : "border-border text-muted hover:text-foreground"}`}>{children}</button>
);

function State({ loading, error, empty, onRetry }: { loading: boolean; error: string | null; empty: string | null; onRetry: () => void }) {
  if (loading) return <div className="mt-10 flex items-center justify-center gap-2 text-sm text-muted"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  if (error) return <div className="mt-10 text-center text-sm text-muted">{error} <button type="button" onClick={onRetry} className="ml-1 font-semibold text-foreground underline">Try again</button></div>;
  if (empty) return <p className="mt-10 text-center text-sm text-muted">{empty}</p>;
  return null;
}

/** One request, with loading and error state, re-run by `reload`. */
function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    fn().then((d) => { if (live) setData(d); }).catch((e) => { if (live) setError(errText(e)); });
    return () => { live = false; };
  }, [n, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, loading: data === null && !error, reload: () => setN((x) => x + 1), setData };
}

/* ───────────────────────── Library ───────────────────────── */

export function LibraryView({ onOpen }: { onOpen: (e: LibraryEntry) => void }) {
  const { data, error, loading, reload } = useLoad(listLibrary);
  const items = useMemo(() => library(data ?? []), [data]);
  const [kind, setKind] = useState<ItemKind | "All">("All");
  const [q, setQ] = useState("");
  const kinds = Array.from(new Set(items.map((i) => i.kind)));
  const shown = items.filter((i) => (kind === "All" || i.kind === kind) && (!q || `${i.title} ${i.cls ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Library</h2>
      <p className="mt-1 text-sm text-muted">Everything you&rsquo;ve made, newest first. Anything you make in a chat is saved here on its own.</p>
      {items.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Chip on={kind === "All"} onClick={() => setKind("All")}>All <span className="opacity-60">{items.length}</span></Chip>
          {kinds.map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{k} <span className="opacity-60">{items.filter((i) => i.kind === k).length}</span></Chip>)}
          <span className="flex-1" />
          <Field value={q} onChange={setQ} placeholder="Search the library" />
        </div>
      )}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shown.map((i, n) => (
          <motion.button key={i.id} type="button" onClick={() => onOpen(i.entry)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(n, 10) * 0.03 }}
            className="group min-w-0 flex flex-col text-left rounded-2xl border border-border bg-surface overflow-hidden hover:border-border-hi hover:shadow-soft transition-all">
            <div className="relative w-full aspect-[16/7] bg-card border-b border-border grid place-items-center">
              <span className="w-12 h-12 rounded-2xl grid place-items-center bg-accent-soft text-accent"><Icon name={KIND_ICON[i.kind]} className="w-5 h-5" /></span>
              <span className="absolute top-2.5 left-2.5 rounded-full bg-surface/90 backdrop-blur px-2 py-0.5 text-[11px] font-semibold text-foreground">{i.kind}</span>
            </div>
            <div className="p-3.5">
              <div className="font-semibold text-[14px] text-foreground truncate">{i.title}</div>
              <div className="mt-0.5 text-[12px] text-muted">{[i.cls, ago(i.when)].filter(Boolean).join(" · ")}</div>
            </div>
          </motion.button>
        ))}
      </div>
      <State loading={loading} error={error} onRetry={reload}
        empty={data && !items.length ? "Nothing yet. Ask for slides, a paper or an explanation in a chat and it lands here." : data && !shown.length ? "Nothing matches. Try another type or search." : null} />
    </div>
  );
}

/* ───────────────────────── adding a file ───────────────────────── */

const typeOf = (name: string) => (/\.pptx$/i.test(name) ? "pptx" : /\.docx$/i.test(name) ? "docx" : "pdf") as "pdf" | "docx" | "pptx";

/** The one place a file is added: the composer's paperclip and My sources both open this. */
export function AddSourceDialog({ file, onClose, onAdded }: { file: File; onClose: () => void; onAdded: (s: ActiveSource) => void }) {
  const [mine, setMine] = useState(false);
  const [clean, setClean] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    setBusy(true); setError(null);
    try {
      const r = await addSource({ title: file.name.replace(/\.(pdf|docx|pptx)$/i, ""), type: typeOf(file.name), file, useForFacts: true, learnStyle: mine ? "auto" : "no", authoredByMe: mine, confirmNoStudentData: clean });
      if (!r.material) throw new Error(r.facts.reason || "That file couldn't be read.");
      onAdded({ id: r.material.id, title: r.material.title });
    } catch (e) { setError(errText(e)); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 px-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-border bg-background p-5 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Add a source</div><div className="mt-1 font-semibold text-foreground truncate">{file.name}</div></div>
          <button type="button" aria-label="Close" onClick={onClose} className="p-1 rounded-full text-muted hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <p className="mt-3 text-[13px] text-muted">Vivran reads it and answers from it, citing its pages.</p>
        <label className="mt-4 flex items-start gap-3 text-[13.5px] text-foreground cursor-pointer">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="mt-1 accent-[var(--accent-1)]" />
          <span>I made this <span className="block text-[12px] text-muted">Vivran also learns how you set papers, slides or notes from it. You approve each thing it learns.</span></span>
        </label>
        <label className="mt-3 flex items-start gap-3 text-[13.5px] text-foreground cursor-pointer">
          <input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} className="mt-1 accent-[var(--accent-1)]" />
          <span>It has no student names, marks or other student data</span>
        </label>
        {error && <p className="mt-3 text-[12.5px] text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-full border border-border text-[13px] font-semibold text-foreground">Cancel</button>
          <button type="button" disabled={!clean || busy} onClick={add} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-ink-fg text-[13px] font-semibold disabled:opacity-40">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{busy ? "Uploading…" : "Add and use"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── My sources ───────────────────────── */

const factsLabel = (s: SourceRow) => {
  const f = s.facts;
  if (!f) return null;
  if (f.status === "READY") return { text: `Facts · ${f.chunks ?? 0} passages`, cls: "bg-success-soft text-success" };
  if (f.status === "FAILED") return { text: "Couldn't be read", cls: "bg-card text-danger border border-border" };
  return { text: "Reading…", cls: "bg-card text-muted border border-border" };
};

export function SourcesView({ active, onUse, onAddFile, version }: { active: ActiveSource | null; onUse: (s: ActiveSource | null) => void; onAddFile: (f: File) => void; version: number }) {
  const { data, error, loading, reload, setData } = useLoad(() => listSources().then((r) => r.sources), [version]);
  const file = useRef<HTMLInputElement>(null);
  const reading = data?.some((s) => s.facts?.status === "PROCESSING" || s.facts?.status === "UPLOADED");
  useEffect(() => { if (!reading) return; const t = setTimeout(reload, 4000); return () => clearTimeout(t); }, [reading, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = async (s: SourceRow) => {
    if (!window.confirm(`Remove ${s.title}? Vivran stops using it for facts and style.`)) return;
    setData((d) => (d ?? []).filter((x) => x.id !== s.id));
    if (active?.id === s.id) onUse(null);
    deleteSource(s.id).catch(reload);
  };
  const list = data ?? [];
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">My sources</h2>
          <p className="mt-1 text-sm text-muted">Files Vivran reads before it writes. Each one is used for facts, for learning how you set things, or both.</p>
        </div>
        <input ref={file} type="file" accept=".pdf,.docx,.pptx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onAddFile(f); }} />
        <button type="button" onClick={() => file.current?.click()} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-ink text-ink-fg text-[13px] font-semibold hover:opacity-90"><Upload className="w-3.5 h-3.5" /> Add a file</button>
      </div>
      {list.length > 0 && (
        <div className="mt-5 rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
          {list.map((s) => {
            const f = factsLabel(s);
            const usable = s.facts?.status === "READY" && !s.id.startsWith("style:");
            return (
              <div key={s.id} className="group flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 p-3.5 sm:px-4">
                <span className="w-9 h-9 shrink-0 rounded-xl grid place-items-center bg-card text-[10px] font-bold text-muted uppercase">{s.type === "youtube" ? "▶" : s.type === "pptx" ? "PPT" : s.type === "docx" ? "DOC" : "PDF"}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[14px] text-foreground truncate">{s.title}</div>
                  <div className="text-[12px] text-muted">{[classOf(s.grade, s.subject), s.created_at && `added ${ago(Date.parse(s.created_at)).toLowerCase()}`].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto pl-12 sm:pl-0">
                  {f && <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${f.cls}`}>{f.text}</span>}
                  {s.style && <span className="rounded-full bg-accent-soft text-accent px-2 py-0.5 text-[11.5px] font-medium">Style · {s.style.kind.replace(/_/g, " ")}{s.style.status === "needs_review" ? " (check)" : ""}</span>}
                  {usable && (active?.id === s.id
                    ? <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-success"><Check className="w-3.5 h-3.5" /> In use</span>
                    : <button type="button" onClick={() => onUse({ id: s.id, title: s.title })} className="rounded-full border border-border px-2.5 py-1 text-[12px] font-semibold text-foreground hover:border-border-hi">Use in a chat</button>)}
                  <button type="button" aria-label={`Remove ${s.title}`} onClick={() => remove(s)} className="p-1.5 rounded-full text-faint hover:text-danger sm:opacity-0 group-hover:opacity-100 focus:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <State loading={loading} error={error} onRetry={reload} empty={data && !list.length ? "No files yet. Add a chapter, a past paper or your notes, and Vivran answers from them." : null} />
    </div>
  );
}

/* ───────────────────────── Teaching memory ───────────────────────── */

const KINDS: NodeKind[] = ["class", "topic", "source", "made", "pattern"];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function MemoryView({ name, theme, onOpenItem, onUseSource }: {
  name: string; theme: "light" | "dark";
  onOpenItem: (e: LibraryEntry) => void; onUseSource: (s: ActiveSource) => void;
}) {
  const { data, error, loading, reload, setData } = useLoad(() => Promise.all([
    listLibrary(), listSources().then((r) => r.sources), getTeachingMemory().then((m) => m.traits),
  ]));
  const [lib, sources, traits] = data ?? [[], [], []];
  const graph = useMemo(() => memoryGraph(name, library(lib), sources, traits), [name, lib, sources, traits]);
  const [hidden, setHidden] = useState<Set<NodeKind>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [spin, setSpin] = useState(true);
  const handle = useRef<GraphHandle | null>(null);
  const node = graph.nodes.find((n) => n.id === sel) ?? null;
  const links = node ? graph.edges.flatMap((e) => (e.a === node.id ? [e.b] : e.b === node.id ? [e.a] : [])).map((id) => graph.nodes.find((n) => n.id === id)!).filter(Boolean) : [];
  const pal = KIND_COLOUR[theme];
  const shownTraits = traits.filter((t) => t.status !== "dismissed");

  const decide = async (t: StyleTrait, action: "use" | "dismiss") => {
    const next = { ...t, status: (action === "use" ? "active" : "dismissed") as StyleTrait["status"] };
    setData((d) => d && [d[0], d[1], d[2].map((x) => (x.id === t.id ? next : x))]);
    decideStyleTrait(t.id, action).catch(reload);
  };
  const find = (v: string) => {
    setQ(v);
    const hit = v.trim() && graph.nodes.find((n) => n.label.toLowerCase().includes(v.trim().toLowerCase()));
    if (hit) setSel(hit.id);
  };
  const empty = data && graph.nodes.length <= 1;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Teaching memory</h2>
      <p className="mt-1 text-sm text-muted max-w-xl">Your classes, the topics you teach, the files behind them, what you&rsquo;ve made and how you like it done, all connected. It grows as you work.</p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {KINDS.map((k) => {
          const off = hidden.has(k);
          return (
            <button key={k} type="button" aria-pressed={!off} onClick={() => setHidden((h) => { const n = new Set(h); if (off) n.delete(k); else n.add(k); return n; })}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12.5px] transition-all ${off ? "border-dashed border-border text-faint" : "border-border bg-surface text-foreground"}`}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: off ? "transparent" : pal[k], boxShadow: off ? `inset 0 0 0 1.5px ${pal[k]}` : `0 0 8px ${pal[k]}` }} />
              {KIND_LABEL[k]} <span className="text-faint">{graph.nodes.filter((n) => n.kind === k).length}</span>
            </button>
          );
        })}
        <span className="flex-1" />
        <Field value={q} onChange={find} placeholder="Find in memory" />
      </div>

      <div className={`vv-space relative mt-4 h-[460px] sm:h-[580px] rounded-[22px] overflow-hidden border ${theme === "dark" ? "border-white/10" : "border-black/10"}`}
        style={{ background: theme === "dark" ? "radial-gradient(120% 90% at 50% 40%, #1A1714 0%, #0D0C0B 70%)" : "radial-gradient(120% 90% at 50% 40%, #2A221C 0%, #15110D 72%)" }}>
        {data && <MemoryGraph nodes={graph.nodes} edges={graph.edges} theme={theme} hidden={hidden} selected={sel} query={q} onSelect={setSel} handle={handle} />}
        {(loading || error || empty) && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-[13.5px] text-white/70">
            {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading your memory…</span>
              : error ? <span>{error} <button type="button" onClick={reload} className="ml-1 font-semibold text-white underline">Try again</button></span>
              : <span className="max-w-sm">Nothing on the map yet. Make something in a chat or add a file to My sources, and it appears here, linked to its class and topic.</span>}
          </div>
        )}
        {data && !empty && <div className="pointer-events-none absolute left-4 top-3 text-[11px] text-white/45">Drag to turn · scroll or pinch to zoom · tap a point</div>}
        {data && !empty && (
          <div className="absolute left-3 bottom-3 flex items-center gap-1 rounded-full bg-white/[0.06] border border-white/10 p-1 backdrop-blur">
            {[
              { label: "Zoom in", icon: <Plus className="w-3.5 h-3.5" />, on: () => handle.current?.zoom(1.25) },
              { label: "Zoom out", icon: <Minus className="w-3.5 h-3.5" />, on: () => handle.current?.zoom(0.8) },
              { label: spin ? "Stop turning" : "Turn slowly", icon: spin ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />, on: () => setSpin(!!handle.current?.toggleSpin()) },
              { label: "Reset view", icon: <RotateCcw className="w-3.5 h-3.5" />, on: () => { handle.current?.reset(); setQ(""); } },
            ].map((b) => <button key={b.label} type="button" aria-label={b.label} title={b.label} onClick={b.on} className="w-8 h-8 grid place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/10">{b.icon}</button>)}
          </div>
        )}
        <AnimatePresence>
          {node && (
            <motion.aside key={node.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }}
              className="absolute right-3 top-3 bottom-3 max-sm:top-auto max-sm:left-3 max-sm:max-h-[58%] sm:w-[300px] flex flex-col rounded-2xl bg-[#1E1A16]/92 border border-white/10 backdrop-blur-md text-[#F4EFE7] shadow-2xl">
              <NodeDetail node={node} links={links} pal={pal} onDecide={decide}
                onClose={() => setSel(null)} onPick={setSel} onOpenItem={onOpenItem} onUseSource={onUseSource} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <h3 className="mt-9 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">What Vivran has learned about how you teach</h3>
      {shownTraits.length ? (
        <div className="mt-3 grid md:grid-cols-3 gap-3">
          {shownTraits.map((t) => <PatternCard key={t.id} t={t} onDecide={(a) => decide(t, a)} onShow={() => setSel(`p:${t.id}`)} />)}
        </div>
      ) : data ? (
        <p className="mt-3 text-[13px] text-muted max-w-xl">Nothing learned yet. Add a paper, deck or notes you made to My sources and tick &ldquo;I made this&rdquo;: Vivran picks up your format and asks before using it.</p>
      ) : null}
    </div>
  );
}

function PatternCard({ t, onDecide, onShow }: { t: StyleTrait; onDecide: (a: "use" | "dismiss") => void; onShow: () => void }) {
  const status = TRAIT_STATUS[t.status];
  return (
    <div className={`rounded-2xl border bg-surface p-4 ${t.status === "suggested" ? "border-accent-line" : "border-border"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${t.status === "active" ? "bg-success-soft text-success" : t.status === "suggested" ? "bg-accent-soft text-accent" : "bg-card text-muted"}`}>{status}</span>
        <button type="button" onClick={onShow} className="text-[12px] text-muted hover:text-foreground">Show on map</button>
      </div>
      <div className="mt-2 font-semibold text-[14px] text-foreground">{t.summary}</div>
      <p className="mt-1 text-[12px] text-faint">{t.subject.replace(/_/g, " ")} · seen in {plural(t.n_documents, "file", "files")}</p>
      {t.update && <p className="mt-1.5 text-[12px] text-muted">Newer files say: {t.update}</p>}
      {t.status === "suggested" && (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onDecide("use")} className="rounded-full bg-ink text-ink-fg px-3 py-1 text-[12px] font-semibold">Use it</button>
          <button type="button" onClick={() => onDecide("dismiss")} className="rounded-full border border-border px-3 py-1 text-[12px] font-semibold text-foreground">Not me</button>
        </div>
      )}
    </div>
  );
}

function NodeDetail({ node, links, pal, onDecide, onClose, onPick, onOpenItem, onUseSource }: {
  node: GNode; links: GNode[]; pal: Record<NodeKind, string>; onDecide: (t: StyleTrait, a: "use" | "dismiss") => void;
  onClose: () => void; onPick: (id: string) => void; onOpenItem: (e: LibraryEntry) => void; onUseSource: (s: ActiveSource) => void;
}) {
  const item = node.kind === "made" ? (node.ref as LibraryItem) : null;
  const src = node.kind === "source" ? (node.ref as SourceRow) : null;
  const trait = node.kind === "pattern" ? (node.ref as StyleTrait) : null;
  const groups = (["you", ...KINDS] as NodeKind[]).map((k) => ({ k, list: links.filter((l) => l.kind === k) })).filter((g) => g.list.length);
  return (
    <>
      <div className="p-4 pb-3 border-b border-white/10">
        <div className="flex items-start gap-2">
          <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pal[node.kind], boxShadow: `0 0 10px ${pal[node.kind]}` }} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.1em] text-white/50">{KIND_ONE[node.kind]}{node.sub ? ` · ${node.sub}` : ""}</div>
            <div className="mt-0.5 font-semibold text-[15px] leading-snug">{node.label}</div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="p-1 -m-1 rounded-full text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="mt-2.5 text-[12.5px] text-white/70 space-y-1">
          {item && <p>{[item.cls, `made ${ago(item.when).toLowerCase()}`].filter(Boolean).join(" · ")}</p>}
          {src && <p>{src.facts?.status === "READY" ? `${src.facts.chunks ?? 0} passages used for facts` : src.facts ? "Still being read" : "Kept for style only"}{src.style ? ` · teaches your ${src.style.kind.replace(/_/g, " ")} style` : ""}</p>}
          {trait && <p>Seen in {plural(trait.n_documents, "file", "files")}{trait.evidence.length ? `: ${trait.evidence.map((e) => e.title).slice(0, 3).join(", ")}` : ""}</p>}
          {node.kind === "topic" && <p>{plural(links.filter((l) => l.kind === "made").length, "thing", "things")} made · {plural(links.filter((l) => l.kind === "source").length, "source", "sources")}</p>}
          {node.kind === "class" && <p>{plural(links.filter((l) => l.kind === "topic").length, "topic", "topics")} taught</p>}
          {node.kind === "you" && <p>{plural(links.filter((l) => l.kind === "class").length, "class", "classes")}, everything below them is yours</p>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {item && <button type="button" onClick={() => onOpenItem(item.entry)} className="inline-flex items-center gap-1 rounded-full bg-white text-[#15110D] px-3 py-1 text-[12px] font-semibold">Open <ArrowRight className="w-3 h-3" /></button>}
          {src && src.facts?.status === "READY" && <button type="button" onClick={() => onUseSource({ id: src.id, title: src.title })} className="inline-flex items-center gap-1 rounded-full bg-white text-[#15110D] px-3 py-1 text-[12px] font-semibold">Use in a chat <ArrowRight className="w-3 h-3" /></button>}
          {trait && trait.status === "suggested" && <>
            <button type="button" onClick={() => onDecide(trait, "use")} className="rounded-full bg-white text-[#15110D] px-3 py-1 text-[12px] font-semibold">Use it</button>
            <button type="button" onClick={() => onDecide(trait, "dismiss")} className="rounded-full border border-white/20 px-3 py-1 text-[12px] font-semibold">Not me</button>
          </>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pt-3 space-y-3">
        {groups.map((g) => (
          <div key={g.k}>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/45">{KIND_LABEL[g.k]} · {g.list.length}</div>
            <div className="mt-1.5 space-y-0.5">
              {g.list.map((l) => (
                <button key={l.id} type="button" onClick={() => onPick(l.id)} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-white/85 hover:bg-white/[0.08]">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: pal[l.kind] }} /><span className="truncate">{l.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
