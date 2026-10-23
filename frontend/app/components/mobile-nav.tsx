"use client";

// Phones and small tablets: a top bar (brand, Ask) and a bottom tab bar with the
// four places teachers go most. Everything else sits in "More". The desktop
// sidebar is hidden below lg, so the page gets the whole width.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpenCheck, CalendarRange, FileCheck2, FolderOpen, Home, LifeBuoy, Library, LogOut, MoreHorizontal, Settings, Sparkles, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ASK_EVENT } from "@/app/components/ask-vivran";
import { BrandMark } from "@/app/components/brand-mark";
import { ThemeToggle } from "@/app/components/theme-toggle";

const TABS = [
  { label: "Home", href: "/teacher", icon: Home },
  { label: "Teach", href: "/teacher/create", icon: BookOpenCheck },
  { label: "Assess", href: "/teacher/assess", icon: FileCheck2 },
  { label: "Sources", href: "/teacher/materials", icon: FolderOpen },
];
const MORE = [
  { label: "Plan a course", href: "/teacher/plan", icon: CalendarRange },
  { label: "Library", href: "/teacher/library", icon: Library },
  { label: "Settings", href: "/teacher/settings", icon: Settings },
  { label: "Help", href: "/teacher/help", icon: LifeBuoy },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const active = (href: string) => (href === "/teacher" ? pathname === href : pathname.startsWith(href));
  const moreActive = MORE.some((m) => active(m.href));

  return (
    <>
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b border-border bg-surface-2/90 backdrop-blur">
        <Link href="/teacher" className="flex items-center gap-2">
          <BrandMark className="w-7 h-7" />
          <span className="font-display font-extrabold text-base text-foreground">VIVRAN</span>
        </Link>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => window.dispatchEvent(new Event(ASK_EVENT))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card text-xs font-medium text-foreground">
            <Sparkles className="w-3.5 h-3.5 text-accent" /> Ask
          </button>
          <ThemeToggle />
        </div>
      </header>

      <nav aria-label="Main" className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-surface-2/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-5">
          {TABS.map(({ label, href, icon: Icon }) => (
            <li key={href}>
              <Link href={href} aria-current={active(href) ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium ${active(href) ? "text-accent" : "text-muted"}`}>
                {active(href) && <motion.span layoutId="tab-dot" className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
                <Icon className="w-5 h-5" /> {label}
              </Link>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setOpen(true)} aria-expanded={open}
              className={`w-full flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium ${moreActive ? "text-accent" : "text-muted"}`}>
              <MoreHorizontal className="w-5 h-5" /> More
            </button>
          </li>
        </ul>
      </nav>

      <AnimatePresence>
        {open && (
          <>
            <motion.div key="scrim" className="lg:hidden fixed inset-0 z-40 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div key="sheet" role="dialog" aria-label="More"
              className="lg:hidden fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-1"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 320 }}>
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-bold font-display text-foreground">More</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-lg text-muted"><X className="w-4 h-4" /></button>
              </div>
              {MORE.map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href} className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm ${active(href) ? "bg-accent-soft text-foreground" : "text-foreground hover:bg-card"}`}>
                  <Icon className="w-4 h-4 text-muted" /> {label}
                </Link>
              ))}
              <button type="button" onClick={() => { logout(); router.push("/login"); }} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-danger hover:bg-card">
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
