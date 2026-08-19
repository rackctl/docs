// @ts-check

import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { sidebar } from "./src/sidebar";

// https://astro.build/config
export default defineConfig({
  site: "https://docs.rackctl.sh",
  integrations: [
    starlight({
      title: "rackctl",
      description: "The day-0 installer for a nanohype platform.",
      logo: {
        light: "./src/assets/mark-light.svg",
        dark: "./src/assets/mark.svg",
        alt: "rackctl",
      },
      favicon: "/favicon.svg",
      // The shared shuttering theme: slate ground + rackctl's own steel accent
      // (set in rackctl.css), then the site's fonts + brand touches.
      customCss: [
        "@shuttering/starlight/grounds/slate.css",
        "@shuttering/starlight",
        "./src/styles/rackctl.css",
      ],
      components: {
        Hero: "./src/components/Hero.astro",
        // Icon theme toggle + view transitions (with the TOC scroll-spy fix).
        ThemeSelect: "@shuttering/starlight/ThemeSelect.astro",
        // Wraps the shared theme's Head and completes the social card — Starlight
        // declares summary_large_image but never emits an image.
        Head: "./src/components/Head.astro",
      },
      // Site-wide default. Starlight merges head sources in order — its own
      // defaults, then this, then per-page frontmatter — so the 404's
      // `noindex, follow` still overrides this rather than fighting it.
      head: [
        {
          tag: "meta",
          attrs: { name: "robots", content: "index, follow" },
        },
      ],
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/rackctl/rackctl" }],
      editLink: { baseUrl: "https://github.com/rackctl/docs/edit/main/" },
      lastUpdated: true,
      sidebar,
    }),
  ],
});
