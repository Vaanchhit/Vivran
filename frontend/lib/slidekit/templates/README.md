# Slide template family

Teachers type a prompt. Code does the rest, for free, with one Gemini call to write the words:

```
prompt → understand → facts → pick a template → plan 8 slides → design rules → prompt
       → Gemini fills the blocks → repair → design rules again (sees what was written) → layout → HTML / PDF / PPTX
```

You, the engineer, edit **JSON only** for almost everything:

| You want to… | Edit |
|---|---|
| change what a lesson shape contains | `families/<id>.json` → `slides` |
| change when a template is chosen | `families/<id>.json` → `signals` (weights add up; best wins; `requires` is a hard gate) |
| add a template | new `families/<id>.json` + one import line in `registry.ts` |
| change colours / type size / density by situation | `design-rules.json` |
| teach it a phrase ("viva", "kahoot") | `purposes.json` (keywords per purpose/tone) |
| allow another meme format | `../memes.json` (memegen template id, caption count, when to use it) |

Mistakes fail at load with the file and field (unknown fact, bad theme, bad block type, a value outside a fact's domain). `npx tsx lib/slidekit/test/templates.ts` runs all of it for free (mock model).

## Condition language (`cond.ts`)
`{all:[…]}` `{any:[…]}` `{not:…}` and leaves `{fact, is | in | notIn | gte | lte | has | hasAny | truthy}`.
Facts (`facts.ts`): grade, subject, family, goal, slideCount, durationMin, shapes, topShape, purpose, tone, wantsMeme, memeOk, grounded, script, language, hasObjectives, quantitative, isCode; after filling: avgWords, maxWords, memeCount, hasFormula, hasCode, hasDiagrams, quizShare, blockCount.

## Slides
Each slide has a `type`, `intent`, `guidance` (`{topic}`, `{grade}`, `{subject}` filled in), a `fallback` type, `keep` (1–9; lowest dropped first when fewer slides are asked for; title and closing recap are protected), optional `include` condition and `variants` (first matching condition replaces the slide, e.g. a meme). A type the subject/level can't use falls back automatically.

## Design rules
`{id, priority, phase: plan|fill, when, set, why}`. Higher priority wins per property; `preferFamilies` merge. `set` may use `theme`, `accent`+`dark`, `minFont`, `maxDensity`, `maxItems`, `preferFamilies`. Rules never touch geometry: the matcher still verifies every slide fits, so a rule can make type bigger but can't cause overflow. A theme the teacher saved always wins over a rule (see `deck-view.tsx`).

## Memes
Opt-in ("add a meme", "make it fun", or the include flag); never in assessments; at most one per deck; only cartoon/animal formats from `memes.json`. Captions are cleaned and capped; the image is fetched through our signed proxy `app/api/meme`, never by the browser from the meme host. Source: memegen (MIT) at `MEMEGEN_BASE_URL` (default public instance, which adds a small watermark; self-host to remove it). Set `MEME_SIGNING_SECRET` in production. Reddit is not used: its API needs approval and a commercial agreement.

## Personas the ten templates were shaped for
Concept Explorer (any class, first lesson) · Problem Solver (maths/physics numericals) · How It Works (science processes) · Story of an Era (history/civics) · Compare & Contrast · Exam Revision Sprint (board/university) · Hands-on Activity (labs, groups) · Language & Literature Room · Code Walkthrough · Quiz Round.
Example prompts: "Photosynthesis class 6 with a meme", "Class 10 quadratic equations practice", "last minute revision electrochemistry class 12", "mitosis vs meiosis", "python for loops BCA", "fractions quiz round class 5".
