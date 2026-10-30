"use client";
// The teacher's own material: the Library (everything made), My sources (files
// Vivran reads) and Teaching memory (what it has learned, as a 3D map).
import React, { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Download, Minus, Pause, Play, Plus, RotateCcw, Search, Upload, X } from "lucide-react";
import {
  CLASSES, KIND_LABEL, KIND_ONE, PATTERNS, SOURCE_FILES, TOPICS, memoryGraph, obsidianVault, zip,
  type GNode, type ItemKind, type LibraryItem, type NodeKind, type Pattern, type SourceFile,
} from "../lib/memory";
import { Icon } from "./kit";
import { KIND_COLOUR, MemoryGraph, type GraphHandle } from "./graph";

const KIND_ICON: Record<ItemKind, string> = {
  Slides: "slides", Paper: "paper", Worksheet: "list", Explanation: "bulb", Comparison: "columns",
  Plan: "calendar", Ideas: "spark", Summary: "doc", Analysis: "chart", Chat: "doc",
};
const className = (id: string | null) => CLASSES.find((c) => c.id === id)?.name ?? "No class yet";
const ago = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d < 1) { const h = Math.floor((Date.now() - t) / 3600000); return h < 1 ? "Just now" : `${h} h ago`; }
  return d === 1 ? "Yesterday" : d < 7 ? `${d} days ago` : new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

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

/* ───────────────────────── Library ───────────────────────── */

export function LibraryView({ items, onOpen }: { items: LibraryItem[]; onOpen: (i: LibraryItem) => void }) {
  const [kind, setKind] = useState<ItemKind | "All">("All");
  const [q, setQ] = useState("");
  const kinds = Array.from(new Set(items.map((i) => i.kind)));
  const shown = items.filter((i) => (kind === "All" || i.kind === kind) && (!q || `${i.title} ${className(i.cls)}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Library</h2>
      <p className="mt-1 text-sm text-muted">Everything you&rsquo;ve made, newest first. Anything you make in a chat lands here on its own.</p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Chip on={kind === "All"} onClick={() => setKind("All")}>All <span className="opacity-60">{items.length}</span></Chip>
        {kinds.map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{k} <span className="opacity-60">{items.filter((i) => i.kind === k).length}</span></Chip>)}
        <span className="flex-1" />
        <Field value={q} onChange={setQ} placeholder="Search the library" />
      </div>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shown.map((i, n) => (
          <motion.button key={i.id} type="button" onClick={() => onOpen(i)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(n, 10) * 0.03 }}
            className="group min-w-0 flex flex-col text-left rounded-2xl border border-border bg-surface overflow-hidden hover:border-border-hi hover:shadow-soft transition-all">
            <div className="relative w-full aspect-[16/8] bg-card border-b border-border overflow-hidden">
              {i.deck ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/landing/decks/${i.deck}/01.jpg`} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
              ) : (
                <div className="w-full h-full grid place-items-center">
                  <span className="w-12 h-12 rounded-2xl grid place-items-center bg-accent-soft text-accent"><Icon name={KIND_ICON[i.kind]} className="w-5 h-5" /></span>
                </div>
              )}
              <span className="absolute top-2.5 left-2.5 rounded-full bg-surface/90 backdrop-blur px-2 py-0.5 text-[11px] font-semibold text-foreground">{i.kind}</span>
            </div>
            <div className="p-3.5">
              <div className="font-semibold text-[14px] text-foreground truncate">{i.title}</div>
              <div className="mt-0.5 text-[12px] text-muted">{className(i.cls)} · {ago(i.when)}</div>
              {i.note && <div className="mt-2 rounded-lg bg-accent-soft px-2.5 py-1.5 text-[12px] text-foreground/85 line-clamp-2">{i.note}</div>}
            </div>
          </motion.button>
        ))}
      </div>
      {shown.length === 0 && <p className="mt-10 text-center text-sm text-muted">Nothing matches. Try another type or search.</p>}
    </div>
  );
}

/* ───────────────────────── My sources ───────────────────────── */

export function SourcesView({ active, habits, onUse }: { active: string | null; habits: string[]; onUse: (name: string) => void }) {
  const [tab, setTab] = useState<"files" | "habits">("files");
  const [added, setAdded] = useState<SourceFile[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const files = [...added, ...SOURCE_FILES];
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">My sources</h2>
          <p className="mt-1 text-sm text-muted">Files Vivran reads before it writes. Each one is used for facts, for learning how you set things, or both.</p>
        </div>
        <input ref={file} type="file" accept=".pdf,.docx,.pptx" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (f) setAdded((a) => [{ id: `s-new-${a.length}`, name: f.name, kind: /\.pptx$/i.test(f.name) ? "PowerPoint" : /\.docx$/i.test(f.name) ? "Word" : "PDF", cls: "", added: "Just now", size: `${Math.max(1, Math.round(f.size / 1024))} KB`, facts: null, style: null, topics: [] }, ...a]);
        }} />
        <button type="button" onClick={() => file.current?.click()} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-ink text-ink-fg text-[13px] font-semibold hover:opacity-90"><Upload className="w-3.5 h-3.5" /> Add a file</button>
      </div>
      <div className="mt-5 inline-flex rounded-full border border-border p-1 bg-surface">
        {([["files", `Files ${files.length}`], ["habits", "Recent requests"]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ${tab === id ? "bg-ink text-ink-fg" : "text-muted hover:text-foreground"}`}>{label}</button>
        ))}
      </div>
      {tab === "files" ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
          {files.map((s) => (
            <div key={s.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 p-3.5 sm:px-4">
              <span className="w-9 h-9 shrink-0 rounded-xl grid place-items-center bg-card text-[10px] font-bold text-muted">{s.kind === "YouTube" ? "▶" : s.kind === "PowerPoint" ? "PPT" : s.kind === "Word" ? "DOC" : "PDF"}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-[14px] text-foreground truncate">{s.name}</div>
                <div className="text-[12px] text-muted">{[s.cls && className(s.cls), s.size, `added ${s.added.toLowerCase()}`].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto pl-12 sm:pl-0">
                {s.facts === null ? <span className="rounded-full bg-card border border-border px-2 py-0.5 text-[11.5px] text-muted">Reading… (sample)</span>
                  : <span className="rounded-full bg-success-soft text-success px-2 py-0.5 text-[11.5px] font-medium">Facts · {s.facts} passages</span>}
                {s.style && <span className="rounded-full bg-accent-soft text-accent px-2 py-0.5 text-[11.5px] font-medium">Style · {s.style}</span>}
                {active === s.name
                  ? <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-success"><Check className="w-3.5 h-3.5" /> In use</span>
                  : <button type="button" onClick={() => onUse(s.name)} className="rounded-full border border-border px-2.5 py-1 text-[12px] font-semibold text-foreground hover:border-border-hi">Use in a chat</button>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <p className="text-[13px] text-muted">What you&rsquo;ve asked for lately. Vivran uses these to suggest what you&rsquo;ll want next.</p>
          <ul className="mt-3 space-y-1.5">{habits.map((h, i) => <li key={i} className="rounded-xl bg-card px-3 py-2 text-[13.5px] text-foreground">{h}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Teaching memory ───────────────────────── */

const KINDS: NodeKind[] = ["class", "topic", "source", "made", "pattern"];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function MemoryView({ items, theme, onOpenItem, onUseSource }: {
  items: LibraryItem[]; theme: "light" | "dark";
  onOpenItem: (i: LibraryItem) => void; onUseSource: (name: string) => void;
}) {
  const graph = useMemo(() => memoryGraph(items), [items]);
  const [hidden, setHidden] = useState<Set<NodeKind>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [spin, setSpin] = useState(true);
  const [review, setReview] = useState<Record<string, "kept" | "dropped">>({});
  const handle = useRef<GraphHandle | null>(null);
  const node = graph.nodes.find((n) => n.id === sel) ?? null;
  const links = node ? graph.edges.flatMap((e) => (e.a === node.id ? [e.b] : e.b === node.id ? [e.a] : [])).map((id) => graph.nodes.find((n) => n.id === id)!).filter(Boolean) : [];
  const pal = KIND_COLOUR[theme];

  const exportVault = () => {
    const blob = zip(obsidianVault(graph));
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Vivran memory.zip"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const find = (v: string) => {
    setQ(v);
    const hit = v.trim() && graph.nodes.find((n) => n.label.toLowerCase().includes(v.trim().toLowerCase()));
    if (hit) setSel(hit.id);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Teaching memory</h2>
          <p className="mt-1 text-sm text-muted max-w-xl">Your classes, the topics you teach, the files behind them, what you&rsquo;ve made and how you like it done, all connected. It grows as you work.</p>
        </div>
        <button type="button" onClick={exportVault} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-border text-[13px] font-semibold text-foreground hover:border-border-hi">
          <Download className="w-3.5 h-3.5" /> Export to Obsidian
        </button>
      </div>

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
        <MemoryGraph nodes={graph.nodes} edges={graph.edges} theme={theme} hidden={hidden} selected={sel} query={q} onSelect={setSel} handle={handle} />
        <div className="pointer-events-none absolute left-4 top-3 text-[11px] text-white/45">Drag to turn · scroll or pinch to zoom · tap a point</div>
        <div className="absolute left-3 bottom-3 flex items-center gap-1 rounded-full bg-white/[0.06] border border-white/10 p-1 backdrop-blur">
          {[
            { label: "Zoom in", icon: <Plus className="w-3.5 h-3.5" />, on: () => handle.current?.zoom(1.25) },
            { label: "Zoom out", icon: <Minus className="w-3.5 h-3.5" />, on: () => handle.current?.zoom(0.8) },
            { label: spin ? "Stop turning" : "Turn slowly", icon: spin ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />, on: () => setSpin(!!handle.current?.toggleSpin()) },
            { label: "Reset view", icon: <RotateCcw className="w-3.5 h-3.5" />, on: () => { handle.current?.reset(); setQ(""); } },
          ].map((b) => <button key={b.label} type="button" aria-label={b.label} title={b.label} onClick={b.on} className="w-8 h-8 grid place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/10">{b.icon}</button>)}
        </div>
        <AnimatePresence>
          {node && (
            <motion.aside key={node.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }}
              className="absolute right-3 top-3 bottom-3 max-sm:top-auto max-sm:left-3 max-sm:max-h-[58%] sm:w-[300px] flex flex-col rounded-2xl bg-[#1E1A16]/92 border border-white/10 backdrop-blur-md text-[#F4EFE7] shadow-2xl">
              <NodeDetail node={node} links={links} pal={pal} review={review} setReview={setReview}
                onClose={() => setSel(null)} onPick={setSel} onOpenItem={onOpenItem} onUseSource={onUseSource} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <h3 className="mt-9 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">What Vivran has learned about how you teach</h3>
      <div className="mt-3 grid md:grid-cols-3 gap-3">
        {PATTERNS.map((p) => <PatternCard key={p.id} p={p} state={review[p.id]} onReview={(v) => setReview((r) => ({ ...r, [p.id]: v }))} onShow={() => setSel(p.id)} />)}
      </div>
      <p className="mt-6 text-[12px] text-faint">Sample memory for this preview. The export is a folder of linked notes: unzip it and open the folder as a vault in Obsidian, and its graph view shows the same map.</p>
    </div>
  );
}

function PatternCard({ p, state, onReview, onShow }: { p: Pattern; state?: "kept" | "dropped"; onReview: (v: "kept" | "dropped") => void; onShow: () => void }) {
  const status = state === "kept" ? "In use" : state === "dropped" ? "Not used" : p.status;
  return (
    <div className={`rounded-2xl border bg-surface p-4 ${status === "To review" ? "border-accent-line" : "border-border"} ${state === "dropped" ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${status === "In use" ? "bg-success-soft text-success" : status === "To review" ? "bg-accent-soft text-accent" : "bg-card text-muted"}`}>{status}</span>
        <button type="button" onClick={onShow} className="text-[12px] text-muted hover:text-foreground">Show on map</button>
      </div>
      <div className="mt-2 font-semibold text-[14px] text-foreground">{p.name}</div>
      <p className="mt-1 text-[13px] text-muted leading-snug">{p.detail}</p>
      <p className="mt-2 text-[12px] text-faint">{p.evidence}</p>
      {status === "To review" && (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onReview("kept")} className="rounded-full bg-ink text-ink-fg px-3 py-1 text-[12px] font-semibold">Use it</button>
          <button type="button" onClick={() => onReview("dropped")} className="rounded-full border border-border px-3 py-1 text-[12px] font-semibold text-foreground">Not me</button>
        </div>
      )}
    </div>
  );
}

function NodeDetail({ node, links, pal, review, setReview, onClose, onPick, onOpenItem, onUseSource }: {
  node: GNode; links: GNode[]; pal: Record<NodeKind, string>; review: Record<string, "kept" | "dropped">;
  setReview: React.Dispatch<React.SetStateAction<Record<string, "kept" | "dropped">>>;
  onClose: () => void; onPick: (id: string) => void; onOpenItem: (i: LibraryItem) => void; onUseSource: (name: string) => void;
}) {
  const item = node.kind === "made" ? (node.ref as LibraryItem) : null;
  const src = node.kind === "source" ? (node.ref as SourceFile) : null;
  const pat = node.kind === "pattern" ? (node.ref as Pattern) : null;
  const topic = node.kind === "topic" ? TOPICS.find((t) => t.id === node.id) : null;
  const groups = (["you", ...KINDS] as NodeKind[]).map((k) => ({ k, list: links.filter((l) => l.kind === k) })).filter((g) => g.list.length);
  return (
    <>
      <div className="p-4 pb-3 border-b border-white/10">
        <div className="flex items-start gap-2">
          <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pal[node.kind], boxShadow: `0 0 10px ${pal[node.kind]}` }} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.1em] text-white/50">{KIND_ONE[node.kind]} · {node.sub}</div>
            <div className="mt-0.5 font-semibold text-[15px] leading-snug">{node.label}</div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="p-1 -m-1 rounded-full text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="mt-2.5 text-[12.5px] text-white/70 space-y-1">
          {item && <p>{className(item.cls)} · made {ago(item.when).toLowerCase()}</p>}
          {item?.note && <p className="rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-white/85">Your note: {item.note}</p>}
          {src && <p>{src.facts ? `${src.facts} passages used for facts` : "Still being read"}{src.style ? ` · teaches your ${src.style.toLowerCase()} style` : ""}</p>}
          {pat && <><p>{pat.detail}</p><p className="text-white/50">{pat.evidence}</p></>}
          {topic && <p>{plural(links.filter((l) => l.kind === "made").length, "thing", "things")} made · {plural(links.filter((l) => l.kind === "source").length, "source", "sources")}</p>}
          {node.kind === "class" && <p>{plural(links.filter((l) => l.kind === "topic").length, "topic", "topics")} taught</p>}
          {node.kind === "you" && <p>{plural(links.length, "class", "classes")}, everything below them is yours</p>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {item && <button type="button" onClick={() => onOpenItem(item)} className="inline-flex items-center gap-1 rounded-full bg-white text-[#15110D] px-3 py-1 text-[12px] font-semibold">Open <ArrowRight className="w-3 h-3" /></button>}
          {src && <button type="button" onClick={() => onUseSource(src.name)} className="inline-flex items-center gap-1 rounded-full bg-white text-[#15110D] px-3 py-1 text-[12px] font-semibold">Use in a chat <ArrowRight className="w-3 h-3" /></button>}
          {pat && pat.status === "To review" && !review[pat.id] && <>
            <button type="button" onClick={() => setReview((r) => ({ ...r, [pat.id]: "kept" }))} className="rounded-full bg-white text-[#15110D] px-3 py-1 text-[12px] font-semibold">Use it</button>
            <button type="button" onClick={() => setReview((r) => ({ ...r, [pat.id]: "dropped" }))} className="rounded-full border border-white/20 px-3 py-1 text-[12px] font-semibold">Not me</button>
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
