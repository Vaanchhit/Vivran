"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpenCheck, AlertCircle, Wand2, RotateCcw } from "lucide-react";
import { BookLoader } from "@/app/components/book-loader";
import {
  enhancePrompt,
  generateImage,
  getLibraryItem,
  generateVideo,
  libraryHref,
  type EnhancedPrompt,
  type InteractiveResult,
  type LessonNotesResult,
  type DeckReady,
} from "@/services/api";
import { SmartCreationBox, type SmartCreationArtifactType } from "@/app/components/smart-creation-box";
import { DeckView } from "@/app/components/deck-view";
import { FeatureExplainer } from "@/app/components/feature-explainer";
import { getLiveValue, noticeIfAway, setLiveValue, setTabValue, useLiveState, useOnScreen, useTabState } from "@/lib/tab-state";
import { stage } from "@/lib/catalog";

const VIDEO_THEMES = [
  { label: "Whiteboard Explainer", modifier: "as a hand-drawn whiteboard-style explainer animation" },
  { label: "Case Study Narrative", modifier: "as a short narrative case-study video with on-screen text callouts" },
  { label: "Animated Infographic", modifier: "as a clean animated infographic with icons, charts, and motion graphics" },
  { label: "Slide Read-Along", modifier: "as a slide-deck-style video with bullet points appearing in sync with narration" },
];

const IMAGE_THEMES = [
  { label: "Labeled Diagram", modifier: "as a clean, textbook-style labeled diagram with clear annotations" },
  { label: "Infographic", modifier: "as a colorful infographic with icons and short text callouts" },
  { label: "Illustration", modifier: "as a simple, flat-style educational illustration" },
  { label: "Photo-realistic", modifier: "as a photo-realistic real-world scene" },
];

type ArtifactKey = "slides" | "lesson_notes" | "narration" | "image" | "video" | "interactive";

const ARTIFACTS = stage("teach").items as ((ReturnType<typeof stage>)["items"][number] & { key: ArtifactKey })[];

// The 4 content types below are unified onto the shared SmartCreationBox
// (free text + mic + customization dropdowns + editable topics).
// Image and video keep their own separate, previously-approved
// enhance-prompt + theme-preset flow.
const SMART_CREATION_TYPES = new Set<ArtifactKey>(["slides", "lesson_notes", "narration", "interactive"]);

const ARTIFACT_KEYS = new Set<string>(ARTIFACTS.map((a) => a.key));

/** Shortcut aliases so a dashboard card can deep-link in the words a teacher
 * used ("Create Lesson", "Create Video") rather than our internal key. */
const TYPE_PARAM_ALIASES: Record<string, ArtifactKey> = {
  lesson: "lesson_notes",
  lesson_notes: "lesson_notes",
  notes: "lesson_notes",
  video: "video",
  image: "image",
  slides: "slides",
  narration: "narration",
  audio: "narration",
  interactive: "interactive",
  activities: "interactive",
};

function resolveTypeParam(value: string | null): ArtifactKey | null {
  if (!value) return null;
  const key = TYPE_PARAM_ALIASES[value.toLowerCase()];
  if (key) return key;
  return ARTIFACT_KEYS.has(value) ? (value as ArtifactKey) : null;
}

type QA = { text?: string; answer?: string };

function Answer({ answer }: { answer?: string }) {
  if (!answer) return null;
  return (
    <details className="mt-1.5">
      <summary className="text-muted cursor-pointer select-none">Show answer</summary>
      <div className="mt-1 text-foreground">{answer}</div>
    </details>
  );
}

function InteractiveBlockBody({ content }: { content: Record<string, unknown> }) {
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const questions = Array.isArray(content.questions) ? (content.questions as QA[]) : [];
  return (
    <div className="mt-1 space-y-1.5 text-foreground leading-relaxed">
      {str(content.text) && <p>{str(content.text)}</p>}
      {str(content.instructions) && <p className="text-muted"><span className="font-semibold text-foreground">Task: </span>{str(content.instructions)}</p>}
      <Answer answer={str(content.answer)} />
      {questions.length > 0 && (
        <ol className="list-decimal list-inside space-y-2">
          {questions.map((q, i) => (
            <li key={i}>
              {q.text}
              <Answer answer={q.answer} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <CreatePageInner />
    </Suspense>
  );
}

type TeachResult = DeckReady | LessonNotesResult | InteractiveResult | { media_url: string; library_id?: string };

function CreatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const itemParam = searchParams.get("item");

  // Everything below is kept per browser tab, and results per card, so
  // switching cards or leaving the page never clears what was on screen.
  const [active, setActive] = useTabState<ArtifactKey | null>("create:active", resolveTypeParam(typeParam));
  const scope = `create:${active ?? "none"}`;
  const [imagePrompt, setImagePrompt] = useTabState("create:image:prompt", "");
  const [videoPrompt, setVideoPrompt] = useTabState("create:video:prompt", "");
  const [videoDuration, setVideoDuration] = useTabState<4 | 6 | 8>("create:video:duration", 8);
  const [loading] = useLiveState(`${scope}:running`, false);
  const [error, setError] = useTabState<string | null>(`${scope}:error`, null);
  const [result, setResult] = useTabState<TeachResult | null>(`${scope}:result`, null);
  const [enhancing, setEnhancing] = useState(false);
  const [enhancement, setEnhancement] = useTabState<EnhancedPrompt | null>(`${scope}:enhancement`, null);
  /** Keeps the teacher's own wording alongside the AI's rewrite so both are
   * one click away. The live textarea is always the version that generates. */
  const [enhanceState, setEnhanceState] = useTabState<{ original: string; enhanced: string } | null>(`${scope}:enhanceState`, null);
  /** Set when this page was opened from saved work rather than a fresh generation. */
  const [openedTitle, setOpenedTitle] = useTabState<string | null>(`${scope}:opened`, null);
  const [openingItem, setOpeningItem] = useState(false);
  useOnScreen(scope);

  useEffect(() => {
    // Worksheets moved to Assess; old links still land in the right place.
    if (typeParam === "worksheet") {
      router.replace(`/teacher/assess?mode=worksheet${itemParam ? `&item=${encodeURIComponent(itemParam)}` : ""}`);
      return;
    }
    const resolved = resolveTypeParam(typeParam);
    if (resolved) setActive(resolved);
  }, [typeParam, itemParam, router, setActive]);

  // Reopening saved work: the saved result goes through the same display as a fresh one.
  useEffect(() => {
    if (!itemParam || typeParam === "worksheet") return;
    let cancelled = false;
    setOpeningItem(true);
    getLibraryItem(itemParam)
      .then((item) => {
        if (cancelled) return;
        const kind = resolveTypeParam(item.type);
        if (!kind || !item.content) {
          setError("This item can't be opened here.");
          return;
        }
        // Written under the opened item's own card, whatever card was showing.
        const at = (name: string) => `create:${kind}:${name}`;
        setTabValue(at("result"), item.content as TeachResult, null);
        setTabValue(at("opened"), item.title, null);
        setTabValue(at("error"), null, null);
        setActive(kind);
        router.replace(`/teacher/create?type=${kind}`);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not open that item.");
      })
      .finally(() => {
        if (!cancelled) setOpeningItem(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemParam]);

  const currentPrompt = active === "video" ? videoPrompt : imagePrompt;
  const setCurrentPrompt = (value: string) => {
    if (active === "video") setVideoPrompt(value);
    else setImagePrompt(value);
  };

  const applyTheme = (modifier: string) => {
    const setter = active === "video" ? setVideoPrompt : setImagePrompt;
    setter((prev) => (prev.trim() ? `${prev.trim()}, ${modifier}` : modifier.replace(/^as /, "")));
  };

  const runEnhance = async () => {
    if (!currentPrompt.trim() || !active) return;
    const original = currentPrompt;
    setEnhancing(true);
    setError(null);
    setEnhancement(null);
    try {
      const enhanced = await enhancePrompt(original, active);
      setEnhancement(enhanced);
      if (!enhanced.error && enhanced.enhanced_prompt?.trim()) {
        // The rewrite lands straight in the editable prompt box, so there's
        // only ever one text that generates — and it can be revised freely.
        setEnhanceState({ original, enhanced: enhanced.enhanced_prompt });
        setCurrentPrompt(enhanced.enhanced_prompt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prompt enhancement failed.");
    } finally {
      setEnhancing(false);
    }
  };

  const promptVersion: "original" | "enhanced" | "edited" | null = !enhanceState
    ? null
    : currentPrompt === enhanceState.original
      ? "original"
      : currentPrompt === enhanceState.enhanced
        ? "enhanced"
        : "edited";

  // Only image/video still run through this direct call — the other types
  // generate via the embedded SmartCreationBox's own Confirm & Generate.
  // Written through the store under the card it started on, so leaving the
  // page mid-run still lands the result there.
  const run = async () => {
    const kind = active;
    if ((kind !== "image" && kind !== "video") || getLiveValue(`${scope}:running`, false)) return;
    const at = (name: string) => `${scope}:${name}`;
    const label = kind === "video" ? "video" : "image";
    setLiveValue(at("running"), true, false);
    setError(null);
    setResult(null);
    setOpenedTitle(null);
    try {
      const data = kind === "image" ? await generateImage(imagePrompt) : await generateVideo(videoPrompt, "16:9", videoDuration);
      setTabValue<TeachResult | null>(at("result"), data, null);
      const href = data.library_id ? libraryHref({ id: data.library_id, type: kind }) : `/teacher/create?type=${kind}`;
      noticeIfAway(scope, { tone: "success", message: `Your ${label} is ready. It's saved in your library.`, href, linkLabel: "Open it" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed.";
      setTabValue<string | null>(at("error"), message, null);
      noticeIfAway(scope, { tone: "error", message: `Your ${label} could not be made: ${message}`, href: `/teacher/create?type=${kind}`, linkLabel: "Go back" });
    } finally {
      setLiveValue(at("running"), false, false);
    }
  };

  const activeMeta = ARTIFACTS.find((a) => a.key === active);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
          <BookOpenCheck className="w-6 h-6 text-accent" /> Teach
        </h1>
        <p className="text-sm text-muted mt-1">
          {stage("teach").blurb}: notes, slides, activities and media, grounded in your own material when you add it.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ARTIFACTS.map((art) => {
          const Icon = art.icon;
          const isActive = active === art.key;
          return (
            <FeatureExplainer key={art.key} title={art.title} text={art.explain}>
              {(describedBy) => (
                <button
                  type="button"
                  aria-describedby={describedBy}
                  onClick={() => setActive(art.key)}
                  className={`w-full h-full text-left p-5 rounded-2xl bg-surface border space-y-3 transition-all cursor-pointer group ${
                    isActive ? "border-accent" : "border-border hover:border-accent-line"
                  }`}
                >
                  <div className={`p-2.5 rounded-xl bg-card w-fit ${art.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="font-bold text-base text-foreground font-display flex items-center justify-between">
                    {art.title}
                    <span className="text-xs text-accent opacity-0 group-hover:opacity-100 transition-opacity">Create →</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">{art.desc}</p>
                </button>
              )}
            </FeatureExplainer>
          );
        })}
      </div>

      {active && (
        <div
          className={
            SMART_CREATION_TYPES.has(active)
              ? "space-y-4"
              : "p-6 rounded-2xl bg-surface border border-accent-line space-y-4"
          }
        >
          {!SMART_CREATION_TYPES.has(active) && (
            <div className="font-bold text-base text-foreground font-display">{activeMeta?.title}</div>
          )}

          {active === "image" || active === "video" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(active === "image" ? IMAGE_THEMES : VIDEO_THEMES).map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => applyTheme(t.modifier)}
                    className="px-2.5 py-1 rounded-lg border border-border bg-card text-[11px] font-medium text-muted hover:text-foreground hover:border-accent-line hover:bg-accent-soft transition-all"
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* The one textarea below is always what gets generated —
                  enhancing rewrites it in place, and both versions stay one
                  click away, so there's never an unused "improved" prompt
                  the teacher can't touch. */}
              {promptVersion && (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded-md border border-accent-line bg-accent-soft text-accent font-semibold">
                    {promptVersion === "original"
                      ? "Generating from your original wording"
                      : promptVersion === "enhanced"
                        ? "Generating from the enhanced prompt"
                        : "Generating from the enhanced prompt · your edits"}
                  </span>
                  {promptVersion !== "original" && (
                    <button
                      type="button"
                      onClick={() => setCurrentPrompt(enhanceState!.original)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-muted hover:text-foreground font-medium"
                    >
                      <RotateCcw className="w-3 h-3" /> Revert to my original
                    </button>
                  )}
                  {promptVersion !== "enhanced" && (
                    <button
                      type="button"
                      onClick={() => setCurrentPrompt(enhanceState!.enhanced)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-muted hover:text-foreground font-medium"
                    >
                      <Wand2 className="w-3 h-3" /> Restore enhanced version
                    </button>
                  )}
                </div>
              )}

              <textarea
                value={currentPrompt}
                onChange={(e) => setCurrentPrompt(e.target.value)}
                placeholder={
                  active === "image"
                    ? "Describe the diagram or illustration you want, e.g. 'A labeled diagram of Porter's Five Forces'… (pick a style above, or write your own)"
                    : "Describe the video clip you want, e.g. 'A video on Porter's Five Forces'… (pick a style above, or write your own)"
                }
                className="w-full h-36 p-3 bg-card border border-border rounded-xl text-foreground text-xs resize-none focus:outline-none focus:border-accent leading-relaxed"
              />

              <button
                type="button"
                onClick={runEnhance}
                disabled={enhancing || !currentPrompt.trim()}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-accent-line bg-accent-soft text-accent hover:bg-accent-soft-hi disabled:opacity-50"
              >
                {enhancing ? <BookLoader className="w-3.5 h-3.5" /> : <Wand2 className="w-3.5 h-3.5" />}
                {enhancing ? "Enhancing…" : enhanceState ? "Enhance again" : "Enhance with AI"}
              </button>

              {enhancement?.error && <div className="text-xs text-danger">{enhancement.error}</div>}

              {enhancement && !enhancement.error &&
                (enhancement.illustration_suggestions.length > 0 || enhancement.animation_suggestions.length > 0) && (
                  <div className="p-3.5 rounded-xl bg-card border border-accent-line space-y-2.5 text-xs">
                    {enhancement.illustration_suggestions.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Illustration ideas</div>
                        <ul className="list-disc list-inside text-muted space-y-0.5">
                          {enhancement.illustration_suggestions.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                    {enhancement.animation_suggestions.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Animation ideas</div>
                        <ul className="list-disc list-inside text-muted space-y-0.5">
                          {enhancement.animation_suggestions.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                    <div className="text-[10px] text-muted">
                      Add any of these to the prompt above if you want them — nothing is applied for you.
                    </div>
                  </div>
                )}

              {active === "video" && (
                <select
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(Number(e.target.value) as 4 | 6 | 8)}
                  className="px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground"
                >
                  <option value={4}>4 seconds</option>
                  <option value={6}>6 seconds</option>
                  <option value={8}>8 seconds</option>
                </select>
              )}
            </div>
          ) : active && SMART_CREATION_TYPES.has(active) ? (
            // Shared free text + mic + customization dropdowns + editable
            // topics pattern, locked to whichever card was clicked. Each card
            // keeps its own draft under its own scope.
            // Results feed the per-type displays below via onGenerated
            // instead of this component rendering its own.
            <SmartCreationBox
              key={active}
              scope={scope}
              scopeHref={`/teacher/create?type=${active}`}
              lockedArtifactType={active as SmartCreationArtifactType}
              showInlineResult={false}
              heading={`Describe the ${activeMeta?.title.toLowerCase()} you want`}
              onGenerated={(r) => {
                setError(null);
                setOpenedTitle(null);
                if (!r.ok) {
                  setError(r.error);
                  setResult(null);
                  return;
                }
                switch (r.artifactType) {
                  case "slides":
                  case "lesson_notes":
                  case "interactive":
                  case "narration":
                    setResult(r.data);
                    break;
                }
              }}
            />
          ) : null}

          {(active === "image" || active === "video") && (
            <button
              type="button"
              onClick={run}
              disabled={loading || !currentPrompt.trim()}
              className="btn-primary px-5 py-2.5 text-xs font-semibold rounded-xl flex items-center gap-2 disabled:opacity-50"
            >
              {loading && <BookLoader className="w-3.5 h-3.5" />}
              {loading ? (active === "video" ? "Generating video (1-3 min)…" : "Generating…") : "Generate"}
            </button>
          )}

          {openingItem && (
            <div className="p-3 rounded-xl bg-card border border-border flex items-center gap-2 text-xs text-muted">
              <BookLoader className="w-3.5 h-3.5" /> Opening your saved work…
            </div>
          )}
          {openedTitle && result && (
            <div className="text-xs text-muted">
              Opened from your saved work: <span className="text-foreground font-medium">{openedTitle}</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-danger-soft border border-danger-line rounded-xl flex items-center gap-2 text-xs text-danger">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {result && active === "slides" && "placements" in result && <DeckView deck={result} />}

          {result && active === "lesson_notes" && (
            <div className="space-y-2 pt-2 border-t border-border">
              {(result as LessonNotesResult).sections?.map((s, i) => (
                <div key={i} className="p-3 rounded-lg bg-card border border-border text-xs">
                  <div className="font-semibold text-foreground">{s.heading}</div>
                  <div className="text-muted mt-1">{s.content}</div>
                </div>
              ))}
              {(result as LessonNotesResult).recap && <div className="text-xs text-chrome">Recap: {(result as LessonNotesResult).recap}</div>}
            </div>
          )}

          {result && active === "interactive" && (
            <div className="space-y-2 pt-2 border-t border-border">
              {(result as InteractiveResult).blocks?.map((b, i) => (
                <div key={i} className="p-3 rounded-lg bg-card border border-border text-xs">
                  <div className="font-semibold text-chrome uppercase text-[10px]">{b.type}</div>
                  <InteractiveBlockBody content={b.content} />
                </div>
              ))}
            </div>
          )}

          {result && active === "narration" && "media_url" in result && (
            <audio controls className="w-full pt-2" src={result.media_url} />
          )}

          {result && active === "image" && "media_url" in result && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.media_url} alt={imagePrompt} className="w-full rounded-xl border border-border pt-2" />
          )}

          {result && active === "video" && "media_url" in result && (
            <video controls className="w-full rounded-xl border border-border pt-2" src={result.media_url} />
          )}

          {result && "sources" in result && result.sources && result.sources.length > 0 && (
            <div className="pt-2 border-t border-border space-y-1.5">
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">Grounded in your materials</div>
              {result.sources.map((s) => (
                <div key={s.chunk_id} className="text-[11px] text-muted">
                  <span className="text-chrome font-medium">{s.source_material}{s.page_number ? ` · p.${s.page_number}` : ""}</span> — {s.excerpt}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
