# AS-BUILT: AI Data Grid

**Last updated:** 2026-09-25 (SPST-8, the Documenter step for SPST-2 / PR #12)
**Covers:** the rebranded library packages, license and attribution files, toolchain, CI and Storybook (work package WP1). React 19 only (WP2), hosted Storybook (WP3) and the docs site (WP4) are documented when they land.

For how to work on these parts, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Packages and workspaces

### Layout

The root `package.json` (name `root`, version `7.0.0`) declares three npm workspaces. All three packages are at `7.0.0`, have `author: SpecStory`, and point `repository`, `homepage` and `bugs` at `specstoryai/ai-data-grid`.

| Workspace | npm name | Depends on | Peer dependencies |
| --- | --- | --- | --- |
| `packages/core` | `@specstory/ai-data-grid` | `@linaria/react`, `canvas-hypertxt`, `react-number-format` | `react`, `react-dom` (`^16.12.0 \|\| 17.x \|\| 18.x \|\| 19.x`), `lodash`, `marked`, `react-responsive-carousel` |
| `packages/cells` | `@specstory/ai-data-grid-cells` | `@specstory/ai-data-grid` `7.0.0` (exact), `@linaria/react`, `@toast-ui/editor`, `@toast-ui/react-editor`, `react-select` | `react`, `react-dom` (same range) |
| `packages/source` | `@specstory/ai-data-grid-source` | `@specstory/ai-data-grid` `7.0.0` (exact) | `react`, `react-dom` (same range), `lodash` |

None of them is published to npm yet.

### Build outputs

Each package's `build.sh` uses `config/build-util.sh`:

1. `tsc` compiles `esm` and `cjs` in parallel into `dist/esm-tmp` and `dist/cjs-tmp`, with declarations into a shared `dist/dts-tmp`.
2. `wyw-in-js` extracts the Linaria styles into per-module `.css` files, and the `import "*.css"` lines are then removed from the JS.
3. The tmp directories replace `dist/esm`, `dist/cjs` and `dist/dts`.
4. `generate_index_css` writes `dist/index.css`, which `@import`s every extracted `.css` file.

So consumers must import `dist/index.css` themselves: `@specstory/ai-data-grid/dist/index.css` for core (also exported as `./index.css`), and `@specstory/ai-data-grid-cells/dist/index.css` for the cells' editor styles. `source` has no CSS. Entry points: `main` → `dist/cjs/index.js`, `module`/`browser` → `dist/esm/index.js`, `types` → `dist/dts/index.d.ts`, all mirrored in `exports`.

### What ships in each tarball (`npm pack --dry-run`)

| Package | `files` | Contents |
| --- | --- | --- |
| core | not set (`.npmignore` excludes only `tsconfig*` and `coverage/*`) | 768 files: `dist/`, plus `src/` (stories and docs included), `test/`, `API.md`, `CHANGELOG.md`, `build.sh`, ESLint and vitest config, `LICENSE`, `README.md` |
| cells | `["dist"]` | 120 files: `dist/`, `LICENSE`, `README.md`, `package.json` |
| source | `["dist"]` | 41 files: `dist/` (including two `tsconfig.*.tsbuildinfo` files), `LICENSE`, `README.md`, `package.json` |

This is unchanged from upstream apart from the names.

## Rebrand

### Renamed

- Package names: `@glideapps/glide-data-grid` → `@specstory/ai-data-grid`, `-cells` → `@specstory/ai-data-grid-cells`, `-source` → `@specstory/ai-data-grid-source`. Every import in `src/`, tests and stories uses the new names, except in `test-projects/`.
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

`packages/{core,cells,source}/test/public-api-exports.test.ts` build a TypeScript program for the package's `src/index.ts`, list the module's exports with the type checker, sort them, and compare them with a hard-coded `expectedExports` list taken from 6.0.4-alpha25: 151 names in core, 27 in cells, 5 in source. These add one test per package (core 388, cells 65, source 8; the baseline was 387, 64, 7). They check names only, not prop or type shapes.

## License and attribution

- Four `LICENSE` files (root, `packages/core`, `packages/cells`, `packages/source`) keep the MIT text and `Copyright (c) 2021 typeguard, Inc.`, with `Copyright (c) 2026 ai-data-grid contributors` on the next line. `npm pack --dry-run` lists `LICENSE` in all three packages.
- `THIRD_PARTY_NOTICES.md` lists Glide Data Grid (full MIT text), the `dequal` port by Luke Edwards (`packages/core/src/common/support.ts`) and the `use-callback-ref` pattern by Anton Korzunov (`packages/core/src/data-editor/use-initial-scroll-offset.ts`). The in-code attribution comments stay at both sites.
- The READMEs carry "Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed." The only other uses of the old names in the READMEs are the 6.x → 7.0.0 migration tables.

## Toolchain and lockfile

- Node 24 (`.nvmrc` = `24`), npm, no yarn. The root `packageManager` field (yarn) was removed.
- One lockfile: the root `package-lock.json`, regenerated so that `npm ci` passes. The per-package lockfiles were deleted. `.npmrc` sets `legacy-peer-deps=true`.
- `npm run build` builds all workspaces, then runs each workspace's `lint` (ESLint; core also runs `cycle-check` via `ts-helper` from `@glideapps/ts-helper`).

## CI

`.github/workflows/ci.yml`, job `test`, on `pull_request` and on `push` to `main`, `ubuntu-latest`, Node from `.nvmrc`: `npm ci` → `npm run build` → `npm test -- --run` → `npm run test-cells -- --run` → `npm run test-source -- --run`. Upstream's `node.js`, `beta`, `release` and `storybook` workflows and `.github/dependabot.yml` were deleted. `ci.yml` is not a required check on `main` yet.

## Storybook

- Storybook 9 with `@storybook/react-vite` (`.storybook/main.cjs`), stories from `**/src/**/*.stories.tsx`, Linaria through `@wyw-in-js/vite`.
- `npm start` runs `storybook dev -p 9009 --no-open` together with a core watcher. The dev server listens on all interfaces.
- `npm run build-storybook` builds the packages, then a static Storybook into `storybook-build/` (113 stories). The `MoreInfo` styled component exported from `packages/source/src/stories/use-data-source.stories.tsx` is kept out of the story list with `excludeStories`.
- Not hosted anywhere yet.

### Smoke test

`scripts/smoke-storybook.mjs` (`npm run smoke-storybook`) serves `storybook-build/` on `127.0.0.1` at a random port with a small `node:http` server, reads the story ids from `index.json`, opens each story's iframe in headless Chromium (Playwright, a root devDependency) and waits 1.5 s. A story fails when it logs a console error or page error that no substring in `errorAllowlist[storyId]` matches, or when it has no `<canvas>` and isn't in `noCanvasAllowlist`. `FIXED?` flags allowlist entries whose errors no longer occur. The allowlist has 8 entries: one image-cell demo with an undefined URL (404) and seven test-case stories that hotlink an Imgur image (403). Current result: 113 visited, 8 known, 0 unexpected, 0 without a canvas. It isn't run in CI.

## Known limitations and risks

- **React peer range is still 16.12–19** at this stage, while the 7.0.0 CHANGELOG section already says React 19 is required. WP2 narrows the range to `^19.0.0`.
- **`@glideapps/ts-helper` is still a core devDependency** (with its dependencies `@glideapps/graphs` and `@glideapps/ts-necessities` in the lockfile). It's the external tool behind `cycle-check`, not shipped code.
- **Emitted `.d.ts` files aren't byte-for-byte reproducible.** The `//# sourceMappingURL` trailer varies between builds because the parallel esm and cjs compiles share `dist/dts-tmp`. Pre-existing.
- **Failing `Vercel` status on PRs without `docs/`.** The docs Vercel project (WP4) builds every branch, and fails on branches that don't contain `docs/`. It stops once WP4 is on `main` and branches have merged it.
- **`test-projects/`, `test-18`, `test-19`, `test-projects` script.** `test-projects/` is broken and still uses the old package names. `test-18`/`test-19` reinstall React and Testing Library with `npm i -D`, rewriting `package.json` and the lockfile. WP2 removes or replaces them.
- **The core tarball ships source, tests and stories** because core has no `files` field (see above).
- **`.devcontainer/` is stale.** It pins a Node 14 image and runs a `.devcontainer/run.sh` that doesn't exist. It isn't documented as a way to work on the repo.
- `packages/cells/test/date-picker-cell.test.tsx` was fixed in WP1: it rendered the wrong cell and left a `findByDisplayValue` promise unawaited, which failed CI intermittently.
- 43 `npm audit` findings are open.

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

## Open follow-ups

- React 19 only: peer range `^19.0.0`, and remove or replace `test-projects/`, `test-18` and `test-19` (WP2, SPST-4).
- Deploy Storybook to Vercel and link it from the READMEs (WP3, SPST-5).
- Docs site (WP4, SPST-3), then link it from the READMEs.
- Rename the `glide-*` runtime identifiers in 8.0.
- Fix the 43 `npm audit` findings.
- Make `ci.yml` a required check on `main`.
- Replace `@glideapps/ts-helper` for `cycle-check`.
- Decide whether the core tarball should get a `files` field, and fix or delete `.devcontainer/`.
- First npm publish under `@specstory` (needs Jake's approval).
