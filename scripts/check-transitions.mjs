/**
 * Post-build gate for page transitions. Read-only; exits non-zero on any failure.
 *
 * Run with `pnpm check:transitions`, after `pnpm build`. Deliberately NOT part of
 * `postbuild` — it drives headless Chrome, and this repo keeps Chrome out of the
 * build for the same reason `og-image.mjs` does. It runs as its own CI step
 * instead, so a local `pnpm build` never launches a browser.
 *
 * WHAT IT CATCHES
 *
 * A `view-transition-name` must resolve to at most one element. Two claimants does
 * not degrade that one group — it aborts the whole transition, every group on the
 * page. Nothing else in CI notices: the build succeeds, links resolve, types check,
 * and every transition on the site is dead.
 *
 * WHY IT ASSERTS COMPUTED STYLE RATHER THAN THE STYLESHEET
 *
 * The collision only exists once Starlight and expressive-code have rendered.
 * Expressive-code emits a `<figcaption class="header">` for every code frame, so a
 * theme rule matching a bare `.header` collects a claimant per code block on the
 * page plus the site header — invisible in the CSS, unmissable in the DOM. Computed
 * style is the ground truth: it accounts for cascade, specificity, and names that
 * only appear after client script has run.
 *
 * WHY `root` IS EXCLUDED FROM THE VACUITY GUARD
 *
 * "Fail if no name was declared" is unreachable if counted naively. The UA origin
 * declares `view-transition-name: root` on the document element, so a build with
 * every transition rule stripped from its CSS still reports one name and reads as
 * clean. Only names the site's own stylesheets could have produced count toward the
 * guard. Strip the rules from a copy of `dist/` and this must fail.
 */

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

/** The UA declares this one on the document element; the site's CSS does not. */
const UA_SUPPLIED = "root";

// ── locate a browser ────────────────────────────────────────────────────────

// Absent Chrome fails the gate rather than skipping it: a check that opts itself
// out is counted as coverage while providing none. The GitHub Actions Ubuntu
// images ship Google Chrome and export CHROME_BIN pointing at it.
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find((candidate) => {
  try {
    execFileSync(candidate, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});

if (!chrome) {
  console.error(
    `check-transitions: no browser found. Tried:\n  ${CHROME_CANDIDATES.join("\n  ")}\n` +
      "Set CHROME_PATH to a Chrome or Chromium binary.",
  );
  process.exit(1);
}

// ── serve dist/ ─────────────────────────────────────────────────────────────

// Over HTTP rather than file://, because the built pages reference their CSS and
// client scripts by site-absolute path.
const MIME = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
};

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
  console.error("check-transitions: no dist/ — run `pnpm build` first.");
  process.exit(1);
}

// Every page the router serves, so a new one is covered without editing this
// file. Astro stamps this marker only where the ClientRouter is mounted, which is
// exactly the population a transition can run on — it excludes standalone
// artifacts like the generated 500 page, which carry no theme rules by design.
const ROUTED = "astro-view-transitions-enabled";

const routes = files
  .filter((file) => file.endsWith(".html") && readFileSync(file, "utf8").includes(ROUTED))
  .map((file) => {
    const rel = `/${relative(dist, file).split(/[\\/]/).join("/")}`;
    return rel.endsWith("/index.html") ? rel.slice(0, -"index.html".length) : rel;
  })
  .sort();

// Auditing nothing would satisfy every assertion below. If the ClientRouter is
// ever dropped, this gate must fail rather than pass on an empty population.
if (routes.length === 0) {
  console.error(
    `check-transitions: no built page carries ${ROUTED} — either dist/ is stale, ` +
      "or the ClientRouter is no longer mounted and there are no transitions to check.",
  );
  process.exit(1);
}

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  let file = join(dist, path);
  try {
    if (statSync(file).isDirectory()) file = join(file, "index.html");
  } catch {
    // Fall through to the read, which reports the miss.
  }
  let body;
  try {
    body = readFileSync(file);
  } catch {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  response.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  response.end(body);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

// ── drive the browser over the DevTools protocol ────────────────────────────

const profile = mkdtempSync(join(tmpdir(), "check-transitions-"));
const browser = spawn(
  chrome,
  [
    "--headless",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Chrome writes the port it chose here once the endpoint is listening. */
async function debuggerUrl() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const chosen = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0];
      const response = await fetch(`http://127.0.0.1:${chosen}/json/version`);
      if (response.ok) return (await response.json()).webSocketDebuggerUrl;
    } catch {
      // Not up yet.
    }
    await sleep(200);
  }
  throw new Error("the browser's DevTools endpoint never came up");
}

const socket = new WebSocket(await debuggerUrl());
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

let nextId = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id === undefined) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(JSON.stringify(message.error)));
  else resolve(message.result);
};

const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });

const PROBE = `(() => {
  const tally = {};
  for (const element of document.querySelectorAll("*")) {
    const name = getComputedStyle(element).viewTransitionName;
    if (!name || name === "none") continue;
    const classes = typeof element.className === "string" && element.className.trim()
      ? "." + element.className.trim().split(/\\s+/).join(".")
      : "";
    (tally[name] ??= []).push(element.tagName.toLowerCase() + classes);
  }
  return JSON.stringify({ elements: document.querySelectorAll("*").length, tally });
})()`;

const failures = [];
const fail = (message) => failures.push(message);
let audited = 0;

for (const route of routes) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Page.navigate", { url: `http://127.0.0.1:${port}${route}` }, sessionId);

  // Poll for the load rather than race a fixed delay.
  let loaded = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    const state = await send(
      "Runtime.evaluate",
      { expression: "document.readyState", returnByValue: true },
      sessionId,
    );
    if (state.result.value === "complete") {
      loaded = true;
      break;
    }
    await sleep(100);
  }
  if (!loaded) throw new Error(`${route}: never finished loading`);

  // Expressive-code and Starlight's router both add names after first paint.
  await sleep(300);

  const evaluated = await send(
    "Runtime.evaluate",
    { expression: PROBE, returnByValue: true },
    sessionId,
  );
  if (evaluated.exceptionDetails) {
    throw new Error(`${route}: probe threw ${JSON.stringify(evaluated.exceptionDetails)}`);
  }

  const { elements, tally } = JSON.parse(evaluated.result.value);
  // An empty page would satisfy every assertion below without exercising any.
  if (elements < 20) throw new Error(`${route}: ${elements} elements — the page did not render`);

  const declared = Object.keys(tally).filter((name) => name !== UA_SUPPLIED);
  if (declared.length === 0) {
    fail(`${route}  declares no transition name of its own — the theme's rules are not applying`);
  }

  for (const [name, claimants] of Object.entries(tally)) {
    if (claimants.length > 1) {
      fail(`${route}  ${name} is claimed by ${claimants.length} elements: ${claimants.join(", ")}`);
    }
  }

  audited++;
  await send("Target.closeTarget", { targetId });
}

socket.close();
browser.kill();
server.close();

// ── report ──────────────────────────────────────────────────────────────────

if (audited !== routes.length) {
  throw new Error(`audited ${audited} of ${routes.length} routes`);
}

if (failures.length > 0) {
  console.error(`\ncheck-transitions: ${failures.length} problem(s)\n`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error("");
}

// Cleanup cannot change the verdict: the browser may still be flushing its profile.
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
} catch {
  // A leftover temp directory is not a failure.
}

if (failures.length > 0) process.exit(1);

console.log(
  `check-transitions: ok — ${audited} routes, every transition name has exactly one claimant`,
);
