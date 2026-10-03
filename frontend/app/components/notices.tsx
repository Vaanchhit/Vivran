"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { dismissNotice, useNotices } from "@/lib/tab-state";

/** Work that finished while the teacher was on another page announces itself here. */
export function Notices() {
  const notices = useNotices();
  if (!notices.length) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-[min(22rem,calc(100vw-2.5rem))]" role="status" aria-live="polite">
      {notices.map((n) => (
        <div
          key={n.id}
          className={`p-3.5 rounded-xl border shadow-panel bg-surface text-xs flex items-start gap-2.5 ${
            n.tone === "success" ? "border-success-line" : "border-danger-line"
          }`}
        >
          {n.tone === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-px" />
          ) : (
            <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-px" />
          )}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="text-foreground leading-relaxed">{n.message}</div>
            {n.href && (
              <Link href={n.href} onClick={() => dismissNotice(n.id)} className="text-accent font-semibold hover:underline">
                {n.linkLabel ?? "Open"} →
              </Link>
            )}
          </div>
          <button type="button" onClick={() => dismissNotice(n.id)} aria-label="Dismiss" className="text-muted hover:text-foreground shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
