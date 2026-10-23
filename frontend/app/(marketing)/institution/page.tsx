import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, BookOpenCheck, Building2, CheckCircle2, Layers, ListChecks, ShieldCheck, Target, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Vivran for institutions | Schools, colleges and universities",
  description: "Give every teacher Vivran, and see teaching and learning across every classroom: syllabus coverage, where students struggle, and shared standards across departments.",
};

const MAIL = "mailto:info@vivran.co.in?subject=Vivran%20pilot%20for%20our%20institution&body=Name%3A%0ARole%3A%0AInstitution%3A%0ABoard%20or%20university%3A%0AApproximate%20number%20of%20teachers%20and%20students%3A%0AWhat%20we%20would%20most%20like%20to%20see%3A%0A";

const NOW = [
  { icon: BookOpenCheck, t: "Every teacher gets Vivran", d: "Course plans, slides, worksheets and papers built from your own syllabus and textbooks, each question traced to its page." },
  { icon: Layers, t: "Your formats, everywhere", d: "Vivran learns each department's paper format (sections, marks, question types) and offers it to every teacher." },
  { icon: ShieldCheck, t: "Grounded and checkable", d: "Anything not found in your material is flagged, not hidden, so heads of department can review with confidence." },
];
const PILOT = [
  { icon: ListChecks, t: "Coverage", d: "Taught vs planned, by class and section, without asking teachers for a report." },
  { icon: Target, t: "Where students struggle", d: "Topic-by-topic understanding from student practice, so help comes before the final marks." },
  { icon: BarChart3, t: "Time back for teaching", d: "Preparation time saved across departments, and where it goes." },
  { icon: Users, t: "Shared standards", d: "Paper formats and lesson templates a department adopts in one click." },
];
const STEPS = [
  { t: "A conversation", d: "We meet your principal or heads of department and pick one or two subjects and classes to start with." },
  { t: "Set up for your syllabus", d: "We load your board, syllabus and textbooks, and your existing paper formats." },
  { t: "Teachers use it for a term", d: "Teachers prepare lessons and papers with Vivran. We support them directly." },
  { t: "Review together", d: "We look at what was taught, what was learned and where students needed help, and decide what comes next." },
];

export default function InstitutionPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-14 sm:py-20 space-y-20">
      <section className="max-w-3xl">
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent"><Building2 className="w-4 h-4" /> For schools, colleges and universities</div>
        <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold font-display tracking-tight text-foreground leading-[1.05]">See teaching and learning across every classroom, before the final marks.</h1>
        <p className="mt-5 text-lg text-muted leading-relaxed">Today an institution sees marks, attendance and reports at the end. Vivran gives every teacher a way to prepare from your own syllabus, and gives the institution a clear view of what is taught, what is learned, and where students need help, while there is still time to act.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href={MAIL} className="btn-primary px-5 py-3 rounded-xl text-sm font-semibold inline-flex items-center gap-2">Start a pilot <ArrowRight className="w-4 h-4" /></a>
          <Link href="/tour" className="px-5 py-3 rounded-xl text-sm font-semibold border border-border bg-card text-foreground hover:border-accent-line">See the product tour</Link>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl font-extrabold font-display text-foreground">Live today, for every teacher</h2>
          <span className="text-xs font-semibold uppercase tracking-wider text-success">Available now</span>
        </div>
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          {NOW.map(({ icon: Icon, t, d }) => (
            <div key={t} className="p-5 rounded-2xl bg-surface border border-border">
              <Icon className="w-5 h-5 text-accent" />
              <div className="mt-3 font-semibold text-foreground">{t}</div>
              <p className="mt-1.5 text-sm text-muted leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="p-6 sm:p-10 rounded-3xl bg-ink text-ink-fg">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl font-extrabold font-display">The institution view, built with our pilot partners</h2>
          <span className="text-xs font-semibold uppercase tracking-wider opacity-70">In development</span>
        </div>
        <p className="mt-3 max-w-2xl text-sm opacity-80 leading-relaxed">Pilot institutions shape what this looks like. It is built on the same lessons and papers your teachers make, so every number traces back to a real lesson.</p>
        <div className="mt-7 grid sm:grid-cols-2 gap-4">
          {PILOT.map(({ icon: Icon, t, d }) => (
            <div key={t} className="p-5 rounded-2xl bg-white/5 border border-white/10">
              <Icon className="w-5 h-5 opacity-80" />
              <div className="mt-3 font-semibold">{t}</div>
              <p className="mt-1.5 text-sm opacity-75 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-extrabold font-display text-foreground">How a pilot works</h2>
        <ol className="mt-6 grid md:grid-cols-4 gap-4">
          {STEPS.map((s, i) => (
            <li key={s.t} className="p-5 rounded-2xl bg-surface border border-border">
              <div className="text-xs font-bold text-accent">STEP {i + 1}</div>
              <div className="mt-2 font-semibold text-foreground">{s.t}</div>
              <p className="mt-1.5 text-sm text-muted leading-relaxed">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid md:grid-cols-2 gap-8 items-start">
        <div>
          <h2 className="text-2xl font-extrabold font-display text-foreground">Your data stays yours</h2>
          <ul className="mt-5 space-y-3 text-sm text-muted">
            {["Your syllabus, material and papers are used only to serve your institution.", "Student work and student names are refused at upload.", "Handled in line with India's Digital Personal Data Protection Act, 2023.", "Delete any file, or everything, at any time."].map((t) => (
              <li key={t} className="flex gap-2.5"><CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />{t}</li>
            ))}
          </ul>
          <Link href="/privacy" className="mt-4 inline-block text-sm font-semibold text-accent hover:underline">Read the privacy policy</Link>
        </div>
        <div className="p-6 rounded-2xl bg-accent-soft border border-accent-line">
          <div className="text-lg font-bold font-display text-foreground">Bring Vivran to your institution</div>
          <p className="mt-2 text-sm text-muted leading-relaxed">Tell us about your institution and what you&rsquo;d most like to see. We reply ourselves, usually within two working days.</p>
          <a href={MAIL} className="mt-5 btn-primary px-5 py-3 rounded-xl text-sm font-semibold inline-flex items-center gap-2">Start a pilot <ArrowRight className="w-4 h-4" /></a>
          <p className="mt-3 text-xs text-muted">Or write to <a href="mailto:info@vivran.co.in" className="underline">info@vivran.co.in</a></p>
        </div>
      </section>
    </div>
  );
}
