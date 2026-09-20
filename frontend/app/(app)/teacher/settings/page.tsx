"use client";

import React, { useState } from "react";
import { Settings, AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function SettingsPage() {
  const { user, logout, deleteAccount } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Delete your Vivran account? This permanently removes your profile, workspace, materials, and everything you've created. This cannot be undone.\n\nType OK to permanently delete your account.",
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError("");
    const ok = await deleteAccount();
    if (!ok) {
      setDeleting(false);
      setDeleteError("Could not delete your account. Check your connection and try again, or contact info@vivran.co.in.");
      return;
    }
    await logout();
    // A hard navigation rather than router.push(): clearing the session here
    // also flips TeacherLayout's own auth guard, which independently tries
    // to redirect to /login the moment `user` goes null. Racing that against
    // a client-side push("/") is unreliable (whichever redirect resolves
    // last wins). A full navigation leaves the guarded tree immediately and
    // sidesteps the race entirely — this is a one-off terminal redirect for
    // an irreversible action, not a routing pattern used anywhere else.
    window.location.href = "/";
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-[#7C6EFA]" /> Teacher Profile & Workspace Settings
        </h1>
        <p className="text-sm text-muted mt-1">
          Manage your teacher profile, subject preferences, and AI routing configuration.
        </p>
      </div>

      <div className="p-6 rounded-2xl bg-surface border border-border space-y-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#7C6EFA]/20 border border-[#7C6EFA]/30 flex items-center justify-center text-[#7C6EFA] text-lg font-bold">
            {(user?.name || "T")
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-foreground text-base">{user?.name || "Teacher"}</div>
            <div className="text-xs text-muted">{user?.school || "Your institution"}</div>
          </div>
        </div>

        <div className="pt-4 border-t border-border space-y-3 text-xs">
          <div>
            <span className="text-muted">Subjects:</span>
            <div className="text-foreground font-medium mt-0.5">
              {user?.preferredSubjects?.length ? user.preferredSubjects.join(", ") : "Not set — inferred automatically from what you generate."}
            </div>
          </div>

          <div>
            <span className="text-muted">Grade Levels:</span>
            <div className="text-foreground font-medium mt-0.5">
              {user?.preferredGrades?.length ? user.preferredGrades.join(", ") : "Not set — inferred automatically from what you generate."}
            </div>
          </div>

          <div>
            <span className="text-muted">Preferred Language:</span>
            <div className="text-foreground font-medium mt-0.5">{user?.preferredLanguage || "Not set"}</div>
          </div>

          <div>
            <span className="text-muted">Default Difficulty:</span>
            <div className="text-foreground font-medium mt-0.5 capitalize">{user?.preferredDifficulty || "Not set"}</div>
          </div>

          <div>
            <span className="text-muted">AI Model:</span>
            <div className="text-[#4FC3F7] font-medium mt-0.5">Google Gemini, with automatic fallback if a request is rate-limited.</div>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="p-6 rounded-2xl bg-surface border border-red-500/20 space-y-4 max-w-2xl">
        <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
          <AlertTriangle className="w-4 h-4" /> Danger Zone
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Deleting your account permanently removes your profile, workspace, uploaded materials, and everything
          you&rsquo;ve created with Vivran. This action is irreversible.
        </p>
        {deleteError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{deleteError}</div>
        )}
        <button
          type="button"
          onClick={handleDeleteAccount}
          disabled={deleting}
          className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {deleting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting account...
            </>
          ) : (
            "Delete Account"
          )}
        </button>
      </div>
    </div>
  );
}
