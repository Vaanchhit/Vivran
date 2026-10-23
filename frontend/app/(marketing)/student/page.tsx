import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Lightbulb, ListChecks, TrendingUp } from "lucide-react";

export const metadata: Metadata = {
  title: "Vivran for students | Learn from what was actually taught",
  description: "Revision and practice built from your own class's lessons, with mistakes explained and every answer linked to the page.",
};

const MAIL = "mailto:info@vivran.co.in?subject=Vivran%20for%20students%3A%20early%20access&body=Name%3A%0ASchool%20%2F%20college%3A%0AClass%20%2F%20year%20and%20course%3A%0A";
const FEATURES = [
  { icon: BookOpen, t: "Revise what was taught", d: "Revision cards built from your teacher's own lessons, not a generic course." },
  { icon: ListChecks, t: "Practice that explains", d: "A wrong answer gets the reason and a link to the page and slide it came from." },
  { icon: Lightbulb, t: "Stuck? Explain it simply", d: "Hard ideas explained with everyday examples, the numbers worked out." },
  { icon: TrendingUp, t: "Know what to revisit", d: "See what you have and what needs another look before the test, in minutes." },
];

export default function StudentPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-14 sm:py-20 space-y-14">
      <section className="max-w-3xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">For students · coming next</div>
        <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold font-display tracking-tight text-foreground leading-[1.05]">Learn from exactly what your teacher taught.</h1>
        <p className="mt-5 text-lg text-muted leading-relaxed">When your teacher uses Vivran, your revision and practice can come from the same lessons, the same examples and the same pages, instead of starting from scratch on YouTube.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href={MAIL} className="btn-primary px-5 py-3 rounded-xl text-sm font-semibold inline-flex items-center gap-2">Get early access <ArrowRight className="w-4 h-4" /></a>
          <Link href="/tour" className="px-5 py-3 rounded-xl text-sm font-semibold border border-border bg-card text-foreground hover:border-accent-line">See the student preview</Link>
        </div>
      </section>
      <section className="grid sm:grid-cols-2 gap-4">
        {FEATURES.map(({ icon: Icon, t, d }) => (
          <div key={t} className="p-5 rounded-2xl bg-surface border border-border">
            <Icon className="w-5 h-5 text-accent" />
            <div className="mt-3 font-semibold text-foreground">{t}</div>
            <p className="mt-1.5 text-sm text-muted leading-relaxed">{d}</p>
          </div>
        ))}
      </section>
      <p className="text-sm text-muted">The student space is in development and built with schools in our pilot. Teachers can use Vivran today. <Link href="/login" className="text-accent font-semibold hover:underline">Teacher login</Link></p>
    </div>
  );
}
