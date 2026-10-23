"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { ASK_EVENT } from "@/app/components/ask-vivran";
import {
  Home,
  CalendarRange,
  BookOpenCheck,
  FileCheck2,
  FolderOpen,
  Library,
  LifeBuoy,
  Sparkles,
  Settings,
  User,
  LogOut,
} from "lucide-react";
import { BrandMark } from "@/app/components/brand-mark";

export function TeacherSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  // Plan, Teach and Assess follow a teacher's own cycle, and are named the
  // same here as on the dashboard and on each page (lib/catalog.ts).
  const navItems = [
    { label: "Home", href: "/teacher", icon: Home },
    { label: "Plan", href: "/teacher/plan", icon: CalendarRange },
    { label: "Teach", href: "/teacher/create", icon: BookOpenCheck },
    { label: "Assess", href: "/teacher/assess", icon: FileCheck2 },
    { label: "My sources", href: "/teacher/materials", icon: FolderOpen },
    { label: "Library", href: "/teacher/library", icon: Library },
    { label: "Settings", href: "/teacher/settings", icon: Settings },
    { label: "Help", href: "/teacher/help", icon: LifeBuoy },
  ];

  return (
    <aside className="hidden lg:flex w-64 border-r border-border bg-surface-2 flex-col h-screen sticky top-0 z-20">
      {/* Brand Header */}
      <div className="p-5 border-b border-border flex items-center justify-between">
        <Link href="/teacher" className="vv-mark-host flex items-center gap-2.5">
          <BrandMark className="w-9 h-9" />
          <div>
            <div className="font-display font-extrabold text-lg text-foreground leading-none">
              VIVRAN
            </div>
            <div className="text-[10px] text-muted mt-0.5 tracking-wider">
              विवरण · Teacher Terminal
            </div>
          </div>
        </Link>
        <ThemeToggle />
      </div>

      <div className="pt-4" />
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(ASK_EVENT))}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted hover:text-foreground hover:bg-card border border-border transition-colors"
        >
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="flex-1 text-left">Ask Vivran</span>
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-card text-faint font-sans">⌘K</kbd>
        </button>
      </div>

      {/* Primary Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent-soft text-foreground font-semibold border border-accent-line"
                  : "text-muted hover:text-foreground hover:bg-card"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-accent" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer Profile & Logout */}
      <div className="p-3 m-3 border border-border rounded-xl bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-card flex items-center justify-center text-foreground shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">
                {user?.name || "Teacher"}
              </div>
              <div className="text-[10px] text-muted truncate">
                {user?.school || "Teacher Beta Account"}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            aria-label="Logout"
            className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-card transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

