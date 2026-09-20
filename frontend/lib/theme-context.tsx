"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
type ThemeContextType = { theme: Theme; toggleTheme: () => void };

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "vivran_theme";

function getInitialTheme(): Theme {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  }
  return "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // Single effect for the initial mount: compute the real theme (saved
  // choice, else system preference) and apply it to the DOM directly here.
  // This used to be two separate effects — one computing the initial theme
  // via setTheme(), another syncing `theme` to the DOM on every change —
  // but both fire in the SAME initial commit, and the sync effect ran with
  // the stale pre-update `theme` value ("dark"), immediately overwriting
  // the correct system-preferred value before the re-render could apply
  // it. Net effect: the page always ended up dark, regardless of system
  // preference, until a manual toggle. `mounted` lets the second effect
  // below skip that same redundant first-pass fire and only react to
  // real subsequent changes (i.e. toggleTheme()).
  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, mounted]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}