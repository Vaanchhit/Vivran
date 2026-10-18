"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Check, Copy, Download, Lightbulb, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { BookLoader } from "@/app/components/book-loader";
import {
  generateExample,
  getLibraryItem,
  listMaterials,
  makeExampleVisual,
  type ExampleResult,
  type Material,
} from "@/services/api";
import { FILE_PALETTE, THEME_PALETTE, downloadable, mappingSvg, waterfallSvg } from "@/lib/example-diagrams";
import { GRADE_LEVEL_OPTIONS, LANGUAGE_OPTIONS, SUBJECT_OPTIONS } from "@/lib/constants";
import { useTabState } from "@/lib/tab-state";

/** Settings students already live in. Picking one is the teacher's choice; "Surprise me" leaves it to Vivran. */
const SETTINGS = [
  "A tea stall",
  "A cricket match",
  "A school canteen",
  "A train journey",
  "A family kitchen",
  "A kirana shop",
  "A village market",
  "A mobile data plan",
  "Pocket money",
];

/** "120" + "₹ thousand" reads as "₹120 thousand"; other units follow the number. */
function amount(value: number, unit: string): string {
  const m = unit.match(/^([₹$€£])\s*(.*)$/);
  return m ? `${m[1]}${value}${m[2] ? " " + m[2] : ""}` : `${value}${unit ? " " + unit : ""}`;
}

const FIELD = "w-full px-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-accent";

export default function ExamplesPage() {
  return (
    <Suspense fallback={null}>
      <ExamplesInner />
    </Suspense>
  );
}

function ExamplesInner() {
  const router = useRouter();
  const itemParam = useSearchParams().get("item");

  const [concept, setConcept] = useTabState("examples:concept", "");
  const [grade, setGrade] = useTabState("examples:grade", "");
  const [subject, setSubject] = useTabState("examples:subject", "");
  const [setting, setSetting] = useTabState("examples:setting", "");
  const [language, setLanguage] = useTabState("examples:language", "");
  const [materialId, setMaterialId] = useTabState("examples:material", "");
  const [result, setResult] = useTabState<ExampleResult | null>("examples:result", null);
  const [shown, setShown] = useTabState<string[]>("examples:shown", []);
  const [openedTitle, setOpenedTitle] = useTabState<string | null>("examples:opened", null);
  const [error, setError] = useTabState<string | null>("examples:error", null);
  const [busy, setBusy] = useState<null | "new" | "again">(null);
  const [materials, setMaterials] = useState<Material[]>([]);

  useEffect(() => {
    listMaterials().then(setMaterials).catch(() => undefined);
  }, []);

  // Reopening saved work: the saved result is shown exactly as it was.
  useEffect(() => {
    if (!itemParam) return;
    let cancelled = false;
    getLibraryItem(itemParam)
      .then((item) => {
        if (cancelled || item.type !== "example" || !item.content) return;
        const content = item.content as ExampleResult;
        setResult(content);
        setOpenedTitle(item.title);
        setShown(content.analogy ? [content.analogy.setting] : []);
        setConcept(content.concept?.concept ?? "");
        setError(null);
        router.replace("/teacher/examples");
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Could not open that example."));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemParam]);

  const run = async (kind: "new" | "again", chosen?: string) => {
    if (busy) return;
    if (!concept.trim()) {
      setError("Type the concept first, for example \"FCFE\" or \"opportunity cost\".");
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      const again = kind === "again" && result?.concept;
      const data = await generateExample({
        concept: concept.trim(),
        grade,
        subject,
        setting: chosen ?? setting,
        language: language && language !== "English" ? language : undefined,
        materialId,
        card: again ? result!.concept : undefined,
        avoidSettings: again ? shown : [],
      });
      if (data.error) {
        setError(data.error);
        return;
      }
      setResult(data);
      setOpenedTitle(null);
      setShown((prev) => (again ? [...prev, data.analogy?.setting ?? ""] : [data.analogy?.setting ?? ""]).filter(Boolean));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
          <Lightbulb className="w-6 h-6 text-accent" /> Explain simply
        </h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Type an idea students find hard. You get an everyday story with every key term tied to it, a worked example whose
          numbers are calculated for you, and where the comparison stops being true.
        </p>
      </div>

      {/* Ask */}
      <section className="p-5 rounded-2xl bg-surface border border-border space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-foreground font-display">What should students understand?</span>
          <input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run("new")}
            placeholder="e.g. FCFE, opportunity cost, Le Chatelier's principle, supply and demand"
            className={FIELD}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs text-muted space-y-1.5">
            <span className="block">Grade / Year</span>
            <select value={grade} onChange={(e) => setGrade(e.target.value)} className={FIELD}>
              <option value="">Any</option>
              {GRADE_LEVEL_OPTIONS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted space-y-1.5">
            <span className="block">Subject</span>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} className={FIELD}>
              <option value="">Any</option>
              {SUBJECT_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted space-y-1.5">
            <span className="block">Language</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className={FIELD}>
              <option value="">English</option>
              {LANGUAGE_OPTIONS.filter((l) => l !== "Other" && l !== "English").map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs text-muted">Compare it to</div>
          <SettingChips value={setting} onChange={setSetting} />
        </div>

        {materials.length > 0 && (
          <label className="text-xs text-muted space-y-1.5 block">
            <span className="block">Take the definition from your material (optional)</span>
            <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className={FIELD}>
              <option value="">Search all my materials</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </label>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => run("new")}
            disabled={!!busy || !concept.trim()}
            className="btn-primary px-5 py-2.5 text-sm font-semibold rounded-xl flex items-center gap-2 disabled:opacity-50"
          >
            {busy === "new" ? <><BookLoader className="w-4 h-4" /> Finding a good example…</> : <><Sparkles className="w-4 h-4" /> Explain it simply</>}
          </button>
        </div>
      </section>

      {error && (
        <div className="p-3 bg-danger-soft border border-danger-line rounded-xl flex items-center gap-2 text-xs text-danger">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {result?.concept && result.analogy && (
        <ExampleView
          result={result}
          openedTitle={openedTitle}
          again={busy === "again"}
          onAgain={(s) => run("again", s)}
          shown={shown}
          language={language}
        />
      )}
    </div>
  );
}

function SettingChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const custom = value && !SETTINGS.includes(value) && value !== "";
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Setting for the comparison">
      {["", ...SETTINGS].map((s) => (
        <button
          key={s || "auto"}
          type="button"
          aria-pressed={value === s}
          onClick={() => onChange(s)}
          className={`px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
            value === s ? "bg-accent-soft border-accent-line text-foreground font-semibold" : "bg-card border-border text-muted hover:text-foreground"
          }`}
        >
          {s || "Surprise me"}
        </button>
      ))}
      <input
        value={custom ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="or type your own"
        aria-label="Your own setting"
        className="px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs text-foreground placeholder:text-faint focus:outline-none focus:border-accent w-36"
      />
    </div>
  );
}

function ExampleView({
  result,
  openedTitle,
  again,
  onAgain,
  shown,
  language,
}: {
  result: ExampleResult;
  openedTitle: string | null;
  again: boolean;
  onAgain: (setting?: string) => void;
  shown: string[];
  language: string;
}) {
  const { concept, analogy } = result;
  const [reveal, setReveal] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [visual, setVisual] = useState<{ state: "idle" | "busy" | "ready" | "error"; image?: string; error?: string }>({ state: "idle" });
  const [next, setNext] = useState("");

  const mapSvg = useMemo(() => (analogy ? mappingSvg(analogy.mapping, THEME_PALETTE) : ""), [analogy]);
  const barSvg = useMemo(() => (analogy?.worked_example ? waterfallSvg(analogy.worked_example, THEME_PALETTE) : ""), [analogy]);
  if (!concept || !analogy) return null;

  const worked = analogy.worked_example;
  const plainText = [
    `${concept.concept}: ${concept.one_line}`,
    "",
    `Think of ${analogy.setting.toLowerCase()}.`,
    analogy.story,
    "",
    "What is what:",
    ...analogy.mapping.map((m) => `• ${m.term} = ${m.in_story}`),
    ...(worked ? ["", `${worked.title}:`, ...worked.inputs.map((i) => `• ${i.label}: ${i.value} ${i.unit}`), ...worked.steps.map((s) => `• ${s.label} = ${s.expr} = ${s.value}`), worked.explain] : []),
    "",
    "Where the comparison breaks:",
    ...analogy.where_it_breaks.map((b) => `• ${b}`),
    "",
    "Check understanding:",
    ...analogy.check.map((c, i) => `${i + 1}. ${c.q}\n   Answer: ${c.a}`),
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable: nothing to do */
    }
  };

  const save = (svg: string, name: string) => {
    const blob = new Blob([downloadable(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${concept.concept.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${name}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const designed = async () => {
    setVisual({ state: "busy" });
    try {
      const out = await makeExampleVisual(analogy.story, analogy.mapping, language && language !== "English" ? language : undefined);
      setVisual({ state: "ready", image: out.image });
    } catch (e) {
      setVisual({ state: "error", error: e instanceof Error ? e.message : "Couldn't make the picture." });
    }
  };

  return (
    <div className="space-y-6">
      {openedTitle && <div className="text-xs text-muted">Opened from your saved work: <span className="text-foreground font-medium">{openedTitle}</span></div>}

      {/* The idea */}
      <section className="p-5 rounded-2xl bg-surface border border-border space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">The idea</div>
        <h2 className="text-xl font-bold font-display text-foreground">{concept.concept}</h2>
        <p className="text-sm text-foreground leading-relaxed">{concept.one_line}</p>
        {concept.formula && <div className="text-xs font-mono px-3 py-2 rounded-lg bg-card border border-border text-foreground">{concept.formula}</div>}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {concept.key_terms.map((t) => (
            <span key={t.term} title={t.meaning} className="text-[11px] px-2 py-1 rounded-full bg-accent-soft border border-accent-line text-foreground">{t.term}</span>
          ))}
        </div>
        {(result.grounded_on ?? 0) > 0 && (
          <div className="text-[11px] text-muted">
            The definition follows your material:{" "}
            {result.sources?.slice(0, 3).map((s) => `${s.source_material ?? "source"}${s.page_number ? ` p.${s.page_number}` : ""}`).join(", ")}.
          </div>
        )}
      </section>

      {/* The story */}
      <section className="p-5 rounded-2xl bg-surface border border-accent-line space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">Think of {analogy.setting.toLowerCase()}</div>
        </div>
        <p className="text-base text-foreground leading-relaxed">{analogy.story}</p>
      </section>

      {/* What is what */}
      <section className="p-5 rounded-2xl bg-surface border border-border space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-bold text-foreground font-display">What is what</div>
          <button type="button" onClick={() => save(mappingSvg(analogy.mapping, FILE_PALETTE), "mapping")} className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Download diagram
          </button>
        </div>
        {/* The drawing needs room to be legible; on a phone the same pairs are a list. */}
        <div className="hidden sm:block max-w-2xl" dangerouslySetInnerHTML={{ __html: mapSvg }} />
        <ul className="sm:hidden space-y-2">
          {analogy.mapping.map((m) => (
            <li key={m.term} className="rounded-xl border border-border bg-card p-3 space-y-1">
              <div className="text-sm text-foreground">{m.in_story}</div>
              <div className="text-[11px] text-muted">stands for</div>
              <div className="text-sm font-semibold text-accent">{m.term}</div>
              <div className="text-xs text-muted">{m.meaning}</div>
            </li>
          ))}
        </ul>
      </section>

      {/* Numbers */}
      {worked && (
        <section className="p-5 rounded-2xl bg-surface border border-border space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-bold text-foreground font-display">{worked.title || "Try it with numbers"}</div>
            <button type="button" onClick={() => save(waterfallSvg(worked, FILE_PALETTE), "numbers")} className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Download chart
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              {worked.inputs.map((i) => (
                <div key={i.name} className="flex justify-between gap-3 px-3 py-2 rounded-lg bg-card border border-border">
                  <span className="text-muted">{i.label}</span>
                  <span className="text-foreground font-semibold tabular-nums">{amount(i.value, i.unit)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              {worked.steps.map((s) => (
                <div key={s.name} className="px-3 py-2 rounded-lg bg-accent-soft border border-accent-line">
                  <div className="flex justify-between gap-3">
                    <span className="text-foreground font-medium">{s.label}</span>
                    <span className="text-foreground font-bold tabular-nums">{s.value}</span>
                  </div>
                  <div className="text-[11px] text-muted font-mono mt-0.5">{s.expr}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden sm:block max-w-2xl" dangerouslySetInnerHTML={{ __html: barSvg }} />
          {worked.explain && <p className="text-sm text-foreground leading-relaxed">{worked.explain}</p>}
          <div className="text-[11px] text-muted flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-success" /> These numbers were calculated by Vivran, not written by the AI.</div>
        </section>
      )}

      {/* Limits */}
      <section className="p-5 rounded-2xl bg-warning-soft border border-warning-line space-y-2">
        <div className="text-sm font-bold text-foreground font-display flex items-center gap-2"><TriangleAlert className="w-4 h-4 text-warning" /> Where the comparison breaks</div>
        <ul className="space-y-1.5 text-sm text-foreground list-disc pl-5">
          {analogy.where_it_breaks.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
        {analogy.common_mistake && <p className="text-xs text-muted pt-1"><span className="font-semibold text-foreground">A common mistake:</span> {analogy.common_mistake}</p>}
      </section>

      {/* Check */}
      <section className="p-5 rounded-2xl bg-surface border border-border space-y-3">
        <div className="text-sm font-bold text-foreground font-display">Check understanding</div>
        {analogy.check.map((c, i) => (
          <div key={i} className="space-y-1.5">
            <div className="text-sm text-foreground">{i + 1}. {c.q}</div>
            {reveal[i] ? (
              <div className="text-xs text-muted pl-4 border-l-2 border-accent-line">{c.a}</div>
            ) : (
              <button type="button" onClick={() => setReveal((r) => ({ ...r, [i]: true }))} className="text-xs text-accent hover:underline">Show answer</button>
            )}
          </div>
        ))}
      </section>

      {/* Warnings */}
      {(result.guardrail_warnings?.length ?? 0) > 0 && (
        <div className="p-3 bg-warning-soft border border-warning-line rounded-xl text-xs text-warning space-y-1">
          <div className="font-semibold">Worth a look before you use it:</div>
          {result.guardrail_warnings!.map((w, i) => <div key={i}>• {w}</div>)}
        </div>
      )}

      {/* Actions */}
      <section className="p-5 rounded-2xl bg-card border border-border space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copy} className="px-3 py-2 rounded-lg border border-border bg-surface text-xs font-semibold text-foreground inline-flex items-center gap-1.5 hover:border-accent-line">
            {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy as text"}
          </button>
          {result.visual_options?.napkin && (
            <button type="button" onClick={designed} disabled={visual.state === "busy"} className="px-3 py-2 rounded-lg border border-border bg-surface text-xs font-semibold text-foreground inline-flex items-center gap-1.5 hover:border-accent-line disabled:opacity-50">
              {visual.state === "busy" ? <BookLoader className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />} Make a designed picture
            </button>
          )}
        </div>

        <div className="space-y-1.5 pt-1">
          <div className="text-xs text-muted">Not quite right? Try a different comparison{shown.length > 0 ? ` (already used: ${shown.join(", ")})` : ""}.</div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onAgain()} disabled={again} className="px-3 py-2 rounded-lg btn-primary text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
              {again ? <BookLoader className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />} Another setting
            </button>
            <input
              value={next}
              onChange={(e) => setNext(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next.trim() && onAgain(next.trim())}
              placeholder="or name one, e.g. a bus ticket counter"
              aria-label="A setting to try"
              className="px-3 py-2 rounded-lg border border-border bg-surface text-xs text-foreground placeholder:text-faint focus:outline-none focus:border-accent w-64"
            />
          </div>
        </div>

        {visual.state === "error" && <div className="text-xs text-danger">{visual.error}</div>}
        {visual.state === "ready" && visual.image && (
          <div className="space-y-1.5">
            {/* An <img> keeps anything inside the file inert: it can draw, never run. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={visual.image} alt={`A designed picture of the story: ${analogy.setting}`} className="w-full max-w-xl rounded-xl border border-border bg-white" />
            <div className="text-[11px] text-muted">Designed by Napkin. Pictures made on a free Napkin plan carry its watermark.</div>
          </div>
        )}
        {result.library_id && <div className="text-[11px] text-muted">Saved to your Library.</div>}
      </section>
    </div>
  );
}
