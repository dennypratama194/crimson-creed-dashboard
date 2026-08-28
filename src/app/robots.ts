import type { MetadataRoute } from "next";

// Private internal tool — keep it out of search indexes entirely.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
