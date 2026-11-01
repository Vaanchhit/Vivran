/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/landing", destination: "/", permanent: false },
      { source: "/home.html", destination: "/", permanent: true },
      { source: "/tour", destination: "/demo", permanent: true },
      // Saved work used to be listed under Recent; it is all in Library now.
      { source: "/teacher/recent", destination: "/teacher/library", permanent: true },
    ];
  },
  async headers() {
    // Everything under /landing has a content hash in its file name, so a
    // changed file is a new URL and browsers can keep these for a year.
    // landing/site/ holds files that keep their names when they change (the
    // page's own CSS and JS, the dot field), so browsers check them each visit.
    // The later rule wins for the same header.
    const text = (type) => [{ key: "Content-Type", value: `${type}; charset=utf-8` }];
    return [
      { source: "/landing/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/landing/site/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
      // Agent-facing text: say what it is, and point every page at it.
      { source: "/index.md", headers: text("text/markdown") },
      { source: "/llms-full.txt", headers: text("text/markdown") },
      { source: "/llms.txt", headers: text("text/plain") },
      { source: "/.well-known/security.txt", headers: text("text/plain") },
      { source: "/", headers: [{ key: "Link", value: '</index.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="help"' }, { key: "Vary", value: "Accept" }] },
    ];
  },
  async rewrites() {
    // The landing page is a self-contained document (its own theme script,
    // GSAP scenes and page-wide styles), served as-is so none of it can leak
    // into the app's routes.
    // An agent that asks for markdown gets the markdown copy of the home page.
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "header", key: "accept", value: ".*text/markdown.*" }], destination: "/index.md" },
        { source: "/", destination: "/home.html" },
        { source: "/llms-full.txt", destination: "/index.md" },
      ],
    };
  },
};

export default nextConfig;
