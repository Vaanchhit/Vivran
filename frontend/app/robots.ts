import type { MetadataRoute } from "next";

const SITE = "https://vivran.co.in";

// The public site is open to search engines and AI agents alike; the product
// (behind sign-in) and the API are not for crawling. AI crawlers get their
// own named groups so the welcome is explicit, with the same limits.
const PRIVATE = ["/teacher", "/beta", "/api/", "/auth/"];
const AGENTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AGENTS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
