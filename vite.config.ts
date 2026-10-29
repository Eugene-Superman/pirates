import { defineConfig, type Plugin } from 'vite';

/** The landing in each of its languages: a page of its own, at its own address */
const LANDINGS = [
  { lang: 'en', path: '/' },
  { lang: 'uk', path: '/uk/' },
  { lang: 'ru', path: '/ru/' },
] as const;

/**
 * robots.txt and sitemap.xml for the build. Both name the site's address (VITE_SITE_URL in .env), which only the build
 * knows, so they are written here rather than kept in public/
 */
function crawlerFiles(): Plugin {
  let site = '';
  return {
    name: 'crawler-files',
    apply: 'build',
    configResolved(config) {
      site = String(config.env.VITE_SITE_URL ?? '').replace(/\/+$/, '');
    },
    generateBundle() {
      if (!site) this.error('VITE_SITE_URL is not set: put the site address in .env');
      if (!URL.canParse(site)) this.error(`VITE_SITE_URL is not an address: ${site}`);
      // .env's own address is a placeholder: a deploy built with it would name a site that doesn't exist everywhere
      if (new URL(site).hostname.endsWith('.example')) {
        this.warn(`VITE_SITE_URL is the placeholder ${site}: set the real address before deploying`);
      }
      // The game's page (/play/) is left out: it is noindex, the landing is what searches should find, in each of its
      // languages, every one naming the others, and the English one for any other language (as the pages do)
      const alternates = [...LANDINGS, { lang: 'x-default', path: '/' }].map(
        ({ lang, path }) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${site}${path}"/>`,
      );
      const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
      ];
      for (const { path } of LANDINGS) {
        lines.push('  <url>', `    <loc>${site}${path}</loc>`, ...alternates, '  </url>');
      }
      lines.push('</urlset>', '');
      const sitemap = lines.join('\n');
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [crawlerFiles()],
  build: {
    rolldownOptions: {
      // The landing at the site's root (in Ukrainian and Russian under /uk/ and /ru/), the game under /play/
      input: { landing: 'index.html', landingUk: 'uk/index.html', landingRu: 'ru/index.html', play: 'play/index.html' },
    },
  },
});
