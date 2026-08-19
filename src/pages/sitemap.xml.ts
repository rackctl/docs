import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

/**
 * /sitemap.xml — the path the SEO baseline requires.
 *
 * Starlight enables @astrojs/sitemap, which always emits `<base>-index.xml` plus
 * `<base>-0.xml` and cannot be made to publish a bare `sitemap.xml` (the index
 * filename is hard-coded as `${filenameBase}-index.xml`). Rather than hand-maintain
 * a second file, this generates a urlset from the content collection — the same
 * route table Astro builds from — so it stays correct as pages are added.
 *
 * Pages that opt out of indexing via a frontmatter `robots` head tag (the 404) are
 * excluded: listing a noindex page in a sitemap is a contradiction crawlers report.
 */

/** True when frontmatter declares a `robots` head tag containing `noindex`. */
function isNoIndex(entry: { data: { head?: unknown } }): boolean {
  const head = entry.data.head;
  if (!Array.isArray(head)) return false;

  return head.some((tag) => {
    const attrs = (tag as { attrs?: Record<string, unknown> }).attrs;
    return (
      attrs?.name === "robots" &&
      typeof attrs.content === "string" &&
      attrs.content.includes("noindex")
    );
  });
}

/** Content-collection id to a site-absolute, trailing-slash route. */
function routeFor(id: string): string {
  return id === "index" ? "/" : `/${id}/`;
}

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    throw new Error("`site` must be set in astro.config.mjs — sitemap.xml needs absolute URLs.");
  }

  const urls = (await getCollection("docs"))
    .filter((entry) => !isNoIndex(entry))
    .map((entry) => new URL(routeFor(entry.id), site).href)
    .sort();

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((loc) => `  <url><loc>${loc}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
