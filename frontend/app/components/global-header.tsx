"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/app/components/theme-toggle";

export function GlobalHeader() {
  const pathname = usePathname();

  // Teacher workspace has its own sidebar chrome; hide the public header there.
  if (pathname.startsWith("/teacher") || pathname.startsWith("/login")) {
    return null;
  }

  return (
    <header className="w-full border-b border-border bg-background/85 backdrop-blur-2xl sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/landing" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#7C6EFA] to-[#4FC3F7] flex items-center justify-center font-bold text-white text-xs">
            विव
          </div>
          <span className="font-display font-extrabold text-lg tracking-tight text-foreground">
            VIVRAN
          </span>
        </Link>

        <nav className="hidden sm:flex items-center gap-6 text-sm text-muted">
          <Link href="/landing" className="hover:text-foreground transition-colors">Home</Link>
          <Link href="/teacher" className="hover:text-foreground transition-colors">Teacher</Link>
          <Link href="/student" className="hover:text-foreground transition-colors">Student</Link>
          <Link href="/institution" className="hover:text-foreground transition-colors">Institution</Link>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/login"
            className="grad-btn px-4 py-2 text-white text-sm font-medium rounded-xl"
          >
            Login
          </Link>
        </div>
      </div>
    </header>
  );
}