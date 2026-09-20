"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlobalHeader } from "@/app/components/global-header";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The root landing page ships its own complete nav + footer (ported from
  // the original static design) — stacking this layout's generic header/
  // footer on top of it would duplicate navigation. /student and
  // /institution still use the shared marketing chrome.
  const isRoot = pathname === "/";

  if (isRoot) return <>{children}</>;

  return (
    <>
      <GlobalHeader />
      <main>{children}</main>
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted">
          <span>© {new Date().getFullYear()} Vivran (विवरण) — built for teachers, students &amp; institutions.</span>
          <div className="flex items-center gap-5">
            <Link href="/teacher" className="hover:text-foreground transition-colors">Teacher</Link>
            <Link href="/student" className="hover:text-foreground transition-colors">Student</Link>
            <Link href="/institution" className="hover:text-foreground transition-colors">Institution</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Login</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
