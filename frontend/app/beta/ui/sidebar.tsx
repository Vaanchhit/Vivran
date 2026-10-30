"use client";
// The left rail: navigation, conversation search and organisation, help.
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bookmark, Brain, ChevronDown, ChevronRight, FolderClosed, FolderOpen, FolderPlus, HelpCircle, LayoutGrid, Library,
  MoreHorizontal, PanelLeft, Pencil, Pin, PinOff, RotateCcw, Search, Settings, SquarePen, Trash2, X,
} from "lucide-react";
import { BrandMark } from "@/app/components/brand-mark";
import { TIPS } from "../lib/config";
import type { Conversation, Folder } from "../lib/types";
import { Tip } from "./kit";

export type Since = "all" | "today" | "week" | "older";

export interface SidebarProps {
  convs: Conversation[]; folders: Folder[]; activeId: string | null; view: string; savedCount: number;
  query: string; since: Since; folderFilter: string | null;
  autoRead: boolean; showRoute: boolean; user: { name: string; email: string };
  onQuery: (q: string) => void; onSince: (s: Since) => void; onFolderFilter: (id: string | null) => void;
  onNew: () => void; onOpen: (id: string) => void; onView: (v: "features" | "saved" | "library" | "sources" | "memory") => void; onCollapse: () => void;
  onRename: (id: string, title: string) => void; onPin: (id: string) => void; onMove: (id: string, folderId: string | null) => void; onDelete: (id: string) => void;
  onFolderCreate: (name: string) => void; onFolderRename: (id: string, name: string) => void; onFolderDelete: (id: string) => void;
  onTour: () => void; onReset: () => void; onAutoRead: (v: boolean) => void; onShowRoute: (v: boolean) => void; onSignOut: () => void;
}

function ConvItem({ c, active, folders, p }: { c: Conversation; active: boolean; folders: Folder[]; p: SidebarProps }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setTitle(c.title), [c.title]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  if (editing) return (
    <form onSubmit={(e) => { e.preventDefault(); p.onRename(c.id, title.trim() || c.title); setEditing(false); }} className="px-1">
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => { p.onRename(c.id, title.trim() || c.title); setEditing(false); }}
        className="w-full rounded-xl border border-accent-line bg-surface px-3 py-1.5 text-[13.5px] text-foreground outline-none" />
    </form>
  );
  return (
    <div ref={ref} className={`group relative flex items-center rounded-xl transition-colors ${active ? "bg-card" : "hover:bg-card"}`}>
      <button type="button" onClick={() => p.onOpen(c.id)} onDoubleClick={() => setEditing(true)}
        className={`flex-1 min-w-0 text-left pl-3 pr-1 py-2 text-[13.5px] truncate ${active ? "text-foreground font-medium" : "text-foreground/80"}`}>
        {c.pinned && <Pin className="inline w-3 h-3 mr-1.5 -mt-0.5 text-accent" />}{c.title}
      </button>
      <button type="button" aria-label="Chat options" onClick={() => setMenu(!menu)} className={`shrink-0 p-1.5 mr-1 rounded-lg text-muted hover:text-foreground ${menu ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}><MoreHorizontal className="w-4 h-4" /></button>
      <AnimatePresence>
        {menu && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute right-1 top-full mt-1 z-40 w-52 rounded-2xl border border-border bg-surface shadow-panel p-1.5 text-[13px]">
            <button type="button" onClick={() => { setEditing(true); setMenu(false); }} className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-card text-foreground"><Pencil className="w-3.5 h-3.5 text-muted" /> Rename</button>
            <button type="button" onClick={() => { p.onPin(c.id); setMenu(false); }} className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-card text-foreground">{c.pinned ? <PinOff className="w-3.5 h-3.5 text-muted" /> : <Pin className="w-3.5 h-3.5 text-muted" />} {c.pinned ? "Unpin" : "Pin"}</button>
            <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">Move to</div>
            {folders.map((f) => (
              <button key={f.id} type="button" disabled={c.folderId === f.id} onClick={() => { p.onMove(c.id, f.id); setMenu(false); }} className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-card text-foreground disabled:opacity-40"><FolderClosed className="w-3.5 h-3.5 text-muted" /> <span className="truncate">{f.name}</span></button>
            ))}
            {c.folderId && <button type="button" onClick={() => { p.onMove(c.id, null); setMenu(false); }} className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-card text-foreground"><X className="w-3.5 h-3.5 text-muted" /> Out of folder</button>}
            <div className="my-1 border-t border-border" />
            <button type="button" onClick={() => { p.onDelete(c.id); setMenu(false); }} className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-danger-soft text-danger"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FolderGroup({ f, convs, p }: { f: Folder; convs: Conversation[]; p: SidebarProps }) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(f.name);
  return (
    <div>
      <div className="group flex items-center rounded-xl hover:bg-card">
        {editing ? (
          <form className="flex-1 px-1 py-0.5" onSubmit={(e) => { e.preventDefault(); p.onFolderRename(f.id, name.trim() || f.name); setEditing(false); }}>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { p.onFolderRename(f.id, name.trim() || f.name); setEditing(false); }} className="w-full rounded-lg border border-accent-line bg-surface px-2 py-1 text-[13px] outline-none text-foreground" />
          </form>
        ) : (
          <button type="button" onClick={() => setOpen(!open)} onDoubleClick={() => setEditing(true)} className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5 text-[13px] font-medium text-foreground/85">
            {open ? <ChevronDown className="w-3.5 h-3.5 text-faint" /> : <ChevronRight className="w-3.5 h-3.5 text-faint" />}
            {open ? <FolderOpen className="w-3.5 h-3.5 text-accent" /> : <FolderClosed className="w-3.5 h-3.5 text-accent" />}
            <span className="truncate">{f.name}</span><span className="text-faint text-[11px]">{convs.length}</span>
          </button>
        )}
        {!editing && <>
          <button type="button" aria-label="Rename folder" onClick={() => setEditing(true)} className="p-1 opacity-0 group-hover:opacity-100 text-muted hover:text-foreground"><Pencil className="w-3 h-3" /></button>
          <button type="button" aria-label="Delete folder" onClick={() => p.onFolderDelete(f.id)} className="p-1 mr-1 opacity-0 group-hover:opacity-100 text-muted hover:text-danger"><Trash2 className="w-3 h-3" /></button>
        </>}
      </div>
      {open && <div className="ml-4 pl-2 border-l border-border space-y-0.5 mt-0.5">{convs.length ? convs.map((c) => <ConvItem key={c.id} c={c} active={p.activeId === c.id} folders={p.folders} p={p} />) : <div className="px-3 py-1.5 text-[12px] text-faint">Empty. Move a chat here from its ⋯ menu.</div>}</div>}
    </div>
  );
}

export function Sidebar(p: SidebarProps) {
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const filtering = !!p.query || p.since !== "all" || !!p.folderFilter;
  const pinned = p.convs.filter((c) => c.pinned);
  const loose = p.convs.filter((c) => !c.pinned && !c.folderId);
  const nav = "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors";
  return (
    <div className="h-full flex flex-col bg-surface-2">
      <div className="flex items-center justify-between px-4 h-14 shrink-0">
        <a href="/" className="flex items-center gap-2 font-display font-extrabold text-[17px] text-foreground"><BrandMark className="w-6 h-6" /> Vivran</a>
        <button type="button" aria-label="Collapse sidebar" onClick={p.onCollapse} className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card"><PanelLeft className="w-[18px] h-[18px]" /></button>
      </div>
      <nav className="px-2 space-y-0.5 shrink-0">
        <button type="button" onClick={p.onNew} className={`${nav} text-foreground/85 hover:bg-card`}><SquarePen className="w-4 h-4 text-muted" /> New chat</button>
        <button type="button" onClick={() => p.onView("library")} className={`${nav} ${p.view === "library" ? "bg-card text-foreground font-medium" : "text-foreground/85 hover:bg-card"}`}><Library className="w-4 h-4 text-muted" /> Library</button>
        <button type="button" onClick={() => p.onView("sources")} className={`${nav} ${p.view === "sources" ? "bg-card text-foreground font-medium" : "text-foreground/85 hover:bg-card"}`}><FolderOpen className="w-4 h-4 text-muted" /> My sources</button>
        <button type="button" onClick={() => p.onView("memory")} className={`${nav} ${p.view === "memory" ? "bg-card text-foreground font-medium" : "text-foreground/85 hover:bg-card"}`}><Brain className="w-4 h-4 text-muted" /> Teaching memory</button>
        <button type="button" data-tour="saved" onClick={() => p.onView("saved")} className={`${nav} ${p.view === "saved" ? "bg-card text-foreground font-medium" : "text-foreground/85 hover:bg-card"}`}>
          <Bookmark className="w-4 h-4 text-muted" /> Saved {p.savedCount > 0 && <span className="ml-auto text-[11px] text-faint">{p.savedCount}</span>}
        </button>
        <button type="button" data-tour="features" onClick={() => p.onView("features")} className={`${nav} ${p.view === "features" ? "bg-card text-foreground font-medium" : "text-foreground/85 hover:bg-card"}`}><LayoutGrid className="w-4 h-4 text-muted" /> Explore features</button>
      </nav>

      <div className="mt-4 px-3 shrink-0" data-tour="search">
        <Tip text={TIPS.search} side="bottom" className="w-full">
          <label className="vv-field w-full flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 focus-within:border-accent-line">
            <Search className="w-3.5 h-3.5 text-faint shrink-0" />
            <input value={p.query} onChange={(e) => p.onQuery(e.target.value)} placeholder="Search chats" className="flex-1 min-w-0 bg-transparent text-[13px] text-foreground placeholder:text-faint outline-none" />
            {p.query && <button type="button" aria-label="Clear search" onClick={() => p.onQuery("")}><X className="w-3.5 h-3.5 text-muted" /></button>}
          </label>
        </Tip>
        <div className="mt-2 flex flex-wrap gap-1">
          {(["all", "today", "week", "older"] as Since[]).map((s) => (
            <button key={s} type="button" onClick={() => p.onSince(s)} className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${p.since === s ? "bg-ink text-ink-fg border-transparent" : "border-border text-muted hover:text-foreground"}`}>
              {{ all: "All", today: "Today", week: "This week", older: "Older" }[s]}
            </button>
          ))}
          {p.folders.map((f) => (
            <button key={f.id} type="button" onClick={() => p.onFolderFilter(p.folderFilter === f.id ? null : f.id)} className={`px-2 py-0.5 rounded-full text-[11px] border max-w-[140px] truncate transition-colors ${p.folderFilter === f.id ? "bg-accent text-white border-transparent" : "border-border text-muted hover:text-foreground"}`}>{f.name}</button>
          ))}
        </div>
      </div>

      <div className="mt-3 px-2 flex-1 overflow-y-auto space-y-4 pb-3">
        {filtering ? (
          <div>
            <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{p.convs.length} {p.convs.length === 1 ? "result" : "results"}</div>
            <div className="mt-1 space-y-0.5">{p.convs.map((c) => <ConvItem key={c.id} c={c} active={p.activeId === c.id} folders={p.folders} p={p} />)}</div>
          </div>
        ) : (
          <>
            {pinned.length > 0 && <div><div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Pinned</div><div className="mt-1 space-y-0.5">{pinned.map((c) => <ConvItem key={c.id} c={c} active={p.activeId === c.id} folders={p.folders} p={p} />)}</div></div>}
            <div>
              <div className="flex items-center justify-between px-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">Folders</span>
                <Tip text="New folder" side="bottom"><button type="button" aria-label="New folder" onClick={() => setNewFolder("")} className="p-1 rounded-md text-muted hover:text-foreground"><FolderPlus className="w-3.5 h-3.5" /></button></Tip>
              </div>
              {newFolder !== null && (
                <form className="px-1 mt-1" onSubmit={(e) => { e.preventDefault(); if (newFolder.trim()) p.onFolderCreate(newFolder.trim()); setNewFolder(null); }}>
                  <input autoFocus value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onBlur={() => { if (newFolder.trim()) p.onFolderCreate(newFolder.trim()); setNewFolder(null); }} placeholder="Folder name" className="w-full rounded-xl border border-accent-line bg-surface px-3 py-1.5 text-[13px] outline-none text-foreground" />
                </form>
              )}
              <div className="mt-1 space-y-0.5">{p.folders.map((f) => <FolderGroup key={f.id} f={f} convs={p.convs.filter((c) => c.folderId === f.id && !c.pinned)} p={p} />)}</div>
            </div>
            <div><div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Recent</div><div className="mt-1 space-y-0.5">{loose.map((c) => <ConvItem key={c.id} c={c} active={p.activeId === c.id} folders={p.folders} p={p} />)}</div></div>
          </>
        )}
      </div>

      <div className="relative p-3 space-y-0.5 border-t border-border shrink-0">
        <AnimatePresence>
          {help && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute bottom-full left-3 right-3 mb-2 z-40 rounded-2xl border border-border bg-surface shadow-panel p-1.5 text-[13px]">
              <button type="button" onClick={() => { setHelp(false); p.onTour(); }} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-card text-foreground"><HelpCircle className="w-4 h-4 text-muted" /> Take the tour</button>
              <button type="button" onClick={() => { setHelp(false); p.onView("features"); }} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-card text-foreground"><LayoutGrid className="w-4 h-4 text-muted" /> What Vivran can do</button>
              <button type="button" onClick={() => { setHelp(false); p.onReset(); }} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-card text-foreground"><RotateCcw className="w-4 h-4 text-muted" /> Clear chats in this browser</button>
            </motion.div>
          )}
          {settings && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute bottom-full left-3 right-3 mb-2 z-40 rounded-2xl border border-border bg-surface shadow-panel p-3 text-[13px]">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span><span className="block text-foreground font-medium">Read answers aloud</span><span className="text-[11.5px] text-muted">Every new answer, automatically</span></span>
                <input type="checkbox" checked={p.autoRead} onChange={(e) => p.onAutoRead(e.target.checked)} className="w-4 h-4 accent-[var(--accent-1)]" />
              </label>
              <label className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl hover:bg-card cursor-pointer">
                <span><span className="block text-foreground font-medium">Show routing</span><span className="text-[11.5px] text-muted">Internal: which model ran each step</span></span>
                <input type="checkbox" checked={p.showRoute} onChange={(e) => p.onShowRoute(e.target.checked)} className="w-4 h-4 accent-[var(--accent-1)]" />
              </label>
              <button type="button" onClick={p.onSignOut} className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-card text-foreground font-medium">Sign out</button>
            </motion.div>
          )}
        </AnimatePresence>
        <button type="button" data-tour="help" onClick={() => { setHelp(!help); setSettings(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] text-foreground/85 hover:bg-card"><HelpCircle className="w-4 h-4 text-muted" /> Help and tour</button>
        <button type="button" onClick={() => { setSettings(!settings); setHelp(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] text-foreground/85 hover:bg-card"><Settings className="w-4 h-4 text-muted" /> Settings</button>
        <div className="flex items-center gap-2.5 px-3 py-2">
          <span className="w-7 h-7 shrink-0 rounded-full grid place-items-center bg-accent text-white text-[12px] font-bold">{p.user.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0"><div className="text-[13.5px] font-medium text-foreground truncate">{p.user.name}</div><div className="text-[11px] text-faint truncate">{p.user.email}</div></div>
        </div>
      </div>
    </div>
  );
}
