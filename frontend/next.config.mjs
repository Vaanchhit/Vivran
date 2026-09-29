/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/landing", destination: "/", permanent: false },
      { source: "/home.html", destination: "/", permanent: true },
    ];
  },
  async headers() {
    // Everything under /landing has a content hash in its file name, so a
    // changed file is a new URL and browsers can keep these for a year.
    return [{ source: "/landing/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
  async rewrites() {
    // The landing page is a self-contained document (its own theme script,
    // GSAP scenes and page-wide styles), served as-is so none of it can leak
    // into the app's routes.
    return { beforeFiles: [{ source: "/", destination: "/home.html" }] };
  },
};

export default nextConfig;
