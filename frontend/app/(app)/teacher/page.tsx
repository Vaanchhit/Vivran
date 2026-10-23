"use client";

// Home: a teacher's day, not a menu.
//
//   1. Today        greeting, date, the classes they teach
//   2. Ask          one box that routes itself (deck, paper, notes…), and what it will use
//   3. Continue     the last few things they made, one click to resume
//   4. For you      suggestions from their own habits and requests; a click only
//                   fills the box or opens a form, nothing is generated for them
//   5. Sources      facts + style health in one card (My sources)
//   6. Explain simply, the feature nothing else has
//
// The sidebar already lists every tool, so Home no longer repeats it as a grid.
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, FolderKanban, FolderOpen, Lightbulb, PenLine, Presentation, RotateCcw, Sparkles, FileCheck2 } from "lucide-react";
import { SmartPromptBox } from "@/app/components/smart-prompt-box";
import { RecentProjects } from "@/app/components/recent-projects";
import { useAuth } from "@/lib/auth-context";
import { setTabValue } from "@/lib/tab-state";
import { getRecentPrompts, getTeachingMemory, getUsualSetup, listSources, type RecentPrompt, type Source, type StyleTrait, type UsualSetup } from "@/services/api";
import { BookLoader } from "@/app/components/book-loader";
import { Item, Stagger } from "@/app/components/motion";

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function TeacherHome() {
  const { user } = useAuth();
  const [now] = useState(() => new Date());
  const [sources, setSources] = useState<Source[] | null>(null);
  const [traits, setTraits] = useState<StyleTrait[]>([]);
  const [prompts, setPrompts] = useState<RecentPrompt[]>([]);
  const [usual, setUsual] = useState<{ slides: UsualSetup | null; test: UsualSetup | null }>({ slides: null, test: null });

  useEffect(() => {
    // Each card fails quietly on its own: Home never breaks because one service is slow.
    listSources().then((r) => setSources(r.sources)).catch(() => setSources([]));
    getTeachingMemory().then((m) => setTraits(m.traits)).catch(() => undefined);
    getRecentPrompts().then((r) => setPrompts(r.prompts.slice(0, 3))).catch(() => undefined);
    Promise.all([getUsualSetup("slides").catch(() => null), getUsualSetup("test").catch(() => null)])
      .then(([s, t]) => setUsual({ slides: s?.usual ?? null, test: t?.usual ?? null }));
  }, []);

  const subjects = user?.preferredSubjects ?? [];
  const grades = user?.preferredGrades ?? [];
  const firstName = (user?.name || "Teacher").split(" ")[0];

  const health = useMemo(() => ({
    facts: sources?.filter((s) => s.facts?.status === "READY").length ?? 0,
    style: sources?.filter((s) => s.style).length ?? 0,
    pending: traits.filter((t) => t.status === "suggested").length,
    inUse: traits.filter((t) => t.status === "active").length,
  }), [sources, traits]);

  const fillBox = (text: string) => {
    setTabValue("home:prompt", text, "");
    document.getElementById("home-ask")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* 1. Today */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-foreground tracking-tight mt-1">
            {greeting(now)}, {firstName}
          </h1>
          <p className="text-sm text-muted mt-1">What are you teaching next? Say it in your own words.</p>
        </div>
        {(subjects.length > 0 || grades.length > 0) && (
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {[...subjects.slice(0, 3), ...grades.slice(0, 3)].map((x) => (
              <span key={x} className="px-2.5 py-1 rounded-full bg-card border border-border text-[11px] text-muted">{x}</span>
            ))}
            <Link href="/teacher/settings" className="px-2.5 py-1 rounded-full text-[11px] text-accent hover:underline">Edit</Link>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-8 min-w-0">
          {/* 2. Ask */}
          <section id="home-ask" className="scroll-mt-6 space-y-2">
            <SmartPromptBox />
            <UsingLine facts={health.facts} inUse={health.inUse} />
          </section>

          {/* 3. Continue */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold font-display text-foreground flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-accent" /> Continue where you left off
              </h2>
              <Link href="/teacher/library" className="text-xs font-medium text-accent hover:underline">All your work →</Link>
            </div>
            <RecentProjects limit={3} />
          </section>
        </div>

        <Stagger className="space-y-4 min-w-0" delay={0.08}>
          <Item>
          {/* 4. For you */}
          <Card title="For you" icon={<Sparkles className="w-4 h-4 text-accent" />}>
            <div className="space-y-2">
              {usual.slides && (
                <Suggestion icon={<Presentation className="w-3.5 h-3.5" />} href="/teacher/create?type=slides"
                  text={`Your usual deck: ${usual.slides.label}`} action="Start" />
              )}
              {usual.test && (
                <Suggestion icon={<FileCheck2 className="w-3.5 h-3.5" />} href="/teacher/assess?mode=test"
                  text={`Your usual test: ${usual.test.label}`} action="Start" />
              )}
              {prompts.map((p) => (
                <button key={p.id} type="button" onClick={() => fillBox(p.text)}
                  className="w-full text-left p-2.5 rounded-xl bg-card border border-border hover:border-accent-line text-xs flex items-start gap-2 group">
                  <RotateCcw className="w-3.5 h-3.5 mt-0.5 text-muted group-hover:text-accent shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-foreground line-clamp-2">{p.text}</span>
                    <span className="block text-[11px] text-muted mt-0.5">Do it again: puts it in the box to edit</span>
                  </span>
                </button>
              ))}
              {health.pending > 0 && (
                <Suggestion icon={<PenLine className="w-3.5 h-3.5" />} href="/teacher/materials?tab=style"
                  text={`Vivran noticed ${health.pending} pattern${health.pending > 1 ? "s" : ""} in how you work`} action="Review" />
              )}
              {!usual.slides && !usual.test && prompts.length === 0 && health.pending === 0 && (
                <p className="text-xs text-muted leading-relaxed">
                  As you use Vivran, your usual setups and repeat requests show up here, one click away. Nothing is
                  made for you without asking.
                </p>
              )}
            </div>
          </Card>
          </Item>
          <Item>
          {/* 5. Sources */}
          <Card title="My sources" icon={<FolderOpen className="w-4 h-4 text-accent" />} href="/teacher/materials">
            {sources === null ? (
              <div className="flex items-center gap-2 text-xs text-muted"><BookLoader className="w-4 h-4" /> Loading…</div>
            ) : sources.length === 0 ? (
              <div className="space-y-2.5">
                <p className="text-xs text-muted leading-relaxed">
                  Add the chapter you teach next and a paper you set last term. Vivran then writes from your book and
                  in your format.
                </p>
                <Link href="/teacher/materials" className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline">
                  Add a source <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric n={health.facts} label="for facts" />
                <Metric n={health.style} label="teach style" />
                <Metric n={health.inUse} label="patterns used" accent={health.pending > 0} sub={health.pending ? `${health.pending} to review` : undefined} />
              </div>
            )}
          </Card>
          </Item>
          <Item>
          {/* 6. Explain simply */}
          <Link href="/teacher/create?type=example"
            className="block p-4 rounded-2xl border border-accent-line bg-accent-soft hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-2 text-sm font-bold font-display text-foreground">
              <Lightbulb className="w-4 h-4 text-accent" /> Explain it simply
            </div>
            <p className="text-xs text-muted mt-1.5 leading-relaxed">
              A concept your class keeps missing? Get an everyday example with the numbers worked out, and a picture to draw on the board.
            </p>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent mt-2">Try it <ArrowRight className="w-3.5 h-3.5" /></span>
          </Link>
          </Item>
        </Stagger>
      </div>
    </div>
  );
}

function UsingLine({ facts, inUse }: { facts: number; inUse: number }) {
  if (!facts && !inUse) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted px-1">
      <BookOpenCheck className="w-3.5 h-3.5" />
      <span>
        Vivran writes from {facts ? <strong className="text-foreground">{facts} source{facts > 1 ? "s" : ""}</strong> : "general knowledge"}
        {inUse ? <> in <strong className="text-foreground">your style ({inUse} pattern{inUse > 1 ? "s" : ""})</strong></> : null}.
      </span>
      <Link href="/teacher/materials" className="text-accent hover:underline">Manage</Link>
    </div>
  );
}

function Card({ title, icon, href, children }: { title: string; icon: React.ReactNode; href?: string; children: React.ReactNode }) {
  return (
    <section className="p-4 rounded-2xl bg-surface border border-border space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold font-display text-foreground flex items-center gap-2">{icon} {title}</h2>
        {href && <Link href={href} className="text-[11px] font-medium text-accent hover:underline">Open</Link>}
      </div>
      {children}
    </section>
  );
}

function Suggestion({ icon, text, href, action }: { icon: React.ReactNode; text: string; href: string; action: string }) {
  return (
    <Link href={href} className="p-2.5 rounded-xl bg-card border border-border hover:border-accent-line text-xs flex items-center gap-2 group">
      <span className="text-muted group-hover:text-accent shrink-0">{icon}</span>
      <span className="flex-1 min-w-0 text-foreground line-clamp-2">{text}</span>
      <span className="text-accent font-semibold shrink-0">{action}</span>
    </Link>
  );
}

function Metric({ n, label, accent, sub }: { n: number; label: string; accent?: boolean; sub?: string }) {
  return (
    <div className={`p-2 rounded-xl border ${accent ? "bg-accent-soft border-accent-line" : "bg-card border-border"}`}>
      <div className="text-lg font-extrabold font-display text-foreground leading-none">{n}</div>
      <div className="text-[10.5px] text-muted mt-1 leading-tight">{label}</div>
      {sub && <div className="text-[10px] text-accent mt-0.5">{sub}</div>}
    </div>
  );
}
