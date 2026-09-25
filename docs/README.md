# AI Data Grid documentation

The AI Data Grid documentation site, built with [unmint](https://github.com/gregce/unmint) (Next.js + Fumadocs).

AI Data Grid is forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed. The content is converted from the original GitBook documentation at https://docs.grid.glideapps.com.

## Getting Started

```bash
# Install dependencies
npm ci

# Start development server
npm run dev
```

Your docs will be available at [http://localhost:3000](http://localhost:3000)

## Content

Pages live in `content/docs/` as MDX, with Fumadocs `meta.json` files controlling the sidebar order. `content/docs/index.mdx` (welcome) and `content/docs/about.mdx` are maintained by hand; every other page is generated.

## Re-running the GitBook importer

```bash
node scripts/import-gitbook.mjs
```

This regenerates the converted pages from https://docs.grid.glideapps.com/llms.txt, downloads the images into `public/images/`, and rewrites the `meta.json` files. It never overwrites the hand-maintained pages, but it **does** overwrite the other generated pages, so hand edits to generated pages must be re-applied afterwards.
