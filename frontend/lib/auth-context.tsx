"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  clearApiAuth,
  setApiAuth,
  provisionWorkspace,
  updatePreferences as apiUpdatePreferences,
  deleteAccount as apiDeleteAccount,
  type ProvisionResponse,
  type PreferencesPayload,
} from "@/services/api";
import type { UserSession } from "@/types";

export interface SignUpResult {
  ok: boolean;
  error?: string;
  /** True when the Supabase project requires email confirmation before a
   * session exists — the caller should tell the teacher to check their inbox
   * rather than navigating anywhere (there's no session to sync yet). */
  needsEmailConfirmation?: boolean;
}

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<SignUpResult>;
  logout: () => Promise<void>;
  /** Saves the onboarding wizard's answers and flips onboardingCompleted to
   * true on the local user object immediately, so TeacherLayout stops
   * showing the wizard without needing a full session resync. */
  completeOnboarding: (prefs: PreferencesPayload) => Promise<boolean>;
  /** Permanently deletes the signed-in teacher's account (backend + Supabase
   * Auth user). Does NOT sign the user out locally — callers should call
   * logout() themselves right after a successful delete. */
  deleteAccount: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toUserSession(
  apiUser: import("@supabase/supabase-js").User,
  provision?: ProvisionResponse,
): UserSession {
  const meta = apiUser.user_metadata ?? {};
  const email = apiUser.email ?? "";
  return {
    id: apiUser.id,
    email,
    username: email.split("@")[0] || "teacher",
    name: meta.full_name || meta.name || email.split("@")[0] || "Teacher",
    role: "teacher",
    school: meta.school || undefined,
    avatar_url: meta.avatar_url || meta.picture || undefined,
    workspace_id: provision?.workspace_id,
    authenticated: true,
    // Fail open when provisioning didn't run/succeed (e.g. backend
    // unreachable) — never trap someone behind a wizard they can't
    // complete because the network call that would tell us otherwise failed.
    onboardingCompleted: provision?.onboarding_completed ?? true,
    preferredSubjects: provision?.subjects,
    preferredGrades: provision?.grades,
    preferredLanguage: provision?.preferred_language ?? undefined,
    preferredDifficulty: provision?.preferred_difficulty ?? undefined,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  // createClient() is browser-only; guard for safety server-side.
  const supabase = typeof window !== "undefined" ? createClient() : null;

  const syncSession = useCallback(async (session: { user: import("@supabase/supabase-js").User; access_token: string } | null) => {
    if (!session?.user) {
      setUser(null);
      clearApiAuth();
      setLoading(false);
      return;
    }

    // First-login provisioning: returns the teacher's workspace id plus
    // onboarding status + saved preferences.
    try {
      const data = await provisionWorkspace(session.access_token);
      setApiAuth(session.access_token, data.workspace_id);
      setUser(toUserSession(session.user, data));
    } catch {
      setApiAuth(session.access_token, null);
      setUser(toUserSession(session.user));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => syncSession(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSession(session);
    });

    return () => subscription.unsubscribe();
  }, [supabase, syncSession]);

  const login = async (email: string, password: string): Promise<boolean> => {
    if (!supabase) return false;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) return false;
    // Wait for the full session sync (incl. the workspace-provisioning call)
    // before resolving. The caller navigates to /teacher immediately after
    // this returns true — without awaiting here, that navigation could win
    // the race against onAuthStateChange's async syncSession, so
    // TeacherLayout's guard would still see `user === null` for a moment
    // and bounce straight back to /login even though sign-in succeeded.
    await syncSession(data.session);
    return true;
  };

  const loginWithGoogle = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const signUp = async (email: string, password: string, fullName: string): Promise<SignUpResult> => {
    if (!supabase) return { ok: false, error: "Not available" };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { ok: false, error: error.message };
    if (!data.session) {
      // Project requires email confirmation before a session is issued —
      // there's nothing to sync yet. The login page tells the teacher to
      // check their inbox and switches back to sign-in mode.
      return { ok: true, needsEmailConfirmation: true };
    }
    // Same "await full sync before resolving" contract as login() — see its
    // comment above. A brand-new account provisions with
    // onboarding_completed=false, so TeacherLayout will show the wizard.
    await syncSession(data.session);
    return { ok: true };
  };

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    clearApiAuth();
  };

  const completeOnboarding = async (prefs: PreferencesPayload): Promise<boolean> => {
    try {
      const data = await apiUpdatePreferences(prefs);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              onboardingCompleted: true,
              preferredSubjects: data.subjects,
              preferredGrades: data.grades,
              preferredLanguage: data.preferred_language ?? undefined,
              preferredDifficulty: data.preferred_difficulty ?? undefined,
            }
          : prev,
      );
      return true;
    } catch {
      return false;
    }
  };

  const deleteAccount = async (): Promise<boolean> => {
    try {
      await apiDeleteAccount();
      return true;
    } catch {
      return false;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted">
        Loading Vivran...
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, loginWithGoogle, signUp, logout, completeOnboarding, deleteAccount }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
