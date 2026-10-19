"use client";

import React from "react";
import { BookLoader } from "@/app/components/book-loader";
import type { StyleTrait } from "@/services/api";

/** One learned pattern, with the teacher's decision buttons. Nothing is used until they press "Use this". */
export function TraitCard({ trait, busy, onDecide }: { trait: StyleTrait; busy: boolean; onDecide: (t: StyleTrait, a: "use" | "dismiss") => void }) {
  const chip = {
    active: { label: "In use", cls: "text-success bg-success-soft border-success-line" },
    suggested: { label: "Suggested", cls: "text-chrome bg-chrome-soft border-chrome-line" },
    stale: { label: "No longer evidence", cls: "text-warning bg-warning-soft border-warning-line" },
    dismissed: { label: "Not used", cls: "text-muted bg-card border-border" },
  }[trait.status];

  return (
    <div className={`p-4 rounded-xl border text-xs space-y-2.5 ${trait.status === "active" ? "bg-surface border-accent-line" : "bg-surface border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-foreground leading-relaxed">{trait.summary}</p>
        <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[10.5px] font-medium ${chip.cls}`}>{chip.label}</span>
      </div>

      {trait.kind === "profile" ? (
        <div className="text-muted">Seen in {trait.n_evidence} of your last {trait.n_documents} requests.</div>
      ) : (
        trait.evidence.length > 0 && (
          <details className="text-muted">
            <summary className="cursor-pointer select-none">Based on {trait.n_evidence} of your {trait.n_documents} papers</summary>
            <ul className="mt-1.5 pl-4 list-disc space-y-0.5">
              {trait.evidence.map((e) => <li key={e.document_id}>{e.title}</li>)}
            </ul>
          </details>
        )
      )}
      {trait.status === "stale" && (
        <div className="text-muted">
          {trait.kind === "profile" ? "Your recent requests no longer show this, so it isn\u2019t being used." : "The files this came from were removed, so it isn\u2019t being used."}
        </div>
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
