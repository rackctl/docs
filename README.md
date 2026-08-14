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
