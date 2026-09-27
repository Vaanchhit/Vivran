/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/landing", destination: "/", permanent: false },
      { source: "/home.html", destination: "/", permanent: true },
    ];
  },
  async rewrites() {
    // The landing page is a self-contained document (its own theme script,
    // GSAP scenes and page-wide styles), served as-is so none of it can leak
    // into the app's routes.
    return { beforeFiles: [{ source: "/", destination: "/home.html" }] };
  },
};

export default nextConfig;
