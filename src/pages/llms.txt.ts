import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { entryId, sidebar } from "../sidebar";

/**
 * /llms.txt — a machine-readable summary of the site for agents, in the
 * llmstxt.org shape: an H1, a blockquote summary, then one section per sidebar
 * group listing every page with its own description.
 *
 * Built from the content collection and `src/sidebar.ts`, so it carries the real
 * page descriptions in the real navigation order and cannot drift as pages are
 * added. A sidebar link with no matching content entry fails the build rather
 * than emitting a silently short index.
 */
export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    throw new Error(
      "`site` must be set in astro.config.mjs — llms.txt needs it for absolute links.",
    );
  }

  const docs = await getCollection("docs");
  const byId = new Map(docs.map((entry) => [entry.id, entry]));

  const url = (link: string) => new URL(link, site).href;

  const lines: string[] = [
    "# rackctl",
    "",
    "> The day-0 installer for a nanohype platform — one command takes an empty",
    "> AWS account to a running, self-reconciling platform, then hands off to the",
    "> operator portal for day-2.",
    "",
    "rackctl is a thin orchestration engine over `tofu`, `terragrunt`, `kubectl`,",
    "`helm`, `aws`, `git` and `gh`. It drives the real nanohype repos rather than",
    "reimplementing them. Every `init` is a dry-run plan until `--apply` is passed,",
    "and a phase that fails rolls back in reverse.",
  ];

  for (const group of sidebar) {
    lines.push("", `## ${group.label}`, "");

    for (const item of group.items) {
      const id = entryId(item.link);
      const entry = byId.get(id);

      if (!entry) {
        throw new Error(
          `llms.txt: sidebar links "${item.link}" but no docs entry "${id}" exists. ` +
            "Add the page or remove it from src/sidebar.ts.",
        );
      }

      const description = entry.data.description?.trim();
      lines.push(`- [${item.label}](${url(item.link)})${description ? `: ${description}` : ""}`);
    }
  }

  lines.push(
    "",
    "## Source",
    "",
    `- [rackctl CLI](https://github.com/rackctl/rackctl): the OSS bootstrapper itself.`,
    `- [Documentation source](https://github.com/rackctl/docs): this site.`,
    "",
  );

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
