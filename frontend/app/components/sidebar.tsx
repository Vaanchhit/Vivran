"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  Plus,
  Home,
  CalendarRange,
  Sparkles,
  FileCheck2,
  FolderOpen,
  Library,
  Clock,
  Settings,
  User,
  LogOut,
} from "lucide-react";

export function TeacherSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const navItems = [
    { label: "Home", href: "/teacher", icon: Home },
    { label: "Plan", href: "/teacher/plan", icon: CalendarRange },
    { label: "Create", href: "/teacher/create", icon: Sparkles },
    { label: "Assess", href: "/teacher/assess", icon: FileCheck2 },
    { label: "My Materials", href: "/teacher/materials", icon: FolderOpen },
    { label: "Library", href: "/teacher/library", icon: Library },
    { label: "Recent", href: "/teacher/recent", icon: Clock },
    { label: "Settings", href: "/teacher/settings", icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-white/10 bg-[#0C0C12]/90 flex flex-col h-screen sticky top-0 z-20">
      {/* Brand Header */}
      <div className="p-5 border-b border-white/5 flex items-center justify-between">
        <Link href="/teacher" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#7C6EFA] to-[#4FC3F7] flex items-center justify-center font-bold text-white text-xs">
            विव
          </div>
          <div>
            <div className="font-display font-extrabold text-lg text-white leading-none">
              VIVRAN
            </div>
            <div className="text-[10px] text-[#8B8B99] mt-0.5 tracking-wider">
              विवरण · Teacher Terminal
            </div>
          </div>
        </Link>
      </div>

      {/* Quick Action Button */}
      <div className="p-4">
        <Link
          href="/teacher/create"
          className="w-full h-10 bg-[#7C6EFA] hover:bg-[#684af3] text-white font-medium text-sm rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#7C6EFA]/20"
        >
          <Plus className="w-4 h-4" /> Create Content
        </Link>
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
                  ? "bg-[#7C6EFA]/15 text-white font-semibold border border-[#7C6EFA]/30"
                  : "text-[#8B8B99] hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-[#7C6EFA]" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer Profile & Logout */}
      <div className="p-3 m-3 border border-white/10 rounded-xl bg-white/[0.02]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {user?.name || "Teacher"}
              </div>
              <div className="text-[10px] text-[#8B8B99] truncate">
                {user?.school || "Teacher Beta Account"}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="p-1.5 rounded-lg text-[#8B8B99] hover:text-red-400 hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

