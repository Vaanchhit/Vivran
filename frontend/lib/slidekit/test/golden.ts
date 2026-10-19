// ─────────────────────────────────────────────────────────────
// Hand-written decks of the quality we want a model to reach, one per
// template shape. They serve three jobs: a visual reference in the gallery,
// a check that the block schema and layouts can carry real teaching content
// (not just random filler), and a yardstick when comparing model output.
// ─────────────────────────────────────────────────────────────
import type { TeacherInput } from "../intent";

export interface Golden { template: string; input: TeacherInput; lessonTitle: string; blocks: Record<string, unknown>[] }

export const GOLDEN: Golden[] = [
  {
    template: "how-it-works",
    input: { topic: "Photosynthesis", grade: "Class 8", subject: "science", goal: "introduce", notes: "add a meme" },
    lessonTitle: "Photosynthesis: how plants make food",
    blocks: [
      { type: "title", intent: "hook", title: "Photosynthesis", subtitle: "How a leaf turns sunlight into food · Class 8 Science" },
      { type: "objectives", intent: "orient", heading: "By the end of this lesson", items: ["Say what goes into photosynthesis and what comes out", "Name where in the leaf it happens", "Explain why it matters for every living thing"] },
      { type: "explanation", intent: "teach", heading: "The big picture", points: ["Plants make their own food; animals must eat", "They use light, water and carbon dioxide", "The products are glucose (food) and oxygen"] },
      { type: "process", intent: "teach", heading: "How a leaf does it", isCycle: false, steps: [
        { label: "Roots absorb water", detail: "Carried up to the leaf through the stem" },
        { label: "Leaves take in CO₂", detail: "Through tiny pores called stomata" },
        { label: "Chlorophyll traps light", detail: "The green pigment captures sunlight energy" },
        { label: "Glucose is made", detail: "Water and CO₂ are combined using that energy" },
        { label: "Oxygen is released", detail: "Leaves the leaf through the stomata" } ] },
      { type: "cause_effect", intent: "teach", heading: "What limits the rate", causes: ["Less sunlight", "Less water in the soil", "Less carbon dioxide"], event: "Photosynthesis slows down", effects: ["Less glucose for growth", "Less oxygen released"] },
      { type: "meme", intent: "teach", template: "pooh", lines: ["Plants eat soil", "Plants make food from light, water and air"], takeaway: "A plant's food is made in its leaves; the soil only provides water and minerals." },
      { type: "quiz_mcq", intent: "check", question: "Which gas do plants take in for photosynthesis?", options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"], answer: 1, explanation: "Leaves absorb carbon dioxide through stomata and combine it with water to make glucose." },
      { type: "recap", intent: "close", heading: "Remember", points: ["Inputs: sunlight, water, carbon dioxide", "Outputs: glucose and oxygen", "It happens in chlorophyll-rich leaf cells", "It feeds the plant and almost every food chain"] },
    ],
  },
  {
    template: "problem-solver",
    input: { topic: "Solving quadratic equations by factorisation", grade: "Class 10", subject: "mathematics", goal: "practice", notes: "solve problems" },
    lessonTitle: "Quadratic equations by factorisation",
    blocks: [
      { type: "title", intent: "hook", title: "Quadratics by Factorisation", subtitle: "Split the middle term · Class 10 Mathematics" },
      { type: "objectives", intent: "orient", heading: "You will be able to", items: ["Write a quadratic in standard form", "Factorise by splitting the middle term", "Find both roots and check them"] },
      { type: "formula", intent: "teach", heading: "The method in one line", latex: "ax^2 + bx + c = 0 \\Rightarrow (x - p)(x - q) = 0", variables: [
        { symbol: "a, b, c", meaning: "Coefficients; a is not zero" }, { symbol: "p, q", meaning: "The two roots", unit: "" } ], note: "Find two numbers whose product is ac and whose sum is b." },
      { type: "worked_example", intent: "apply", heading: "Example 1: a is 1", problem: "Solve x² − 5x + 6 = 0.", steps: ["Product ac = 6, sum b = −5, so the numbers are −2 and −3", "Split the middle term: x² − 2x − 3x + 6", "Group: x(x − 2) − 3(x − 2) = (x − 2)(x − 3)", "Set each factor to zero"], answer: "x = 2 or x = 3" },
      { type: "worked_example", intent: "apply", heading: "Example 2: a is not 1", problem: "Solve 2x² + 7x + 3 = 0.", steps: ["ac = 6, b = 7, so the numbers are 6 and 1", "Split: 2x² + 6x + x + 3", "Group: 2x(x + 3) + 1(x + 3) = (x + 3)(2x + 1)", "Set each factor to zero"], answer: "x = −3 or x = −1/2" },
      { type: "misconception", intent: "teach", myth: "If (x − 2)(x − 3) = 6, then x − 2 = 2 and x − 3 = 3", fact: "Only a product equal to ZERO lets you set each factor to zero", why: "Many pairs of numbers multiply to 6. Zero is the only product that forces a factor to be zero." },
      { type: "quiz_mcq", intent: "check", question: "What are the roots of x² − 7x + 12 = 0?", options: ["3 and 4", "−3 and −4", "2 and 6", "1 and 12"], answer: 0, explanation: "(x − 3)(x − 4) = x² − 7x + 12, so x = 3 or x = 4. Option B gives a middle term of +7x." },
      { type: "recap", intent: "close", heading: "The method", points: ["Write the equation as ax² + bx + c = 0", "Find two numbers with product ac and sum b", "Split the middle term and group", "Set each factor to zero and check the roots"] },
    ],
  },
];
