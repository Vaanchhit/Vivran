import type { MetadataRoute } from "next";

const SITE = "https://vivran.co.in";

/** The public pages. The product lives behind sign-in and is left out on purpose. */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number, changeFrequency: "weekly" | "monthly" | "yearly") =>
    ({ url: `${SITE}${path}`, lastModified: new Date(), changeFrequency, priority });
  return [
    page("/", 1, "weekly"),
    page("/demo", 0.8, "monthly"),
    page("/index.md", 0.5, "weekly"),
    page("/student", 0.4, "monthly"),
    page("/institution", 0.4, "monthly"),
    page("/login", 0.3, "yearly"),
    page("/privacy", 0.2, "yearly"),
    page("/terms", 0.2, "yearly"),
  ];
}
