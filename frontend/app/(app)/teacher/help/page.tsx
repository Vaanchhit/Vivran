"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LifeBuoy, Mail, MessageCircle, Search } from "lucide-react";
import { FeatureExplainer } from "@/app/components/feature-explainer";
import { STAGES, type CatalogItem } from "@/lib/catalog";
import { HELP_ENTRIES, HELP_SECTIONS, type HelpEntry, type HelpSection } from "@/lib/help-content";
import { buildIndex, lookup, searchHelp } from "@/lib/help-search";
import { WAITLIST_EMAIL, helpMailto, helpWhatsApp } from "@/lib/constants";

const CATALOG: Record<string, CatalogItem> = Object.fromEntries(STAGES.flatMap((s) => s.items).map((it) => [it.key, it]));
const VOTES_KEY = "vivran.help.votes";

/** "Did this help?" answers, kept in this browser only (nothing is sent anywhere). */
function readVotes(): Record<string, "yes" | "no"> {
  try {
    return JSON.parse(localStorage.getItem(VOTES_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function HelpPage() {
  return (
    <Suspense fallback={null}>
      <HelpPageInner />
    </Suspense>
  );
}

function HelpPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(query);
  const [votes, setVotes] = useState<Record<string, "yes" | "no">>({});
  const [active, setActive] = useState<string>("start");
  const index = useMemo(() => buildIndex(HELP_ENTRIES), []);

  useEffect(() => setVotes(readVotes()), []);

  // Search waits for a pause in typing, and the question stays in the URL so
  // a link to /teacher/help?q=... opens with the answer showing.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(query);
      const q = query.trim();
      if (q === (params.get("q") ?? "").trim()) return;
      router.replace(q ? `${window.location.pathname}?q=${encodeURIComponent(q)}` : window.location.pathname, { scroll: false });
    }, 150);
    return () => clearTimeout(t);
  }, [query, router, params]);

  const q = debounced.trim();
  const result = useMemo(() => (q ? lookup(q, index) : null), [q, index]);
  // While searching, sections without a matching entry fold away.
  const matchingSections = useMemo(() => {
    // Only when there is a confident answer: a vague or unanswerable question shouldn't hide the guide.
    if (!q || result?.kind !== "answer") return null;
    return new Set(searchHelp(q, index).filter((m) => m.score > 0).map((m) => m.entry.section));
  }, [q, index, result]);
  const visibleSections = HELP_SECTIONS.filter((s) => !matchingSections || matchingSections.has(s.id) || s.id === "start");

  // Highlight the section in view in the contents list.
  useEffect(() => {
    const els = HELP_SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [visibleSections.length]);

  const vote = (id: string, v: "yes" | "no") => {
    const next = { ...readVotes(), [id]: v };
    try {
      localStorage.setItem(VOTES_KEY, JSON.stringify(next));
    } catch {
      /* private window: the vote just isn't remembered */
    }
    setVotes(next);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
          <LifeBuoy className="w-6 h-6 text-accent" /> Help
        </h1>
        <p className="text-sm text-muted mt-1">How everything in Vivran works, and how to reach us when it doesn&rsquo;t.</p>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_13rem] gap-10">
        <div className="space-y-10 min-w-0">
          {/* Ask */}
          <section className="p-5 rounded-2xl bg-surface border border-border space-y-4" role="search">
            <label htmlFor="help-q" className="text-sm font-bold text-foreground font-display block">
              Ask a question or search help
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="help-q"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. how do I print a paper?"
                className="w-full pl-9 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-accent"
              />
            </div>

            <div aria-live="polite" className="sr-only">
              {!result
                ? ""
                : result.kind === "answer"
                  ? `${1 + result.related.length} answers found`
                  : result.kind === "suggest"
                    ? `${result.suggestions.length} closest matches`
                    : "No answer found"}
            </div>

            {q && result?.kind === "answer" && (
              <div className="space-y-2">
                <AnswerCard entry={result.best} vote={votes[result.best.id]} onVote={vote} prominent />
                {result.related.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Related</div>
                    {result.related.map((e) => (
                      <details key={e.id} className="rounded-xl bg-card border border-border text-xs group">
                        <summary className="px-3.5 py-2.5 cursor-pointer select-none text-foreground font-medium">{e.q}</summary>
                        <div className="px-3.5 pb-3.5"><AnswerBody entry={e} /></div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            )}

            {q && result?.kind === "suggest" && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {result.suggestions.length === 1 ? "Closest match" : "Closest matches"}
                </div>
                {result.suggestions.map((e, i) => (
                  <details key={e.id} open={i === 0} className="rounded-xl bg-card border border-border text-xs">
                    <summary className="px-3.5 py-2.5 cursor-pointer select-none text-foreground font-medium">{e.q}</summary>
                    <div className="px-3.5 pb-3.5 space-y-2.5">
                      <AnswerBody entry={e} />
                      <div className="flex flex-wrap gap-3">
                        {e.links?.map((l) => (
                          <Link key={l.href} href={l.href} className="text-accent hover:underline inline-flex items-center gap-1">
                            {l.label} <ArrowRight className="w-3 h-3" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  </details>
                ))}
                <p className="text-[11px] text-muted pt-1">
                  Not what you meant? Keep typing, or{" "}
                  <a href={helpMailto(q)} className="text-accent hover:underline">ask us directly</a>.
                </p>
              </div>
            )}

            {q && result?.kind === "none" && <NoAnswer question={q} />}
          </section>

          {/* Sections */}
          {visibleSections.map((section) =>
            section.id === "start" ? (
              <GetStarted key={section.id} section={section} />
            ) : (
              <HelpSectionBlock
                key={section.id}
                section={section}
                entries={HELP_ENTRIES.filter((e) => e.section === section.id)}
              />
            ),
          )}

          <ContactCard />
        </div>

        {/* Contents */}
        <nav aria-label="Help contents" className="hidden lg:block">
          <div className="sticky top-8 space-y-1 text-xs">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">On this page</div>
            {HELP_SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`block px-2.5 py-1.5 rounded-lg transition-colors ${
                  active === s.id ? "bg-accent-soft text-foreground font-semibold" : "text-muted hover:text-foreground"
                }`}
              >
                {s.title}
              </a>
            ))}
            <a href="#contact" className="block px-2.5 py-1.5 rounded-lg text-muted hover:text-foreground">Talk to us</a>
          </div>
        </nav>
      </div>
    </div>
  );
}

/** An answer laid out the same way everywhere: a one-line answer, numbered
 * steps to follow, then bullet points. */
function AnswerBody({ entry }: { entry: HelpEntry }) {
  return (
    <div className="space-y-2.5 text-xs">
      {entry.a && <p className="text-foreground leading-relaxed">{entry.a}</p>}
      {entry.steps && (
        <ol className="space-y-2">
          {entry.steps.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-muted leading-relaxed">
              <span className="w-5 h-5 mt-px shrink-0 rounded-full border border-accent-line text-accent text-[10.5px] font-bold font-display flex items-center justify-center">
                {i + 1}
              </span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      )}
      {entry.points && (
        <ul className="space-y-1.5">
          {entry.points.map((point, i) => (
            <li key={i} className="flex gap-2.5 text-muted leading-relaxed">
              <span aria-hidden="true" className="w-1 h-1 mt-[0.45rem] shrink-0 rounded-full bg-accent" />
              <span className="min-w-0">{point}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnswerCard({
  entry,
  vote,
  onVote,
  prominent = false,
}: {
  entry: HelpEntry;
  vote?: "yes" | "no";
  onVote: (id: string, v: "yes" | "no") => void;
  prominent?: boolean;
}) {
  return (
    <div className={`p-4 rounded-xl bg-card border space-y-3 ${prominent ? "border-accent-line" : "border-border"}`}>
      <div className="text-sm font-semibold text-foreground">{entry.q}</div>
      <AnswerBody entry={entry} />
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap gap-3">
          {entry.links?.map((l) => (
            <Link key={l.href} href={l.href} className="text-accent hover:underline inline-flex items-center gap-1">
              {l.label} <ArrowRight className="w-3 h-3" />
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-muted">
          {vote ? (
            <span>{vote === "yes" ? "Glad it helped." : "Thanks. Tell us below what you needed."}</span>
          ) : (
            <>
              <span>Did this help?</span>
              {(["yes", "no"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={false}
                  onClick={() => onVote(entry.id, v)}
                  className="px-2 py-1 rounded-lg border border-border bg-surface hover:text-foreground capitalize"
                >
                  {v}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NoAnswer({ question }: { question: string }) {
  const wa = helpWhatsApp(question);
  return (
    <div className="p-4 rounded-xl bg-card border border-border text-xs space-y-3">
      <div className="text-sm font-semibold text-foreground">We don&rsquo;t have an answer for that yet.</div>
      <p className="text-muted leading-relaxed">
        Ask us directly and we&rsquo;ll reply ourselves. Your question is already filled in.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={helpMailto(question)} className="px-3 py-1.5 rounded-lg btn-primary font-semibold inline-flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5" /> Email us
        </a>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg border border-border bg-surface text-foreground inline-flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

function GetStarted({ section }: { section: HelpSection }) {
  return (
    <section id={section.id} className="scroll-mt-8 space-y-3">
      <div>
        <h2 className="text-lg font-bold font-display text-foreground tracking-tight">{section.title}</h2>
        <p className="text-xs text-muted mt-0.5">{section.intro}</p>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {section.steps?.map((step, i) => (
          <li key={i} className="p-4 rounded-xl bg-surface border border-border text-xs text-muted leading-relaxed flex gap-3">
            <span className="w-6 h-6 shrink-0 rounded-full border border-accent-line text-accent text-[11px] font-bold font-display flex items-center justify-center">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function HelpSectionBlock({ section, entries }: { section: HelpSection; entries: HelpEntry[] }) {
  const cards = (section.catalogKeys ?? []).map((k) => CATALOG[k]).filter(Boolean);
  return (
    <section id={section.id} className="scroll-mt-8 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold font-display text-foreground tracking-tight">{section.title}</h2>
          <p className="text-xs text-muted mt-0.5">{section.intro}</p>
        </div>
        {section.href && (
          <Link href={section.href} className="text-xs font-medium text-accent hover:underline inline-flex items-center gap-1">
            {section.linkLabel} <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      {cards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {cards.map((it) => {
            const Icon = it.icon;
            return (
              <FeatureExplainer key={it.key} title={it.title} text={it.explain} className="h-full">
                {(describedBy) => (
                  <Link
                    href={it.href}
                    aria-describedby={describedBy}
                    className="min-h-11 h-full w-full flex items-start gap-2.5 p-3 [@media(hover:none)]:pr-9 rounded-xl bg-card border border-border hover:border-accent-line transition-colors"
                  >
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${it.color}`} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-foreground leading-tight">{it.title}</span>
                      <span className="block text-[11px] text-muted mt-0.5 leading-snug">{it.desc}</span>
                    </span>
                  </Link>
                )}
              </FeatureExplainer>
            );
          })}
        </div>
      )}

      {section.steps && (
        <div className="p-4 rounded-xl bg-surface border border-border">
          <AnswerBody entry={{ id: section.id, section: section.id, q: "", a: "", keywords: [], steps: section.steps }} />
        </div>
      )}

      {entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map((e) => (
            <details key={e.id} className="rounded-xl bg-surface border border-border text-xs">
              <summary className="px-3.5 py-2.5 cursor-pointer select-none text-foreground font-medium">{e.q}</summary>
              <div className="px-3.5 pb-3.5 space-y-2.5">
                <AnswerBody entry={e} />
                {e.links?.map((l) => (
                  <Link key={l.href} href={l.href} className="text-xs text-accent hover:underline inline-flex items-center gap-1 mr-3">
                    {l.label} <ArrowRight className="w-3 h-3" />
                  </Link>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function ContactCard() {
  const wa = helpWhatsApp();
  return (
    <section id="contact" className="scroll-mt-8 p-5 rounded-2xl bg-surface border border-border space-y-3">
      <div>
        <h2 className="text-lg font-bold font-display text-foreground tracking-tight">Talk to us</h2>
        <p className="text-xs text-muted mt-0.5">
          Stuck, or something isn&rsquo;t right? Write to Vaanchhit, who started Vivran. Every message gets a reply from a person.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <a href={helpMailto()} className="px-3 py-2 rounded-lg btn-primary font-semibold inline-flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5" /> {WAITLIST_EMAIL}
        </a>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-lg border border-border bg-card text-foreground inline-flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </a>
        )}
      </div>
    </section>
  );
}
