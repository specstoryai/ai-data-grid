# AS-BUILT: AI Data Grid

**Last updated:** 2026-09-26 (SPST-27: AI Fill WP-AI3 after merging WP-AI2 fix round 1, PR #18 at `9c1328ae`)
**Covers:** the rebranded library packages, license and attribution files, toolchain, CI and Storybook (work package WP1, PR #12), React 19 only with the `test-projects/` sample apps (WP2, PR #14), Storybook hosting on Vercel (WP3, PR #13), the documentation site in `docs/` (WP4, SPST-3 / PR #11), the AI Fill foundation in core (WP-AI1, SPST-19 / PR #16, not merged), AI Fill's execution layer with the `/server` and `/testing` subpaths (WP-AI2, SPST-23 / PR #17, stacked on PR #16, not merged), and AI Fill's grid integration: the `aiFill` prop, rendering, fill, commit and undo (WP-AI3, SPST-26 / PR #18, stacked on PR #17, not merged).

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

Because the JS doesn't import any CSS, consumers must import it themselves: `@specstory/ai-data-grid/dist/index.css` for core (also exported as `./index.css`), and `@specstory/ai-data-grid-cells/dist/index.css` for the cells' editor styles. `source` has no `dist/index.css` and needs no CSS import. Entry points, the same in all three packages: `main` → `dist/cjs/index.js`, `module`/`browser` → `dist/esm/index.js`, `types` → `dist/dts/index.d.ts`, all mirrored in `exports`. Since WP-AI2, core's `exports` also has `./server` and `./testing` (see [Entry points](#entry-points-server-and-testing)).

### What ships in each tarball (`npm pack --dry-run`)

| Package | `files` | Contents |
| --- | --- | --- |
| core | not set (`.npmignore` excludes only `tsconfig*` and `coverage/*`) | 1,029 files at PR #18 (978 at PR #17, 862 at PR #16, 768 before AI Fill): `dist/`, plus `src/` (stories and docs included), `test/`, `API.md`, `CHANGELOG.md`, `build.sh`, ESLint and vitest config, `LICENSE`, `README.md` |
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

Since WP-AI1, core's list is `upstreamExports` (the 151 names) plus `aiFillExports` (97 names since WP-AI3), 248 in total. A second core test checks that all 151 upstream names are kept and that every added name matches the AI Fill naming rule `/AI|Jev|^(?:Choice|Score|Noul)/` (see [AI Fill](#ai-fill-in-development)). A third pins the `/server` (4 names) and `/testing` (5 names) entries exactly; the naming rule doesn't apply to them.

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
- `next-app/app/api/jev/route.ts` (WP-AI2) exports `POST = createJevHandler({ apiKey: process.env.TYPESAFE_API_KEY ?? "", authorize: () => false })` from `@specstory/ai-data-grid/server`. `next build` compiles and type-checks it as the dynamic route `ƒ /api/jev`, which proves the subpath resolves from the tarball. It rejects every request, so it never calls Jev. `vite-app` doesn't use the subpaths.
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

AI Fill (SPST-16) is developer-configured AI filling of grid columns with Jev, TypeSafe's Choice, Score and Noul primitives. It is being built into core, `@specstory/ai-data-grid`, in five stacked PRs (WP-AI1 to WP-AI5). The design is SPST-17's plan with its Amendment 1. Three packages exist so far, none merged: WP-AI1 (PR #16), a pure TypeScript foundation; WP-AI2 (PR #17, stacked on it), the execution layer (Jev clients, scheduler, cache, result store) plus the `/server` and `/testing` entry points; and WP-AI3 (PR #18, stacked on PR #17), the grid integration: the optional `aiFill` prop on `DataEditor`, a lazily loaded controller, canvas rendering of AI states, fills, the commit path and undo. A grid with `aiFill` fills and commits; the built-in UI (menus, confirm dialog, status bar, inspector) is WP-AI4. Core's dependencies are unchanged; WP-AI2 added two `exports` subpaths and two `cycle-check` roots. The user-facing reference is the "AI Fill" chapter of `packages/core/API.md`, marked as in development.

### Module layout

All paths are under `packages/core/src/ai-fill/`. Tests are in `packages/core/test/ai-fill/` (422 tests in 23 files; core also gained two export tests in `test/public-api-exports.test.ts`, for 812 in total). Source has one more, `packages/source/test/ai-fill-undo.test.tsx` (9 in total).

| Module | Contents | Public |
| --- | --- | --- |
| `index.ts` | Barrel of the public names, re-exported by `src/index.ts` with `export *`. | — |
| `contract/` | Jev request, question and answer types (`types.ts`); `parseJevAnswer` (`parse-answer.ts`), which checks a raw answer against its question and returns a `ParsedJevAnswer` (`ChoiceAnswer`, `ScoreAnswer` or `NoulAnswer`) or a reason; `JevEndpointErrorBody` (`endpoint.ts`). | yes |
| `config/` | 40 configuration types (`types.ts`), 20 result, event and error types (`results.ts`), the API types `AIFillApi`, `AIFillTarget`, `AICellState` and `AIRunState` plus two unexported helpers, `AIActiveRun` and `AIFillRun` (`api.ts`), and `validateAIFillConfig` (`validate.ts`), which returns every problem as `{ path, message, columnId? }`. | yes |
| `identity/` | `canonicalJson`, `buildQuestion`, `questionFingerprint`, `inputFingerprint`, `cacheKey`, `resolveModel` and `shortHash`. | no |
| `policy/` | `mapAIOutput` (`map-output.ts`), `evaluateAIPolicy` (`evaluate-policy.ts`), `isAIDestinationEmpty` and `defaultToCell` (`cells.ts`), and the commit-guard helpers (`commit-guards.ts`). | the first three |
| `transport/` | `createJevTransport` (`client.ts`) for the endpoint, direct and custom modes; `JevTransportError`, `errorFromResponse` and the status mapping (`errors.ts`); `backoffDelay`, `retryDelay` and an abortable `sleep` (`retry.ts`); `isBrowserEnvironment` (`environment.ts`). | no |
| `engine/` | `AIFillEngine` (`engine.ts`), `AIFillStore` (`store.ts`), `RequestScheduler` (`scheduler.ts`), `TokenBucket` (`token-bucket.ts`), the LRU answer cache (`lru-cache.ts`), `groupRequests` (`requests.ts`), row-state building and missing-input checks (`state.ts`), `defaultExecution` and `resolveExecution` (`defaults.ts`). | no |
| `react/` | `bridge.ts` (static: `AIFillBridge`, `AIFillControllerProps`, `linkAIFillRef`), `controller.tsx` (the lazy controller), `session.ts` (`AIFillSession`: composition, fills, commits, revert, repaints, shortcuts), `grid-host.ts` (`AIFillGridHost`, the engine's host), `draw.ts` (canvas presentations and the header badge). | no |
| `server/index.ts` | `createJevHandler`, `toNodeListener`, `JevHandlerOptions`, `JevNodeListener`. | `/server` |
| `testing/index.ts` | `createMockJev`, `MockJev`, `MockJevOptions`, `MockJevRule`, `MockJevCall`. | `/testing` |

Planned layers that don't exist yet: `react/ui/` (the built-in UI, WP-AI4) and `stories/` (WP-AI5).

### Public API

WP-AI1 adds 92 core exports (151 → 243): 5 functions (`validateAIFillConfig`, `parseJevAnswer`, `evaluateAIPolicy`, `mapAIOutput`, `isAIDestinationEmpty`) and 87 types (20 contract types, the 40 config and 20 result types, and 7 helper types: `ParseJevAnswerResult`, `AIFillConfigIssue`, `ValidateAIFillConfigOptions`, `MapAIOutputResult`, `MapAIOutputError`, `EvaluateAIPolicyInput`, `AIPolicyEvaluation`). The configuration, result and event types already describe the later layers (connection modes, execution limits, fill scopes, observers); only the functions above run in this stage.

WP-AI2 adds one type to `.` (`JevEndpointErrorBody`, 244 in total) and makes `AIResultEvent` gain an optional `reason?: "row-missing"`. The `/server` entry exports 4 names and `/testing` 5 (see the table above). The engine and transport are internal: tests and `scripts/jev-live-check.mjs` import them by path.

WP-AI3 adds four types to `.` (`AIFillApi`, `AIFillTarget`, `AICellState`, `AIRunState`; 248 in total), the optional `aiFill` prop on `DataEditorAllProps` (the exported `DataEditor`), the optional `DataEditorRef.aiFill` member, and `onReady` on `AIFillConfig`. The prop and the member add no export names. There is no `AIFillDataEditor` and no public `useAIFill` hook. The five public functions are still exported, now as constants read from module namespaces (see the decision log).

### Behaviour worth knowing

- **Exact comparisons.** Gate thresholds are compared with the raw doubles from the response: `min` passes when `value >= min`, `max` when `value <= max`, with no epsilon or rounding. Display rounding never feeds a decision.
- **Identity.** The question fingerprint is canonical JSON (sorted keys) of the question sent to Jev (type, instructions, context, criteria) plus the column's `sources`, deduplicated and sorted (`identity/fingerprints.ts`). The input fingerprint is canonical JSON of the state. The cache key is canonical JSON of `[rowId, columnId, questionFingerprint, inputFingerprint, model]`, with the full strings, not hashes. `shortHash` is 32-bit FNV-1a over UTF-16 code units, 8 hex digits, for display only.
- **Validation** (`config/validate.ts`) reports, among others: 2–255 Choice options, 2–10 Score levels, overlapping gates (`show` ≤ `ready` ≤ `autoApply` for each shared `min`, the reverse for `max`), Noul bands, a confidence measure on a Noul, a direct-mode key in a browser without `dangerouslyAllowBrowser`, and `autoApply` with `overwrite: "never"` when the `column` fill scope is enabled.
- **Parsing** (`contract/parse-answer.ts`): a Score answer without a `legend` gets one built from the question's criteria; a `legend` that isn't an object is malformed.
- **Mapping** (`policy/map-output.ts`): the default `precision` for Score and Noul values is 2. An apply candidate needs a value.
- **`decide`** receives frozen copies of the answer, candidate and decision (`policy/evaluate-policy.ts`). A throw or invalid return is a `policy-callback` error, and nothing is written.
- **Emptiness** (`policy/cells.ts`): `0` and `false` are values. The cells package's dropdown cell is empty when its `data.value` is `""`, `null` or `undefined`, detected by `data.kind === "dropdown-cell"`, so core doesn't import the cells package.

### Execution (WP-AI2)

WP-AI3's session constructs the `AIFillEngine` with the config and an `AIFillGridHost` whose `readCell(rowId, columnId, sources)` reads the destination and source cells by row id (or returns `undefined` when the row isn't displayed; see [Grid integration](#grid-integration-wp-ai3)). The user-facing behaviour is in API.md's "Execution and errors" section; this is the data flow behind it.

```
fill(target) ─► plan()                       per cell: applies / fillScopes / populated / missing-input /
                                             cached → skip reason; throwing callback → configuration error;
                                             over maxCellsPerRun or grid-level issue → refused (onError only)
            ─► run(plan)                     onRunStart; store.enqueue (new requestSeq, keeps the previous record)
                 ├─ state > maxStateChars ─► input-too-large, settled at once
                 ├─ LRU cache hit ────────► settled from the cache, no request
                 ├─ same request in flight ► joins that flight (dedup)
                 └─ groupRequests ────────► one request per (rowId, model, canonical state),
                                            questions q0…, chunks of maxQuestionsPerRequest
            ─► RequestScheduler              FIFO, ≤ concurrency in flight, TokenBucket(maxRequestsPerMinute),
                                             paused after a final 429/503/529; cancelled tasks pruned
            ─► JevTransport.send             endpoint / direct / custom; per-attempt timeout, AbortSignal,
                                             retries with backoff or the server's delay (≤ 60 s)
            ─► on arrival                    runId + requestSeq must match; re-read the row: gone → dropped
                                             (row-missing), input changed → stale, destination changed → stale
                                             + manual; else parseJevAnswer → evaluateAIPolicy → store record
            ─► onResult / onRunProgress / onRunEnd
```

- **Store** (`engine/store.ts`): one record per `(rowId, columnId)`, never per display row. Statuses in flight are `queued` and `pending`; decided ones are `suggested`, `review` and `withheld`. Each enqueue bumps `requestSeq` and keeps the previous record, which `cancel` restores. A record keeps its identity (question fingerprint, input fingerprint, model), the destination snapshot, timings and, once committed, a commit id.
- **Transport** (`transport/client.ts`): every mode sends the same `JevRequest`. The endpoint client adds `connection.headers()` on each attempt; the direct client posts to `${baseURL}/v1/systemone` with a bearer key, refuses in a browser without `dangerouslyAllowBrowser` (no request), warns once per page with it, turns a browser network failure into a `network` error pointing to endpoint mode, and redacts the key from error text. Every result and error carries `x-typesafe-request-id` when present.
- **Scheduler** (`engine/scheduler.ts`, `token-bucket.ts`): limits are read again before every dispatch, so `setConfig` applies to queued work. The bucket holds `max(1, ceil(maxRequestsPerMinute / 60))` tokens and starts full. A final 429, 503 or 529 pauses the whole queue for `min(server delay ?? backoff.maxMs, 60 s)`.
- **Engine API** (internal): `plan`, `run`, `fill`, `retry` (failed cells, same scope and mode), `rerunStale`, `cancel`, `reject`, `recordCommit`, `markEdited`, `notifyRowsChanged`, `setConfig`, `getRecord`, `subscribe`, `metadata` and `dispose`. `recordCommit` reserves a write: WP-AI3's commit path calls it after its guards and immediately before writing, and writes only the cells it returns in `committed`. It refuses an already-committed result (`commit-blocked`); the other guards run in the commit path. WP-AI3 also exposed `planRerun(status, target?)`, which `retry` and `rerunStale` now run through, so the session can report a re-run's plan.
- **Callbacks** go through one `notify` helper: a throwing app callback is rethrown in a microtask, so it reaches the console without stopping the engine.

### Grid integration (WP-AI3)

The user-facing behaviour is in API.md ("Quick start (`aiFill` prop)", "Rows, identity and staleness", "Committing, validation and undo"). This is how it is built.

**The prop and the lazy controller.** `DataEditorAllImpl` (`src/data-editor-all.tsx`, exported as `DataEditor`) takes `aiFill?: AIFillConfig`. Five hooks run on every render whether or not it is set: a `bridge` state, refs to the core grid's handle and to the API, and two stable callbacks (the merged ref and `onBridge`). Every other AI hook is in the lazy controller. While `aiFill` is set it also renders `<Suspense fallback={null}><AIFillController …/></Suspense>` as a sibling of the core `DataEditor`, where `AIFillController = React.lazy(() => import("./ai-fill/react/controller.js"))`. Setting or clearing the prop only adds or removes that sibling, so the grid is never remounted.

```
render DataEditor(aiFill)
  ├─ core DataEditor ◄── props = bridge ? bridge.compose(rest, aiFill) : rest
  │                      ref   = aiFill ? mergedRef : app ref
  └─ Suspense ─► AIFillController (lazy chunk)
                   ├─ useState(new AIFillSession(gridRef)); session.update(props, config) each render
                   ├─ layout effect: session.attach(onBridge) → new AIFillEngine(config, AIFillGridHost)
                   │                  → onBridge({ api, compose }) → setBridge → re-render with composed props
                   │                  → config.onReady(api) once;  cleanup: session.detach()
                   └─ layout effect: session.configure(config, columns) → engine.setConfig on change
```

- **Before the controller loads** the grid gets the app's props unchanged and `ref.current.aiFill` is `undefined`.
- **Detach** (clearing `aiFill`, or unmounting) disposes the engine (cancelling every run, which aborts in-flight requests) and discards it with its records, clears the session's runs and commits, and calls `onBridge(undefined)`, so the grid gets the app's props again.
- **Unset**, `DataEditor` passes `{...rest}` and the app's own ref. `test/ai-fill/unconfigured-grid.test.tsx` (committed with its snapshot in `a3390df`, before the prop existed) checks that the DOM, the canvas calls and every app callback are byte-identical, that the controller module is never imported and nothing is fetched, that the ref is the core handle with no `aiFill` key, and that every app prop reaches the core grid with the same identity.

**The bridge and composition** (`react/bridge.ts`, `session.ts` `compose`). The bridge module is the only AI Fill module in the initial bundle. It holds types and `linkAIFillRef`. `compose` is a plain function called during render with the app's props. It returns a copy with these replaced (the SPST-17 A1 table):

| Prop | Composition |
| --- | --- |
| `columns` | AI columns get `hasMenu: true` in a shallow copy, memoized on the app's `columns` and the AI column set |
| `drawCell` | calls the app's `drawCell` (or `drawContent`), then `drawAICell` for cells with a record |
| `drawHeader` | calls the app's, then `drawAIHeaderBadge` (a ✦ left of the menu button) on AI columns |
| `onCellsEdited` | always set: observes the edited locations, then returns the app's return value (`undefined` without one) |
| `onCellEdited` | only when the app passes one: observes, then calls it |
| `onKeyDown` | the app's first, with `preventDefault` / `cancel` spied; if neither was called, the shortcuts (Mod+Enter accept, Mod+Backspace reject, Mod+Alt+F fill; Mod is ⌘ on macOS, Ctrl elsewhere; never with Shift) |
| `gridSelection`, `onGridSelectionChange` | untouched when the app controls the selection; wrapped to observe when the app only listens; when it passes neither, AI Fill holds the selection (`heldSelection`) and passes both |

`getCellContent`, `validateCell`, `rows` and the menu callbacks (`onHeaderMenuClick`, `onHeaderContextMenu`, `onCellContextMenu`) pass through untouched until WP-AI4. Each wrapper is memoized on the app handler it wraps (`Memo` in `session.ts`), so it keeps its identity while the app's does. The session keeps the latest unwrapped app props (`update`), and its own writes call the app's handlers directly, so they aren't observed as user edits.

**The merged ref.** With `aiFill` set, the core grid gets `mergedRef`, which stores the core handle and calls `linkAIFillRef(appRef, handle, api)`: the app's ref gets `{ ...handle, aiFill: api }` once the API exists, and the plain handle before (the handle's methods are closures, so a shallow copy is safe). `onBridge` calls it again when the API appears or goes away. The callback is stable per app `ref`.

**Reading the grid** (`AIFillGridHost`). Everything is addressed by `(rowId, columnId)`. `rowIndex(rowId)` uses `rows.getRowIndex` when given and accepts its answer only if it is an integer in range whose `getRowId` is the same id; otherwise it scans `getRowId` over the rows once and caches the map until a microtask clears it. The session calls `invalidate()` before fills, commits, reverts, edits and `notifyRowsChanged`. `colIndex` maps column ids, cached per `columns` array. `readCell` returns `undefined` when the row or column isn't displayed, so to the engine a filtered-out row looks the same as a deleted one.

**Fills** (`session.fill`). `selection` and `selection-empty` take the AI cells in the selection (the app's, the last one observed, or the held one): whole selected columns, selected rows × AI columns, and the current range and range stack, de-duplicated. `column-empty` and `column` need `rowScope` (otherwise a `configuration` error and nothing is sent); `"displayed"` means every displayed row, and a list is used as given, so rows that aren't displayed are skipped as `unloaded` by `engine.plan`. The engine skips a column whose `fillScopes` doesn't list the scope as `not-applicable`.

**Targets** (`session.resolve`). The method passes the statuses it acts on (`accept`: `suggested`, `review`; `reject`: those plus `withheld`, `stale`; `retry`: `error`; `rerunStale`: `stale`; `clear`: every status except in flight), and the target picks the cells: `{ cells }` as given, `{ selection: true }` the AI cells in the selection, `{ column, filter }` every record in the store for that column. A column filter narrows the statuses: `all` keeps them, `eligible` keeps only `suggested`, `review` only `review`. `accept` then drops a column target's rows that aren't displayed; `reject` and `clear` don't, so on a column they also reach results on filtered-out rows. `retry` and `rerunStale` go through `engine.planRerun`, whose `plan()` skips a row that isn't displayed as `unloaded`.

**Store to repaint.** The session subscribes to the engine's record changes. Changed cells are queued and flushed in one microtask: each is located by id and repainted with `ref.updateCells` (no animation loop; `drawAICell` is static). The same flush runs auto-apply: a record that just settled from its own request (its `requestSeq` matches the one seen in flight) as `suggested` with an `apply-candidate` decision in an `apply`-mode run, not manual and not committed, is committed with `source: "auto-apply"`. A result re-decided by a policy change never auto-applies.

**The commit path** (`session.commit`, SPST-17 §8.6 and A5), for `accept` and auto-apply:

1. Results without a value to write (a semantic outcome without `value`, the Noul middle band) are marked `accepted` with a `reviewed-N` commit id, with no write and no `onCommit` (auto-apply skips them).
2. For each other result, `prepare` re-checks: the grid has an edit handler (else `read-only`); the row is found by id (else the engine's `notifyRowsChanged([rowId])` drops it as `row-missing`); `output.toCell` builds the cell (a throw or `undefined` is `type-mismatch`); then `checkCommitGuards` with a freshly computed input fingerprint: not already committed, identity unchanged (else the record is marked stale), destination unchanged (else manual and stale), writable, `overwriteAllows`, and `validateCell` (a returned cell is used).
3. Blocked cells get a `blocked` reason (reported by `getCellState` until the record's next request) and one `onError` per reason: `type-mismatch`, or `commit-blocked` for the rest.
4. If there is no selection, one covering the written cells is set through the app's `onGridSelectionChange` (or the held selection), so `useUndoRedo` records the batch.
5. `engine.recordCommit` records the commit and calls `onCommit`, and only the cells it returns are written: one `onCellsEdited(items)`, and unless it returned `true`, one `onCellEdited` per item, in the same tick. The cells are then repainted, and AI columns whose `sources` include a written column become stale.

**Invalidation.** Edits reported through the composed `onCellsEdited` / `onCellEdited` go to `engine.markEdited`: an edited AI cell becomes `manual` (and stale if it was pending or decided), and results whose `sources` include the edited column become stale. `api.notifyRowsChanged` invalidates the row map and calls the engine's `notifyRowsChanged`, which re-fingerprints records and drops decided records whose row isn't readable, filtered-out rows included. A changed `aiFill` object goes to `engine.setConfig` (re-decide on a policy change, stale on a question or model change, drop a removed column).

**Undo.**

- `useUndoRedo` (source) works unchanged, because commits go through the app's handlers as one synchronous batch with a selection set first. `packages/source/test/ai-fill-undo.test.tsx` checks it with the real hook: a bulk accept is one undo step, undo restores every cell, redo writes them again once, and no suggestion comes back. `commit-undo-contract.test.tsx` in core checks the batch contract itself.
- Limits: `useUndoRedo` keys edits by display position (Jake's answer 4 kept it that way), so undo after a re-sort or filter writes to positions, not rows. If the app's `onCellsEdited` returns `true`, the per-cell calls it records don't happen (the same as paste).
- `api.revertCommit(commitId)` is the id-safe alternative. The session keeps each commit's written cells (`previous`, `next`, ids) in memory. A revert re-locates each cell by id and restores `previous` only where the cell still holds `next`, both cells are writable, and `validateCell` allows it, through the same selection-and-batch path. The commit is forgotten once at least one cell is restored. Records stay `accepted`, so nothing is suggested again. Commits are lost on detach, and nothing persists across reloads.

### Entry points (`/server` and `/testing`)

Core's `package.json` `exports`:

| Subpath | `types` | `import` | `require` |
| --- | --- | --- | --- |
| `.` | `dist/dts/index.d.ts` | `dist/esm/index.js` | `dist/cjs/index.js` |
| `./index.css` | — | `dist/index.css` | `dist/index.css` |
| `./server` | `dist/dts/ai-fill/server/index.d.ts` | `dist/esm/ai-fill/server/index.js` | `dist/cjs/ai-fill/server/index.js` |
| `./testing` | `dist/dts/ai-fill/testing/index.d.ts` | `dist/esm/ai-fill/testing/index.js` | `dist/cjs/ai-fill/testing/index.js` |

Core is `"type": "module"`, and `tsconfig.cjs.json` compiles with `module: Node16`, so `dist/cjs` is ES modules too. `require("@specstory/ai-data-grid/server")` therefore works only through Node's `require(esm)` (Node 20.19+, 22.12+, 24); `test/ai-fill/server-load.test.ts` checks both `import()` and `createRequire` of the built files in a Node environment. `cycle-check` runs from `src/index.ts`, `src/ai-fill/server/index.ts` and `src/ai-fill/testing/index.ts`.

### Endpoint contract and server helper

- **Contract.** The browser sends `POST <url>` with Jev's own `JevRequest` body (`{ model, state, questions }`). Success is Jev's response body unchanged, with `x-typesafe-request-id`. Failure is a non-2xx status with `JevEndpointErrorBody` (`{ error: { type, message, retryAfterMs?, detail? } }`), and Jev's status and `Retry-After` / `retry-after-ms` headers forwarded, so the client maps it exactly as it maps a direct Jev error.
- **`createJevHandler`** (`server/index.ts`) is a Fetch-API `(Request) => Promise<Response>`. Safeguards, in order: POST only (405); `authorize` must be passed at construction (`TypeError` otherwise) and must return exactly `true` per request (403, also on a throw); an empty `apiKey` gives 500 `server_configuration` per request rather than failing at load, so a Next build without the key still works; `maxBodyBytes` (256,000) is checked against `content-length` and again while streaming (413); the body must be JSON of the right shape (400); `maxQuestions` (32, 413); `allowedModels` (`["jev-latest"]`, 400 `model_not_allowed`); `timeoutMs` (20,000, then 504); an unreachable Jev, or a caller that aborted its request, is 502 (an already-aborted request never reaches Jev). The timeout and the caller's `request.signal` race the whole upstream step, `fetch` plus the body read, like `withTimeout` in `transport/client.ts`: the handler answers on time even when a custom `fetch` or the body ignores its abort signal, and the abandoned promise's late result or rejection is ignored. It forwards only `{ state, model, questions }` with its own `authorization`, `content-type` and `accept` headers, adds no CORS headers, and logs nothing.
- **Keeping the key out of responses** (`server/index.ts`): the key, as the literal string and in its JSON-escaped form, is replaced with `[redacted]` in a successful body, which is otherwise passed through byte for byte. In an error, `type`, `message` and every string in `detail` (object keys included) are redacted. Forwarded headers (`x-typesafe-request-id`, plus `retry-after` and `retry-after-ms` on errors) are dropped when their value contains the key, and a request id is forwarded only if it matches `/^[!-~]{1,128}$/` (1–128 visible ASCII characters). The error body's `retryAfterMs` is computed from the forwarded headers only.
- **`toNodeListener`** adapts the handler to Node `http`/Express. It uses `req.body` when middleware already parsed it, otherwise it streams the request.

### Error taxonomy

`transport/errors.ts` turns every failure into an `AIFillError` kind, the same for direct Jev and for an endpoint:

| Source | Kind | Retryable |
| --- | --- | --- |
| HTTP 400, 404, 405; an error body with `type: "server_configuration"` (the server helper's 500) | `configuration` | no |
| HTTP 401, 403 | `authentication` (aborts the whole run) | no |
| HTTP 408, 504; no response within `timeoutMs` | `timeout` | yes |
| HTTP 413; state over `maxStateChars` | `input-too-large` | no |
| HTTP 422 and other 4xx | `invalid-request` | no |
| HTTP 429 | `rate-limit` | yes |
| HTTP 503, 529 | `overloaded` | yes |
| other 5xx; the request couldn't be sent | `network` | yes |
| the response has no answer for a question id | `evaluation` | yes |
| the body isn't JSON or has no `answers`; the answer fails `parseJevAnswer` | `malformed` | no |

Engine-side kinds (`type-mismatch`, `policy-callback`, `commit-blocked`, and `configuration` from config issues and throwing callbacks) are listed in API.md's Errors table. Jev's error body shape isn't fully documented, so the message is read from `error.message`, `message` or `detail`.

### Scripts and test infrastructure

- **`scripts/jev-dev-proxy.mjs`** (manual only, unpublished): `createJevHandler` plus `toNodeListener` behind `node:http` on `0.0.0.0:8787` by default, with its own CORS layer. The origin allowlist is `http://localhost:*`, `http://127.0.0.1:*` and exact `--allow-origin` values (never `*` or `null`); `authorize` checks the same list, so a request with no allowed `Origin` never reaches Jev. It logs method, path, status and time only. Commands are in [CONTRIBUTING.md](CONTRIBUTING.md#live-jev-scripts-manual-only).
- **`scripts/jev-live-check.mjs`** (manual only, for WP-AI5): one direct-mode request with three questions about a synthetic contact, with `maxRetries: 0`, plus one bad-key request expecting 401 (2 HTTP requests, 1 with `--skip-401`); `--dry-run` sends nothing. It imports `buildQuestion` and `createJevTransport` from `packages/core/dist/esm/ai-fill/`, so it needs a build.
- **Live-Jev guard.** `vitest.setup.ts` installs `test/ai-fill/live-jev-guard.ts` for every core test: it wraps `fetch`, rejects any URL on `typesafe.ai` or a subdomain, and fails the test in `afterEach` even if the code under test swallowed the rejection. `no-live-jev.test.ts` checks it.
- **Node-environment tests.** `vitest.setup.ts` now runs its DOM-only setup (`vitest-canvas-mock`, `ResizeObserver`, `Image.decode`) only when `window` exists, so files marked `// @vitest-environment node` (`boundaries`, `server`, `server-load`) run in plain Node. Under jsdom it behaves as before.
- **Mock Jev** (`testing/index.ts`): rules, fixture replay, generated answers seeded by seed, state and question, latency, error injection for every transport kind and a call log that never records auth values. Its `fetch` speaks Jev's protocol for URLs ending in `/v1/systemone` and the endpoint protocol otherwise, without the handler's checks. It reports `jev-mock-1.0.0` for `jev-latest` and `jev-preview`.

### Guard tests

- `test/ai-fill/boundaries.test.ts` parses every `src/**/*.ts(x)` with the TypeScript compiler and enforces the import rules: (1) `ai-fill/` never imports `src/index.ts`, `src/data-editor-all.tsx` or `@specstory/*`; (2) only `src/index.ts` and `src/data-editor-all.tsx` import `ai-fill/` (plus type-only imports from `src/data-editor/data-editor.tsx`); (3) the graph reachable from `ai-fill/server/index.ts` (relative imports, type-only included) has no `react`, `react-dom` or `@linaria/*` import, no `.tsx` file and no module-level `window` or `document` reference; (4) `ai-fill/testing/` imports only `testing/`, `contract/`, `identity/` and `transport/`; and core never imports cells or source. It runs in the Node environment.
- `test/public-api-exports.test.ts` pins `.`, `/server` and `/testing` (see [How the API is guarded](#how-the-api-is-guarded)).
- `test/ai-fill/server-load.test.ts` loads the built `/server` with `import()` and `require()` in Node and runs a request through it with a fake `fetch`. Like the bundle budget, it needs `npm run build` first.
- `test/ai-fill/bundle-budget.test.ts`, see below.

### Bundle budget

AI Fill must cost little for apps that render `DataEditor` without `aiFill`. `test/ai-fill/bundle-budget.test.ts` bundles an entry that imports `DataEditor` and `dist/index.css` from core's built `dist/esm`, with the root esbuild CLI (0.25.12): `--bundle --minify --splitting --format=esm`, with `react`, `react-dom`, `marked`, `lodash` and `react-responsive-carousel` external. Sizes are GNU `gzip -9` of the concatenated output files. It uses the CLI because esbuild's JS API refuses to run under jsdom.

| Measure | Baseline (SPST-17 A7, `main` at `a0a121c`) | Measured by the test (`main`, PR #16 and PR #17) | Measured at PR #18 (WP-AI3) | Limit |
| --- | --- | --- | --- | --- |
| Initial JS (entry chunk plus the chunks it imports statically) | 70,374 B | 70,305 B | 70,624 B (+319 B) | 71,900 B (+1.5 KB) |
| CSS | 2,052 B | 2,044 B | 2,044 B | 4,600 B (+2.5 KB) |
| AI Fill modules in the initial chunks | — | none | at most `ai-fill/react/bridge.js` (the test passes) | none except `ai-fill/react/bridge.js`; never `transport/`, `engine/`, `server/` or `testing/` (added in WP-AI2) |
| Lazy AI Fill chunks | — | 0 B | 24,244 B | 40,000 B |

The A7 figures came from a slightly different measurement than the test's (the test gzips the concatenated files); the limits are A7's. It reads `dist/`, so it needs `npm run build` first. CI builds before testing. WP-AI3's numbers were measured on 2026-09-25 from a clean `npm ci` and `npm run build` at `31660d73`, and the lazy chunks again on 2026-09-26 at `869d65de` after fix round 1 (initial JS and CSS unchanged). The initial JS grew by 319 B for the lazy import, the prop wiring and the bridge. The lazy chunks (the controller, session, host, drawing and the engine with everything it imports) are 24,244 B, leaving 15,756 B for WP-AI4's UI. WP-AI4 (the CSS and the UI) is where the numbers move next. In the Implementor's `npm run test-projects` run, Vite also emitted the controller as its own chunk (about 23.8 kB gzip) in `test-projects/vite-app`.

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
- **Browsers can't call Jev directly today.** TypeSafe's API rejects CORS preflights from every origin tried during planning (SPST-17 §1), so direct mode only works from Node. In a browser it refuses without `dangerouslyAllowBrowser`, and with it a call fails as a `network` error that points to endpoint mode. Browser apps need endpoint mode (their own server, for example with `createJevHandler`) or, for demos, `scripts/jev-dev-proxy.mjs`.
- **AI Fill has no built-in UI yet.** A grid with `aiFill` fills, draws, commits and reverts, but fills and accepts start only from `ref.current.aiFill` and the keyboard shortcuts. The menus, confirm dialog, status bar and inspector are WP-AI4, and the menu callbacks pass through untouched until then.
- **Documented but not yet acted on:** `execution.confirmAbove` (WP-AI4's confirm dialog). API.md and the TSDoc say so.
- **A filtered-out row counts as a deleted row** wherever AI Fill has to find it (accepted for WP-AI3 by the Orchestrator). The only deletion signal is that `getRowId` / `getRowIndex` no longer reach the id among the displayed rows. So an answer that arrives while its row is filtered out is dropped as `row-missing`; `notifyRowsChanged()` while a filter is on drops the decided results of hidden rows; and an `accept({ cells })` naming a hidden row drops that result. A decided result on a hidden row otherwise keeps its record, and "Accept all eligible" skips it. SPST-17 §5 said a filtered-out row keeps its record in every case. Follow-up: an optional app signal for "row still exists".
- **`useUndoRedo` is position-based.** Undo after a re-sort or filter writes to display positions, and an `onCellsEdited` that returns `true` hides AI Fill's writes from it, as with paste. `revertCommit` is the id-safe path. Commits live in memory only.
- **`npm test` in core needs a build.** `bundle-budget.test.ts` and `server-load.test.ts` read `dist/` and fail on a fresh clone until `npm run build` has run, and they test stale output after source changes. The bundle budget also needs the `gzip` binary.
- **Lazy-chunk headroom.** The lazy AI chunks are 24,244 B gzip at WP-AI3, leaving 15,756 B of the 40,000 B cap for WP-AI4's UI.
- **`AIFillRun` and `AIActiveRun` aren't exported.** They are the return type of `fill` / `retry` / `rerunStale` and the element type of `AIRunState.active`. Apps can reach them only through those types (for example `ReturnType<AIFillApi["fill"]>`).
- **`require("@specstory/ai-data-grid/server")` needs `require(esm)`** (Node 20.19+, 22.12+ or 24), because core's `dist/cjs` is ES modules. Older Node versions must use `import`.
- **Jev's error-body shape isn't fully documented,** so the transport reads the message from `error.message`, `message` or `detail`. A new shape would still map by status, with a generic message.
- **`scripts/jev-live-check.mjs`'s header comment** counts "at most 4 live calls (3 without --skip-401)", one per question; it sends 2 HTTP requests (1 with `--skip-401`). It also points to `docs/content/docs/ai-fill/live-validation.mdx`, which WP-AI5 hasn't created yet.

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
| 2026-09-25 | SPST-17 Amendment 1 | Apps opt in with an optional `aiFill` prop on `DataEditor`, loaded lazily through a small static bridge. An unconfigured grid is unchanged. (Built in WP-AI3, PR #18; see below.) | Keeps the 6.x-compatible API and costs apps without AI Fill almost nothing. |
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
| 2026-09-25 | SPST-17 §6, SPST-23 / PR #17 | Call Jev over raw HTTP with our own retry: per-attempt timeout, exponential backoff 500 ms → 5 s with 0.25 jitter, server delays (`retry-after-ms`, `Retry-After`, body `retryAfterMs`) honored up to 60 s, and a queue-wide pause after a final 429/503/529. | The grid needs cancellation, per-cell settling and one scheduler across columns, and core takes no SDK dependency. Capping server delays keeps a bad header from stalling a run. |
| 2026-09-25 | SPST-17 §7, SPST-23 / PR #17 | `createJevHandler` requires `authorize` at construction and throws without it; an empty `apiKey` is a per-request 500 instead of a construction error. | An endpoint that spends the key must never ship open by accident. Next.js evaluates route modules at build time, often without the key, so an empty key can't throw. |
| 2026-09-25 | SPST-16 (plan default), SPST-23 / PR #17 | One row per request; a row's columns with the same state and model share a request (`q0`, `q1`, …, up to `maxQuestionsPerRequest`). | Rows never mix in one Jev evaluation, so a cell's answer depends only on its row. Sharing a request across columns cuts calls without that risk. |
| 2026-09-25 | SPST-17 Amendment 1 (A3), SPST-23 / PR #17 | The server helper and the mock ship as the core subpaths `@specstory/ai-data-grid/server` and `/testing`. Their exports are pinned exactly; the `.` naming rule doesn't apply to them, so `toNodeListener` keeps its generic name. | One package (Jake's decision), with server and test code kept out of the browser entry. A subpath is already its own namespace. |
| 2026-09-25 | SPST-23 / PR #17 | Core's `dist/cjs` stays ES modules, so `require` of `/server` relies on Node's `require(esm)`, checked by `server-load.test.ts`. | It matches how the rest of core is built; changing the CJS build is out of scope for AI Fill. |
| 2026-09-25 | SPST-16 (Jake, answer 2), SPST-23 / PR #17 | Browser demos use an unpublished local dev proxy (`scripts/jev-dev-proxy.mjs`) whose CORS and `authorize` allow only localhost, 127.0.0.1 and exact `--allow-origin` origins, never `*`, and refuse requests without an allowed `Origin`. | TypeSafe rejects browser preflights. An allowlist keeps other sites (and `curl` without an origin) from spending the developer's key through the proxy. |
| 2026-09-25 | SPST-17 Amendment 1 (A-Q3), SPST-23 / PR #17 | Add a one-file `/server` route to `test-projects/next-app` (`app/api/jev/route.ts`) whose `authorize` rejects everything. | `next build` then proves the subpath resolves and type-checks from the tarball, with no live call. |
| 2026-09-25 | SPST-23 / PR #17 | Tests run behind a live-Jev `fetch` guard in `vitest.setup.ts`, and that setup skips its DOM-only part when there's no `window`, so `// @vitest-environment node` works in core. | Tests must never reach `api.typesafe.ai`, even by mistake. `/server` must be tested without a DOM. |
| 2026-09-25 | SPST-23 / PR #17 | Engine details: the token bucket allows a burst of one second's worth of requests; the queue pause falls back to `backoff.maxMs` without a server delay; cancel restores each cell's previous record; re-evaluation after `setConfig` doesn't fire `onResult`; a throwing app callback is rethrown in a microtask; a result that was already committed is refused as `commit-blocked`. | Smooth rate limiting without starving the first requests; cancel leaves the grid as it was; `onResult` reports answers from Jev, not policy replays; app bugs stay visible without breaking AI Fill; a result is written at most once. |
| 2026-09-25 | SPST-23 / PR #17 | `AIFillRunSummary` wasn't added; WP-AI1's `AIRunSummary` is the run summary type. `AIResultEvent` gained an optional `reason: "row-missing"`. | Avoids a duplicate public type. The engine needs a way to report an answer dropped because its row is gone. |
| 2026-09-25 | SPST-17 Amendment 1 (A1), SPST-26 / PR #18 | Built as planned: an optional `aiFill` prop on `DataEditor` (`data-editor-all.tsx`), with no `AIFillDataEditor` wrapper component. `DataEditorRef` gains an optional `aiFill` member. | Apps keep their existing `DataEditor` and ref and add one prop; there is no second component to migrate to. |
| 2026-09-25 | SPST-17 Amendment 1 (A1, A7), SPST-26 / PR #18 | The controller loads with `React.lazy` in a `Suspense` sibling of the grid, and only the static `react/bridge.ts` is in the initial bundle. Until it loads, the grid renders with the app's props. | Keeps apps without `aiFill` within the budget (+319 B initial JS at WP-AI3). A sibling rather than a wrapper means setting or clearing the prop never remounts the grid. |
| 2026-09-25 | SPST-17 Amendment 1 (A1), SPST-26 / PR #18 | `useAIFill` is not public. The controller's logic is a plain class (`AIFillSession`), and the API is only `ref.current.aiFill` and `onReady`. | One way in for apps, and no hook API to keep compatible. A class is testable without React and keeps the lazy chunk self-contained. |
| 2026-09-25 | SPST-17 A5, SPST-26 / PR #18 | Before a commit or revert, if the grid has no selection, AI Fill sets one covering the written cells (through the app's `onGridSelectionChange`, or its held selection). | `useUndoRedo` ignores edits made without a selection. With one set first, a bulk accept is one undo step. |
| 2026-09-25 | SPST-17 Amendment 1 (A-Q1), SPST-26 / PR #18 | Add `packages/source/test/ai-fill-undo.test.tsx`, a round trip through the real `useUndoRedo`, taking source to 9 tests (exports stay at 5). It imports core by package name, so it tests core's built `dist/`. | The undo contract spans two packages; a core-only test with a fake hook couldn't prove it. |
| 2026-09-25 | SPST-26 / PR #18 | `src/ai-fill/index.ts` exports the five public functions as constants read from module namespaces, with their TSDoc on those constants, instead of `export { … } from`. | With re-exports, esbuild's code splitting put the modules in a grid's initial chunk once the lazy chunk also imported them (78,544 B initial JS, over the limit). |
| 2026-09-25 | SPST-26 / PR #18 | A `rows.getRowIndex` answer is used only when `getRowId` at that index returns the same id; otherwise the row counts as missing. Without `getRowIndex`, a per-task scan of `getRowId` is used. | A wrong or stale index can't redirect a read or a write to another row. |
| 2026-09-25 | SPST-26 / PR #18 | A `{ column }` target for `accept` covers only displayed rows. | "Accept all eligible" must not write to rows the user can't see. |
| 2026-09-25 | SPST-26 / PR #18, Orchestrator | An answer for a row that isn't displayed is dropped as `row-missing`, like a deleted row. Accepted as a known limitation of WP-AI3, with a follow-up. | The only deletion signal (`getRowIndex(id)` is `undefined`) can't tell a filtered row from a deleted one, and writing to a row that might be gone is worse than asking to fill it again. |
| 2026-09-25 | SPST-26 / PR #18 | `onCellsEdited` is always composed (AI Fill needs to see edits even when the app has no handler) and returns the app's value, or `undefined` without one. `onCellEdited` is composed only when the app passes it. | Returning `undefined` keeps the grid's default of calling `onCellEdited`, so an app with only `onCellEdited` behaves as before, and `true` still suppresses the per-cell calls. |
| 2026-09-25 | SPST-26 / PR #18 | A grid with neither `onCellEdited` nor `onCellsEdited` can't commit: every write is blocked as `read-only`. | AI Fill writes only through the app's handlers, never into the app's data. |
| 2026-09-25 | SPST-26 / PR #18 | A `toCell` failure at commit time is reported as `type-mismatch`, not `commit-blocked`. | It is the same failure as a value that doesn't fit when the answer arrives, and apps handle it the same way. |
| 2026-09-25 | SPST-26 / PR #18 | A result without a value to write (a semantic outcome without `value`, or the Noul middle band) is marked `accepted` on accept, with no write and no `onCommit`. Auto-apply skips it. | The user has reviewed it, so it shouldn't stay a suggestion, but there is nothing to write. |
| 2026-09-26 | SPST-26 / PR #18 (fix round 1), Orchestrator decision 2026-09-25 23:48 UTC | For a `{ column, filter }` target the method decides which statuses count, as for every other target (`accept`: `suggested`, `review`; `reject`: also `withheld`, `stale`; `retry`: `error`; `rerunStale`: `stale`; `clear`: every status except in flight), and the filter narrows them: `all` keeps them all, `eligible` only `suggested`, `review` only `review`. `accept` is unchanged. | The first build replaced the method's statuses with the filter's, so `retry` / `rerunStale` on a column re-ran nothing and `reject` / `clear` skipped withheld, failed and stale results; WP-AI4's column menu needs them. |
| 2026-09-26 | SPST-25 (verification round 1), SPST-23 / PR #17 | `createJevHandler` races the whole upstream step (`fetch` and body read) against `timeoutMs` and the caller's signal; a caller abort is a 502 `upstream_unreachable`. The key is redacted from a successful body (literal and JSON-escaped), forwarded headers that contain it are dropped rather than rewritten, and a request id is forwarded only if it's 1–128 visible ASCII characters (otherwise the client gets no `requestId`). | Verification round 1 found that the helper could hang past `timeoutMs` when `fetch` or the body ignored abort, and could echo the key to the caller in a forwarded header. A `[redacted]` request id or `Retry-After` is no use to a client, so dropping is safer than rewriting. |

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
- AI Fill: WP-AI4 (built-in UI, including `confirmAbove` and the AI menus) and WP-AI5 (Storybook, docs site guide, live check). Remove the "in development" note from `packages/core/API.md` when the built-in UI lands.
- AI Fill: an optional app signal for "row still exists", so a result or answer for a filtered-out row can be kept instead of dropped as `row-missing` (SPST-17 §5).
- Fix `scripts/jev-live-check.mjs`'s header comment (call count, and the `live-validation.mdx` path) when WP-AI5 creates that page.
