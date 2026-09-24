"use client";

import React, { useState } from "react";
import { KeyRound, ArrowRight, Mail, LogOut, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { WAITLIST_EMAIL, REQUEST_ACCESS_MAILTO } from "@/lib/constants";

/** The authoritative post-auth referral gate. Rendered by TeacherLayout in
 * place of the page (before even the onboarding wizard) whenever
 * `!user.referralVerified` — catches every sign-in method, including
 * "Continue with Google", where Supabase creates the account automatically
 * on the OAuth callback and the login form never gets a chance to ask for a
 * code up front. Plain client-side gating, same shape as TeacherLayout's own
 * auth guard (no middleware — see middleware.ts's removal). */
export function ReferralGate() {
  const { user, verifyReferral, logout } = useAuth();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { ok, error: failure } = await verifyReferral(code.trim());
    setSubmitting(false);
    if (!ok) {
      // Only claim the code is wrong when the server actually said so. A
      // throttle or a failed write is not the teacher's mistake, and telling
      // them to re-check a correct code leaves them with nothing to try.
      setError(
        failure
          ? `We couldn't check that code right now. ${failure}`
          : "That referral code isn't valid. Vivran is invite-only during beta — request access below and we'll get you one.",
      );
    }
    // On success, user.referralVerified flips to true and TeacherLayout
    // re-renders the real page (or the onboarding wizard) in place of this.
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-10">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-panel p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-accent-soft border border-accent-line text-accent">
            <KeyRound className="w-3.5 h-3.5" /> Invite-Only Beta
          </div>
          <h1 className="text-2xl font-extrabold font-display text-foreground tracking-tight">
            One more step{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="text-sm text-muted">
            Vivran is invite-only during beta. Enter the referral code we sent you to unlock your workspace.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3 h-3" /> Referral Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter the code we sent you"
              autoComplete="off"
              autoFocus
              required
              className="w-full h-11 px-3.5 bg-card border border-border rounded-xl text-foreground placeholder:text-faint text-sm focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-danger-soft border border-danger-line text-danger text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              <a href={REQUEST_ACCESS_MAILTO} className="inline-flex items-center gap-1.5 text-accent font-semibold hover:underline">
                <Mail className="w-3.5 h-3.5" /> Request access via email
              </a>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !code.trim()}
            className="w-full h-11 btn-primary font-medium text-sm rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Checking..." : "Unlock Vivran"}
            {!submitting && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <div className="flex items-center justify-between text-xs text-muted pt-2 border-t border-border">
          <span>
            Don&rsquo;t have a code?{" "}
            <a href={REQUEST_ACCESS_MAILTO} className="text-accent font-medium hover:underline">
              Email {WAITLIST_EMAIL}
            </a>
          </span>
          <button type="button" onClick={() => logout()} className="flex items-center gap-1 text-muted hover:text-foreground">
            <LogOut className="w-3.5 h-3.5" /> Log out
          </button>
        </div>
      </div>
    </div>
  );
}
