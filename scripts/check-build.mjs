/**
 * Post-build integrity gate. Read-only; exits non-zero on any failure.
 *
 * Broken internal links are the top failure mode for a docs site — nothing else in
 * CI notices when a page is renamed and three others keep pointing at the old URL,
 * because the build still succeeds. This walks the built output and checks:
 *
 *   1. every internal link resolves to a page that was actually built
 *   2. every same-page `#fragment` resolves to an id that exists on the target
 *   3. the SEO artifacts the site is required to publish are present
 *   4. install.md still shows the same command as the hero
 *
 * Checks 3 and 4 are regression guards: they cost nothing and each covers a defect
 * that previously shipped to production unnoticed.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const failures = [];
const fail = (message) => failures.push(message);

// ── collect built pages ──────────────────────────────────────────────────────

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

let files;
try {
  files = walk(dist);
} catch {
  console.error("check-build: no dist/ — run `pnpm build` first.");
  process.exit(1);
}

const htmlFiles = files.filter((f) => f.endsWith(".html"));

/** Site-absolute route for a built file: dist/install/index.html -> /install/ */
const routeOf = (file) => {
  const rel = `/${relative(dist, file).split(/[\\/]/).join("/")}`;
  return rel.endsWith("/index.html") ? rel.slice(0, -"index.html".length) : rel;
};

const routes = new Set(htmlFiles.map(routeOf));
const assets = new Set(files.map((f) => `/${relative(dist, f).split(/[\\/]/).join("/")}`));

// Heading/element ids per route, for fragment checking.
const idsByRoute = new Map(
  htmlFiles.map((file) => [
    routeOf(file),
    new Set([...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])),
  ]),
);

// ── 1 + 2: internal links and fragments ─────────────────────────────────────

// Starlight ships a client-side router; links it generates are plain <a href>.
const HREF = /<a\b[^>]*\shref="([^"]+)"/gi;

for (const file of htmlFiles) {
  const from = routeOf(file);
  const html = readFileSync(file, "utf8");

  for (const [, raw] of html.matchAll(HREF)) {
    const href = raw.trim();

    // External, protocol-relative, and non-navigational schemes are out of scope —
    // this gate is about internal consistency, not reachability of the internet.
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
    if (href === "" || href.startsWith("?")) continue;

    const [pathPart, fragment] = href.split("#");

    const target = pathPart === "" ? from : posix.resolve(posix.dirname(`${from}index`), pathPart);
    const normalised = target.endsWith("/") || posix.extname(target) ? target : `${target}/`;

    if (pathPart !== "") {
      const known = routes.has(normalised) || assets.has(normalised) || assets.has(target);
      if (!known) {
        fail(`${from}  ->  ${href}   (no such page or asset in dist/)`);
        continue;
      }
    }

    if (fragment) {
      const ids = idsByRoute.get(pathPart === "" ? from : normalised);
      // Only check fragments on pages we built; assets have no ids.
      if (ids && !ids.has(fragment)) {
        fail(`${from}  ->  ${href}   (no element with id="${fragment}" on that page)`);
      }
    }
  }
}

// ── 3: required SEO artifacts ───────────────────────────────────────────────

for (const required of ["/robots.txt", "/llms.txt", "/og.png", "/sitemap.xml"]) {
  if (!assets.has(required)) fail(`missing required SEO artifact: ${required}`);
}

// ── 4: the install command has not drifted ──────────────────────────────────

const site = readFileSync(join(root, "src", "site.ts"), "utf8");
const match = site.match(/export const INSTALL_COMMAND\s*=\s*"([^"]+)"/);

if (!match) {
  fail("could not read INSTALL_COMMAND from src/site.ts — has its shape changed?");
} else {
  const command = match[1];
  const doc = readFileSync(join(root, "src", "content", "docs", "install.md"), "utf8");
  if (!doc.includes(command)) {
    fail(`install.md no longer contains the hero's install command: ${command}`);
  }
}

// ── report ──────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`\ncheck-build: ${failures.length} problem(s)\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error("");
  process.exit(1);
}

console.log(
  `check-build: ok — ${htmlFiles.length} pages, ${routes.size} routes, links and fragments resolve`,
);
