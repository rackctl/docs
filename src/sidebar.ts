/**
 * The docs information architecture, in one place.
 *
 * Shared by `astro.config.mjs` (Starlight's `sidebar`) and `src/pages/llms.txt.ts`
 * (the agent-readable index), so the machine-readable view of the site cannot
 * drift from the navigation a human sees. Add a page here once and it appears in
 * both; the llms.txt generator resolves each `link` back to its content entry and
 * fails the build if one does not exist.
 */

export interface SidebarLink {
  label: string;
  link: string;
}

export interface SidebarGroup {
  label: string;
  items: SidebarLink[];
}

export const sidebar: SidebarGroup[] = [
  {
    label: "Start here",
    items: [
      { label: "Overview", link: "/" },
      { label: "Install", link: "/install/" },
      { label: "Quickstart", link: "/quickstart/" },
    ],
  },
  {
    label: "Reference",
    items: [
      { label: "Configuration", link: "/configuration/" },
      { label: "Commands", link: "/commands/" },
      { label: "The pipeline", link: "/pipeline/" },
    ],
  },
  {
    label: "Operate",
    items: [
      { label: "Footguns", link: "/footguns/" },
      { label: "Runbook", link: "/runbook/" },
    ],
  },
];

/** Content-collection id for a sidebar link (`/install/` -> `install`, `/` -> `index`). */
export function entryId(link: string): string {
  const trimmed = link.replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "index" : trimmed;
}
