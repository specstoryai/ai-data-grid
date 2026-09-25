# Contributing to AI Data Grid

This guide is for anyone, human or agent, who changes code in this repository. For what is built and why, see [AS-BUILT.md](AS-BUILT.md). User documentation is in [README.md](README.md).

AI Data Grid is a hard fork of Glide Data Grid (forked from upstream `main` at `0875d78c`, 6.0.4-alpha25, with upstream history kept). Upstream is https://github.com/glideapps/glide-data-grid. You can add it as a read-only `upstream` remote to compare or cherry-pick. Never push to it.

## Setup

- **Node 24** (the version in `.nvmrc`; run `nvm use` if you use nvm) with **npm**. No yarn.
- Install from the root lockfile:

    ```bash
    npm ci
    ```

    `package-lock.json` at the root is the only committed lockfile (the packages are npm workspaces and have none of their own; the sample apps' lockfiles are gitignored, see [Sample apps](#sample-apps-test-projects)). Never commit a lockfile that `npm ci` rejects: if you change dependencies with `npm install`, run `npm ci` afterwards to check it. `.npmrc` sets `legacy-peer-deps=true`, partly because `@toast-ui/react-editor` (a `cells` dependency) declares a `react ^17.0.1` peer.

### React 19 only, and the root `overrides`

The packages need React 19 (`react` / `react-dom` peer `^19.0.0`), and the repository develops and tests against React 19 only. The root devDependencies `@types/react` and `@types/react-dom` are `^19`.

The root `package.json` `overrides` only affect this repository's install, not the published packages. Don't remove them:

| Override | Why |
| --- | --- |
| `storybook: "$storybook"` | One Storybook version across all Storybook packages. |
| `@types/react: "$@types/react"`, `@types/react-dom: "$@types/react-dom"` | Pins every copy to the root's React 19 types. Without it `@types/react-transition-group` pulls in an 18.x copy that breaks `react-select`'s types. |
| `@emotion/react: "^11.14.0"` | Older Emotion 11 types use the global `JSX` namespace, which React 19's types removed. `react-select` 5.x depends on Emotion. |
| `csstype: "3.1.3"` | csstype 3.2's readonly tuples break Emotion's `CSSInterpolation` type. |

## Code map

| Path | What it is |
| --- | --- |
| `packages/core` | `@specstory/ai-data-grid`, the grid. Source in `src/`, tests in `test/`, stories in `src/docs/` and `src/**/*.stories.tsx`. `API.md` is the API reference and `CHANGELOG.md` the release notes. |
| `packages/cells` | `@specstory/ai-data-grid-cells`, extra cell renderers (`src/cells/`). |
| `packages/source` | `@specstory/ai-data-grid-source`, data source hooks. |
| `config/build-util.sh` | Shared build steps used by each package's `build.sh`. |
| `.storybook/` | Storybook config (branded "AI Data Grid"). |
| `scripts/smoke-storybook.mjs` | Headless smoke test of the built Storybook. |
| `scripts/check-test-project.mjs`, `scripts/check-article-cell-editor.mjs` | Headless checks for a running sample app and for the cells article editor. See [Sample apps](#sample-apps-test-projects). |
| `.github/workflows/ci.yml` | The only CI workflow. |
| `test-projects/` | Sample apps (`vite-app`, `next-app`) that install the packed tarballs. See [Sample apps](#sample-apps-test-projects). |
| `docs/` | The documentation site, a standalone Next.js app outside the npm workspaces. See [Working on the docs site](#working-on-the-docs-site). |

## Check commands

Run these from the root. CI runs the first five.

| Command | What it does |
| --- | --- |
| `npm ci` | Clean install from the root lockfile. |
| `npm run build` | Builds all three packages into `dist/esm`, `dist/cjs` and `dist/dts`, plus `dist/index.css` for core and cells (source has no CSS), then lints them (ESLint, plus a `cycle-check` for import cycles in core). Two existing `no-console` warnings are expected; errors fail. |
| `npm test -- --run` | Core unit tests (vitest), run once. Without `--run` vitest watches. |
| `npm run test-cells -- --run` | Cells unit tests. |
| `npm run test-source -- --run` | Source unit tests. |
| `npm run build-storybook` | Builds the packages and a static Storybook into `storybook-build/` (git-ignored). |
| `npm run smoke-storybook` | Opens every story from `storybook-build/` in headless Chromium and fails on unexpected console errors. Run `npm run build-storybook` first. |

At the time of writing the test counts are core 388, cells 65 and source 8. Tests run on React 19 only; there are no per-React-version test scripts.

Hook tests use `renderHook` and `act` from `@testing-library/react`. Don't use `@testing-library/react-hooks`, `react-test-renderer` or `react-dom/test-utils` (removed or deprecated with React 19). RTL's `renderHook` has no `result.all`; to check how often a hook rendered, count renders in the hook callback.

### The Storybook smoke test

`npm run smoke-storybook` serves `storybook-build/` on a random local port, visits every story, and prints `KNOWN`, `FIXED?`, `NOCANVAS` and `FAIL` lines, then a summary. It exits non-zero if a story logs a console error that isn't allowlisted, or renders no `<canvas>` (except the text-only docs pages in `noCanvasAllowlist`).

`errorAllowlist` in `scripts/smoke-storybook.mjs` lists known, accepted failures per story id (currently 8, all "Failed to load resource" from third-party images). A `FIXED?` line means an allowlisted error no longer happens; remove that entry. Only add an entry for a failure you have understood and accepted, with a comment explaining it.

It needs Playwright's Chromium. If it isn't installed yet, run `npx playwright install chromium`. The smoke test doesn't run in CI.

## Sample apps (`test-projects/`)

`test-projects/` holds two small apps that install the packages the way users do, from the npm tarballs:

- `vite-app`: Vite 8, React 19, TypeScript. `npm run build` runs `tsc --noEmit && vite build`.
- `next-app`: Next 16 App Router, React 19. `app/page.tsx` is a `"use client"` page that loads the grid component (`components/Grid.tsx`) with `next/dynamic` and `ssr: false`. `npm run build` runs `next build`.

Both render a `DataEditor` with text, number, boolean and star (from `-cells`) columns, and import `@specstory/ai-data-grid/dist/index.css`.

Build and check them from the root:

```bash
npm run test-projects
```

This runs `test-projects/bootstrap-projects.sh`, which:

1. runs `npm run build --workspaces` if any package's `dist/` is missing (it doesn't rebuild stale output, so run `npm run build` first after code changes);
2. `npm pack`s the three packages into `test-projects/.packs/`;
3. in each sample, deletes `node_modules` and `package-lock.json`, runs `npm install` with the tarballs, then `npm run build`.

It ends with `All test projects built successfully.` and takes under a minute with a warm npm cache, but it installs about 500 MB of `node_modules` into the samples. It isn't in CI. Run it when you change what users install: package `exports`, `main`/`module`/`types`, `files`, the CSS entry, peer dependencies or dependencies.

Each sample has `.npmrc` with `legacy-peer-deps=true`. Their `package.json` files depend on `file:../.packs/…-7.0.0.tgz`, so update them if the version changes. `.packs/`, `node_modules/`, `dist/`, `.next/` and the samples' `package-lock.json` are gitignored and regenerated on every run.

To check a built sample in a browser, serve it and run `scripts/check-test-project.mjs <base-url> <sample-node_modules-dir>`. It fails unless a `<canvas>` renders with no console or page errors and every `react` package under the given `node_modules` has the same version. It needs Playwright's Chromium (`npx playwright install chromium`).

```bash
(cd test-projects/vite-app && npm run preview)   # Vite's preview server, default port 4173
node scripts/check-test-project.mjs http://localhost:4173/ test-projects/vite-app/node_modules

(cd test-projects/next-app && npm start)         # next start, default port 3000
node scripts/check-test-project.mjs http://localhost:3000/ test-projects/next-app/node_modules
```

Run the servers in another terminal (or detached) and stop them afterwards.

### Article cell editor check

`scripts/check-article-cell-editor.mjs [url]` opens the cells "Custom cells" story in headless Chromium, double-clicks an article cell, types, saves, reopens and cancels, and fails on any console error except a `Failed to load resource` 404. The default URL is `http://localhost:9009/iframe.html?id=extra-packages-cells--custom-cells`, so serve a Storybook on port 9009 first, for example:

```bash
npm run prod-storybook                             # builds, then serves storybook-build/ on 9009; leave it running
node scripts/check-article-cell-editor.mjs
```

Or pass another URL as the only argument. It finds the cell by canvas coordinates (the widths of the columns before it), so if you change that story's columns, update the coordinates in the script. Run it when you touch the article cell or upgrade `@toast-ui/*` or React.

## Running Storybook

```bash
npm start
```

This runs Storybook's dev server on port 9009 together with a watcher that rebuilds core on change. Open http://localhost:9009/. Storybook listens on all interfaces, so http://<your-machine>:9009/ also works from another machine on your network.

To serve the production build instead: `npm run prod-storybook` (builds, then serves `storybook-build/` on port 9009).

## Hosted Storybook (Vercel)

Storybook is hosted on Vercel as the project `ai-data-grid-storybook` in the SpecStory team (`spec-story`). Production is https://ai-data-grid-storybook.vercel.app.

### How deploys happen

The project is git-connected to `specstoryai/ai-data-grid`, so there is nothing to run by hand:

- **Every push to a branch builds a preview**, at `https://ai-data-grid-storybook-git-<branch>-spec-story.vercel.app`. On a PR it shows up as the `Vercel – ai-data-grid-storybook` check, with a link to the preview.
- **A push to `main` deploys production.** In practice that's a PR merge commit.
- Build settings: Root Directory = repo root, Framework = Other, Node 24.x, Install `npm ci`, Build `npm run build-storybook`, Output `storybook-build`. A build takes about 80 s.
- **Settings live in the Vercel project, not in the repo.** There is no root `vercel.json`. Change them in the Vercel dashboard (Project → Settings) and record the change in [AS-BUILT.md](AS-BUILT.md#storybook-hosting-vercel).
- **Docs-only commits are skipped.** The project's Ignored Build Step skips the build when the latest commit changes only files under `docs/` (the docs site, which is its own Vercel project). Empty commits and commits touching anything else build.
- **Known limitation:** the ignore step compares only `HEAD^` with `HEAD`. If you push several commits at once and the last one touches only `docs/`, Vercel skips the preview even though earlier commits changed code. Push another commit or redeploy by hand. Production isn't affected, because `main` only moves by merge commits.

### How to redeploy

You need access to the `spec-story` Vercel team.

- Push a commit to the branch (an empty commit works: `git commit --allow-empty -m "Redeploy Storybook"`).
- Or open the deployment in the Vercel dashboard and use **Redeploy**.
- Fallback if the git connection is lost: with the Vercel CLI and a project linked to `ai-data-grid-storybook` (`vercel link`), run `vercel build` and then `vercel deploy --prebuilt` (add `--prod` to both for production). Don't deploy production by hand without the maintainer's approval.

### Previews are protected

The production URL is public. Preview URLs use Vercel's default Standard Protection: without a Vercel login that can see the `spec-story` team they redirect to the Vercel login page.

- **In a browser:** log in to Vercel with an account in the team.
- **From automation** (for example a verification script): send the header `x-vercel-protection-bypass: <secret>`. The secret is the project's *Protection Bypass for Automation*, under Project → Settings → Deployment Protection (or from the Vercel API). Never commit it, log it, or post it in a PR or issue. In browser tools, send the header to the preview origin only: sent to every origin, it turns requests to third parties such as Google Fonts into CORS preflights that fail.

`npm run smoke-storybook` only tests a local `storybook-build/`. It can't target a deployed URL or send the bypass header.

## Working on the docs site

The documentation site (https://ai-data-grid-docs.vercel.app) lives in `docs/`. It is a standalone [unmint](https://github.com/gregce/unmint) app (Next.js 16 + Fumadocs + React 19) with its own `package.json` and `package-lock.json`. It is **not** one of the root npm `workspaces`, so the root `npm ci`, `npm run build` and `npm test` neither install nor check it. Run everything from `docs/`. Use Node 24 (the Vercel project builds with Node 24.x).

```bash
cd docs && npm ci && npm run dev -- -H 0.0.0.0   # dev server on port 3000; / redirects to /docs
npm run build                                     # production build (static pages for every doc)
npm run lint                                      # ESLint (eslint-config-next core-web-vitals)
npm test -- --run                                 # vitest unit tests, run once (plain `npm test` watches)
```

Add `-p <port>` to the dev command to use another port. In the dev sandbox, run it detached in tmux and share it with `sb-url <port>`.

### Content

- Pages are MDX in `docs/content/docs/`. `meta.json` files set the sidebar order.
- `docs/content/docs/index.mdx` (the welcome page, served at `/docs`) and `docs/content/docs/about.mdx` (About & License) are hand-maintained.
- Every other page is generated from the Glide Data Grid GitBook docs by the importer, then hand-edited to replace the product name. Images are in `docs/public/images/`.
- Keep the attribution "Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed." on the welcome page, on the About & License page and in the site footer (`docs/lib/theme-config.ts`).

### Re-running the GitBook importer

```bash
cd docs && node scripts/import-gitbook.mjs
```

This fetches the 36 pages listed in https://docs.grid.glideapps.com/llms.txt, downloads the 17 images again and rewrites every `meta.json`. It skips `index.mdx` and `about.mdx`, but it **overwrites every other page**. That undoes the hand edits that replaced "Glide Data Grid" with "AI Data Grid" (in five pages at the time of writing). After a re-import, review `git diff docs/content` and re-apply those edits before committing.

### Deploys (Vercel)

- The Vercel project `ai-data-grid-docs` (team `spec-story`) is connected to this repo with Root Directory `docs`. Vercel builds on every push. Production deploys come from `main`, and every other branch gets a preview deployment, linked from the PR's `Vercel` status.
- `ignoreCommand` in `docs/vercel.json` skips the build when nothing under `docs/` changed since the previous deployment. It builds when there is no previous deployment or when the `git diff` fails.
- Preview deployments are protected by Vercel Authentication (sign in with a `spec-story` team account). The production URL is public.
- A push to a branch that has no `docs/` directory (a branch cut before the docs site reached `main`) produces a failed (ERROR) `Vercel – ai-data-grid-docs` status, because the Root Directory is missing. Merge `main` into the branch, or ignore the status: no status checks are required on `main`. See [AS-BUILT.md](AS-BUILT.md#known-limitations-and-risks).

## Versioning

`update-version.sh` sets one version everywhere: the root and all three `package.json` files, and the `@specstory/ai-data-grid` dependency of `cells` and `source`. It needs `jq`, and it doesn't touch `package-lock.json`.

```bash
./update-version.sh 7.0.1
```

With no argument it copies the current root version to the packages. It is also the root `version` script, so `npm version` runs it. Don't publish to npm; releases need the maintainer's explicit approval.

## Rules that must hold

### License and attribution

- Never change the MIT text or the line `Copyright (c) 2021 typeguard, Inc.` in any `LICENSE` file (root, `packages/core`, `packages/cells`, `packages/source`). The line `Copyright (c) 2026 ai-data-grid contributors` sits directly below it and adds to it.
- Keep in-code attributions (for example the `dequal` port in `packages/core/src/common/support.ts`). When you copy or adapt third-party code, keep its notice at the use site and add it to `THIRD_PARTY_NOTICES.md`.
- Every publishable package must ship its `LICENSE`. Check with `npm pack --dry-run` in the package directory.
- Don't use Glide trademarks (the Glide product name, logos, the `@glideapps` scope, `glideapps.com` URLs) except in attribution text, the 6.x → 7.0.0 migration mapping, and historical CHANGELOG entries.

### API compatibility (7.x)

7.x is API-compatible with 6.x. Don't rename or remove:

- any export or prop, including `DataEditor`;
- the `--gdg-*` CSS variables and the `gdg-` class names;
- the runtime identifiers `glide-cell-{col}-{row}` (DOM id), `glide-select` (class) and `glide_fade_in` (keyframe). Renaming them waits for 8.0.

Each package has a `test/public-api-exports.test.ts`. It reads the package's `src/index.ts` with the TypeScript compiler API and compares the sorted export names with a hard-coded list (core 151, cells 27, source 5). Adding, removing or renaming an export fails the test. If the change is intended (a new export is not breaking; removals and renames wait for 8.0), update `expectedExports` in the same PR and say why in the PR description.

## Git and PR workflow

- Branch from `main` as `<issue-key>-<slug>`, lowercase, for example `spst-2-rebrand`.
- Open a PR into `main` with the issue key in the title, for example `SPST-12: Fix fill handle`. Don't use closing keywords unless merging should close the issue.
- Never push to `main`. PRs are merged with a merge commit (squash and rebase merges are disabled) and head branches are deleted after merge.
- Once a PR is open, never rebase or force-push it. Bring base changes in with `git merge`.
- Stacked PRs are based on the branch below them. GitHub retargets them to `main` when that branch merges.

## CI

`.github/workflows/ci.yml` (job `test`) runs on every pull request and on pushes to `main`, with Node from `.nvmrc`:

```
npm ci → npm run build → npm test -- --run → npm run test-cells -- --run → npm run test-source -- --run
```

CI only tests. There are no publish, release, Pages or Dependabot workflows. Storybook build, the smoke test, `npm run test-projects` and the two check scripts are not in CI; run them locally when you touch what they cover. Vercel builds Storybook separately on every push (see [Hosted Storybook](#hosted-storybook-vercel)), but it doesn't run the smoke test. CI doesn't install or check `docs/` either; its Vercel build is the only automated check (see [Working on the docs site](#working-on-the-docs-site)).

## Keeping the docs current

`README.md` (users), `CONTRIBUTING.md` (developers) and `AS-BUILT.md` (architecture and decision log) must match the code. Update them in the PR that changes behaviour, commands or structure. `AGENTS.md` and `CLAUDE.md` only point here; put content in this file instead.

## Contributing new cells

If you wish to contribute new cells, please add them to the `cells` package. There are already other cells in that package which can be used as an example. If your cell editor requires additional third party dependencies please consider using a React.lazy to allow for code splitting.

## Any contributions you make will be under the MIT Software License

In short, when you submit code changes, your submissions are understood to be under the same MIT License that covers the project. Feel free to contact the maintainers if that's a concern.
