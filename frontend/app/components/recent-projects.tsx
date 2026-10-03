"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, Clock, FolderKanban, Pencil, Trash2, X } from "lucide-react";
import { BookLoader } from "@/app/components/book-loader";
import { deleteLibraryItem, libraryHref, listLibrary, renameLibraryItem, type LibraryEntry } from "@/services/api";
import { KIND_LABELS, LIBRARY_KINDS } from "@/lib/catalog";
import { useTabState } from "@/lib/tab-state";

/** The teacher's saved work, from GET /api/library. Shared by the dashboard
 * preview and the full /teacher/library list so the two can't drift apart. It
 * never shows sample content: a live product must not show fabricated work
 * back to someone who didn't make it. */

function relativeTime(iso?: string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

function ItemCard({ item, manage, onRenamed, onDeleted }: {
  item: LibraryEntry;
  manage: boolean;
  onRenamed: (title: string) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const when = relativeTime(item.updated_at || item.created_at);

  const saveTitle = async () => {
    const t = draft.trim();
    if (!t || t === item.title) { setEditing(false); setDraft(item.title); return; }
    setBusy(true); setErr(null);
    try { await renameLibraryItem(item.id, t); onRenamed(t); setEditing(false); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not rename."); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setErr(null);
    try { await deleteLibraryItem(item.id); onDeleted(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not delete."); setBusy(false); setConfirming(false); }
  };

  return (
    <div className="p-5 rounded-2xl bg-surface border border-border space-y-3 hover:border-border-hi transition-all flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase font-semibold tracking-wider text-accent bg-accent-soft px-2 py-0.5 rounded-md border border-accent-line">
          {KIND_LABELS[item.type] ?? item.type}
        </span>
        {when && (
          <span className="text-[11px] text-muted flex items-center gap-1 shrink-0">
            <Clock className="w-3 h-3" /> {when}
          </span>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={draft}
            maxLength={120}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setEditing(false); setDraft(item.title); } }}
            aria-label="New name"
            className="flex-1 min-w-0 px-2 py-1 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent"
          />
          <button type="button" onClick={saveTitle} disabled={busy} aria-label="Save name" className="p-1 text-muted hover:text-foreground"><Check className="w-4 h-4" /></button>
          <button type="button" onClick={() => { setEditing(false); setDraft(item.title); }} aria-label="Cancel" className="p-1 text-muted hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <Link href={libraryHref(item)} className="font-bold text-sm text-foreground font-display hover:text-accent line-clamp-2">
          {item.title}
        </Link>
      )}

      {err && <div className="text-[11px] text-danger">{err}</div>}

      <div className="flex items-center justify-between gap-2 pt-1 mt-auto">
        <Link href={libraryHref(item)} className="text-xs font-medium text-accent hover:underline">Open →</Link>
        {manage && !editing && (
          confirming ? (
            <span className="flex items-center gap-2 text-[11px]">
              <span className="text-muted">Delete for good?</span>
              <button type="button" onClick={remove} disabled={busy} className="text-danger font-semibold hover:underline">{busy ? "Deleting…" : "Delete"}</button>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="text-muted hover:text-foreground">Keep</button>
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => setEditing(true)} aria-label={`Rename ${item.title}`} className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card"><Pencil className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => setConfirming(true)} aria-label={`Delete ${item.title}`} className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-card"><Trash2 className="w-3.5 h-3.5" /></button>
            </span>
          )
        )}
      </div>
    </div>
  );
}

export function RecentProjects({ limit, manage = false }: { limit?: number; manage?: boolean }) {
  const [items, setItems] = useState<LibraryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useTabState<string>("library:kind", "");

  useEffect(() => {
    let cancelled = false;
    listLibrary()
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load your saved work.");
        setItems([]);
      });
    return () => { cancelled = true; };
  }, []);

  if (items === null) {
    return (
      <div className="p-6 rounded-2xl bg-surface border border-border text-sm text-muted flex items-center justify-center gap-2">
        <BookLoader className="w-4 h-4" /> Loading your saved work…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-2xl bg-warning-soft border border-warning-line text-xs text-warning flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-8 rounded-2xl bg-surface border border-dashed border-border text-center text-sm text-muted flex flex-col items-center gap-2">
        <FolderKanban className="w-5 h-5 text-muted" />
        <div>Nothing saved yet. Everything you create is saved here automatically.</div>
        <Link href="/teacher" className="text-accent font-medium hover:underline">
          Create something →
        </Link>
      </div>
    );
  }

  // The filter only offers kinds the teacher actually has, with a count each.
  const counts = new Map<string, number>();
  items.forEach((i) => counts.set(i.type, (counts.get(i.type) ?? 0) + 1));
  const kinds = LIBRARY_KINDS.filter((k) => counts.has(k.kind));
  const activeKind = manage && counts.has(kind) ? kind : "";
  const filtered = activeKind ? items.filter((i) => i.type === activeKind) : items;
  const shown = limit ? filtered.slice(0, limit) : filtered;

  const chip = (value: string, label: string, count: number) => (
    <button
      key={value || "all"}
      type="button"
      onClick={() => setKind(value)}
      aria-pressed={activeKind === value}
      className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
        activeKind === value ? "border-accent bg-accent-soft text-accent font-semibold" : "border-border bg-card text-muted hover:text-foreground"
      }`}
    >
      {label} <span className="opacity-60">{count}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      {manage && kinds.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
          {chip("", "All", items.length)}
          {kinds.map((k) => chip(k.kind, k.label, counts.get(k.kind) ?? 0))}
        </div>
      )}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {shown.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          manage={manage}
          onRenamed={(title) => setItems((rows) => rows?.map((r) => (r.id === item.id ? { ...r, title } : r)) ?? rows)}
          onDeleted={() => setItems((rows) => rows?.filter((r) => r.id !== item.id) ?? rows)}
        />
      ))}
    </div>
    </div>
  );
}
