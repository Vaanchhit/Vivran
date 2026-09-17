"use client";

import React, { useState } from "react";
import { Sparkles, Presentation, FileSpreadsheet, BookOpenCheck, Mic, MessageSquare, Image as ImageIcon, Video as VideoIcon, Loader2, AlertCircle, Wand2 } from "lucide-react";
import {
  enhancePrompt,
  generateImage,
  generateVideo,
  type EnhancedPrompt,
  type InteractiveResult,
  type LessonNotesResult,
  type SlidesResult,
  type WorksheetResult,
} from "@/services/api";
import { SmartCreationBox, type SmartCreationArtifactType } from "@/app/components/smart-creation-box";

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

type ArtifactKey = "slides" | "worksheet" | "lesson_notes" | "narration" | "image" | "video" | "interactive";

const ARTIFACTS: { key: ArtifactKey; title: string; icon: typeof Presentation; color: string; desc: string }[] = [
  { key: "slides", title: "Presentation Slides", icon: Presentation, color: "text-amber-400", desc: "Editable slide deck outline, key hooks, and speaker notes." },
  { key: "worksheet", title: "Worksheets", icon: FileSpreadsheet, color: "text-emerald-400", desc: "Practice questions with an answer key." },
  { key: "lesson_notes", title: "Lesson Notes", icon: BookOpenCheck, color: "text-[#4FC3F7]", desc: "Structured teaching notes with real-life examples & a recap." },
  { key: "narration", title: "Narration Audio", icon: Mic, color: "text-purple-400", desc: "Real narrated audio for a lesson script (ElevenLabs / Cartesia)." },
  { key: "image", title: "AI Image", icon: ImageIcon, color: "text-orange-400", desc: "Generate a diagram or illustration from a prompt. Review labels before use — AI-generated text in images can be inaccurate." },
  { key: "video", title: "AI Video", icon: VideoIcon, color: "text-sky-400", desc: "Generate a short educational video clip from a prompt (takes 1-3 minutes)." },
  { key: "interactive", title: "Classroom Activities", icon: MessageSquare, color: "text-pink-400", desc: "Interactive lesson blocks: activities, scenarios & quick checks." },
];

// The 5 content types below are unified onto the shared SmartCreationBox
// (free text + mic + Interpret Intent + editable grade/subject/topics).
// Image and video keep their own separate, previously-approved
// enhance-prompt + theme-preset flow — untouched.
const SMART_CREATION_TYPES = new Set<ArtifactKey>(["slides", "worksheet", "lesson_notes", "narration", "interactive"]);

export default function CreatePage() {
  const [active, setActive] = useState<ArtifactKey | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoDuration, setVideoDuration] = useState<4 | 6 | 8>(8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SlidesResult | WorksheetResult | LessonNotesResult | InteractiveResult | { media_url: string } | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [enhancement, setEnhancement] = useState<EnhancedPrompt | null>(null);

  const applyTheme = (modifier: string) => {
    const setter = active === "video" ? setVideoPrompt : setImagePrompt;
    setter((prev) => (prev.trim() ? `${prev.trim()}, ${modifier}` : modifier.replace(/^as /, "")));
  };

  const runEnhance = async () => {
    const currentPrompt = active === "video" ? videoPrompt : imagePrompt;
    if (!currentPrompt.trim() || !active) return;
    setEnhancing(true);
    setError(null);
    setEnhancement(null);
    try {
      const result = await enhancePrompt(currentPrompt, active);
      setEnhancement(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prompt enhancement failed.");
    } finally {
      setEnhancing(false);
    }
  };

  const useEnhancedPrompt = () => {
    if (!enhancement) return;
    if (active === "video") setVideoPrompt(enhancement.enhanced_prompt);
    else setImagePrompt(enhancement.enhanced_prompt);
    setEnhancement(null);
  };

  // Only image/video still run through this direct call — the other 5 types
  // generate via the embedded SmartCreationBox's own Confirm & Generate.
  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      if (active === "image") setResult(await generateImage(imagePrompt));
      else if (active === "video") setResult(await generateVideo(videoPrompt, "16:9", videoDuration));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const activeMeta = ARTIFACTS.find((a) => a.key === active);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
          <Sparkles className="w-6 h-6 text-[#7C6EFA]" /> Pillar 2 — Classroom Content Creation
        </h1>
        <p className="text-sm text-muted mt-1">
          Generate classroom-ready teaching artifacts directly from your teacher intent and source material.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ARTIFACTS.map((art) => {
          const Icon = art.icon;
          const isActive = active === art.key;
          return (
            <button
              key={art.key}
              type="button"
              onClick={() => {
                setActive(art.key);
                setResult(null);
                setError(null);
                setEnhancement(null);
              }}
              className={`text-left p-5 rounded-2xl bg-surface border space-y-3 transition-all cursor-pointer group ${
                isActive ? "border-[#7C6EFA]" : "border-border hover:border-[#7C6EFA]/40"
              }`}
            >
              <div className={`p-2.5 rounded-xl bg-white/5 w-fit ${art.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="font-bold text-base text-foreground font-display flex items-center justify-between">
                {art.title}
                <span className="text-xs text-[#7C6EFA] opacity-0 group-hover:opacity-100 transition-opacity">Create →</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">{art.desc}</p>
            </button>
          );
        })}
      </div>

      {active && (
        <div
          className={
            SMART_CREATION_TYPES.has(active)
              ? "space-y-4"
              : "p-6 rounded-2xl bg-surface border border-[#7C6EFA]/30 space-y-4"
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
                    className="px-2.5 py-1 rounded-lg border border-border bg-card text-[11px] font-medium text-muted hover:text-foreground hover:border-[#7C6EFA]/40 hover:bg-[#7C6EFA]/10 transition-all"
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <textarea
                value={active === "image" ? imagePrompt : videoPrompt}
                onChange={(e) => (active === "image" ? setImagePrompt(e.target.value) : setVideoPrompt(e.target.value))}
                placeholder={
                  active === "image"
                    ? "Describe the diagram or illustration you want, e.g. 'A labeled diagram of Porter's Five Forces'… (pick a style above, or write your own)"
                    : "Describe the video clip you want, e.g. 'A video on Porter's Five Forces'… (pick a style above, or write your own)"
                }
                className="w-full h-28 p-3 bg-card border border-border rounded-xl text-foreground text-xs resize-none focus:outline-none focus:border-[#7C6EFA]"
              />

              <button
                type="button"
                onClick={runEnhance}
                disabled={enhancing || !(active === "image" ? imagePrompt : videoPrompt).trim()}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#7C6EFA]/40 bg-[#7C6EFA]/10 text-[#7C6EFA] hover:bg-[#7C6EFA]/20 disabled:opacity-50"
              >
                {enhancing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                {enhancing ? "Enhancing…" : "Enhance with AI"}
              </button>

              {enhancement && (
                <div className="p-3.5 rounded-xl bg-card border border-[#7C6EFA]/30 space-y-2.5 text-xs">
                  {enhancement.error ? (
                    <div className="text-red-400">{enhancement.error}</div>
                  ) : (
                    <>
                      <div className="text-foreground leading-relaxed">{enhancement.enhanced_prompt}</div>
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
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={useEnhancedPrompt}
                          className="px-3 py-1.5 bg-[#7C6EFA] hover:bg-[#684af3] text-white text-[11px] font-semibold rounded-lg"
                        >
                          Use This Prompt
                        </button>
                        <button
                          type="button"
                          onClick={() => setEnhancement(null)}
                          className="px-3 py-1.5 text-muted hover:text-foreground text-[11px] font-medium"
                        >
                          Keep My Version
                        </button>
                      </div>
                    </>
                  )}
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
            // Shared free text + mic + Interpret Intent + editable
            // grade/subject/topics pattern, locked to whichever card was
            // clicked. `key` forces a fresh box (and clears its state) when
            // switching cards. Results feed the per-type displays below via
            // onGenerated instead of this component rendering its own.
            <SmartCreationBox
              key={active}
              lockedArtifactType={active as SmartCreationArtifactType}
              showInlineResult={false}
              showShortcuts={false}
              heading={`Describe the ${activeMeta?.title.toLowerCase()} you want`}
              onGenerated={(r) => {
                setError(null);
                if (!r.ok) {
                  setError(r.error);
                  setResult(null);
                  return;
                }
                switch (r.artifactType) {
                  case "slides":
                  case "worksheet":
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
              disabled={loading || !(active === "image" ? imagePrompt : videoPrompt).trim()}
              className="grad-btn px-5 py-2.5 text-white text-xs font-semibold rounded-xl flex items-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {loading ? (active === "video" ? "Generating video (1-3 min)…" : "Generating…") : "Generate"}
            </button>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {result && active === "slides" && (
            <div className="space-y-2 pt-2 border-t border-border">
              {(result as SlidesResult).slides?.map((s) => (
                <div key={s.slide_number} className="p-3 rounded-lg bg-card border border-border text-xs">
                  <div className="font-semibold text-foreground">Slide {s.slide_number}: {s.title}</div>
                  <ul className="list-disc list-inside text-muted mt-1">{s.bullet_points?.map((b, i) => <li key={i}>{b}</li>)}</ul>
                </div>
              ))}
            </div>
          )}

          {result && active === "worksheet" && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="text-xs text-muted">{(result as WorksheetResult).instructions}</div>
              {(result as WorksheetResult).questions?.map((q, i) => (
                <div key={i} className="p-3 rounded-lg bg-card border border-border text-xs">
                  <div className="text-foreground">{i + 1}. {q.question_text}</div>
                  <div className="text-muted mt-1">Answer: {q.answer}</div>
                </div>
              ))}
            </div>
          )}

          {result && active === "lesson_notes" && (
            <div className="space-y-2 pt-2 border-t border-border">
              {(result as LessonNotesResult).sections?.map((s, i) => (
                <div key={i} className="p-3 rounded-lg bg-card border border-border text-xs">
                  <div className="font-semibold text-foreground">{s.heading}</div>
                  <div className="text-muted mt-1">{s.content}</div>
                </div>
              ))}
              {(result as LessonNotesResult).recap && <div className="text-xs text-[#4FC3F7]">Recap: {(result as LessonNotesResult).recap}</div>}
            </div>
          )}

          {result && active === "interactive" && (
            <div className="space-y-2 pt-2 border-t border-border">
              {(result as InteractiveResult).blocks?.map((b, i) => (
                <div key={i} className="p-3 rounded-lg bg-card border border-border text-xs">
                  <div className="font-semibold text-[#4FC3F7] uppercase text-[10px]">{b.type}</div>
                  <div className="text-foreground mt-1">{JSON.stringify(b.content)}</div>
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
                  <span className="text-[#4FC3F7] font-medium">{s.source_material}{s.page_number ? ` · p.${s.page_number}` : ""}</span> — {s.excerpt}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
