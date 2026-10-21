// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://versusgamers.com',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      // Personal pages (favorites, recent) are noindex; keep them out of the sitemap.
      filter: (page) => !/\/(favorites|favoris|recent|recents)\/$/.test(page) && !page.endsWith('/404/'),
      i18n: { defaultLocale: 'en', locales: { en: 'en-CA', fr: 'fr-CA' } },
    }),
  ],
});
