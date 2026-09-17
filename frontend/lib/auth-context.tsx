"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearApiAuth, setApiAuth, provisionWorkspace } from "@/services/api";
import type { UserSession } from "@/types";

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toUserSession(
  apiUser: import("@supabase/supabase-js").User,
  workspaceId?: string,
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
    workspace_id: workspaceId,
    authenticated: true,
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

    // First-login provisioning: returns the teacher's workspace id.
    try {
      const data = await provisionWorkspace(session.access_token);
      setApiAuth(session.access_token, data.workspace_id);
      setUser(toUserSession(session.user, data.workspace_id));
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

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    clearApiAuth();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted">
        Loading Vivran...
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, logout }}>
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