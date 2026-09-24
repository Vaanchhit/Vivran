import type { Config } from "tailwindcss";

/**
 * Every colour the product uses is a semantic name bound to a CSS variable
 * declared in app/globals.css. Component files should never carry a raw hex
 * — that's what makes the next re-theme a one-file change.
 *
 * Roles:
 *   background / surface / surface-2 / card  — surfaces, light → dark
 *   foreground / muted / faint               — text, high → low emphasis
 *   border / border-hi                       — hairlines
 *   accent                                   — the single brand accent (vermillion)
 *   chrome                                   — warm neutral for provenance/metadata
 *   ink                                      — the solid primary button (inverts per theme)
 *   success / warning / danger               — semantic state, each with .soft + .line
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--bg)",
        foreground: "var(--text-1)",
        muted: "var(--text-2)",
        faint: "var(--text-3)",
        card: "var(--bg-card)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        "border-hi": "var(--border-hi)",
        accent: {
          DEFAULT: "var(--accent-1)",
          soft: "var(--accent-soft)",
          "soft-hi": "var(--accent-soft-hi)",
          line: "var(--accent-line)",
        },
        chrome: {
          DEFAULT: "var(--accent-2)",
          soft: "var(--chrome-soft)",
          line: "var(--chrome-line)",
        },
        ink: {
          DEFAULT: "var(--btn-bg)",
          hover: "var(--btn-bg-hover)",
          fg: "var(--btn-fg)",
        },
        success: {
          DEFAULT: "var(--ok)",
          soft: "var(--ok-soft)",
          line: "var(--ok-line)",
        },
        warning: {
          DEFAULT: "var(--warn)",
          soft: "var(--warn-soft)",
          line: "var(--warn-line)",
        },
        danger: {
          DEFAULT: "var(--err)",
          soft: "var(--err-soft)",
          line: "var(--err-line)",
        },
        focus: "var(--focus)",
        // decorative-only categorical tints (icons); never used for state
        tint: {
          clay: "var(--tint-clay)",
          bronze: "var(--tint-bronze)",
          olive: "var(--tint-olive)",
          rose: "var(--tint-rose)",
          umber: "var(--tint-umber)",
        },
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        panel: "var(--shadow-panel)",
      },
      backgroundImage: {
        "glow-1": "radial-gradient(circle, var(--glow-1) 0%, transparent 70%)",
        "glow-2": "radial-gradient(circle, var(--glow-2) 0%, transparent 70%)",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
