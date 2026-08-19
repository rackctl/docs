# rackctl docs

The documentation site for [rackctl](https://github.com/rackctl/rackctl) — the
day-0 installer for a nanohype platform. Built with [Astro](https://astro.build)
and [Starlight](https://starlight.astro.build), deployed to
[docs.rackctl.sh](https://docs.rackctl.sh) on AWS.

## Develop

`@shuttering/*` is published to GitHub Packages. Configure auth once (any token
with `read:packages` on the shuttering org), then install:

```sh
pnpm config set '//npm.pkg.github.com/:_authToken' "$(gh auth token)"
pnpm install
pnpm dev        # http://localhost:4321
```

`pnpm config set` writes to your user-level config on purpose. Putting the token
in this repo's `.npmrc` does not work: from pnpm 10.34.2 environment variables
are no longer expanded in registry credentials read from a project `.npmrc`,
since that file is committed and could leak the secret to another registry.

## Build

```sh
pnpm build      # -> dist/
pnpm preview    # serve the built site locally
```

## The share card

`public/og.png` is committed, and regenerated on demand — never during the build:

```sh
pnpm og         # requires Chrome; rewrites public/og.png
```

It renders in headless Chrome rather than rasterising an SVG, because sharp goes
through librsvg, which resolves `font-family` against *system* fonts and ignores
`@font-face` — including a woff2 inlined as a data URI. Fontsource ships woff2
only, so the brand faces are unreachable that way and `Space Grotesk` silently
becomes Verdana locally and DejaVu in CI. Chrome loads the real faces, at the cost
of a Chrome dependency, which is why this is a local step with a committed result.

## Checks

`pnpm build` runs `scripts/check-build.mjs` as a postbuild gate, so `ci.yml` and
`deploy.yml` both inherit it without a workflow step. It fails the build on:

- an internal link pointing at a page that was not built
- a `#fragment` with no matching element id on the target page
- a missing `/robots.txt`, `/llms.txt`, `/og.png` or `/sitemap.xml`
- `install.md` no longer showing the same command as the hero (`src/site.ts`)

`/robots.txt`, `/llms.txt` and `/sitemap.xml` are generated from the content
collection and `src/sidebar.ts` — the one place the page order is defined, shared
with Starlight's sidebar so the two cannot drift.

## Structure

```
src/
  content/docs/     # the pages (Markdown / MDX)
  components/       # Hero + Head (completes the social card)
  pages/            # robots.txt, llms.txt, sitemap.xml endpoints
  styles/           # rackctl theme over Starlight
  assets/           # brand mark
  sidebar.ts        # page order, shared with llms.txt
  site.ts           # constants that appear in more than one place
public/             # favicon, error pages, og.png
scripts/            # og-image + build integrity gate
astro.config.mjs    # site + Starlight config
```

Content lives in `src/content/docs/`. Add a page by dropping a `.md`/`.mdx` file
there and adding it to `src/sidebar.ts` — that feeds both the Starlight sidebar and
`/llms.txt`. A sidebar entry with no matching page fails the build.

## License

Apache-2.0.
