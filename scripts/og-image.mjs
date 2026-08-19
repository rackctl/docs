/**
 * Renders public/og.png — the 1200x630 Open Graph card.
 *
 * Run with `pnpm og`. Deliberately NOT part of the build, and its output is
 * committed.
 *
 * WHY LOCAL-ONLY, AND WHY CHROME
 *
 * The obvious approach — rasterise an SVG with sharp — cannot use the site's own
 * typefaces. sharp rasterises through librsvg, which resolves `font-family` against
 * system fonts via fontconfig and ignores `@font-face`, including a woff2 embedded
 * as a base64 data URI. Verified twice by differential test: an embedded Space
 * Grotesk produced a byte-identical raster to the fallback, and rackctl/web reached
 * the same conclusion independently with rsvg-convert. Fontsource ships woff2 only,
 * so the brand faces are simply unreachable that way, and `Space Grotesk` silently
 * resolves to Verdana on macOS and DejaVu on a CI runner — the card would change
 * depending on where it was built.
 *
 * Headless Chrome loads the woff2 exactly as the site does, so the real faces
 * appear. The cost is a Chrome dependency, which is precisely why this is a local
 * step producing a committed artifact rather than a build step.
 *
 * `--force-device-scale-factor=1` is mandatory: without it Chrome rasterises at the
 * display's DPR and the composition overflows a nominally correct canvas. The size
 * assertion below exists because that failure is invisible without one.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const WIDTH = 1200;
const HEIGHT = 630;

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next one.
    }
  }
  throw new Error(
    `No Chrome found. Tried:\n  ${CHROME_CANDIDATES.join("\n  ")}\n` +
      "og.png is committed, so this is only needed when regenerating the card.",
  );
}

/** Inline a font file as a data URI so the page has no external dependency. */
function fontFace(family, file, weight) {
  const path = join(root, "node_modules", family, "files", file);
  const data = readFileSync(path).toString("base64");
  return `@font-face{font-family:"${weight.name}";font-weight:${weight.range};font-style:normal;src:url(data:font/woff2;base64,${data}) format("woff2");}`;
}

const fonts = [
  fontFace("@fontsource-variable/space-grotesk", "space-grotesk-latin-wght-normal.woff2", {
    name: "Space Grotesk",
    range: "300 700",
  }),
  fontFace("@fontsource-variable/jetbrains-mono", "jetbrains-mono-latin-wght-normal.woff2", {
    name: "JetBrains Mono",
    range: "100 800",
  }),
].join("");

// Brand palette, matching src/styles/rackctl.css and src/components/Hero.astro.
const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
${fonts}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${WIDTH}px;height:${HEIGHT}px}
body{
  background:linear-gradient(180deg,#10141c 0%,#0b0e13 100%);
  color:#dbe4f2;
  font-family:"Space Grotesk",sans-serif;
  padding:64px 96px 70px;
  display:flex;flex-direction:column;justify-content:space-between;
  -webkit-font-smoothing:antialiased;
}
.eyebrow{display:flex;align-items:center;gap:18px;
  font-family:"JetBrains Mono",monospace;font-size:23px;font-weight:500;
  letter-spacing:.34em;text-transform:uppercase;color:#8892a6}
.mark{width:76px;height:76px;flex-shrink:0;margin-left:-9px}
h1{font-size:122px;font-weight:700;letter-spacing:-.045em;line-height:1;color:#fff;margin-top:26px}
.rule{height:2px;margin:28px 0 26px;
  background:linear-gradient(90deg,rgba(155,176,208,.9),rgba(155,176,208,0))}
.tagline{font-size:34px;line-height:1.4;max-width:30ch;color:#c6d2e4}
.foot{display:flex;align-items:center;justify-content:space-between}
.term{display:inline-flex;align-items:center;gap:15px;
  padding:17px 26px;background:#0f1320;border:1px solid #4a5878;border-radius:7px;
  font-family:"JetBrains Mono",monospace;font-size:26px}
.led{width:12px;height:12px;border-radius:50%;background:#35e07a;
  box-shadow:0 0 12px rgba(53,224,122,.6);flex-shrink:0}
.prompt{color:#9bb0d0}
.host{font-family:"JetBrains Mono",monospace;font-size:25px;color:#8892a6}
</style></head><body>
  <div>
    <div class="eyebrow">
      <svg class="mark" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
        <rect x="56" y="59" width="144" height="34" rx="10" fill="#9bb0d0"/>
        <rect x="56" y="111" width="144" height="34" rx="10" fill="#9bb0d0"/>
        <rect x="56" y="163" width="144" height="34" rx="10" fill="#9bb0d0"/>
        <circle cx="178" cy="128" r="8" fill="#35e07a"/>
      </svg>
      <span>day-0 installer</span>
    </div>
    <h1>rackctl</h1>
    <div class="rule"></div>
    <p class="tagline">An empty AWS account to a running, self-reconciling nanohype platform.</p>
  </div>
  <div class="foot">
    <div class="term"><span class="led"></span><span><span class="prompt">$</span> curl -fsSL rackctl.sh/install | sh</span></div>
    <span class="host">docs.rackctl.sh</span>
  </div>
</body></html>`;

const chrome = findChrome();
const work = mkdtempSync(join(tmpdir(), "rackctl-og-"));
const page = join(work, "card.html");
const shot = join(work, "card.png");

try {
  writeFileSync(page, html);

  execFileSync(
    chrome,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${WIDTH},${HEIGHT}`,
      `--screenshot=${shot}`,
      `file://${page}`,
    ],
    { stdio: "ignore" },
  );

  const png = await sharp(shot).png({ compressionLevel: 9 }).toBuffer();
  const { width, height } = await sharp(png).metadata();

  // A wrong device scale factor is invisible without this check.
  if (width !== WIDTH || height !== HEIGHT) {
    throw new Error(
      `og.png must be ${WIDTH}x${HEIGHT}, got ${width}x${height}. ` +
        "Chrome likely rasterised at the display DPR — check --force-device-scale-factor=1.",
    );
  }

  const out = join(root, "public", "og.png");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, png);
  console.log(`og.png  ${width}x${height}  ${(png.length / 1024).toFixed(1)} KB  -> ${out}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
