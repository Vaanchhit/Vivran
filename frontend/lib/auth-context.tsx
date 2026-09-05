"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type Role = "teacher" | "student" | "institution";

export interface UserSession {
  username: string;
  name: string;
  role: Role;
  school?: string;
  authenticated: boolean;
}

interface AuthContextType {
  user: UserSession | null;
  login: (username: string, password: string, role: Role) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("vivran_user_session");
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch (e) {
        localStorage.removeItem("vivran_user_session");
      }
    }
    setLoading(false);
  }, []);

  const login = (username: string, password: string, role: Role): boolean => {
    if (role !== "teacher") {
      return false;
    }
    // Teacher proxy credential validation
    if (username.trim().toLowerCase() === "vaanchhit" && password === "123456") {
      const session: UserSession = {
        username: "vaanchhit",
        name: "Vaanchhit Agarwal",
        role: "teacher",
        school: "Delhi Public School",
        authenticated: true,
      };
      setUser(session);
      localStorage.setItem("vivran_user_session", JSON.stringify(session));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("vivran_user_session");
  };

  if (loading) {
    return <div className="min-h-screen bg-[#09090E] flex items-center justify-center text-[#8B8B99]">Loading Vivran...</div>;
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
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

