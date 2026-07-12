// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.rackctl.ai',
  integrations: [
    starlight({
      title: 'rackctl',
      description: 'The day-0 installer for a nanohype platform.',
      logo: {
        light: './src/assets/mark-light.svg',
        dark: './src/assets/mark.svg',
        alt: 'rackctl',
      },
      favicon: '/favicon.svg',
      // The shared shuttering theme: slate ground + rackctl's own steel accent
      // (set in rackctl.css), then the site's fonts + brand touches.
      customCss: [
        '@shuttering/starlight/grounds/slate.css',
        '@shuttering/starlight',
        './src/styles/rackctl.css',
      ],
      components: {
        Hero: './src/components/Hero.astro',
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/rackctl/rackctl' },
      ],
      editLink: { baseUrl: 'https://github.com/rackctl/docs/edit/main/' },
      lastUpdated: true,
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Overview', link: '/' },
            { label: 'Install', link: '/install/' },
            { label: 'Quickstart', link: '/quickstart/' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Configuration', link: '/configuration/' },
            { label: 'Commands', link: '/commands/' },
            { label: 'The pipeline', link: '/pipeline/' },
          ],
        },
        {
          label: 'Operate',
          items: [
            { label: 'Footguns', link: '/footguns/' },
            { label: 'Runbook', link: '/runbook/' },
          ],
        },
      ],
    }),
  ],
});
