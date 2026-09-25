# AS-BUILT: AI Data Grid

**Last updated:** 2026-09-25 (SPST-20: AI Fill WP-AI1, PR #16 at `df9af6f7`)
**Covers:** the rebranded library packages, license and attribution files, toolchain, CI and Storybook (work package WP1, PR #12), React 19 only with the `test-projects/` sample apps (WP2, PR #14), Storybook hosting on Vercel (WP3, PR #13), the documentation site in `docs/` (WP4, SPST-3 / PR #11), and the AI Fill foundation in core (WP-AI1, SPST-19 / PR #16, not merged).

For how to work on these parts, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Packages and workspaces

### Layout

The root `package.json` (name `root`, version `7.0.0`) declares three npm workspaces. All three packages are at `7.0.0`, have `author: SpecStory`, and point `repository`, `homepage` and `bugs` at `specstoryai/ai-data-grid`.

| Workspace | npm name | Depends on | Peer dependencies |
| --- | --- | --- | --- |
| `packages/core` | `@specstory/ai-data-grid` | `@linaria/react`, `canvas-hypertxt`, `react-number-format` | `react`, `react-dom` (`^19.0.0`), `lodash`, `marked`, `react-responsive-carousel` |
| `packages/cells` | `@specstory/ai-data-grid-cells` | `@specstory/ai-data-grid` `7.0.0` (exact), `@linaria/react`, `@toast-ui/editor`, `@toast-ui/react-editor`, `react-select` | `react`, `react-dom` (same range) |
| `packages/source` | `@specstory/ai-data-grid-source` | `@specstory/ai-data-grid` `7.0.0` (exact) | `react`, `react-dom` (same range), `lodash` |

None of them is published to npm yet.

### Build outputs

**core and cells.** Their `build.sh` calls `compile` and `generate_index_css` from `config/build-util.sh`:

1. `tsc` compiles `esm` and `cjs` in parallel into `dist/esm-tmp` and `dist/cjs-tmp`. Both runs write declarations into the same `dist/dts-tmp`.
2. `wyw-in-js` extracts the Linaria styles into per-module `.css` files, and the `import "*.css"` lines are then removed from the JS.
3. The tmp directories replace `dist/esm`, `dist/cjs` and `dist/dts` (the esm run moves `dts-tmp`), and the `tsconfig.*.tsbuildinfo` files are deleted.
4. `generate_index_css` writes `dist/index.css`, which `@import`s every extracted `.css` file.

**source.** `packages/source/build.sh` doesn't use `compile`. It runs `rm -rf dist`, then `tsc -p tsconfig.esm.json` and `tsc -p tsconfig.cjs.json` in parallel, straight into `dist/esm` and `dist/cjs`. Both configs set `declarationDir` to `dist/dts`, so both runs write declarations there. There is no tmp directory, no `wyw-in-js` step and no CSS. The output is `dist/esm`, `dist/cjs`, `dist/dts` and the two `tsconfig.*.tsbuildinfo` files, which are left in `dist/`.

Because the JS doesn't import any CSS, consumers must import it themselves: `@specstory/ai-data-grid/dist/index.css` for core (also exported as `./index.css`), and `@specstory/ai-data-grid-cells/dist/index.css` for the cells' editor styles. `source` has no `dist/index.css` and needs no CSS import. Entry points, the same in all three packages: `main` → `dist/cjs/index.js`, `module`/`browser` → `dist/esm/index.js`, `types` → `dist/dts/index.d.ts`, all mirrored in `exports`.

### What ships in each tarball (`npm pack --dry-run`)

| Package | `files` | Contents |
| --- | --- | --- |
| core | not set (`.npmignore` excludes only `tsconfig*` and `coverage/*`) | 862 files at PR #16 (768 before AI Fill): `dist/`, plus `src/` (stories and docs included), `test/`, `API.md`, `CHANGELOG.md`, `build.sh`, ESLint and vitest config, `LICENSE`, `README.md` |
| cells | `["dist"]` | 120 files: `dist/`, `LICENSE`, `README.md`, `package.json` |
| source | `["dist"]` | 41 files: `dist/` (including two `tsconfig.*.tsbuildinfo` files), `LICENSE`, `README.md`, `package.json` |

This is unchanged from upstream apart from the names.

## Rebrand

### Renamed

- Package names: `@glideapps/glide-data-grid` → `@specstory/ai-data-grid`, `-cells` → `@specstory/ai-data-grid-cells`, `-source` → `@specstory/ai-data-grid-source`. Every import in `src/`, tests, stories and (since WP2) `test-projects/` uses the new names.
- Version `7.0.0` everywhere. `update-version.sh` writes the root and package versions and the `@specstory/ai-data-grid` dependency of `cells` and `source`.
- Storybook: stories are titled `AI-Data-Grid/*`. `.storybook/manager.ts` uses the theme `aiDataGridTheme` (`brandTitle: "AI Data Grid"`, `brandUrl` → the repo, no brand image).
- User-visible "Glide Data Grid" text in shipped JSDoc and `API.md`.
- `packages/core/CHANGELOG.md` has a new 7.0.0 section with the rename table. The older entries are kept verbatim.
- Deleted: `icon.png` and `media/icon.png` (the upstream logo). Kept: `data-grid.jpg` and `media/data-grid.png` / `media/data-grid-dark.png`, which are unbranded screenshots.

### Kept for compatibility (7.x)

- `DataEditor` and every exported name and prop.
- The `--gdg-*` CSS variables and `gdg-` class names.
- Runtime identifiers: the DOM id `glide-cell-{col}-{row}` (`packages/core/src/internal/data-grid/data-grid.tsx`), the class `glide-select` (`packages/cells/src/cells/dropdown-cell.tsx`) and the keyframe `glide_fade_in` (`packages/core/src/internal/data-grid-overlay-editor/data-grid-overlay-editor-style.tsx`).

### How the API is guarded

`packages/{core,cells,source}/test/public-api-exports.test.ts` build a TypeScript program for the package's `src/index.ts`, list the module's exports with the type checker, sort them, and compare them with a hard-coded `expectedExports` list taken from 6.0.4-alpha25: 151 names in core, 27 in cells, 5 in source. These added one test per package (core 388, cells 65, source 8; the baseline was 387, 64, 7). They check names only, not prop or type shapes.

Since WP-AI1, core's list is `upstreamExports` (the 151 names) plus `aiFillExports` (92 names), 243 in total. A second core test checks that all 151 upstream names are kept and that every added name matches the AI Fill naming rule `/AI|Jev|^(?:Choice|Score|Noul)/` (see [AI Fill](#ai-fill-in-development)).

## License and attribution

- Four `LICENSE` files (root, `packages/core`, `packages/cells`, `packages/source`) keep the MIT text and `Copyright (c) 2021 typeguard, Inc.`, with `Copyright (c) 2026 ai-data-grid contributors` on the next line. `npm pack --dry-run` lists `LICENSE` in all three packages.
- `THIRD_PARTY_NOTICES.md` lists Glide Data Grid (full MIT text), the `dequal` port by Luke Edwards (`packages/core/src/common/support.ts`) and the `use-callback-ref` pattern by Anton Korzunov (`packages/core/src/data-editor/use-initial-scroll-offset.ts`). The in-code attribution comments stay at both sites.
- The READMEs carry "Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed." The only other uses of the old names in the READMEs are the 6.x → 7.0.0 migration tables and the root README's note that the docs site is converted from the Glide Data Grid GitBook docs.

## Toolchain and lockfile

- Node 24 (`.nvmrc` = `24`), npm, no yarn. The root `packageManager` field (yarn) was removed.
- One lockfile: the root `package-lock.json`, regenerated so that `npm ci` passes. The per-package lockfiles were deleted. `.npmrc` sets `legacy-peer-deps=true`.
- `npm run build` builds all workspaces, then runs each workspace's `lint` (ESLint; core also runs `cycle-check` via `ts-helper` from `@glideapps/ts-helper`).

## CI

`.github/workflows/ci.yml`, job `test`, on `pull_request` and on `push` to `main`, `ubuntu-latest`, Node from `.nvmrc`: `npm ci` → `npm run build` → `npm test -- --run` → `npm run test-cells -- --run` → `npm run test-source -- --run`. Upstream's `node.js`, `beta`, `release` and `storybook` workflows and `.github/dependabot.yml` were deleted. `ci.yml` is not a required check on `main` yet.

## React 19

### Support model

- `react` / `react-dom` peer dependencies are `^19.0.0` in all three packages. React 16, 17 and 18 are not supported. Core's other peers (`lodash`, `marked`, `react-responsive-carousel`) and source's `lodash` peer are unchanged.
- The repository develops and tests against React 19 only. The root devDependencies `@types/react` / `@types/react-dom` are `^19`. Upstream's `test-18` / `test-19` scripts and `setup-react-18-test.sh` / `setup-react-19-test.sh` were deleted.
- `forwardRef` is kept on `DataEditor`, `DataEditorAll` and `DataGrid`. It still works in React 19, and removing it is out of scope for 7.0.

### Type fallout, fixed internally

React 19's types required only internal changes:

- `useRef<T>()` calls now pass `undefined` (22 call sites); the two `useRef() as MutableRefObject` casts keep the cast and pass the now-required argument.
- Internal `React.VFC` became `React.FC`.
- `packages/source/src/use-undo-redo.ts` checks `gridRef.current !== null` explicitly, because `RefObject<T>.current` is no longer typed as nullable.

No exported type changed. The emitted `.d.ts` differs from WP1 only in two internal, non-exported declarations, both caused by `@types/react` 19: `GroupRename` is `React.FC<Props>` (was `React.VFC`), and `DataGrid`'s default export is `React.NamedExoticComponent<…>` (was `MemoExoticComponent<ForwardRefExoticComponent<…>>`). The export-name snapshots (see [How the API is guarded](#how-the-api-is-guarded)) are unchanged.

### Tests

The 11 hook test files use `renderHook` and `act` from `@testing-library/react`. `@testing-library/react-hooks` and `react-test-renderer` were removed from the root devDependencies, and `react-dom/test-utils` (deprecated in React 19) is no longer imported. The three tests that used `result.all` count renders instead. Test counts are unchanged: core 388, cells 65, source 8.

### Root `overrides`

These apply to this repository's install only; they don't reach the published packages.

| Override | Reason |
| --- | --- |
| `storybook: "$storybook"` | Unchanged from WP1. |
| `@types/react: "$@types/react"`, `@types/react-dom: "$@types/react-dom"` | `@types/react-transition-group` pulled in an 18.x copy that broke `react-select`'s types. |
| `@emotion/react: "^11.14.0"` | Emotion 11.10's types reference the global `JSX` namespace, which React 19's types removed. `react-select` 5.x depends on Emotion. |
| `csstype: "3.1.3"` | csstype 3.2's readonly tuples break Emotion's `CSSInterpolation`. |

The root `.npmrc` keeps `legacy-peer-deps=true`.

### `@toast-ui/react-editor` (cells article editor)

Kept. It declares a `react ^17.0.1` peer and is unmaintained, but the article cell editor works under React 19: `scripts/check-article-cell-editor.mjs` opens it in the Storybook custom-cells story, types, saves, reopens and cancels with no console errors (5 of 5 runs during WP2; 1 run on 2026-09-25 during SPST-13).

Install impact for users, measured with npm 11.19 on 2026-09-25 by installing the packed tarballs next to `react@19` / `react-dom@19` in an empty app with no `.npmrc`:

- default npm: exit 0, with `npm warn ERESOLVE overriding peer dependency` for `@toast-ui/react-editor@3.2.3`; one `react` (19.x) is installed. `npm ci` from the resulting lockfile also succeeds with the warning.
- `--strict-peer-deps`: fails with `npm error code ERESOLVE`.
- an app-level `overrides` entry `"@toast-ui/react-editor": { "react": "$react", "react-dom": "$react-dom" }`: no warning, and `--strict-peer-deps` passes. This is the workaround in the cells README.
- `legacy-peer-deps=true`: no warning, but npm no longer auto-installs peers (`lodash`, `marked`, `react-responsive-carousel` were missing).

If a future React breaks it, the fallback is a small wrapper around `@toast-ui/editor`, which is already a cells dependency.

## Sample apps (`test-projects/`)

`test-projects/bootstrap-projects.sh` (`npm run test-projects`) is a tarball harness:

1. If any package's `dist/` is missing, it runs `npm run build --workspaces`.
2. It runs `npm pack --workspace packages/<pkg>` for core, cells and source into `test-projects/.packs/`.
3. For `vite-app` and `next-app`, it deletes `node_modules` and `package-lock.json`, runs `npm install` with all three tarballs, then `npm run build`.

This tests what users install (the tarballs, with their `LICENSE`, `exports` map and CSS paths) against a single React 19, instead of symlinked workspace sources.

| Sample | Stack | Build | Serve |
| --- | --- | --- | --- |
| `vite-app` | Vite 8, `@vitejs/plugin-react` 6, React 19, TypeScript 5.9 | `tsc --noEmit && vite build` | `npm run preview` |
| `next-app` | Next 16 App Router, React 19, TypeScript 5.9 | `next build` | `npm start` (`next start`) |

- Both render a `DataEditor` with text, number and boolean columns plus the star cell from `@specstory/ai-data-grid-cells`, and import `@specstory/ai-data-grid/dist/index.css`.
- `next-app/app/page.tsx` is a `"use client"` page that loads `components/Grid.tsx` with `next/dynamic` and `ssr: false`, because the grid needs `window`.
- Each sample has `.npmrc` with `legacy-peer-deps=true`, and depends on `file:../.packs/specstory-ai-data-grid*-7.0.0.tgz`.
- `test-projects/.gitignore` ignores `.packs/`, `node_modules/`, `dist/`, `.next/` and `package-lock.json`. The sample lockfiles are regenerated on every run and never committed.
- Not in CI.
- Upstream's `cra5-gdg` (Create React App, pinned to React 17, crashed at runtime with two copies of React) and `next-gdg` (Next 12.1, build failed) were deleted.

On 2026-09-25 (SPST-13) a run took 14 s with a warm npm cache and left about 400 MB (`next-app`) and 110 MB (`vite-app`) of `node_modules`. Both samples resolved React 19.3.0.

### Check scripts

Both need Playwright's Chromium and aren't in CI.

- `scripts/check-test-project.mjs <base-url> <sample-node_modules-dir>` scans the given `node_modules` (including nested and scoped `node_modules`) for `react` packages, then loads the URL in headless Chromium, waits for a `<canvas>` (30 s) and 2 s more. It fails if there's no canvas, any console or page error, or the `react` copies don't share exactly one version. Missing arguments print the usage and exit 2.
- `scripts/check-article-cell-editor.mjs [url]` defaults to `http://localhost:9009/iframe.html?id=extra-packages-cells--custom-cells`. It double-clicks the article cell at fixed canvas coordinates (the Article column, index 8, at x = 1250 + 75 px; row 1, at y = 36 + 34 + 17 px), retrying up to 3 times, then types, saves, reopens and cancels. Console errors fail it, except `Failed to load resource` 404s (the story's image cell with an undefined URL).

## Storybook

- Storybook 9 with `@storybook/react-vite` (`.storybook/main.cjs`), stories from `**/src/**/*.stories.tsx`, Linaria through `@wyw-in-js/vite`.
- `npm start` runs `storybook dev -p 9009 --no-open` together with a core watcher. The dev server listens on all interfaces.
- `npm run build-storybook` builds the packages, then a static Storybook into `storybook-build/` (113 stories). The `MoreInfo` styled component exported from `packages/source/src/stories/use-data-source.stories.tsx` is kept out of the story list with `excludeStories`.
- Hosted on Vercel; see [Storybook hosting (Vercel)](#storybook-hosting-vercel).

### Smoke test

`scripts/smoke-storybook.mjs` (`npm run smoke-storybook`) serves `storybook-build/` on `127.0.0.1` at a random port with a small `node:http` server, reads the story ids from `index.json`, opens each story's iframe in headless Chromium (Playwright, a root devDependency) and waits 1.5 s. A story fails when it logs a console error or page error that no substring in `errorAllowlist[storyId]` matches, or when it has no `<canvas>` and isn't in `noCanvasAllowlist`. `FIXED?` flags allowlist entries whose errors no longer occur. The allowlist has 8 entries: one image-cell demo with an undefined URL (404) and seven test-case stories that hotlink an Imgur image (403). Current result: 113 visited, 8 known, 0 unexpected, 0 without a canvas. It isn't run in CI.

## Storybook hosting (Vercel)

WP3 adds no files to the repository. Everything is Vercel project configuration, created through the Vercel API on 2026-09-25. Values below are as the Vercel API (`GET /v9/projects/<id>`) reports them.

| Setting | Value |
| --- | --- |
| Project | `ai-data-grid-storybook` (`prj_9YwVKakzRDEptjSQguhJXWeLmm6f`) |
| Team | `spec-story` (`team_jCkRTurzFOHzHP9Lwuyat5Dr`) |
| Git connection | GitHub `specstoryai/ai-data-grid`, production branch `main` |
| Root Directory | repo root (`rootDirectory: null`) |
| Framework | Other (`framework: null`) |
| Node.js | `24.x` |
| Install Command | `npm ci` |
| Build Command | `npm run build-storybook` |
| Output Directory | `storybook-build` |
| Deployment protection | Standard Protection (`ssoProtection.deploymentType: all_except_custom_domains`), no password protection |
| Protection bypass | One *Protection Bypass for Automation* secret (scope `automation-bypass`) |

- **URLs.** Production: https://ai-data-grid-storybook.vercel.app. Branch previews: `https://ai-data-grid-storybook-git-<branch>-spec-story.vercel.app`, plus a per-deployment URL. Production has served since the first `main` build after the WP1 merge (`d75cdc15`, 2026-09-25): WP3 itself adds no files, so production didn't wait for it. It is public (200 without a bypass header) and lists 113 stories.
- **Deploys.** Every branch push builds a preview; a push to `main` (a PR merge commit) deploys production. The Vercel GitHub app posts the `Vercel – ai-data-grid-storybook` status on each commit.
- **No root `vercel.json`.** WP4's docs site has its own Vercel project (`ai-data-grid-docs`, Root Directory `docs`) with a `docs/vercel.json`. Keeping the Storybook settings in project config means no repo file is shared between the two projects.
- **Ignored Build Step** (project setting `commandForIgnoringBuildStep`), verbatim:

    ```sh
    git diff --quiet HEAD^ HEAD -- . ":(exclude)docs" 2>/dev/null && ! git diff --quiet HEAD^ HEAD -- docs 2>/dev/null
    ```

    Vercel skips the build when the command exits 0. That happens only when the latest commit changes files and all of them are under `docs/`. Commits that touch anything outside `docs/`, mixed commits and empty commits build, as do branches without `docs/` and first deploys with no `HEAD^` (the `git diff` fails, so the command exits non-zero). The command is compact because Vercel caps the setting at 256 characters.
- **Protection.** The production `*.vercel.app` alias is public. Preview URLs redirect (302) to the Vercel login unless the viewer is logged in with access to the team, or the request carries the `x-vercel-protection-bypass` header with the automation secret. The secret lives only in the Vercel project; it isn't in the repository, CI or any PR.
- **CLI fallback.** If the git connection is lost: `vercel link` to the project, then `vercel build` and `vercel deploy --prebuilt` (`--prod` on both for production). Not used so far.
- **Build.** About 75–80 s on Vercel (`npm ci` takes most of it), about 12 MB of static output.
- **Smoke test.** `scripts/smoke-storybook.mjs` serves only a local `storybook-build/`; it takes no URL or bypass header. The WP3 preview was checked with an ad-hoc variant of the same allowlist logic plus the bypass header: 113 stories, 0 unexpected failures.

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
- `docs/next.config.mjs` sets `agentRules: false`, so `next dev` doesn't generate Next.js 16's `AGENTS.md` / `CLAUDE.md` agent-rule files in `docs/`.
- `docs/tsconfig.json` sets `"types": ["node"]`. Without it, tsc also loads `@types/*` from the repo root's `node_modules` (for example the `@types/prosemirror-*` packages), and `npm run build` fails its type check when the root dependencies are installed.
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
- Pre-7.0.0-release content:
  - An unmint `<Note title="Not on npm yet">` follows the `npm i @specstory/ai-data-grid` command on the welcome page's Quick Start (`index.mdx`) and in step 1 of `extended-quickstart-guide/index.mdx`. It says 7.0.0 isn't on npm yet and links to the root README's [Installing before the npm release](README.md#installing-before-the-npm-release) section on GitHub instead of repeating the tarball steps.
  - The welcome page's intro says to migrate by upgrading to React 19 first, then changing the package names and imports, matching the README's "Migrating from 6.x".
- Links to the hosted Storybook (https://ai-data-grid-storybook.vercel.app): the welcome page ("Lots of fun examples are in our Storybook"), and two FAQ answers in `faq.mdx`: search (story `ai-data-grid-docs--search`) and custom rendering (story `ai-data-grid-dataeditor-demos--custom-drawing`).
- The importer never writes `index.mdx` or `about.mdx` (`HAND_MAINTAINED` in the script). It overwrites all other pages. The rebrand edits that replace "Glide Data Grid" in generated prose are manual. A re-import on 2026-09-25 reverted them in five pages (`api/cells/index`, `extended-quickstart-guide/index`, `extended-quickstart-guide/copy-and-paste-support`, `extended-quickstart-guide/working-with-selections`, `faq`). The "Not on npm yet" note in `extended-quickstart-guide/index.mdx` and the two Storybook links in `faq.mdx` are hand edits to generated pages too, and a re-import removes them the same way.

### Build and deploy

- Vercel project `ai-data-grid-docs` (ID `prj_OG2EFwjOBe2SvtjtRWXtckG0k9UH`) in team `spec-story` is git-connected to `specstoryai/ai-data-grid`. Settings: Root Directory `docs`, framework Next.js, Node 24.x, production branch `main`. The build and install commands are the defaults.
- The Ignored Build Step is `ignoreCommand` in `docs/vercel.json`, not a project setting:
  ```
  [ -n "$VERCEL_GIT_PREVIOUS_SHA" ] || exit 1; git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" -- ':(top)docs/' || exit 1; exit 0
  ```
  Exit 0 skips the build. The command builds (exit 1) when there is no previous deployment SHA, when `docs/` changed, or when `git diff` errors.
- Protection is set by `ssoProtection: all_except_custom_domains` (Vercel's default Standard Protection). Preview deployment URLs redirect to Vercel SSO. The production domain `ai-data-grid-docs.vercel.app` is public. A *Protection Bypass for Automation* secret exists so verification tools can reach previews. It is read from the Vercel API and is never written to the repo.
- Production serves only once `docs/` is on `main`, that is after PR #11 merges. Until then the production URL returns 404 `DEPLOYMENT_NOT_FOUND`.

### Tests

- `docs/__tests__/`: vitest with happy-dom (`docs/vitest.config.ts`). There are 5 files and 27 tests, covering the unmint components (callout, card, tabs), `lib/theme-config` and `lib/utils`. They don't test the content or the importer.
- `npm run build` in `docs/` is the content check: it fails when an MDX page doesn't compile.
- `npm run lint` in `docs/` runs `eslint .` with the flat config `docs/eslint.config.mjs`: `eslint-config-next/core-web-vitals`, ignoring `.next/`, `.source/`, `out/`, `node_modules/` and `next-env.d.ts`. No rules are disabled.
- Root CI and the root check commands don't cover `docs/`. Vercel builds are the only automated check on it.

## AI Fill (in development)

AI Fill (SPST-16) is developer-configured AI filling of grid columns with Jev, TypeSafe's Choice, Score and Noul primitives. It is being built into core, `@specstory/ai-data-grid`, in five stacked PRs (WP-AI1 to WP-AI5). The design is SPST-17's plan with its Amendment 1. Only WP-AI1 (PR #16, not merged) exists so far: a pure TypeScript foundation with no network code and no React code. `DataEditor`, `data-editor-all.tsx` and `DataEditorRef` don't reference it yet, and core's `package.json` (`exports`, dependencies, `cycle-check`) is unchanged. The user-facing reference is the "AI Fill" chapter of `packages/core/API.md`, marked as in development.

### Module layout

All paths are under `packages/core/src/ai-fill/`. Tests are in `packages/core/test/ai-fill/` (185 tests in 8 files; core also gained a second export test in `test/public-api-exports.test.ts`, for 574 in total).

| Module | Contents | Public |
| --- | --- | --- |
| `index.ts` | Barrel of the public names, re-exported by `src/index.ts` with `export *`. | — |
| `contract/` | Jev request, question and answer types (`types.ts`); `parseJevAnswer` (`parse-answer.ts`), which checks a raw answer against its question and returns a `ParsedJevAnswer` (`ChoiceAnswer`, `ScoreAnswer` or `NoulAnswer`) or a reason. | yes |
| `config/` | 40 configuration types (`types.ts`), 20 result, event and error types (`results.ts`), and `validateAIFillConfig` (`validate.ts`), which returns every problem as `{ path, message, columnId? }`. | yes |
| `identity/` | `canonicalJson`, `buildQuestion`, `questionFingerprint`, `inputFingerprint`, `cacheKey`, `resolveModel` and `shortHash`. | no |
| `policy/` | `mapAIOutput` (`map-output.ts`), `evaluateAIPolicy` (`evaluate-policy.ts`), `isAIDestinationEmpty` and `defaultToCell` (`cells.ts`), and the commit-guard helpers (`commit-guards.ts`). | the first three |

Planned layers that don't exist yet: `transport/` and `engine/` (the Jev client, scheduler and result store), `server/` and `testing/` (the `@specstory/ai-data-grid/server` and `/testing` subpaths), `react/` (the `aiFill` prop's controller, the bridge and the UI) and `stories/`.

### Public API

WP-AI1 adds 92 core exports (151 → 243): 5 functions (`validateAIFillConfig`, `parseJevAnswer`, `evaluateAIPolicy`, `mapAIOutput`, `isAIDestinationEmpty`) and 87 types (20 contract types, the 40 config and 20 result types, and 7 helper types: `ParseJevAnswerResult`, `AIFillConfigIssue`, `ValidateAIFillConfigOptions`, `MapAIOutputResult`, `MapAIOutputError`, `EvaluateAIPolicyInput`, `AIPolicyEvaluation`). The configuration, result and event types already describe the later layers (connection modes, execution limits, fill scopes, observers); only the functions above run in this stage.

### Behaviour worth knowing

- **Exact comparisons.** Gate thresholds are compared with the raw doubles from the response: `min` passes when `value >= min`, `max` when `value <= max`, with no epsilon or rounding. Display rounding never feeds a decision.
- **Identity.** The question fingerprint is canonical JSON (sorted keys) of the question sent to Jev (type, instructions, context, criteria) plus the column's `sources`, deduplicated and sorted (`identity/fingerprints.ts`). The input fingerprint is canonical JSON of the state. The cache key is canonical JSON of `[rowId, columnId, questionFingerprint, inputFingerprint, model]`, with the full strings, not hashes. `shortHash` is 32-bit FNV-1a over UTF-16 code units, 8 hex digits, for display only.
- **Validation** (`config/validate.ts`) reports, among others: 2–255 Choice options, 2–10 Score levels, overlapping gates (`show` ≤ `ready` ≤ `autoApply` for each shared `min`, the reverse for `max`), Noul bands, a confidence measure on a Noul, a direct-mode key in a browser without `dangerouslyAllowBrowser`, and `autoApply` with `overwrite: "never"` when the `column` fill scope is enabled.
- **Parsing** (`contract/parse-answer.ts`): a Score answer without a `legend` gets one built from the question's criteria; a `legend` that isn't an object is malformed.
- **Mapping** (`policy/map-output.ts`): the default `precision` for Score and Noul values is 2. An apply candidate needs a value.
- **`decide`** receives frozen copies of the answer, candidate and decision (`policy/evaluate-policy.ts`). A throw or invalid return is a `policy-callback` error, and nothing is written.
- **Emptiness** (`policy/cells.ts`): `0` and `false` are values. The cells package's dropdown cell is empty when its `data.value` is `""`, `null` or `undefined`, detected by `data.kind === "dropdown-cell"`, so core doesn't import the cells package.

### Guard tests

- `test/ai-fill/boundaries.test.ts` parses every `src/**/*.ts(x)` with the TypeScript compiler and enforces the import rules: `ai-fill/` never imports `src/index.ts`, `src/data-editor-all.tsx` or `@specstory/*`; only `src/index.ts` and `src/data-editor-all.tsx` import `ai-fill/` (plus type-only imports from `src/data-editor/data-editor.tsx`); `ai-fill/testing/` imports only `testing/`, `contract/`, `identity/` and `transport/`; core never imports cells or source. The rule that the `/server` graph has no React, DOM or Linaria import is added with `/server` in WP-AI2.
- `test/ai-fill/bundle-budget.test.ts`, see below.

### Bundle budget

AI Fill must cost little for apps that render `DataEditor` without `aiFill`. `test/ai-fill/bundle-budget.test.ts` bundles an entry that imports `DataEditor` and `dist/index.css` from core's built `dist/esm`, with the root esbuild CLI (0.25.12): `--bundle --minify --splitting --format=esm`, with `react`, `react-dom`, `marked`, `lodash` and `react-responsive-carousel` external. Sizes are GNU `gzip -9` of the concatenated output files. It uses the CLI because esbuild's JS API refuses to run under jsdom.

| Measure | Baseline (SPST-17 A7, `main` at `a0a121c`) | Measured by the test (`main` and PR #16) | Limit |
| --- | --- | --- | --- |
| Initial JS (entry chunk plus the chunks it imports statically) | 70,374 B | 70,305 B | 71,900 B (+1.5 KB) |
| CSS | 2,052 B | 2,044 B | 4,600 B (+2.5 KB) |
| AI Fill modules in the initial chunks | — | none | none except `ai-fill/react/bridge.js` |
| Lazy AI Fill chunks | — | 0 B | 40,000 B |

The A7 figures came from a slightly different measurement than the test's (the test gzips the concatenated files); the limits are A7's. It reads `dist/`, so it needs `npm run build` first. CI builds before testing. WP-AI3 (the bridge) and WP-AI4 (the CSS) are where the numbers are expected to move.

## Known limitations and risks

- **`@toast-ui/react-editor` is unmaintained and declares a `react ^17.0.1` peer.** npm warns on install of `-cells` (see [above](#toast-uireact-editor-cells-article-editor)). Fallback if React breaks it: a wrapper around `@toast-ui/editor`.
- **The article-editor check aims by canvas coordinates.** A layout change to the custom-cells story breaks `scripts/check-article-cell-editor.mjs` until its coordinates are updated.
- **`check-test-project.mjs` counts React versions, not copies.** Two copies of the same React version would pass.
- **`@glideapps/ts-helper` is still a core devDependency** (with its dependencies `@glideapps/graphs` and `@glideapps/ts-necessities` in the lockfile). It's the external tool behind `cycle-check`, not shipped code.
- **Emitted `.d.ts` files aren't byte-for-byte reproducible, in all three packages.** The parallel esm and cjs `tsc` runs write the same declaration directory: `dist/dts-tmp` in core and cells, `dist/dts` in source. Whichever run finishes last wins, so the `//# sourceMappingURL` trailer is present in some builds and missing in others. In repeated builds on 2026-09-25 the number of `.d.ts` files with the trailer varied: core 40, 87 and 0 of 87; cells 0, 17, 17, 5 and 0 of 17; source's `index.d.ts` had it in 1 of 4 builds. Pre-existing.
- **Failing `Vercel` status on branches without `docs/`.** The docs project's Root Directory is `docs`, so every push to a branch that doesn't contain `docs/` (for example old Dependabot branches) creates an ERROR deployment and a failing `Vercel – ai-data-grid-docs` status on its PR. It stops once `docs/` is on `main` and those branches have merged `main`. Accepted as non-blocking.
- **Re-importing the docs loses the hand edits** to generated pages: the rebrand edits, the "Not on npm yet" note in the Extended QuickStart Guide and the FAQ's Storybook links (see [Content and importer](#content-and-importer)). The importer doesn't apply any of them itself.
- **The docs site's "Not on npm yet" notes link to the README on GitHub, and the repository is private.** Readers of the public docs site without repository access get GitHub's 404 there, so they can't see the tarball steps.
- **The docs content describes Glide Data Grid 6.x behaviour**, with package names rewritten to `@specstory/*`. It is only as accurate as the upstream GitBook docs.
- **The Storybook ignore step compares only `HEAD^` and `HEAD`.** A branch push of several commits whose last commit touches only `docs/` skips the preview, even if earlier commits changed code. Push another commit or redeploy by hand. Production isn't affected: `main` moves only by merge commits, whose `HEAD^` is the previous `main`.
- **Storybook project settings aren't in the repository.** Changes to them don't show up in PRs or git history; this file is the record.
- **The core tarball ships source, tests and stories** because core has no `files` field (see above).
- **`.devcontainer/` is stale.** It pins a Node 14 image and runs a `.devcontainer/run.sh` that doesn't exist. It isn't documented as a way to work on the repo.
- `packages/cells/test/date-picker-cell.test.tsx` was fixed in WP1: it rendered the wrong cell and left a `findByDisplayValue` promise unawaited, which failed CI intermittently.
- Open `npm audit` findings remain in the root install; run `npm audit` for the current list.
- **Browsers can't call Jev directly today.** TypeSafe's API rejects CORS preflights from every origin tried during planning (SPST-17 §1), so AI Fill's planned direct-key mode will only work from Node. Browser apps will need endpoint mode (their own server) or a local dev proxy. WP-AI1 has no network code; this affects WP-AI2 onwards.
- **AI Fill isn't usable yet.** WP-AI1 exports types and pure functions only. The `aiFill` prop, `DataEditorRef.aiFill`, the transport and the `/server` and `/testing` subpaths arrive in later packages.
- **`npm test` in core needs a build.** `bundle-budget.test.ts` reads `dist/` and fails on a fresh clone until `npm run build` has run, and it measures stale output after source changes. It also needs the `gzip` binary.

## Decision log

| Date | Source | Decision | Reason |
| --- | --- | --- | --- |
| 2026-09-25 | SPST-6 (Phase 1 plan) | Hard fork from upstream `main` at `0875d78c` (6.0.4-alpha25), keeping upstream history and the 73 merged tags with the same SHAs. | Upstream is unmaintained. Keeping the SHAs preserves blame and lets upstream fixes be compared or cherry-picked. |
| 2026-09-25 | SPST-6, SPST-2 / PR #12 | Publish under the `@specstory` npm scope as `ai-data-grid`, `ai-data-grid-cells` and `ai-data-grid-source`, at version 7.0.0. | New owner and trademark-free names. A new major version marks the fork and the coming React 19 requirement. |
| 2026-09-25 | SPST-6 | 7.x stays API-compatible with 6.x: all exports and props, `--gdg-*` variables and `gdg-` classes are kept. | Users migrate by changing import paths only. Breaking changes wait for a later major. |
| 2026-09-25 | SPST-6, SPST-2 / PR #12 | Keep the runtime identifiers `glide-cell-{col}-{row}`, `glide-select` and `glide_fade_in` until 8.0. | Users' CSS, tests and selectors may depend on them. Renaming them is a breaking change. |
| 2026-09-25 | SPST-2 / PR #12 | Guard the API with an export-name snapshot per package, read with the TypeScript compiler API from `src/index.ts`. | Catches accidental export drift without a build or an extra tool. It checks names only. |
| 2026-09-25 | SPST-2 / PR #12 | Add `Copyright (c) 2026 ai-data-grid contributors` below the typeguard line in all four `LICENSE` files, and add `THIRD_PARTY_NOTICES.md`. | MIT requires keeping the original notice. New work is attributed without replacing it. |
| 2026-09-25 | SPST-2 / PR #12 | Delete the per-package lockfiles and regenerate the root `package-lock.json`. | npm workspaces use only the root lockfile. The stale ones were misleading, and the old root lockfile failed `npm ci`. |
| 2026-09-25 | SPST-6, SPST-2 / PR #12 | Leave `test-projects/` (and `test-18`/`test-19`/`test-projects`) untouched in WP1. | WP2 changes the React support model and removes or replaces them there. |
| 2026-09-25 | SPST-2 / PR #12 | Exclude the `MoreInfo` export from stories with `excludeStories`. | It's a styled component, not a story. Storybook listed it as a broken `more-info` story. |
| 2026-09-25 | SPST-6, SPST-2 / PR #12 | CI runs tests only (`ci.yml`: install, build with lint, unit tests). Delete the publish, beta, release and Pages workflows and Dependabot. | Project rule: nothing publishes from CI, and dependency updates are handled deliberately for now. |
| 2026-09-25 | SPST-2 / PR #12 | Add a Playwright Storybook smoke test with a per-story allowlist, and keep it out of CI. | It catches runtime errors in every story. Some stories load third-party images, which makes it too flaky for CI. |
| 2026-09-25 | SPST-2 / PR #12 | Keep `@glideapps/ts-helper` as a core devDependency for `cycle-check`. | It's a build tool, not shipped code or branding, and there is no drop-in replacement yet. |
| 2026-09-25 | SPST-8 | The package READMEs, which ship in the tarballs, don't link to images, a hosted Storybook or a docs site. | The repository is private, so its images and links don't resolve for npm users, and neither hosted site exists yet. |
| 2026-09-25 | SPST-6 | React 19 only: `react` / `react-dom` peer `^19.0.0` in all three packages; drop React 16–18. | One React version to build and test against. It's why 7.0.0 is a major version. |
| 2026-09-25 | SPST-6 | Keep `forwardRef` on `DataEditor`, `DataEditorAll` and `DataGrid` in 7.0. | It works in React 19. Removing it is out of scope for an API-compatible 7.0 and can wait for a later major. |
| 2026-09-25 | SPST-4, PR #14 | Replace `@testing-library/react-hooks` (and `react-test-renderer`, `react-dom/test-utils`) with `renderHook` / `act` from `@testing-library/react`. | `@testing-library/react-hooks` is deprecated and doesn't support React 18 or 19, and `react-dom/test-utils` is deprecated in React 19. RTL's `renderHook` is the replacement. |
| 2026-09-25 | SPST-4, PR #14 | Add root `overrides` for `@types/react`, `@types/react-dom`, `@emotion/react` and `csstype`. | Transitive dependencies pulled in React 18 types or types incompatible with React 19's; overrides fix the dev install without touching the published packages. |
| 2026-09-25 | SPST-4, PR #14 | Keep `@toast-ui/react-editor` instead of replacing it. | The article editor works under React 19 (checked headless). Its `react ^17` peer only causes an npm warning, with a documented `overrides` workaround. Replacing it is a fallback, not needed now. |
| 2026-09-25 | SPST-4, PR #14 | Replace the CRA sample with `vite-app`, and `next-gdg` (Next 12, Pages Router) with `next-app` (Next 16 App Router, grid loaded with `ssr: false`). | CRA is deprecated, and upstream's CRA sample was pinned to React 17 and crashed with two Reacts. The Next 12.1 sample no longer built. |
| 2026-09-25 | SPST-4, PR #14 | The samples install `npm pack` tarballs, and their lockfiles are gitignored and regenerated each run. | Tests exactly what users install (tarball contents, `exports`, CSS paths) with one React. The tarballs are rebuilt on every run, so committed sample lockfiles would go stale. |
| 2026-09-25 | SPST-4, PR #14 | Keep `test-projects` and its check scripts out of CI. | CI stays install, build, lint and unit tests. The harness installs ~500 MB and needs a browser for the checks. |
| 2026-09-25 | SPST-6, SPST-5 / PR #13 | Host Storybook as its own Vercel project, `ai-data-grid-storybook`, git-connected to the repo with production branch `main`, rather than deploying from the CLI. | Previews for every branch and production on merge with no CI publish step (CI stays tests-only). The Vercel GitHub app already had access to the repo. |
| 2026-09-25 | SPST-5 / PR #13 | Keep all Storybook build settings in the Vercel project config, with no root `vercel.json`. | Nothing in the repo can collide with WP4's `docs/vercel.json` and its separate docs project. |
| 2026-09-25 | SPST-5 / PR #13 | Skip builds with a compact Ignored Build Step that exits 0 only when the latest commit changes files and all are under `docs/`. | Vercel limits the setting to 256 characters. Requiring a change under `docs/` makes empty commits and branches without `docs/` still build. |
| 2026-09-25 | SPST-6 (assumption A5), SPST-5 / PR #13 | Use Vercel's default Standard Protection: public production URL, protected previews, plus a Protection Bypass for Automation secret for verification. | The Storybook is meant to be public, previews of unmerged work are not. The bypass lets automated checks reach previews without sharing a login. |
| 2026-09-25 | SPST-11 | Link the hosted Storybook from the root README only. The package READMEs stay unchanged. | The package READMEs don't point readers to examples or demos. |
| 2026-09-25 | SPST-6 (Phase 1 plan), SPST-3 | Build the docs site with unmint (Next.js + Fumadocs) and host it on Vercel under team `spec-story` on the default `*.vercel.app` domain. | Project standard. It replaces the upstream GitBook and GitHub Pages hosting. No custom domain yet. |
| 2026-09-25 | SPST-3, PR #11 | `docs/` is a standalone app with its own lockfile and is not a root npm workspace. | Keeps Next.js 16 and its dependency tree out of the library's install, build and tests, and keeps root `npm ci` independent of the docs. |
| 2026-09-25 | SPST-3, PR #11 | Import the content with a re-runnable script (`docs/scripts/import-gitbook.mjs`) from GitBook's `llms.txt` and per-page `.md`. Keep `index.mdx` and `about.mdx` hand-maintained. | The conversion can be reproduced and audited. The welcome page and license page need AI Data Grid wording that the importer must not overwrite. |
| 2026-09-25 | SPST-3, PR #11 | Reuse the GitBook text and images, with attribution on the welcome page, the About & License page and the footer. | The upstream docs are MIT-licensed project material. The standing rule requires crediting the origin. |
| 2026-09-25 | SPST-3, PR #11 | Make the welcome page the `/docs` landing page, and redirect `/` to `/docs`. | There is a single entry point, and the site has no separate marketing home page. |
| 2026-09-25 | SPST-3, PR #11 | Put the Ignored Build Step in `docs/vercel.json` (`ignoreCommand`), not in the Vercel project settings. | The rule is versioned and reviewed with the code, and it is visible to contributors. |
| 2026-09-25 | SPST-3, PR #11 | Make the ignore step fail-safe: build when there is no previous SHA or when `git diff` errors, and skip only on a clean "no change under `docs/`". | The first deploy, and any environment where the diff can't run, must still produce a deployment rather than silently skip. |
| 2026-09-25 | SPST-3, PR #11 | Keep Vercel's default protection: protected previews and a public production domain. Verification uses a Protection Bypass for Automation secret. | Standing hosting rule. Previews of unmerged work stay private. |
| 2026-09-25 | SPST-3, PR #11 | Accept ERROR `Vercel` statuses on branches without `docs/` until they merge `main`. | This is temporary and only affects branches that predate the docs site. Working around it (for example by disconnecting git) would cost preview deploys. |
| 2026-09-25 | SPST-3, PR #11 (`df5948a`) | Lint `docs/` with the ESLint CLI (`eslint .`, flat config extending `eslint-config-next/core-web-vitals`). Set `agentRules: false` in `docs/next.config.mjs`. Restrict `docs/tsconfig.json` to `"types": ["node"]`. | Next.js 16 removed `next lint`, so the scaffold's lint script was broken. `next dev` otherwise leaves untracked agent-rule files. Without the `types` restriction, the build type-check picks up the root library's broken `@types` packages. |
| 2026-09-25 | SPST-3 / PR #11 (`aca129ec`) | The docs site's "Not on npm yet" notes link to the README's "Installing before the npm release" section instead of copying the tarball steps. The FAQ's custom-rendering answer links the Custom Drawing story (`ai-data-grid-dataeditor-demos--custom-drawing`) in place of the GitBook's `draw-custom-cells` story, which no longer exists. | The tarball steps stay in one place and are removed in one place at the first npm publish. Custom Drawing shows canvas `drawCell` / `drawHeader` painting, which is what that answer is about. |
| 2026-09-25 | SPST-16 (Jake), SPST-17 Amendment 1 | AI Fill is part of core, `@specstory/ai-data-grid` (`packages/core/src/ai-fill/`), not a separate package. WP-AI1's first delivery in `packages/ai` was moved into core. | Jake: "this is one package, an ai-data-grid". One install and one version for users. |
| 2026-09-25 | SPST-17 Amendment 1 | Apps opt in with an optional `aiFill` prop on `DataEditor`, loaded lazily through a small static bridge. An unconfigured grid is unchanged. (Planned for WP-AI3; not built yet.) | Keeps the 6.x-compatible API and costs apps without AI Fill almost nothing. |
| 2026-09-25 | SPST-17 §1 | Call Jev's HTTP API with `fetch`, and don't depend on the TypeSafe SDK. The request and response types are ours (`contract/types.ts`), pinned by `test/ai-fill/fixtures/jev-contract.ts`. | The SDK is pre-1.0 and had a breaking change days before planning. The grid needs its own retry, cancellation and scheduling anyway, and core gets no new dependency. |
| 2026-09-25 | SPST-17 §4, SPST-19 | Compare gate thresholds exactly, as raw IEEE doubles, with no epsilon or rounding; display rounding never feeds a decision. | Predictable, documentable gates: with `minProbability: 0.8`, 0.79 is withheld and 0.80 is shown. |
| 2026-09-25 | SPST-17, SPST-19 | Key cached answers by the exact canonical-JSON strings, not hashes. `shortHash` (FNV-1a, our own code, so `THIRD_PARTY_NOTICES.md` is unchanged) is for display only. | A hash collision can't attach a wrong answer to a cell. |
| 2026-09-25 | SPST-19 | The question fingerprint includes the column's `sources`, deduplicated and sorted. | Changing which columns feed a question changes what it means, so earlier answers become stale. Order and duplicates don't. |
| 2026-09-25 | SPST-17 §1, SPST-19 | Validate the Score level count (2–10) in `validateAIFillConfig`. | Jev's docs say 2–10 levels, but the live API accepted and answered a 1-level Score. |
| 2026-09-25 | SPST-19 | Score levels are `string` or `{ description, label?, value? }`. A Score answer without a `legend` gets one built from the criteria. The default `precision` is 2. | Levels need a label to show and a value to store, apart from the description sent to Jev. |
| 2026-09-25 | SPST-19 | `autoApply` with `overwrite: "never"` and the `column` fill scope is a validation error. An apply candidate needs a value. | The `column` scope includes populated cells, which `never` can't write, so the combination can't do what it says. Nothing is applied without a value to write. |
| 2026-09-25 | SPST-19 | `decide` gets frozen copies of the answer, candidate and decision. A throw (in strict-mode code, including a write to a frozen copy) or an invalid return becomes a `policy-callback` error, and nothing is written. | The callback can't change a stored answer or give a result a value. |
| 2026-09-25 | SPST-19 | The cells package's dropdown cell is empty by its `data.value`, recognized by `data.kind === "dropdown-cell"`. | Custom cells need their own emptiness rule, and core can't import the cells package. |
| 2026-09-25 | SPST-17 Amendment 1 (A8), SPST-19 | Every new core export contains `AI`, `AIFill` or `Jev`, or starts with `Choice`, `Score` or `Noul`, enforced by `public-api-exports.test.ts`. Identity, mapping and commit-guard helpers stay internal. | AI Fill shouldn't take generic names in core's namespace; renaming a public export later would be a breaking change. |
| 2026-09-25 | SPST-17 Amendment 1 (A7), SPST-19 | Cap what AI Fill adds for apps without `aiFill` with `bundle-budget.test.ts`: initial JS ≤ 71,900 B and CSS ≤ 4,600 B gzip, only `bridge.js` in the initial chunks, lazy AI chunks ≤ 40,000 B. | Moving AI Fill into core must not make every grid heavier. The test makes growth visible in each PR. |

## Open follow-ups

- Optionally make the Storybook ignore step compare against `VERCEL_GIT_PREVIOUS_SHA` instead of `HEAD^`, so multi-commit pushes ending in a docs-only commit still build.
- Optionally let `scripts/smoke-storybook.mjs` target a deployed URL (with the bypass header read from the environment), so previews can be smoke-tested without an ad-hoc script.
- Add the docs build, test and lint to CI, if wanted. Today, Vercel builds are the only automated check on `docs/`.
- Move the product-name replacement into the docs importer, so re-imports don't lose the rebrand edits.
- Confirm that https://ai-data-grid-docs.vercel.app/docs serves publicly, with the footer attribution, after PR #11 merges.
- At the first npm publish, remove the docs site's "Not on npm yet" notes (`docs/content/docs/index.mdx` and `docs/content/docs/extended-quickstart-guide/index.mdx`) together with the README's "Installing before the npm release" section and its "Not on npm yet" note.
- Custom domains for Storybook and the docs site (not planned for Phase 1).
- Rename the `glide-*` runtime identifiers in 8.0.
- Fix the open `npm audit` findings.
- Make `ci.yml` a required check on `main`.
- Replace `@glideapps/ts-helper` for `cycle-check`.
- Decide whether the core tarball should get a `files` field, and fix or delete `.devcontainer/`.
- First npm publish under `@specstory` (needs Jake's approval).
- `@toast-ui/react-editor` is unmaintained with a `react ^17` peer. If a React release breaks it, replace it with a small wrapper around `@toast-ui/editor`.
- `scripts/check-article-cell-editor.mjs` aims at the article cell by canvas coordinates; make it find the cell some other way if the story changes often.
- AI Fill: WP-AI2 (transport, scheduler, result store, `/server`, `/testing`, and the `/server` boundary rule), WP-AI3 (the `aiFill` prop), WP-AI4 (built-in UI) and WP-AI5 (Storybook, docs site guide, live check). Remove the "in development" note from `packages/core/API.md` when the `aiFill` prop lands.
