"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import "./landing.css";

/* ────────────────────────────────────────────────────────────────
 * Ported from the original static prototype (public/index.html) —
 * same design, same copy, same interactions. The only real change:
 * every "Login" touchpoint now goes to the real /login page (which
 * already has the Teacher/Student/Institution selector, Teacher
 * wired to the actual product) instead of the old showAuth()/
 * hardcoded-credentials/coming-soon-modal logic. The prototype's own
 * embedded fake auth-screen/teacher-app markup is dropped entirely —
 * we have real ones.
 * ──────────────────────────────────────────────────────────────── */

function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("visible");
        });
      },
      { threshold: 0.12 },
    );
    document.querySelectorAll(".vivran-landing .reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

function useNavScroll() {
  useEffect(() => {
    const nav = document.getElementById("navbar");
    const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Reveals `html` into `el.innerHTML` character-by-character (HTML-tag-aware,
 * so tags aren't split mid-reveal) — same effect as the original prototype. */
function typeInto(el: HTMLElement, html: string, speed = 14): Promise<void> {
  const raw = html.replace(/<[^>]+>/g, "");
  let i = 0;
  return new Promise((resolve) => {
    const findPos = (count: number) => {
      let c = 0;
      let pos = 0;
      while (pos < html.length && c < count) {
        if (html[pos] === "<") {
          while (pos < html.length && html[pos] !== ">") pos++;
        } else {
          c++;
        }
        pos++;
      }
      return pos;
    };
    const interval = setInterval(() => {
      i++;
      el.innerHTML = html.substring(0, findPos(i)) + '<span class="typing-cursor"></span>';
      if (i >= raw.length) {
        clearInterval(interval);
        el.innerHTML = html;
        resolve();
      }
    }, speed);
  });
}

/* ── Hero chat mock: scripted intro animation on load ────────────── */
function HeroChat() {
  const bodyRef = useRef<HTMLDivElement>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const body = bodyRef.current;
    if (!body) return;

    (async () => {
      await sleep(1400);

      const userBubble = document.createElement("div");
      userBubble.className = "bubble bubble-user";
      userBubble.style.opacity = "0";
      userBubble.style.transition = "opacity .3s";
      userBubble.textContent = "Explain Black-Scholes from lecture 3";
      body.appendChild(userBubble);
      await sleep(50);
      userBubble.style.opacity = "1";
      await sleep(900);

      const thinking = document.createElement("div");
      thinking.className = "bubble bubble-ai";
      thinking.innerHTML = '<span style="letter-spacing:4px;color:var(--text-3)">···</span>';
      thinking.style.opacity = "0";
      thinking.style.transition = "opacity .3s";
      body.appendChild(thinking);
      await sleep(50);
      thinking.style.opacity = "1";
      await sleep(1100);
      thinking.remove();

      const aiBubble = document.createElement("div");
      aiBubble.className = "bubble bubble-ai";
      aiBubble.style.opacity = "0";
      aiBubble.style.transition = "opacity .3s";
      body.appendChild(aiBubble);
      await sleep(50);
      aiBubble.style.opacity = "1";

      const text =
        'The <strong>Black-Scholes model</strong> (introduced at <span style="color:var(--accent-2)">32:14 in Lecture 3</span>) provides a theoretical estimate for pricing European options:';
      await typeInto(aiBubble, text, 14);
      await sleep(200);

      const list = document.createElement("ul");
      list.style.margin = "8px 0 0 16px";
      list.style.display = "flex";
      list.style.flexDirection = "column";
      list.style.gap = "5px";
      const items = [
        "<strong>S</strong> — current stock price",
        "<strong>K</strong> — strike price",
        "<strong>σ</strong> — volatility of the underlying asset",
        "<strong>r</strong> — risk-free interest rate",
        "<strong>T</strong> — time to expiration",
      ];
      items.forEach((item) => {
        const li = document.createElement("li");
        li.innerHTML = item;
        li.style.fontSize = "0.82rem";
        li.style.opacity = "0";
        li.style.transition = "opacity .3s";
        list.appendChild(li);
        setTimeout(() => (li.style.opacity = "1"), 80);
      });
      aiBubble.appendChild(list);

      await sleep(600);
      const src = document.createElement("div");
      src.className = "source-tag";
      src.innerHTML = "📄 Lecture 3 · 32:14 — 36:48";
      aiBubble.appendChild(src);
    })();
  }, []);

  return (
    <div className="chat-mock">
      <div className="chat-titlebar">
        <div className="tbar-dot" />
        <div className="tbar-dot" />
        <div className="tbar-dot" />
        <span className="tbar-label">Vivran · FIN 301 — Advanced Finance</span>
      </div>
      <div className="chat-body" ref={bodyRef}>
        <div className="chat-context-bar">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M4 4.5h5M4 6.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Course: Advanced Finance · 14 lectures loaded
        </div>
      </div>
      <div className="chat-input-row">
        <div className="chat-input-fake">Ask anything about your course...</div>
        <button className="chat-send-btn" type="button" aria-label="Send">
          <svg width="14" height="14" fill="none" viewBox="0 0 14 14">
            <path d="M12 7H2M8 3l4 4-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── Live product demo: real click interactions, scripted responses ── */
const DEMO_DOCS = [
  { icon: "▶", type: "vid", name: "Lecture 3 — Derivatives", meta: "48:22 · 14 concepts" },
  { icon: "PDF", type: "pdf", name: "Black-Scholes Model", meta: "32 pages · Chapter 6" },
  { icon: "▶", type: "vid", name: "Lecture 5 — Options Pricing", meta: "52:10 · 19 concepts" },
  { icon: "PPT", type: "ppt", name: "Week 4 Slides", meta: "28 slides" },
  { icon: "PDF", type: "pdf", name: "Problem Set 3", meta: "8 problems · Solutions" },
  { icon: "▶", type: "vid", name: "Lecture 7 — Risk Models", meta: "41:08 · 11 concepts" },
];

const DEMO_QUERIES = [
  {
    q: "Explain Black-Scholes from lecture 3",
    header: "Answer · Lecture 3",
    text: "The <strong>Black-Scholes model</strong> is a mathematical framework for pricing European-style options:",
    list: [
      "Assumes constant volatility and risk-free rate over the option's life",
      "Requires 5 inputs: stock price, strike price, time, volatility, risk-free rate",
      "<strong>Prof. Sharma's note (33:41):</strong> \"This model fails when volatility smiles — real markets don't behave this cleanly\"",
      "Practical applications covered in Problem Set 3, Q4",
    ],
    source: "📹 Lecture 3 · 32:14–36:48 + Ch. 6 PDF p.18",
  },
  {
    q: "Summarize Lecture 3",
    header: "Lecture Summary · Lecture 3",
    text: "Lecture 3 (48 min) covers <strong>Derivatives &amp; Options Pricing</strong> in three parts:",
    list: [
      "<strong>0:00–18:00</strong> — Introduction to derivatives: futures, forwards, options",
      "<strong>18:00–36:00</strong> — Black-Scholes model derivation and assumptions",
      "<strong>36:00–48:00</strong> — Real-world limitations and volatility surface",
      "<strong>Key exam topic flagged by Prof. Sharma at 44:12</strong>",
    ],
    source: "📹 Lecture 3 — Full transcript indexed",
  },
  {
    q: "What did professor say about elasticity?",
    header: "Answer · Week 4 Slides",
    text: "Prof. Sharma covered <strong>price elasticity of demand</strong> in Week 4 slides (slide 11–15):",
    list: [
      "Elasticity = % change in quantity / % change in price",
      "Inelastic goods (|e| &lt; 1): insulin, petrol — firms have pricing power",
      "Elastic goods (|e| &gt; 1): luxury goods, tourism — consumers switch readily",
      "<strong>Her exact words (Week 4, slide 13):</strong> \"Elasticity determines who really bears the tax burden — not who writes the cheque\"",
    ],
    source: "📊 Week 4 Slides · p.11–15",
  },
  {
    q: "Give me examples from the notes",
    header: "Examples · Course Material",
    text: "Here are concrete examples from your course materials:",
    list: [
      "<strong>Black-Scholes (Ch.6, p.22):</strong> Pricing a 3-month call on Infosys at ₹1,400 strike",
      "<strong>Elasticity (Week 4 slides):</strong> PED of onions in India vs premium smartphones",
      "<strong>Portfolio theory (Lecture 5):</strong> 2-asset Sharpe ratio calculation walkthrough",
      "<strong>Problem Set 3, Q2:</strong> Complete worked solution for risk-adjusted return",
    ],
    source: "📄 Multiple sources · All from Prof. Sharma's material",
  },
];

function ProductDemo() {
  const areaRef = useRef<HTMLDivElement>(null);
  const [activeDoc, setActiveDoc] = useState(0);
  const [activeQuery, setActiveQuery] = useState<number | null>(null);
  const [inputVal, setInputVal] = useState("");
  const typingRef = useRef(false);

  const scrollToBottom = () => {
    const area = areaRef.current;
    if (area) area.scrollTop = area.scrollHeight;
  };

  const appendBubble = (className: string, opts: { text?: string; html?: string } = {}) => {
    const area = areaRef.current;
    if (!area) return null;
    const bubble = document.createElement("div");
    bubble.className = className;
    if (opts.html !== undefined) bubble.innerHTML = opts.html;
    if (opts.text !== undefined) bubble.textContent = opts.text;
    bubble.style.opacity = "0";
    bubble.style.transition = "opacity .3s";
    area.appendChild(bubble);
    scrollToBottom();
    return bubble;
  };

  const runQuery = async (idx: number) => {
    if (typingRef.current) return;
    typingRef.current = true;
    setActiveQuery(idx);
    const query = DEMO_QUERIES[idx];

    const userBubble = appendBubble("demo-bubble user", { text: query.q });
    await sleep(50);
    if (userBubble) userBubble.style.opacity = "1";
    await sleep(700);

    const think = appendBubble("demo-bubble ai", {
      html: '<div class="ai-header"><div class="ai-dot"></div>Thinking...</div><span style="color:var(--text-3);font-size:0.82rem">Searching course material</span>',
    });
    await sleep(50);
    if (think) think.style.opacity = "1";
    await sleep(1200);
    think?.remove();

    const aiBubble = appendBubble("demo-bubble ai", {
      html: `<div class="ai-header"><div class="ai-dot"></div>${query.header}</div>`,
    });
    await sleep(50);
    if (aiBubble) aiBubble.style.opacity = "1";

    if (aiBubble) {
      const textNode = document.createElement("div");
      aiBubble.appendChild(textNode);
      await typeInto(textNode, query.text, 12);

      const ul = document.createElement("ul");
      ul.style.marginTop = "10px";
      ul.style.marginLeft = "14px";
      ul.style.display = "flex";
      ul.style.flexDirection = "column";
      ul.style.gap = "6px";
      query.list.forEach((item, i) => {
        const li = document.createElement("li");
        li.innerHTML = item;
        li.style.fontSize = "0.84rem";
        li.style.lineHeight = "1.55";
        li.style.opacity = "0";
        li.style.transition = "opacity .3s";
        ul.appendChild(li);
        setTimeout(() => (li.style.opacity = "1"), i * 120 + 100);
      });
      aiBubble.appendChild(ul);
      await sleep(query.list.length * 120 + 300);

      const srcTag = document.createElement("div");
      srcTag.className = "demo-src-tag";
      srcTag.textContent = query.source;
      aiBubble.appendChild(srcTag);
    }

    scrollToBottom();
    typingRef.current = false;
  };

  const sendCustom = async () => {
    const val = inputVal.trim();
    if (!val || typingRef.current) return;
    setInputVal("");
    typingRef.current = true;
    setActiveQuery(null);

    const userBubble = appendBubble("demo-bubble user", { text: val });
    await sleep(50);
    if (userBubble) userBubble.style.opacity = "1";
    await sleep(700);

    const think = appendBubble("demo-bubble ai", {
      html: '<div class="ai-header"><div class="ai-dot"></div>Searching...</div>',
    });
    await sleep(50);
    if (think) think.style.opacity = "1";
    await sleep(1000);
    think?.remove();

    const aiBubble = appendBubble("demo-bubble ai", {
      html: '<div class="ai-header"><div class="ai-dot"></div>Vivran · FIN 301</div>',
    });
    await sleep(50);
    if (aiBubble) aiBubble.style.opacity = "1";

    if (aiBubble) {
      const textNode = document.createElement("div");
      aiBubble.appendChild(textNode);
      await typeInto(
        textNode,
        `Based on Prof. Sharma's course material, I found relevant context for <strong>"${val}"</strong> across 3 indexed sources. This is a demo — in production, I'd cite specific lecture timestamps and page numbers.`,
        11,
      );
      const srcTag = document.createElement("div");
      srcTag.className = "demo-src-tag";
      srcTag.textContent = "📚 FIN 301 · Course material only";
      aiBubble.appendChild(srcTag);
    }

    scrollToBottom();
    typingRef.current = false;
  };

  return (
    <div className="demo-shell reveal reveal-d2">
      <div className="demo-topbar">
        <div className="tbar-dot" />
        <div className="tbar-dot" />
        <div className="tbar-dot" />
        <div className="demo-topbar-title">Vivran — FIN 301 · Prof. Ananya Sharma</div>
      </div>
      <div className="demo-body">
        <div className="demo-left">
          <div className="demo-panel-title">Course Material</div>
          {DEMO_DOCS.map((doc, i) => (
            <div key={doc.name} className={`doc-item${activeDoc === i ? " active" : ""}`} onClick={() => setActiveDoc(i)}>
              <div className={`doc-icon ${doc.type}`}>{doc.icon}</div>
              <div className="doc-meta">
                <div className="doc-meta-name">{doc.name}</div>
                <div className="doc-meta-sub">{doc.meta}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="demo-right">
          <div className="demo-chat-area" ref={areaRef}>
            <div className="demo-bubble ai" style={{ opacity: 0.6, fontSize: "0.82rem", padding: "12px 16px" }}>
              <div className="ai-header">
                <div className="ai-dot" />
                Vivran
              </div>
              Course loaded. 6 documents indexed. Ask me anything about FIN 301 — I&rsquo;ll only answer from Prof. Sharma&rsquo;s material.
            </div>
          </div>
          <div className="demo-queries">
            {DEMO_QUERIES.map((q, i) => (
              <button
                key={q.q}
                type="button"
                className={`demo-query-btn${activeQuery === i ? " active" : ""}`}
                onClick={() => runQuery(i)}
              >
                {q.q}
              </button>
            ))}
          </div>
          <div className="demo-input-bar">
            <input
              className="demo-input"
              placeholder="Ask anything about FIN 301..."
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendCustom()}
            />
            <button className="demo-send" type="button" aria-label="Send" onClick={sendCustom}>
              <svg width="15" height="15" fill="none" viewBox="0 0 15 15">
                <path d="M13 7.5H2M9 3.5l4 4-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Analytics visuals: static, deterministic data ────────────────── */
const HEATMAP_ROWS = ["Derivatives", "Options", "B-S Model", "Elasticity", "Portfolio"];
const HEATMAP_COLS = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"];
const HEATMAP_VALUES = [
  [0.9, 0.85, 0.7, 0.75, 0.6, 0.88, 0.92, 0.8],
  [0.7, 0.6, 0.9, 0.85, 0.72, 0.65, 0.78, 0.9],
  [0.4, 0.35, 0.85, 0.9, 0.8, 0.5, 0.45, 0.7],
  [0.85, 0.9, 0.6, 0.5, 0.75, 0.88, 0.9, 0.85],
  [0.5, 0.55, 0.6, 0.4, 0.35, 0.65, 0.7, 0.55],
];
function heatColor(v: number) {
  if (v >= 0.8) return `rgba(34,197,94,${v * 0.7})`;
  if (v >= 0.6) return `rgba(234,179,8,${v * 0.8})`;
  return `rgba(239,68,68,${Math.max(v * 0.9, 0.3)})`;
}
const BAR_DATA = [
  { label: "L1", pct: 82, color: "#22C55E" },
  { label: "L2", pct: 78, color: "#22C55E" },
  { label: "L3", pct: 54, color: "#F59E0B" },
  { label: "L4", pct: 71, color: "#F59E0B" },
  { label: "L5", pct: 46, color: "#EF4444" },
  { label: "L6", pct: 68, color: "#F59E0B" },
  { label: "L7", pct: 39, color: "#EF4444" },
  { label: "L8", pct: 75, color: "#22C55E" },
];

export default function LandingPage() {
  useScrollReveal();
  useNavScroll();

  return (
    <div className="vivran-landing">
      {/* NAV */}
      <nav id="navbar">
        <div className="container">
          <div className="nav-inner">
            <Link href="/" className="logo">
              <img src="/Vivran Logo.png" alt="Vivran Logo" style={{ height: 28, width: "auto", borderRadius: 7, objectFit: "contain" }} />
              Vivran
            </Link>
            <ul className="nav-links">
              <li><a href="#problem">Problem</a></li>
              <li><a href="#demo">Demo</a></li>
              <li><a href="#analytics">Analytics</a></li>
              <li><a href="#team">Team</a></li>
            </ul>
            <div className="nav-cta">
              <Link href="/login" className="btn btn-ghost" style={{ padding: "10px 20px", fontSize: "0.82rem" }}>
                Login
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section id="hero">
        <div className="hero-bg" />
        <div className="container">
          <div className="hero-grid">
            <div>
              <div className="hero-eyebrow reveal">
                <span className="hero-eyebrow-dot" />
                Early Access · AI-Native Education
              </div>
              <h1 className="hero-h1 reveal reveal-d1">
                Your course.
                <br />
                Now <span className="grad-text">searchable,<br />explainable,</span>
                <br />
                and alive.
              </h1>
              <div style={{ fontSize: "1.1rem", marginBottom: 16, color: "var(--accent-1)", fontWeight: 500, fontFamily: "var(--font-display)" }}>
                विवरण से समझ तक · From Information to Understanding
              </div>
              <p className="hero-sub reveal reveal-d2">
                Vivran turns static lectures into an intelligent system that answers, analyzes, and adapts — in real time. No hallucinations. Only your content.
              </p>
              <div className="hero-ctas reveal reveal-d3">
                <a href="#demo" className="btn btn-primary btn-lg">
                  <svg width="16" height="16" fill="none" viewBox="0 0 16 16"><polygon points="6,4 12,8 6,12" fill="white" /></svg>
                  See it in action
                </a>
                <Link href="/login" className="btn btn-ghost btn-lg">Login</Link>
              </div>
            </div>
            <div className="reveal reveal-d2">
              <HeroChat />
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section id="problem" className="section-pad">
        <div className="container">
          <div className="problem-grid">
            <div>
              <span className="section-eyebrow reveal">The Problem</span>
              <h2 className="reveal reveal-d1">Education is still static.</h2>
              <ul className="problem-list">
                <li className="problem-item reveal reveal-d2">
                  <span className="p-num">01</span>
                  <div className="p-content">
                    <h4>Students rewatch, not understand</h4>
                    <p>Rewinding a lecture 5 times doesn&rsquo;t build comprehension. It builds frustration. Students need answers, not more playback.</p>
                  </div>
                </li>
                <li className="problem-item reveal reveal-d3">
                  <span className="p-num">02</span>
                  <div className="p-content">
                    <h4>Teachers guess, not measure</h4>
                    <p>Faculty have no signal on which concepts are landing and which are lost entirely. Every class is a best guess.</p>
                  </div>
                </li>
                <li className="problem-item reveal reveal-d4">
                  <span className="p-num">03</span>
                  <div className="p-content">
                    <h4>Content exists. Intelligence doesn&rsquo;t.</h4>
                    <p>Courses have rich material — PDFs, recordings, slides. But none of it is queryable, analyzable, or adaptive.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="reveal reveal-d2">
              <div className="timeline-vis">
                <div className="tl-title">The current learning loop</div>
                <div className="tl-step">
                  <div className="tl-node">
                    <div className="tl-dot active">📹</div>
                    <div className="tl-label">Lecture<br />uploaded</div>
                  </div>
                  <div className="tl-connector" />
                  <div className="tl-node">
                    <div className="tl-dot neutral">🎧</div>
                    <div className="tl-label">Student<br />watches</div>
                  </div>
                  <div className="tl-connector" />
                  <div className="tl-node">
                    <div className="tl-dot warning">❓</div>
                    <div className="tl-label">Confusion<br />hits</div>
                  </div>
                  <div className="tl-connector dashed" />
                  <div className="tl-node">
                    <div className="tl-dot dead">⏳</div>
                    <div className="tl-label">Waits for<br />office hours</div>
                  </div>
                </div>
                <div className="tl-insight">
                  <svg width="14" height="14" fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" /><path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  No feedback loop. No data. No resolution.
                </div>
                <div style={{ marginTop: 28, padding: 20, background: "rgba(124,110,250,.05)", border: "1px solid rgba(124,110,250,.15)", borderRadius: 10 }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>
                    What professors know about drop-off
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "3.5rem", fontWeight: 800, color: "rgba(255,255,255,.06)", letterSpacing: "-0.05em", textAlign: "center", padding: "10px 0" }}>
                    Nothing.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* SOLUTION */}
      <section id="solution" className="section-pad">
        <div className="container">
          <div className="solution-header">
            <span className="section-eyebrow reveal">The Solution</span>
            <h2 className="reveal reveal-d1">Vivran turns content<br />into intelligence.</h2>
            <p className="reveal reveal-d2">Not a chatbot bolted onto your LMS. A purpose-built system that makes every minute of lecture matter more.</p>
          </div>
          <div className="cards-grid">
            <div className="sol-card reveal reveal-d1">
              <span className="card-num">01</span>
              <div className="sol-icon">
                <svg width="22" height="22" fill="none" viewBox="0 0 22 22"><circle cx="10" cy="10" r="7" stroke="#7C6EFA" strokeWidth="1.5" /><path d="M15.5 15.5L19 19" stroke="#7C6EFA" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </div>
              <h3>Ask your course anything</h3>
              <p>Students get 24/7 access to an AI trained exclusively on professor-uploaded material. Instant, grounded answers referencing exact lecture timestamps and page numbers.</p>
            </div>
            <div className="sol-card reveal reveal-d2">
              <span className="card-num">02</span>
              <div className="sol-icon">
                <svg width="22" height="22" fill="none" viewBox="0 0 22 22"><rect x="3" y="13" width="4" height="6" rx="1" fill="rgba(124,110,250,0.4)" stroke="#7C6EFA" strokeWidth="1.5" /><rect x="9" y="9" width="4" height="10" rx="1" fill="rgba(124,110,250,0.2)" stroke="#7C6EFA" strokeWidth="1.5" /><rect x="15" y="5" width="4" height="14" rx="1" fill="rgba(124,110,250,0.1)" stroke="#7C6EFA" strokeWidth="1.5" /></svg>
              </div>
              <h3>See exactly where students struggle</h3>
              <p>Concept-level heatmaps, lecture drop-off graphs, and student-level diagnostics. Know which 4-minute segment of lecture 7 loses 60% of your class — before the exam.</p>
            </div>
            <div className="sol-card reveal reveal-d3">
              <span className="card-num">03</span>
              <div className="sol-icon">
                <svg width="22" height="22" fill="none" viewBox="0 0 22 22"><path d="M11 3v2M11 17v2M3 11h2M17 11h2" stroke="#7C6EFA" strokeWidth="1.5" strokeLinecap="round" /><circle cx="11" cy="11" r="5" stroke="#7C6EFA" strokeWidth="1.5" /><circle cx="11" cy="11" r="2" fill="#7C6EFA" /></svg>
              </div>
              <h3>No hallucinations. Only your content.</h3>
              <p>Strict knowledge boundaries. Vivran refuses to speculate beyond what&rsquo;s in the course. Every answer is traceable, source-cited, and academically defensible.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* PRODUCT DEMO */}
      <section id="demo" className="section-pad">
        <div className="container">
          <div className="demo-header">
            <span className="section-eyebrow reveal">Live Product</span>
            <h2 className="reveal reveal-d1">Intelligence, on demand.</h2>
            <p className="reveal reveal-d2" style={{ marginTop: 14 }}>Click a query below to see Vivran respond with grounded, structured intelligence from actual course material.</p>
          </div>
          <ProductDemo />
        </div>
      </section>

      <div className="divider" />

      {/* ANALYTICS */}
      <section id="analytics" className="section-pad">
        <div className="container">
          <div className="analytics-grid">
            <div>
              <span className="section-eyebrow reveal">For Educators</span>
              <h2 className="reveal reveal-d1">Stop guessing.<br />Start knowing.</h2>
              <p className="reveal reveal-d2">The analytics layer Indian ed-tech has been missing. Understand your students at concept level, not quiz level.</p>
              <div className="analytics-stat-row reveal reveal-d3">
                <div className="a-stat">
                  <div className="a-stat-num">4.2×</div>
                  <div className="a-stat-label">faster concept gap detection</div>
                </div>
                <div className="a-stat">
                  <div className="a-stat-num">91%</div>
                  <div className="a-stat-label">student doubts resolved without office hours</div>
                </div>
              </div>
              <div className="analytics-stat-row reveal reveal-d4" style={{ marginTop: 16 }}>
                <div className="a-stat" style={{ flex: "none", width: "auto", paddingRight: 32 }}>
                  <div className="a-stat-num">∞</div>
                  <div className="a-stat-label">availability. 3am works too.</div>
                </div>
              </div>
            </div>
            <div className="reveal reveal-d2">
              <div className="dashboard-mock">
                <div className="dash-topbar">
                  <div className="dash-topbar-title">Analytics — FIN 301</div>
                  <div className="dash-tabs">
                    <div className="dash-tab active">Overview</div>
                    <div className="dash-tab">Students</div>
                    <div className="dash-tab">Concepts</div>
                  </div>
                </div>
                <div className="dash-body">
                  <div>
                    <div className="heatmap-label">Concept Mastery Heatmap</div>
                    <div className="heatmap-grid">
                      <div />
                      {HEATMAP_COLS.map((c) => <div key={c} className="hm-col-header">{c}</div>)}
                      {HEATMAP_ROWS.map((row, ri) => (
                        <Fragment key={row}>
                          <div className="hm-row-label">{row}</div>
                          {HEATMAP_VALUES[ri].map((v, ci) => (
                            <div key={ci} className="hm-cell" style={{ background: heatColor(v) }} title={`${Math.round(v * 100)}% mastery`} />
                          ))}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="chart-label">Lecture Drop-off (% watching to end)</div>
                    <div className="bar-chart">
                      {BAR_DATA.map((d) => (
                        <div key={d.label} className="bar-col">
                          {/* Pixel height, not %: .bar's containing block for
                              height purposes is .bar-col, which has no definite
                              height (the parent uses align-items:flex-end, not
                              stretch) — percentage would resolve to nothing.
                              .bar-chart's height is a fixed 80px, so compute
                              against that directly instead. */}
                          <div className="bar" style={{ height: `${(d.pct / 100) * 80}px`, background: d.color, opacity: 0.75 }} title={`${d.pct}% watched to end`} />
                          <div className="bar-x-label">{d.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <table className="student-table">
                      <thead>
                        <tr><th>Student</th><th>Engagement</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {[
                          { name: "Priya S.", pct: 88, color: "linear-gradient(90deg,#22C55E,#4ADE80)", status: "ok", label: "On track" },
                          { name: "Arjun M.", pct: 61, color: "linear-gradient(90deg,#F59E0B,#FBBF24)", status: "warn", label: "Review needed" },
                          { name: "Nisha K.", pct: 34, color: "linear-gradient(90deg,#EF4444,#F87171)", status: "bad", label: "At risk" },
                          { name: "Rohan T.", pct: 92, color: "linear-gradient(90deg,#22C55E,#4ADE80)", status: "ok", label: "On track" },
                        ].map((s) => (
                          <tr key={s.name}>
                            <td className="student-name">{s.name}</td>
                            <td>
                              <div className="student-progress">
                                <div className="prog-bar-bg"><div className="prog-bar-fill" style={{ width: `${s.pct}%`, background: s.color }} /></div>
                                <span className="prog-pct">{s.pct}%</span>
                              </div>
                            </td>
                            <td><span className={`status-badge status-${s.status}`}>{s.label}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* WHY */}
      <section id="why" className="section-pad">
        <div className="container">
          <div className="why-inner">
            <span className="section-eyebrow reveal">The Case</span>
            <div className="why-quote reveal reveal-d1">
              Education doesn&rsquo;t need<br />more content. It needs<br /><em className="grad-text">comprehension.</em>
            </div>
            <p className="why-sub reveal reveal-d2">
              India produces 1.5 million engineering graduates and 400,000 commerce graduates per year. The gap isn&rsquo;t content — it&rsquo;s the intelligence layer that makes content stick.
            </p>
            <div className="why-metrics reveal reveal-d3">
              <div className="why-metric">
                <div className="why-metric-num">1.5M</div>
                <div className="why-metric-label">engineering graduates/year<br />in India alone</div>
              </div>
              <div className="why-metric">
                <div className="why-metric-num">68%</div>
                <div className="why-metric-label">of lectures never<br />rewatched after upload</div>
              </div>
              <div className="why-metric">
                <div className="why-metric-num">$0</div>
                <div className="why-metric-label">analytics available<br />to most educators today</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* TEAM */}
      <section id="team" className="section-pad">
        <div className="container">
          <div className="team-header">
            <span className="section-eyebrow reveal">Who&rsquo;s Building This</span>
            <h2 className="reveal reveal-d1">Built by people who<br />lived the problem.</h2>
            <p className="reveal reveal-d2" style={{ marginTop: 16 }}>Both from SRCC. Both frustrated with the same static lectures, the same guessing games, the same unreachable professors.</p>
          </div>
          <div className="team-grid">
            <div className="team-card reveal reveal-d1">
              <div className="team-avatar" style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)" }}>RJ</div>
              <div className="team-info">
                <h3><a href="https://www.linkedin.com/in/rachitjain28/" target="_blank" rel="noreferrer" style={{ color: "var(--text-1)", textDecoration: "underline", textDecorationColor: "var(--accent-1)" }}>Rachit Jain</a></h3>
                <div className="team-role">Co-founder</div>
                <div style={{ fontSize: "0.8rem", marginBottom: 10 }}><a href="mailto:jainrachit4042@gmail.com" style={{ color: "var(--text-2)", textDecoration: "none" }}>jainrachit4042@gmail.com</a></div>
                <p>20 years old. SRCC Commerce. Spent 2 years trying to understand macroeconomics from 1-hour lectures with no way to ask a follow-up question at 2am. Now building the answer.</p>
                <div className="team-tag">
                  <svg width="10" height="10" fill="none" viewBox="0 0 10 10"><path d="M5 1l1.18 2.39L9 3.82 7 5.77l.47 2.74L5 7.19l-2.47 1.32L3 5.77 1 3.82l2.82-.43z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" /></svg>
                  SRCC · Delhi University
                </div>
              </div>
            </div>
            <div className="team-card reveal reveal-d2">
              <div className="team-avatar" style={{ background: "linear-gradient(135deg,#0EA5E9,#4FC3F7)" }}>VA</div>
              <div className="team-info">
                <h3><a href="https://www.linkedin.com/in/vaanchhit-agarwal-549036296/" target="_blank" rel="noreferrer" style={{ color: "var(--text-1)", textDecoration: "underline", textDecorationColor: "var(--accent-2)" }}>Vaanchhit Agarwal</a></h3>
                <div className="team-role">Co-founder</div>
                <div style={{ fontSize: "0.8rem", marginBottom: 10 }}><a href="mailto:vaanchhit06@gmail.com" style={{ color: "var(--text-2)", textDecoration: "none" }}>vaanchhit06@gmail.com</a></div>
                <p>20 years old. SRCC Commerce. Obsessed with the infrastructure problem — how do you make a professor&rsquo;s knowledge available at 3am for every student, simultaneously, without lying?</p>
                <div className="team-tag">
                  <svg width="10" height="10" fill="none" viewBox="0 0 10 10"><path d="M5 1l1.18 2.39L9 3.82 7 5.77l.47 2.74L5 7.19l-2.47 1.32L3 5.77 1 3.82l2.82-.43z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" /></svg>
                  SRCC · Delhi University
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* SUPPORTED BY */}
      <section id="support" className="section-pad-sm">
        <div className="container">
          <div className="support-header">
            <span className="section-eyebrow reveal">Supported By</span>
            <p className="reveal reveal-d1">Early support across infrastructure and voice.</p>
          </div>
          <div className="support-grid">
            <div className="support-card support-card-google reveal reveal-d1">
              <div className="support-logo-wrap">
                <div className="support-logo-google-crop">
                  <img className="support-logo-img support-logo-google" src="/Google Cloud Startup Program.jpg" alt="Google Cloud Startup Program" loading="lazy" />
                </div>
              </div>
            </div>
            <div className="support-card support-card-eleven reveal reveal-d2">
              <div className="support-logo-wrap">
                <img
                  className="support-logo-img support-logo-eleven"
                  src="https://eleven-public-cdn.elevenlabs.io/payloadcms/cy7rxce8uki-IIElevenLabsGrants%201.webp"
                  alt="ElevenLabs Grants"
                  loading="lazy"
                />
              </div>
            </div>
            <div className="support-card support-card-white reveal reveal-d3">
              <div className="support-logo-wrap">
                <img className="support-logo-img support-logo-cartesia" src="/Cartesia Startups Logo.png" alt="Cartesia Startup Program" loading="lazy" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* FINAL CTA */}
      <section id="cta" className="section-pad">
        <div className="cta-orb cta-orb-1" />
        <div className="cta-orb cta-orb-2" />
        <div className="container">
          <div className="cta-inner">
            <span className="section-eyebrow reveal">Get Involved</span>
            <h2 className="reveal reveal-d1">Build the future<br />of learning.</h2>
            <p className="reveal reveal-d2">We&rsquo;re onboarding our first cohort of professors and students this semester. If you&rsquo;re tired of static education, you&rsquo;re in the right place.</p>
            <div className="cta-btns reveal reveal-d3">
              <a href="mailto:info@vivran.co.in" className="btn btn-primary btn-lg">
                <svg width="16" height="16" fill="none" viewBox="0 0 16 16"><rect x="2" y="4" width="12" height="9" rx="1.5" stroke="white" strokeWidth="1.4" /><path d="M2 5.5l6 4 6-4" stroke="white" strokeWidth="1.4" strokeLinecap="round" /></svg>
                Join the waitlist
              </a>
              <a href="mailto:info@vivran.co.in" className="btn btn-ghost btn-lg">Book a demo →</a>
            </div>
            <p className="reveal reveal-d4" style={{ fontSize: "0.78rem", marginTop: 28, color: "var(--text-3)" }}>No spam. No newsletters. Just early access when we&rsquo;re ready for you.</p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="container">
          <div className="footer-inner">
            <div>
              <Link href="/" className="logo" style={{ fontSize: "1.05rem" }}>
                <img src="/Vivran Logo.png" alt="Vivran Logo" style={{ height: 22, width: "auto", borderRadius: 5, objectFit: "contain" }} />
                Vivran
              </Link>
              <p className="footer-copy" style={{ marginTop: 8 }}>Making every minute of education count.</p>
            </div>
            <div className="footer-links">
              <a href="#problem">Problem</a>
              <a href="#demo">Demo</a>
              <a href="#analytics">Analytics</a>
              <a href="#team">Team</a>
              <a href="mailto:info@vivran.co.in">Contact</a>
            </div>
          </div>
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <span className="footer-copy">© {new Date().getFullYear()} Vivran Technologies. All rights reserved.</span>
            <span className="footer-copy">Built at SRCC, New Delhi 🇮🇳</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
