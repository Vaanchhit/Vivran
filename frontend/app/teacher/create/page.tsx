"use client";

import React, { useState } from "react";
import { Sparkles, Presentation, FileSpreadsheet, BookOpenCheck, Mic, MessageSquare, Image as ImageIcon, Loader2, AlertCircle } from "lucide-react";
import {
  generateImage,
  generateInteractiveCoursework,
  generateLessonNotes,
  generateNarration,
  generateSlides,
  generateWorksheet,
  type InteractiveResult,
  type LessonNotesResult,
  type SlidesResult,
  type WorksheetResult,
} from "@/services/api";
import { GRADE_LEVEL_OPTIONS } from "@/lib/constants";

type ArtifactKey = "slides" | "worksheet" | "lesson_notes" | "narration" | "image" | "interactive";

const ARTIFACTS: { key: ArtifactKey; title: string; icon: typeof Presentation; color: string; desc: string }[] = [
  { key: "slides", title: "Presentation Slides", icon: Presentation, color: "text-amber-400", desc: "Editable slide deck outline, key hooks, and speaker notes." },
  { key: "worksheet", title: "Worksheets", icon: FileSpreadsheet, color: "text-emerald-400", desc: "Practice questions with an answer key." },
  { key: "lesson_notes", title: "Lesson Notes", icon: BookOpenCheck, color: "text-[#4FC3F7]", desc: "Structured teaching notes with real-life examples & a recap." },
  { key: "narration", title: "Narration Audio", icon: Mic, color: "text-purple-400", desc: "Real narrated audio for a lesson script (ElevenLabs / Cartesia)." },
  { key: "image", title: "AI Image", icon: ImageIcon, color: "text-orange-400", desc: "Generate a diagram or illustration from a prompt (ElevenLabs Flows — requires Pro plan)." },
  { key: "interactive", title: "Classroom Activities", icon: MessageSquare, color: "text-pink-400", desc: "Interactive lesson blocks: activities, scenarios & quick checks." },
];

export default function CreatePage() {
  const [active, setActive] = useState<ArtifactKey | null>(null);
  const [topic, setTopic] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [script, setScript] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SlidesResult | WorksheetResult | LessonNotesResult | InteractiveResult | { media_url: string } | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      if (active === "slides") setResult(await generateSlides(topic, 12, grade || undefined, subject || undefined));
      else if (active === "worksheet") setResult(await generateWorksheet(topic, 10, grade || undefined, subject || undefined));
      else if (active === "lesson_notes") setResult(await generateLessonNotes(topic, grade || undefined, subject || undefined));
      else if (active === "interactive") setResult(await generateInteractiveCoursework(topic, 15, grade || undefined, subject || undefined));
      else if (active === "narration") setResult(await generateNarration(script));
      else if (active === "image") setResult(await generateImage(imagePrompt));
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
        <div className="p-6 rounded-2xl bg-surface border border-[#7C6EFA]/30 space-y-4">
          <div className="font-bold text-base text-foreground font-display">{activeMeta?.title}</div>

          {active === "narration" ? (
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Paste the lesson script to narrate…"
              className="w-full h-28 p-3 bg-card border border-border rounded-xl text-foreground text-xs resize-none focus:outline-none focus:border-[#7C6EFA]"
            />
          ) : active === "image" ? (
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder="Describe the diagram or illustration you want, e.g. 'A labeled diagram of a plant cell, textbook style'…"
              className="w-full h-28 p-3 bg-card border border-border rounded-xl text-foreground text-xs resize-none focus:outline-none focus:border-[#7C6EFA]"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic (required)" className="px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground" />
              <input value={grade} onChange={(e) => setGrade(e.target.value)} list="grade-options" placeholder="Grade / Year (optional)" className="px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground" />
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject / Course (optional)" className="px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground" />
              <datalist id="grade-options">{GRADE_LEVEL_OPTIONS.map((g) => <option key={g} value={g} />)}</datalist>
            </div>
          )}

          <button
            type="button"
            onClick={run}
            disabled={
              loading ||
              (active === "narration" ? !script.trim() : active === "image" ? !imagePrompt.trim() : !topic.trim())
            }
            className="grad-btn px-5 py-2.5 text-white text-xs font-semibold rounded-xl flex items-center gap-2 disabled:opacity-50"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {loading ? "Generating…" : "Generate"}
          </button>

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
