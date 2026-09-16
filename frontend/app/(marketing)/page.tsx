import Link from "next/link";
import {
  Sparkles,
  BookOpenCheck,
  FileCheck2,
  GraduationCap,
  Layers,
  ArrowRight,
  Database,
  Quote,
} from "lucide-react";
import { StakeholderScroller } from "./stakeholder-scroller";

const pillars = [
  {
    title: "Coursework Planning",
    desc: "Sequenced course plans, lesson plans, unit structures and weekly roadmaps built from your syllabus.",
    icon: BookOpenCheck,
    href: "/teacher/plan",
  },
  {
    title: "Classroom Content",
    desc: "Slides, worksheets, lesson notes and video scripts — coherent, editable, and aligned to your course.",
    icon: Layers,
    href: "/teacher/create",
  },
  {
    title: "Assessment Creation",
    desc: "Structured test papers, quizzes and question banks with marks validation and rubrics.",
    icon: FileCheck2,
    href: "/teacher/assess",
  },
  {
    title: "Interactive Coursework",
    desc: "Block-based interactive lessons that blend explanation, activity and assessment into one flow.",
    icon: GraduationCap,
    href: "/teacher/create",
  },
];

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Hero radial glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/4 w-[540px] h-[540px] rounded-full" style={{ background: "radial-gradient(circle, rgba(124,110,250,0.12) 0%, transparent 70%)" }} />
        <div className="absolute -top-10 right-0 w-[420px] h-[420px] rounded-full" style={{ background: "radial-gradient(circle, rgba(79,195,247,0.07) 0%, transparent 70%)" }} />
      </div>

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-[0.1em] text-[#7C6EFA] bg-[#7C6EFA]/8 border border-[#7C6EFA]/20 mb-6">
          <Sparkles className="w-3.5 h-3.5" /> AI Teacher Workflow Platform
        </span>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1]">
          Changing how teaching happens —
          <br className="hidden sm:block" />
          <span className="grad-text">because what&rsquo;s being taught is changing rapidly.</span>
        </h1>

        <p className="mt-6 max-w-2xl mx-auto text-lg text-muted leading-relaxed">
          Vivran (विवरण) plans your coursework, creates your slides &amp; worksheets,
          builds your assessments, and assembles interactive lessons — grounded in the
          materials <em className="not-italic text-foreground">you</em> already teach with.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/login" className="grad-btn px-7 py-3.5 rounded-2xl text-white font-semibold flex items-center gap-2 group">
            Enter Teacher Workspace
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link href="/login" className="glass-btn px-7 py-3.5 rounded-2xl text-foreground font-medium hover:border-[#7C6EFA]/40 transition-colors">
            Login
          </Link>
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted">
          <span className="flex items-center gap-2"><Database className="w-4 h-4 text-[#4FC3F7]" /> Grounded in your materials</span>
          <span className="flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-[#7C6EFA]" /> Marks &amp; rubric validation</span>
          <span className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-emerald-400" /> Built for classrooms &amp; college courses</span>
        </div>
      </section>

      {/* Three stakeholders — dynamic scroll-linked section */}
      <section className="relative border-t border-border">
        <div className="max-w-6xl mx-auto px-6 pt-16 pb-6 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7C6EFA]">Three People Make A Classroom Work</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight">Built for teachers, students, and institutions</h2>
          <p className="mt-3 text-muted max-w-xl mx-auto text-sm">Scroll — this section changes as you go.</p>
        </div>
        <StakeholderScroller />
      </section>

      {/* Feynman Technique callout */}
      <section className="relative max-w-4xl mx-auto px-6 py-20 border-t border-border">
        <div className="p-10 rounded-3xl bg-surface border border-border backdrop-blur-xl relative overflow-hidden">
          <Quote className="w-10 h-10 text-[#7C6EFA]/40 mb-4" />
          <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground leading-snug">
            &ldquo;If you can&rsquo;t explain it simply, you don&rsquo;t understand it well enough.&rdquo;
          </p>
          <p className="mt-3 text-sm text-muted">— words often attributed to Richard Feynman, and the whole premise behind what's now taught as the <strong className="text-foreground">Feynman Technique</strong>: you don&rsquo;t truly know a topic until you can teach it in plain language.</p>
          <p className="mt-6 text-base text-muted leading-relaxed max-w-2xl">
            Vivran is built on that same discipline. Every plan, slide and worksheet it generates is grounded in
            your own material and written the way real understanding sounds — simple, concrete, and built up from
            first principles, not jargon dressed up as depth.
          </p>
        </div>
      </section>

      {/* Pillars */}
      <section className="relative max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-end justify-between mb-10">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7C6EFA]">Four Pillars</span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">What Vivran creates for you</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <Link
                key={pillar.title}
                href={pillar.href}
                className="group p-7 rounded-3xl bg-surface border border-border backdrop-blur-xl hover:-translate-y-1 transition-all hover:border-[#7C6EFA]/40 hover:shadow-[0_20px_60px_rgba(0,0,0,0.4),0_0_40px_rgba(124,110,250,0.1)]"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#7C6EFA]/20 to-[#4FC3F7]/20 border border-white/10 flex items-center justify-center mb-5 text-[#7C6EFA]">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold tracking-tight flex items-center gap-2">
                  {pillar.title}
                  <ArrowRight className="w-4 h-4 text-muted opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">{pillar.desc}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="relative max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="p-10 rounded-3xl bg-surface border border-border backdrop-blur-xl relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full" style={{ background: "radial-gradient(circle, rgba(124,110,250,0.12) 0%, transparent 70%)" }} />
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight relative">
            Ready to plan tomorrow&rsquo;s <span className="grad-text">lesson?</span>
          </h2>
          <p className="mt-3 text-muted relative">
            Built as a small MVP, now onboarding teachers &amp; commerce college professors for beta testing.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 relative">
            <Link href="/login" className="grad-btn px-7 py-3.5 rounded-2xl text-white font-semibold">
              Start Teaching
            </Link>
            <Link href="/student" className="glass-btn px-7 py-3.5 rounded-2xl text-muted hover:text-foreground transition-colors">
              Student Space — Coming Soon
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
