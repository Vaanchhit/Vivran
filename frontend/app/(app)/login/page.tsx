"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { verifyReferralCode } from "@/services/api";
import type { Role } from "@/types";
import { Shield, BookOpen, GraduationCap, Building2, ArrowRight, Mail, CheckCircle2, KeyRound, User } from "lucide-react";

const WAITLIST_EMAIL = "info@vivran.co.in";

const REQUEST_ACCESS_MAILTO = `mailto:${WAITLIST_EMAIL}?${new URLSearchParams({
  subject: "Vivran Beta Access Request",
  body:
    "Hi Vivran team,\n\n" +
    "I'd like to request access to the Vivran teacher beta — I don't have a referral code yet.\n\n" +
    "Name: \n" +
    "College / Institution: \n" +
    "Subject(s) you teach: \n\n" +
    "Thanks!",
}).toString().replace(/\+/g, "%20")}`;

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center text-muted">
          Loading...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

type Mode = "signin" | "signup";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, login, loginWithGoogle, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [selectedRole, setSelectedRole] = useState<Role>("teacher");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signupSuccessMessage, setSignupSuccessMessage] = useState("");

  const authError = searchParams.get("error");
  const next = searchParams.get("next") || "/teacher";

  // Bounce an already-signed-in visitor straight to their workspace — this
  // used to be a server-side redirect in middleware.ts. It's client-side now
  // (see middleware.ts's removal for why); TeacherLayout independently
  // guards /teacher regardless, so nothing is lost security-wise, just the
  // redirect happens one render tick later.
  useEffect(() => {
    if (user?.authenticated) {
      router.replace(next);
    }
  }, [user, next, router]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setSignupSuccessMessage("");
    setReferralCode("");
    setFullName("");
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSignupSuccessMessage("");
    setSubmitting(true);

    if (selectedRole !== "teacher") {
      setError(`${selectedRole === "student" ? "Student" : "Institution"} access isn't open yet — email ${WAITLIST_EMAIL} to join the waitlist or ask questions.`);
      setSubmitting(false);
      return;
    }

    try {
      if (mode === "signup") {
        // Beta gate: verified server-side (see services/api.ts's comment on
        // why) BEFORE we ever call supabase.auth.signUp() — a wrong or
        // missing code never reaches Supabase at all.
        const codeOk = await verifyReferralCode(referralCode.trim());
        if (!codeOk) {
          setError("That referral code isn't valid. Vivran is invite-only during beta — request access below and we'll get you one.");
          setSubmitting(false);
          return;
        }

        const result = await signUp(email.trim(), password, fullName.trim());
        if (!result.ok) {
          setError(result.error || "Could not create your account. Please try again.");
        } else if (result.needsEmailConfirmation) {
          setSignupSuccessMessage("Account created! Check your email to confirm it, then sign in below.");
          setMode("signin");
          setPassword("");
        } else {
          // Session was issued immediately (no email confirmation required
          // on this project) — TeacherLayout will show the onboarding
          // wizard automatically for this brand-new account.
          router.push(next);
        }
      } else {
        const ok = await login(email.trim(), password);
        if (ok) {
          router.push(next);
        } else {
          setError("Invalid email or password. Please try again.");
        }
      }
    } catch {
      setError(mode === "signup" ? "Could not create your account. Check your connection and try again." : "Could not sign in. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = useCallback(async () => {
    setError("");
    await loginWithGoogle();
  }, [loginWithGoogle]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-center py-12 px-6 lg:px-8 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#7C6EFA]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#4FC3F7]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md max-w-lg z-10">
        {/* Brand logo */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#7C6EFA] to-[#4FC3F7] flex items-center justify-center font-bold text-foreground shadow-lg shadow-[#7C6EFA]/20">
            विव
          </div>
          <span className="font-display font-extrabold text-2xl tracking-tight text-foreground">
            Vivran <span className="text-muted text-base font-normal">विवरण</span>
          </span>
        </div>

        <h2 className="text-center text-3xl font-extrabold font-display tracking-tight text-foreground">
          {mode === "signup" ? "Create Your Workspace" : "Enter Your Workspace"}
        </h2>
        <p className="mt-2 text-center text-sm text-muted">
          AI-powered teacher workflow & content creation platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg z-10">
        <div className="bg-surface border border-border backdrop-blur-xl py-8 px-6 shadow-2xl rounded-2xl sm:px-10">

          {/* Header pill */}
          <div className="flex justify-between items-center mb-6">
            <span className="text-xs uppercase tracking-wider font-semibold text-muted">
              Select Space
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 text-[#4FC3F7]">
              <Shield className="w-3 h-3" /> Secure Auth
            </span>
          </div>

          {/* Role selector cards (3 spaces) */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <button
              type="button"
              onClick={() => { setSelectedRole("teacher"); setError(""); }}
              className={`p-3 rounded-xl border text-left transition-all ${
                selectedRole === "teacher"
                  ? "bg-[#7C6EFA]/15 border-[#7C6EFA] text-white shadow-md shadow-[#7C6EFA]/10"
                  : "bg-white/5 border-border text-muted hover:border-white/20"
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mb-2 text-[#7C6EFA]">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="font-semibold text-sm text-foreground">Teacher</div>
              <div className="text-[10px] text-emerald-400 font-medium mt-0.5">Active Space</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedRole("student");
                setError(`Student access isn't open yet — email ${WAITLIST_EMAIL} to join the waitlist or ask questions.`);
              }}
              className={`p-3 rounded-xl border text-left transition-all opacity-60 ${
                selectedRole === "student"
                  ? "bg-[#7C6EFA]/15 border-[#7C6EFA] text-white"
                  : "bg-white/5 border-border text-muted"
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mb-2 text-[#4FC3F7]">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div className="font-semibold text-sm text-foreground">Student</div>
              <div className="text-[10px] text-muted font-medium mt-0.5">Coming Soon</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedRole("institution");
                setError(`Institution access isn't open yet — email ${WAITLIST_EMAIL} to join the waitlist or ask questions.`);
              }}
              className={`p-3 rounded-xl border text-left transition-all opacity-60 ${
                selectedRole === "institution"
                  ? "bg-[#7C6EFA]/15 border-[#7C6EFA] text-white"
                  : "bg-white/5 border-border text-muted"
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mb-2 text-purple-400">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="font-semibold text-sm text-foreground">Institution</div>
              <div className="text-[10px] text-muted font-medium mt-0.5">Coming Soon</div>
            </button>
          </div>

          {selectedRole !== "teacher" && (
            <div className="mb-6 p-3.5 rounded-xl bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 text-[#4FC3F7] text-xs leading-relaxed flex items-start gap-2">
              <Mail className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>{selectedRole === "student" ? "Student" : "Institution"} access is coming soon.</strong>{" "}
                Email{" "}
                <a href={`mailto:${WAITLIST_EMAIL}`} className="underline font-semibold">
                  {WAITLIST_EMAIL}
                </a>{" "}
                to join the waitlist or ask any questions.
              </span>
            </div>
          )}

          {signupSuccessMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              {signupSuccessMessage}
            </div>
          )}

          {/* Form */}
          <form className="space-y-4" onSubmit={handleLoginSubmit}>
            {mode === "signup" && selectedRole === "teacher" && (
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5 flex items-center gap-1.5">
                  <User className="w-3 h-3" /> Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  autoComplete="name"
                  required
                  className="w-full h-11 px-3.5 bg-white/5 border border-border rounded-xl text-foreground placeholder-[#55555F] text-sm focus:outline-none focus:border-[#7C6EFA] transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your school email"
                disabled={selectedRole !== "teacher"}
                autoComplete="email"
                required
                className="w-full h-11 px-3.5 bg-white/5 border border-border rounded-xl text-foreground placeholder-[#55555F] text-sm focus:outline-none focus:border-[#7C6EFA] transition-colors disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Create a password (min. 6 characters)" : "Enter your password"}
                disabled={selectedRole !== "teacher"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={mode === "signup" ? 6 : undefined}
                required
                className="w-full h-11 px-3.5 bg-white/5 border border-border rounded-xl text-foreground placeholder-[#55555F] text-sm focus:outline-none focus:border-[#7C6EFA] transition-colors disabled:opacity-50"
              />
            </div>

            {mode === "signup" && selectedRole === "teacher" && (
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5 flex items-center gap-1.5">
                  <KeyRound className="w-3 h-3" /> Referral Code
                </label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  placeholder="Enter the code we sent you"
                  autoComplete="off"
                  required
                  className="w-full h-11 px-3.5 bg-white/5 border border-border rounded-xl text-foreground placeholder-[#55555F] text-sm focus:outline-none focus:border-[#7C6EFA] transition-colors"
                />
                <p className="mt-1.5 text-[11px] text-muted">
                  Vivran is invite-only during beta.{" "}
                  <a href={REQUEST_ACCESS_MAILTO} className="text-[#4FC3F7] font-medium hover:underline">
                    Don&rsquo;t have a code? Request access
                  </a>
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs space-y-2">
                <div>{error}</div>
                {mode === "signup" && (
                  <a href={REQUEST_ACCESS_MAILTO} className="inline-flex items-center gap-1.5 text-[#4FC3F7] font-semibold hover:underline">
                    <Mail className="w-3.5 h-3.5" /> Request access via email
                  </a>
                )}
              </div>
            )}

            {authError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                Sign-in could not be completed. Please try again.
              </div>
            )}

            <button
              type="submit"
              disabled={selectedRole !== "teacher" || submitting}
              className="w-full h-11 bg-gradient-to-r from-[#7C6EFA] to-[#4FC3F7] text-white font-medium text-sm rounded-xl shadow-lg shadow-[#7C6EFA]/25 hover:opacity-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? mode === "signup" ? "Creating account..." : "Signing in..."
                : mode === "signup" ? "Create Account" : "Enter Teacher Terminal"}{" "}
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-4 text-center text-xs text-muted">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("signin")} className="text-[#4FC3F7] font-medium hover:underline">
                  Sign in
                </button>
              </>
            ) : (
              <>
                New to Vivran?{" "}
                <button type="button" onClick={() => switchMode("signup")} className="text-[#4FC3F7] font-medium hover:underline">
                  Create an account
                </button>
              </>
            )}
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs text-muted">
              <span className="bg-surface px-3">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={selectedRole !== "teacher"}
            className="w-full h-11 bg-white/5 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-white/10 hover:border-white/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
            </svg>
            Continue with Google
          </button>

          <div className="mt-6 p-3.5 rounded-xl bg-card border border-border text-xs text-muted leading-relaxed">
            🔑 <strong className="text-foreground">Teacher Beta:</strong> Use your school email. New
            accounts are auto-provisioned with a private workspace on first login.
          </div>
        </div>
      </div>
    </div>
  );
}
