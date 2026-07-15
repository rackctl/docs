# rackctl docs

The documentation site for [rackctl](https://github.com/rackctl/rackctl) — the
day-0 installer for a nanohype platform. Built with [Astro](https://astro.build)
and [Starlight](https://starlight.astro.build), deployed to
[docs.rackctl.sh](https://docs.rackctl.sh) on AWS.

## Develop

```sh
pnpm install
pnpm dev        # http://localhost:4321
```

## Build

```sh
pnpm build      # -> dist/
pnpm preview    # serve the built site locally
```

## Structure

```
src/
  content/docs/     # the pages (Markdown / MDX)
  styles/           # rackctl theme over Starlight
  assets/           # brand mark
public/             # favicon and static files
astro.config.mjs    # site + sidebar config
```

Content lives in `src/content/docs/`. Add a page by dropping a `.md`/`.mdx` file
there and adding it to the `sidebar` in `astro.config.mjs`.

## License

Apache-2.0.
