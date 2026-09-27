import Link from "next/link";
import { GlobalHeader } from "@/app/components/global-header";

/** Chrome for /privacy, /terms, /student and /institution. The home page (/) is
 * public/home.html, served by the rewrite in next.config.mjs, and has its own. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
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
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
