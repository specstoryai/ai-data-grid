# AS-BUILT: AI Data Grid

**Last updated:** 2026-09-25 (SPST-7, the Documenter step for SPST-3 / PR #11)
**Covers:** the documentation site in `docs/` (work package WP4). Other parts of the repository are documented when their work packages land.

For how to work on these parts, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Docs site

### Topology

```
GitBook (docs.grid.glideapps.com)
   │  llms.txt index + <page-url>.md
   ▼
docs/scripts/import-gitbook.mjs  ──►  docs/content/docs/**/*.mdx, meta.json
                                      docs/public/images/*.png
   ▼
docs/ (unmint: Next.js 16 + Fumadocs + React 19)
   │  git push → Vercel (Root Directory docs, ignoreCommand in docs/vercel.json)
   ▼
Vercel project ai-data-grid-docs (team spec-story)
   ├─ production: https://ai-data-grid-docs.vercel.app   (from main, public)
   └─ previews:   ai-data-grid-docs-<hash>-spec-story.vercel.app  (other branches, protected)
```

### App

- `docs/` is a standalone Next.js app, scaffolded with `npx create-unmint@latest docs -y` (create-unmint 1.4.0). It has its own `package.json` (name `ai-data-grid-docs`, private) and `package-lock.json`. It is not listed in the root `package.json` `workspaces`, and it doesn't depend on the grid packages.
- Routes: `/` redirects to `/docs` (`docs/app/page.tsx`). `/docs/[[...slug]]` renders the MDX pages and is statically generated at build time. `/api/search` and `/api/og` are dynamic. `/llms.txt` and `/llms-full.txt` are static.
- Content source: `docs/source.config.ts` reads `content/docs`, and `docs/lib/docs-source.ts` mounts it at `/docs`. Code blocks are highlighted by `rehypeCode` (github-light/github-dark themes).
- Site name, footer and theme are set in `docs/lib/theme-config.ts`. The footer carries the attribution "Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed."
- License: `docs/LICENSE` keeps unmint's MIT text (`Copyright (c) 2024 Unmint Contributors`) and adds `Copyright (c) 2026 ai-data-grid contributors`.

### Content and importer

- There are 37 pages: the 36 GitBook pages plus the hand-maintained `about.mdx`. The GitBook welcome page is mapped to `index.mdx`, which is hand-maintained. Sections: Extended QuickStart Guide, FAQ, API (DataEditor, DataEditorCore, DataEditorRef, Cells, Common Types) and Guides.
- `docs/scripts/import-gitbook.mjs` does the following:
  - parses `https://docs.grid.glideapps.com/llms.txt` and fetches each `<page-url>.md`;
  - converts GitBook and HTML syntax to MDX: figures and images, HTML tables to Markdown tables, `{% content-ref %}` to unmint `<Card>`;
  - rewrites absolute GitBook links to `/docs/...` and `@glideapps/*` imports to `@specstory/*`, and escapes `{`, `}` and `<` in prose;
  - downloads the 17 GitBook-hosted images to `docs/public/images/`;
  - rewrites every `meta.json` in llms.txt order, with About listed last.
- The importer never writes `index.mdx` or `about.mdx` (`HAND_MAINTAINED` in the script). It overwrites all other pages. The rebrand edits that replace "Glide Data Grid" in generated prose are manual. A re-import on 2026-09-25 reverted them in five pages (`api/cells/index`, `extended-quickstart-guide/index`, `extended-quickstart-guide/copy-and-paste-support`, `extended-quickstart-guide/working-with-selections`, `faq`).

### Build and deploy

- Vercel project `ai-data-grid-docs` (ID `prj_OG2EFwjOBe2SvtjtRWXtckG0k9UH`) in team `spec-story` is git-connected to `specstoryai/ai-data-grid`. Settings: Root Directory `docs`, framework Next.js, Node 24.x, production branch `main`. The build and install commands are the defaults.
- The Ignored Build Step is `ignoreCommand` in `docs/vercel.json`, not a project setting:
  ```
  [ -n "$VERCEL_GIT_PREVIOUS_SHA" ] || exit 1; git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" -- ':(top)docs/' || exit 1; exit 0
  ```
  Exit 0 skips the build. The command builds (exit 1) when there is no previous deployment SHA, when `docs/` changed, or when `git diff` errors.
- Protection is set by `ssoProtection: all_except_custom_domains` (Vercel's default Standard Protection). Preview deployment URLs redirect to Vercel SSO. The production domain `ai-data-grid-docs.vercel.app` is public. A *Protection Bypass for Automation* secret exists so verification tools can reach previews. It is read from the Vercel API and is never written to the repo.
- Production serves nothing until `docs/` is on `main`. Before PR #11 merges, the URL returns 404 `DEPLOYMENT_NOT_FOUND`.

### Tests

- `docs/__tests__/`: vitest with happy-dom (`docs/vitest.config.ts`). There are 5 files and 27 tests, covering the unmint components (callout, card, tabs), `lib/theme-config` and `lib/utils`. They don't test the content or the importer.
- `npm run build` in `docs/` is the content check: it fails when an MDX page doesn't compile.
- Root CI and the root check commands don't cover `docs/`. Vercel builds are the only automated check on it.

### Known limitations and risks

- **Vercel ERROR statuses on branches without `docs/`.** The project's Root Directory is `docs`, so every push to a branch that doesn't contain `docs/` (for example `spst-2-rebrand`, or Dependabot branches) creates an ERROR deployment and a failing `Vercel` status on its PR. This stops once `docs/` is on `main` and those branches have merged `main`. It was accepted as non-blocking.
- **Re-importing loses the rebrand edits** to generated pages (see above). The importer doesn't apply the product-name replacement itself.
- **`npm run lint` in `docs/` is broken.** The script is `next lint`, which Next.js 16 removed. It fails with `Invalid project directory provided, no such directory: .../docs/lint`.
- **`next dev` creates untracked `docs/AGENTS.md` and `docs/CLAUDE.md`.** Next.js 16 generates these agent-rules files unless `agentRules: false` is set in `docs/next.config.mjs`. They must not be committed.
- The content describes Glide Data Grid 6.x behaviour, with package names rewritten to `@specstory/*`. It is only as accurate as the upstream GitBook docs.
- On this branch, the root `npm ci` fails and `.nvmrc` says `20.10.0`. Both predate the fork and are fixed by WP1 (PR #12). They don't affect `docs/`.

## Decision log

| Date | Source | Decision | Reason |
| --- | --- | --- | --- |
| 2026-09-25 | SPST-6 (Phase 1 plan), SPST-3 | Build the docs site with unmint (Next.js + Fumadocs) and host it on Vercel under team `spec-story` on the default `*.vercel.app` domain. | Project standard. It replaces the upstream GitBook and GitHub Pages hosting. No custom domain yet. |
| 2026-09-25 | SPST-3, PR #11 | `docs/` is a standalone app with its own lockfile and is not a root npm workspace. | Keeps Next.js 16 and its dependency tree out of the library's install, build and tests, and keeps root `npm ci` independent of the docs. |
| 2026-09-25 | SPST-3, PR #11 | Import the content with a re-runnable script (`docs/scripts/import-gitbook.mjs`) from GitBook's `llms.txt` and per-page `.md`. Keep `index.mdx` and `about.mdx` hand-maintained. | The conversion can be reproduced and audited. The welcome page and license page need AI Data Grid wording that the importer must not overwrite. |
| 2026-09-25 | SPST-3, PR #11 | Reuse the GitBook text and images, with attribution on the welcome page, the About & License page and the footer. | The upstream docs are MIT-licensed project material. The standing rule requires crediting the origin. |
| 2026-09-25 | SPST-3, PR #11 | Make the welcome page the `/docs` landing page, and redirect `/` to `/docs`. | There is a single entry point, and the site has no separate marketing home page. |
| 2026-09-25 | SPST-3, PR #11 | Put the Ignored Build Step in `docs/vercel.json` (`ignoreCommand`), not in the Vercel project settings. | The rule is versioned and reviewed with the code, and it is visible to contributors. |
| 2026-09-25 | SPST-3, PR #11 | Make the ignore step fail-safe: build when there is no previous SHA or when `git diff` errors, and skip only on a clean "no change under `docs/`". | The first deploy, and any environment where the diff can't run, must still produce a deployment rather than silently skip. |
| 2026-09-25 | SPST-3, PR #11 | Keep Vercel's default protection: protected previews and a public production domain. Verification uses a Protection Bypass for Automation secret. | Standing hosting rule. Previews of unmerged work stay private. |
| 2026-09-25 | SPST-3, PR #11 | Accept ERROR `Vercel` statuses on branches without `docs/` until they merge `main`. | This is temporary and only affects branches that predate the docs site. Working around it (for example by disconnecting git) would cost preview deploys. |

## Open follow-ups

- Fix `npm run lint` in `docs/` (Next.js 16 has no `next lint`; switch to the ESLint CLI), then add docs build, test and lint to CI if wanted.
- Set `agentRules: false` in `docs/next.config.mjs`, or git-ignore `docs/AGENTS.md` and `docs/CLAUDE.md`, so `next dev` doesn't leave untracked files.
- Move the product-name replacement into the importer, so re-imports don't lose the rebrand edits.
- Confirm that the production URL serves publicly after PR #11 merges.
- Link Storybook from the docs once WP3 deploys it.
- Custom domain (not planned for Phase 1).
