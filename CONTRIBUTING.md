# Contributing to AI Data Grid

This guide is for anyone, human or agent, who changes code in this repository. For what is built and why, see [AS-BUILT.md](AS-BUILT.md). User documentation is in [README.md](README.md).

AI Data Grid is a hard fork of Glide Data Grid (forked from upstream `main` at `0875d78c`, 6.0.4-alpha25, with upstream history kept). Upstream is https://github.com/glideapps/glide-data-grid. You can add it as a read-only `upstream` remote to compare or cherry-pick. Never push to it.

## Setup

- **Node 24** (the version in `.nvmrc`; run `nvm use` if you use nvm) with **npm**. No yarn.
- Install from the root lockfile:

    ```bash
    npm ci
    ```

    `package-lock.json` at the root is the only committed lockfile (the packages are npm workspaces and have none of their own; the sample apps' lockfiles are gitignored, see [Sample apps](#sample-apps-test-projects)). Never commit a lockfile that `npm ci` rejects: if you change dependencies with `npm install`, run `npm ci` afterwards to check it. `.npmrc` sets `legacy-peer-deps=true`. (One of its original reasons, `@toast-ui/react-editor`'s `react ^17.0.1` peer, is gone: cells no longer depends on it.)

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
| `packages/core/src/ai-fill/` | AI Fill, part of core (not a separate package). See [Working on AI Fill](#working-on-ai-fill). Its tests are in `packages/core/test/ai-fill/`. |
| `packages/cells` | `@specstory/ai-data-grid-cells`, extra cell renderers (`src/cells/`). |
| `packages/cells/src/cells/article-editor/` | ArticleCell's Milkdown editor and viewer, their defenses and toolbar. See [Article editor](#article-editor). |
| `packages/source` | `@specstory/ai-data-grid-source`, data source hooks. |
| `config/build-util.sh` | Shared build steps used by each package's `build.sh`. |
| `.storybook/` | Storybook config (branded "AI Data Grid"). |
| `scripts/smoke-storybook.mjs` | Headless smoke test of the built Storybook. |
| `scripts/check-test-project.mjs`, `scripts/check-article-cell-editor.mjs`, `scripts/check-article-cell-sanitizer.mjs` | Headless checks for a running sample app, for the cells article editor and for the article sanitizer. See [Sample apps](#sample-apps-test-projects). |
| `scripts/check-pack.mjs` | `npm run check-pack`: checks what the three npm tarballs contain. See [Releasing](#releasing). |
| `scripts/release-consumers.sh`, `scripts/check-ai-fill-consumer.mjs` | Release checks: clean consumer installs of the tarballs or of a published version, and the AI Fill check on the `vite-app` sample. See [Sample apps](#sample-apps-test-projects). |
| `packages/*/THIRD_PARTY_NOTICES.md` | Byte-identical copies of the root `THIRD_PARTY_NOTICES.md`, so each tarball ships it. Edit only the root file (see [License and attribution](#license-and-attribution)). |
| `scripts/jev-dev-proxy.mjs`, `scripts/jev-live-check.mjs` | Manual-only AI Fill tools that make live Jev calls. See [Live Jev scripts](#live-jev-scripts-manual-only). |
| `.github/workflows/ci.yml` | The only CI workflow. |
| `test-projects/` | Sample apps (`vite-app`, `next-app`) that install the packed tarballs. See [Sample apps](#sample-apps-test-projects). |
| `docs/` | The documentation site, a standalone Next.js app outside the npm workspaces. See [Working on the docs site](#working-on-the-docs-site). |

## Check commands

Run these from the root. CI runs the first six.

| Command | What it does |
| --- | --- |
| `npm ci` | Clean install from the root lockfile. |
| `npm run build` | Builds all three packages into `dist/esm`, `dist/cjs` and `dist/dts`, plus `dist/index.css` for core and cells (source has no CSS), then lints them (ESLint, plus a `cycle-check` for import cycles in core). Two existing `no-console` warnings are expected; errors fail. |
| `npm run check-pack` | Checks the contents of the three npm tarballs with `npm pack --dry-run` (see [Releasing](#releasing)). Run `npm run build` first. |
| `npm test -- --run` | Core unit tests (vitest), run once. Without `--run` vitest watches. Includes the AI Fill bundle-budget and `/server` load tests, which need `npm run build` first (see [Working on AI Fill](#working-on-ai-fill)). |
| `npm run test-cells -- --run` | Cells unit tests. |
| `npm run test-source -- --run` | Source unit tests. `ai-fill-undo.test.tsx` imports `@specstory/ai-data-grid` and its `/testing` subpath through the workspace link, which resolves to core's built `dist/`, so run `npm run build` first (CI does). |
| `npm run build-storybook` | Builds the packages and a static Storybook into `storybook-build/` (git-ignored). |
| `npm run smoke-storybook` | Opens every story from `storybook-build/` in headless Chromium and fails on unexpected console errors. Run `npm run build-storybook` first. |

At the time of writing the test counts are core 863 (473 of them in `test/ai-fill/`), cells 225 (65 plus 160 for the article editor: 129 security and behavior tests, 26 Markdown fidelity tests and 5 guards) and source 9 (8 plus AI Fill's undo round trip). Tests run on React 19 only; there are no per-React-version test scripts.

Hook tests use `renderHook` and `act` from `@testing-library/react`. Don't use `@testing-library/react-hooks`, `react-test-renderer` or `react-dom/test-utils` (removed or deprecated with React 19). RTL's `renderHook` has no `result.all`; to check how often a hook rendered, count renders in the hook callback.

### The Storybook smoke test

`npm run smoke-storybook` serves `storybook-build/` on a random local port, visits every story, and prints `KNOWN`, `FIXED?`, `NOCANVAS` and `FAIL` lines, then a summary. It exits non-zero if a story logs a console error that isn't allowlisted, or renders no `<canvas>` (except the text-only docs pages in `noCanvasAllowlist`).

`errorAllowlist` in `scripts/smoke-storybook.mjs` lists known, accepted failures per story id (currently 8, all "Failed to load resource" from third-party images). A `FIXED?` line means an allowlisted error no longer happens; remove that entry. Only add an entry for a failure you have understood and accepted, with a comment explaining it.

It needs Playwright's Chromium. If it isn't installed yet, run `npx playwright install chromium`. The smoke test doesn't run in CI.

## Working on AI Fill

AI Fill is part of core, `@specstory/ai-data-grid` (SPST-16, merged 2026-09-27 in five stacked PRs, #16 to #20). There is no separate AI package, no `packages/ai` and no `test-ai` script: its tests run with core's `npm test -- --run`. It has the pure foundation (contract, config, identity, policy), the execution layer (transport, engine, `/server`, `/testing`), the grid integration: the optional `aiFill` prop on `DataEditor` (`src/data-editor-all.tsx`), a static bridge and a lazily loaded controller (`react/`), the built-in UI: menus, confirm dialog, status bar, inspector and keyboard shortcuts (`react/ui/`), 13 Storybook stories, the docs site guide and a recorded live check. The user-facing reference is the "AI Fill" chapter of `packages/core/API.md`, and the user guide is `docs/content/docs/ai-fill/` (see [The AI Fill guide](#the-ai-fill-guide-hand-maintained)); the architecture and decisions are in [AS-BUILT.md](AS-BUILT.md#ai-fill).

### Code map

| Path | What it is |
| --- | --- |
| `src/ai-fill/index.ts` | Internal barrel listing only the public AI Fill names. `src/index.ts` re-exports it with `export * from "./ai-fill/index.js"`. |
| `src/ai-fill/contract/` | The Jev request and answer types, `parseJevAnswer` (every malformed-answer rule), and the endpoint contract's error body `JevEndpointErrorBody` (`endpoint.ts`). |
| `src/ai-fill/config/` | The configuration types (`types.ts`), result, event and error types (`results.ts`), and `validateAIFillConfig` (`validate.ts`). |
| `src/ai-fill/identity/` | Canonical JSON, `buildQuestion`, the question and input fingerprints, the cache key and the display-only `shortHash`. Internal. |
| `src/ai-fill/policy/` | `mapAIOutput`, `evaluateAIPolicy`, `isAIDestinationEmpty` and the default `toCell` (`cells.ts`), and the commit-guard helpers (`commit-guards.ts`, internal). |
| `src/ai-fill/transport/` | The Jev clients for the three connection modes (`client.ts`), error normalization and the HTTP status mapping (`errors.ts`), backoff and `Retry-After` parsing (`retry.ts`), and browser detection (`environment.ts`). Internal. |
| `src/ai-fill/engine/` | The execution engine (`engine.ts`: plan, run, cancel, retry, re-evaluation, `recordCommit`), the per-cell result store (`store.ts`), the scheduler and its token bucket (`scheduler.ts`, `token-bucket.ts`), the answer cache (`lru-cache.ts`), request grouping (`requests.ts`), row-state building (`state.ts`) and the `execution` defaults (`defaults.ts`). Internal: the session in `react/session.ts` drives it. |
| `src/ai-fill/config/api.ts` | The public API types: `AIFillApi` (`ref.current.aiFill`), `AIFillTarget`, `AICellState`, `AIRunState`, `AIMenuItem`. `AIFillShortcuts` is with the other configuration types in `types.ts`. |
| `src/ai-fill/react/bridge.ts` | The static half of the `aiFill` prop: the `AIFillBridge` and controller prop types and `linkAIFillRef`, which points the app's ref at the grid's handle plus `aiFill`. The only AI Fill module allowed in a grid's initial bundle, so keep it to types and tiny helpers. |
| `src/ai-fill/react/controller.tsx` | The lazily loaded controller component (`React.lazy` in `data-editor-all.tsx`). It creates an `AIFillSession` and its `AIFillUI`, drives the session's lifecycle, and renders `AIFillUIView`. |
| `src/ai-fill/react/session.ts` | Everything the controller does, without React: prop composition, fills, scopes and re-runs (`planFill` / `planRerun`, then `start`), what `reject` covers (`rejectable`), the commit path (also for Choose), `revertCommit`, invalidation from edits, repaint batching, auto-apply, and `subscribe` / `changed()` for the UI. It hands the menu, inspector, click and shortcut parts to its `ui` (`AIFillSessionUI`). |
| `src/ai-fill/react/grid-host.ts` | `AIFillGridHost`: reads the grid for the engine by row id (`getRowIndex`, checked against `getRowId`, or a per-task scan) and column id. |
| `src/ai-fill/react/draw.ts` | The canvas presentations of cell states and the AI column header badge. |
| `src/ai-fill/react/status.tsx` | The public `AIFillStatus`: a static wrapper that loads `ui/status-bar.tsx` with `React.lazy` on first render. |
| `src/ai-fill/react/ui/ui-controller.ts` | `AIFillUI`, the built-in UI without React: which popup is open, the menu, header-click and cell-click composition and "More options…", the menu items (`getMenuItems`), `openMenu`, `openInspector`, the confirm decision (`requestFill`) and the re-plan check on confirm (`confirmFill`), "Review next", Choose, "Edit manually", the shortcuts and the live-region announcements. |
| `src/ai-fill/react/ui/ui.tsx` | `AIFillUIView`: renders the open popup, portals the status bar into the grid's element and the live region into the portal. |
| `src/ai-fill/react/ui/menu.tsx`, `confirm.tsx`, `inspector.tsx`, `status-bar.tsx` | The menu (`role="menu"`), the confirm dialog, the inspector (both `role="dialog"`; `confirm.tsx` also has the shared `dialogKeys` focus trap) and the status bar (`role="status"`). |
| `src/ai-fill/react/ui/popup.tsx` | `AIPopup`: a popup portalled into `portalElementRef ?? #portal` with click-outside handling, viewport clamping and the grid's copied `--gdg-*` theme variables. |
| `src/ai-fill/react/ui/styles.ts` | The one Linaria `css` block (`aiStyles`) for all of the UI. See [Built-in UI rules](#built-in-ui-rules). |
| `src/ai-fill/server/index.ts` | The `@specstory/ai-data-grid/server` entry: `createJevHandler` and `toNodeListener`. |
| `src/ai-fill/testing/index.ts` | The `@specstory/ai-data-grid/testing` entry: `createMockJev`. |
| `src/ai-fill/stories/` | Stories 1–10, 12 and 13 (`ai-fill-primitives`, `ai-fill-review` and `ai-fill-menus` `.stories.tsx`) and their shared `story-kit.tsx` (synthetic contacts, the editable table, seeded mock answers, the frame and the endpoint URL control). Core's build excludes the folder, and so does core's `files` list, so it doesn't ship. See [AI Fill stories](#ai-fill-stories). |
| `test/ai-fill/*.test.ts` | Unit tests per module, plus the `boundaries`, `bundle-budget`, `server-load` and `no-live-jev` guards below. |
| `test/ai-fill/*.test.tsx` | Grid-level tests that render a real `DataEditor` with `aiFill`: `grid-integration` (the prop, composition, rendering, no inference without a trigger), `grid-fill` (primitives end to end, scopes and skip reasons, accept, reject and commit guards, column targets), `grid-identity` (sorting, filtering, deleting and editing while pending, `getRowIndex`), `commit-undo-contract` (the commit batch and `revertCommit`), `unconfigured-grid` (the golden test), and the built-in UI tests `ui-menus`, `ui-confirm`, `ui-status`, `ui-inspector`, `ui-keyboard` and `ui-workflow` (a whole review workflow with no app code but the config). |
| `test/ai-fill/fixtures/` | Shared fixtures: `jev-contract.ts` holds Jev request and response bodies copied from the TypeSafe docs examples (update them from the docs, never from a test run), `definitions.ts` holds synthetic column definitions, `grid.ts` is a synthetic in-memory grid for the engine tests, `harness.tsx` renders a `DataEditor` with `aiFill` for the grid-level tests, `contacts.ts` is the synthetic contacts grid they use, and `ui.ts` has the UI tests' helpers (clicking a header ▾, right-clicking a cell, grid keys, finding popups). |
| `test/ai-fill/live-jev-guard.ts` | The live-Jev `fetch` guard that `vitest.setup.ts` installs for every core test. |

Paths are relative to `packages/core`. Source's AI Fill test is `packages/source/test/ai-fill-undo.test.tsx` (see [Tests and fixtures](#tests-and-fixtures)), and its AI Fill story is `packages/source/src/stories/ai-fill-undo.stories.tsx` (story 11).

### The `aiFill` prop and the `react/` layer

`data-editor-all.tsx` (the exported `DataEditor`) takes the optional `aiFill` prop. It statically imports only `ai-fill/react/bridge.js` (for `linkAIFillRef`) and type-only modules, and loads the controller with `React.lazy(() => import("./ai-fill/react/controller.js"))`, rendered in a `Suspense` next to the grid only while `aiFill` is set. Once loaded, the controller hands back a bridge, and each render passes the app's props through `bridge.compose(props, aiFill)`. `data-editor.tsx` only gains the type-only `DataEditorRef.aiFill?` member. The behaviour users see is in API.md ("Quick start (`aiFill` prop)"); the architecture is in [AS-BUILT.md](AS-BUILT.md#grid-integration-wp-ai3).

When you change this layer:

- **Keep the unset path identical.** Without `aiFill`, the grid must get the app's props and ref untouched, and nothing may import the controller. `test/ai-fill/unconfigured-grid.test.tsx` checks this against a snapshot (`test/ai-fill/__snapshots__/unconfigured-grid.test.tsx.snap`) of the DOM, the canvas calls and every app callback, taken before the prop existed (commit `a3390df`). **Never update that snapshot** (no `vitest -u` on it): if it fails, the change broke the unconfigured grid. Fix the code.
- **Wrap, never replace.** Every composed app handler is still called with the same arguments, and its return value is passed back. `getCellContent` and `validateCell` are never wrapped. Wrappers are memoized per app handler, so they keep their identity while the app's handler does.
- **Keep the initial chunk small.** Anything `data-editor-all.tsx` imports at runtime lands in every grid's initial bundle. Put new code behind the controller, and check `bundle-budget` (see below). The public helper functions and the `AIFillStatus` component in `src/ai-fill/index.ts` are exported as constants read from module namespaces, not with `export { … } from`, because esbuild's code splitting otherwise pulls their modules into the initial chunk once the lazy chunk imports them too. Keep that pattern for any new runtime export. `AIFillStatus` itself only holds a `React.lazy` import of the status bar, so an app that imports it still loads the UI lazily.

### Invariants

These hold everywhere in AI Fill; the grid-level tests check them.

- **Records are keyed by id.** Results, commits and the blocked-commit reasons are keyed by `(rowId, columnId)` from `rows.getRowId` and `GridColumn.id`, never by display position. Resolve display coordinates only at the moment you need them (drawing, writing), from the latest props, through `AIFillGridHost`. A `getRowIndex` answer that doesn't map back to the same id is a missing row.
- **Commits re-check everything.** The commit path re-reads the row and runs every guard (`policy/commit-guards.ts`: already committed, row missing, stale inputs, changed destination, read-only, overwrite, `validateCell`) right before it writes, then calls `engine.recordCommit` and writes only what that returns. Never write a result without going through it, and never write outside the app's `onCellsEdited` / `onCellEdited`.
- **Nothing infers by itself.** Requests start only from `fill`, `retry`, `rerunStale` and the UI actions that call them: a fill, retry or re-run menu item (or its `run()` from `getMenuItems`), a confirmed confirm dialog, the inspector's Retry and Re-run, and the fill shortcut. Painting, scrolling, selecting, sorting, hovering, reading state, changing the policy, opening a menu and opening the inspector never send a request (`grid-integration.test.tsx`, "no inference without an explicit trigger", which also calls `getMenuItems`, `openMenu` and `openInspector`).

### Built-in UI rules

The UI in `react/ui/` loads with the controller, so it adds nothing to a grid without `aiFill`. The user-facing behaviour is in API.md ("Built-in UI", "Menus in apps that already have menus", "Keyboard"); the architecture is in [AS-BUILT.md](AS-BUILT.md#built-in-ui-wp-ai4).

- **Logic in `AIFillUI`, rendering in components.** Put menu items, counts, confirm decisions and actions in `ui-controller.ts`, and keep the `.tsx` files to rendering and focus. Every write goes through `session.commit` (accept, auto-apply and Choose), never around it.
- **A confirmed fill is the fill that was shown.** Any UI fill that can ask goes through `requestFill`, and its confirm through `confirmFill`, which re-plans and starts only a plan whose statement (cell identities, skips, columns, row-scope label, requests, error) equals the one shown. Don't start a UI fill with `session.fill` after a dialog; `api.fill` is the only path that never asks. `ui-confirm.test.tsx` covers rows added, rows removed and the same count with different cells.
- **Styling.** All UI styles live in the single Linaria `css` block in `react/ui/styles.ts`, which the build extracts into core's `dist/index.css` with the rest of core's styles (no extra CSS import). Every element gets a `gdg-ai-*` class, and every color reads a `--gdg-ai-*` variable with a `--gdg-*` fallback (the table in API.md's "Styling" lists them; update it when you add one). The CSS counts against the bundle budget's 4,600 B limit.
- **Portals.** Popups render through `AIPopup` into `portalElementRef ?? #portal`, with the `click-outside-ignore` class. The status bar is portalled into the grid's own element, found by the per-grid `gdg-ai-grid-<n>` class AI Fill composes into `className`. Don't change the grid's layout: the status bar is absolutely positioned.
- **Accessibility.** Menus are `role="menu"` with `role="menuitem"` items and roving `tabIndex` (arrows, Home, End, Enter, Space, type-ahead, Esc and Tab close). The confirm dialog and the inspector are `role="dialog"` with `aria-labelledby`, trap Tab with `dialogKeys` and close on Esc. The status bar is `role="status"` with `aria-live="polite"`, and action results are announced through `ui.announce()` into the hidden `gdg-ai-sr` live region. When a popup closes from the keyboard or after an action, call `ui.close(true)` so focus returns to the grid; a click outside passes `false`. Every action must be reachable from the keyboard.
- **Shortcuts** are parsed with core's `isHotkey` (`common/is-hotkey.ts`, the `keybindings` syntax) and run from the composed `onKeyDown` only when the app's handler didn't prevent or cancel the event. A shortcut returns `false` when it has nothing to act on, so the grid still gets the key. New shortcuts need a key in `AIFillShortcuts`, a default in `ui-controller.ts`, a name in `validate.ts`'s `shortcutNames`, and a row in API.md's "Keyboard" table.
- **UI tests** render the grid through the harness and drive it like a user, with the helpers in `test/ai-fill/fixtures/ui.ts`. Call `standardBeforeEach()` from `test/test-utils.tsx`: its `getBoundingClientRect` mock is what lets header clicks and right-clicks hit cells in jsdom.

### Entry points

Core's `package.json` `exports` has two AI Fill subpaths next to `.` and `./index.css`: `./server` (`dist/*/ai-fill/server/index.*`) and `./testing` (`dist/*/ai-fill/testing/index.*`). `cycle-check` runs on all three roots (`src/index.ts`, `src/ai-fill/server/index.ts`, `src/ai-fill/testing/index.ts`). If you add or rename an entry point, run `npm run test-projects`: the `next-app` sample's `app/api/jev/route.ts` imports `createJevHandler` from the tarball, so its `next build` checks that `/server` resolves and type-checks.

### Import rules (`test/ai-fill/boundaries.test.ts`)

The test parses every `.ts`/`.tsx` file under `src/` and fails on:

1. an import in `ai-fill/` from `src/index.ts`, `src/data-editor-all.tsx` or any `@specstory/*` package. Import core types from the module that defines them, for example `../../internal/data-grid/data-grid-types.js`;
2. an import of `ai-fill/` from anywhere outside it except `src/index.ts` and `src/data-editor-all.tsx`. `src/data-editor/data-editor.tsx` may use type-only imports;
3. in the graph of files reachable from `ai-fill/server/index.ts` (through relative imports, type-only ones included): a `react`, `react-dom` or `@linaria/*` import, a `.tsx` file, or a `window` or `document` reference outside a function body. `/server` must load in plain Node;
4. an import in `ai-fill/testing/` from anything but `testing/`, `contract/`, `identity/` and `transport/`;
5. in `ai-fill/stories/`, which rule 1 doesn't cover: an import of `src/index.ts`, or of any `@specstory/*` entry other than `@specstory/ai-data-grid/testing` (the stories use AI Fill as an app does, through `../../data-editor-all.js` and the mock's subpath); and an import of a story file from anywhere else in core.

It also fails on an import of `@specstory/ai-data-grid-cells` or `-source` anywhere in core. The numbers match the test's own comments. `npm run build` also runs `cycle-check`, which must stay clean.

### Bundle budget (`test/ai-fill/bundle-budget.test.ts`)

This test caps what AI Fill costs apps that render `DataEditor` without using AI Fill. It bundles `import { DataEditor } from "@specstory/ai-data-grid"` plus `dist/index.css` from the built `dist/esm` with the root esbuild CLI (`--bundle --minify --splitting --format=esm`, with `react`, `react-dom`, `marked`, `lodash` and `react-responsive-carousel` external), and measures the output with `gzip -9`. It fails if:

- the initial JS (the entry chunk and every chunk it imports statically) is over 71,900 B gzip;
- the CSS is over 4,600 B gzip;
- any `ai-fill/` module other than `ai-fill/react/bridge.js` is in the initial chunks;
- any `ai-fill/transport/`, `engine/`, `server/` or `testing/` module is in the initial chunks;
- the lazily loaded AI Fill chunks are over 40,000 B gzip.

It prints the measured sizes (`bundle-budget: initial JS … B gzip, …`). It reads `dist/`, so **run `npm run build` before `npm test`**: without `dist/esm/index.js` it fails with "run \`npm run build\` first", and after source changes it measures stale output. It also needs the `gzip` binary on `PATH`. CI builds before it tests, so it runs there as is. The limits and baseline are recorded in [AS-BUILT.md](AS-BUILT.md#bundle-budget).

### Export names

Every new export name from `.` (`src/index.ts`) contains `AI`, `AIFill` or `Jev`, or starts with `Choice`, `Score` or `Noul`, so AI Fill never takes a generic name from core's namespace. `test/public-api-exports.test.ts` keeps the 151 upstream names (`upstreamExports`) and the AI Fill names (`aiFillExports`) in separate lists and checks every addition against that rule. The `/server` and `/testing` subpaths are their own namespaces, so the rule doesn't apply to them (`toNodeListener` doesn't match it); instead their names are pinned exactly by `expectedServerExports` (4) and `expectedTestingExports` (5) in the same file. Update the matching list whenever you change an entry's exports. Helpers that apps don't need stay unexported: list public names in `src/ai-fill/index.ts` only, and import internal helpers in tests from their module, for example `../../src/ai-fill/identity/fingerprints.js`.

### Tests and fixtures

- **Tests never call Jev.** Use `createMockJev` (from `src/ai-fill/testing/index.js`), a fake transport, answers built in the test, or `test/ai-fill/fixtures/`. `vitest.setup.ts` installs `test/ai-fill/live-jev-guard.ts`, which rejects any `fetch` to `typesafe.ai` or a subdomain and fails the test that tried, even if the code under test caught the rejection (`no-live-jev.test.ts` checks the guard). Live Jev calls are for manual validation only (see [Live Jev scripts](#live-jev-scripts-manual-only)) and are recorded outside the tests.
- **Node-environment tests.** Core's tests run in jsdom. A file that starts with `// @vitest-environment node` runs in plain Node instead, for code that must work without a DOM (`boundaries`, `server`, `server-load`); `vitest.setup.ts` skips its DOM-only setup (canvas mock, `ResizeObserver`, `Image.decode`) when there's no `window`.
- **`server-load.test.ts` needs a build**, like `bundle-budget`: it loads `dist/esm` and `dist/cjs` `ai-fill/server/index.js` with `import()` and `require()`, and fails with "run \`npm run build\` first" when they're missing.
- **Grid-level tests** render a real `DataEditor` in jsdom with core's `test/test-utils.tsx` (`prep`, `Context`, `sendClick`) and `vitest-canvas-mock`, through `renderAIGrid` in `test/ai-fill/fixtures/harness.tsx`. The harness keeps synthetic rows by id with a display order the test can sort and filter, logs every callback and edit, and can run with a controlled, listened-to or uncontrolled selection. Jev is `createMockJev` behind a `custom` connection; `gatedJev` holds each request until the test calls `release()`, so tests can sort, filter or edit while a request is pending. Tests use fake timers: call `settle()` after rendering so the lazily loaded controller has loaded (it waits for `vi.dynamicImportSettled()`).
- **Source's `test/ai-fill-undo.test.tsx`** is the one AI Fill test outside core (approved as A-Q1). It wires the real `useUndoRedo` to a `DataEditor` with `aiFill` and `createMockJev`, and checks that a bulk accept is one undo step, that undo restores every cell and redo writes them again once, and that no suggestion comes back. It imports core by package name, so it tests core's built `dist/`: run `npm run build` before `npm run test-source`.
- **Run `npm run test-projects`** in every AI Fill package from WP-AI2 on, as well as the check commands (see [Sample apps](#sample-apps-test-projects)).
- **The repository is public.** Core's tarball ships the library `src/` but not `test/` or the stories (see [Releasing](#releasing)), and the tests, fixtures and stories are public on GitHub. Fixtures use synthetic row data only, with request ids removed. Never commit a key, token or `.env` file, and never put `JEV_API_KEY` in a test, story, fixture or CI.
- Core gets no new runtime or peer dependencies for AI Fill. Use `fetch` and the platform's `AbortController`, `TextEncoder`, `Headers`, `Request` and `Response`, not the TypeSafe SDK.

### Live Jev scripts (manual only)

Two root scripts talk to the real Jev API. They aren't published (core's tarball doesn't include `scripts/`), and no test or CI step runs them. Both import core's build, so run `npm run build` first. They read the key from `JEV_API_KEY` (or `TYPESAFE_API_KEY`) and never print it. Every call they forward is live and billed, and SPST-16 caps live calls (see the brief for your package before you make any).

- **`scripts/jev-dev-proxy.mjs`** runs `createJevHandler` behind a small `node:http` server, so a browser demo can use endpoint mode (TypeSafe's API rejects browser CORS preflights). Flags: `--port` (default `8787`), `--host` (default `0.0.0.0`), `--allow-origin <origin>` and `--allow-model <model>` (both repeatable; any `--allow-model` replaces the default `jev-latest`), `--help`. It allows `http://localhost:<any port>`, `http://127.0.0.1:<any port>` and the exact `--allow-origin` origins; it refuses `--allow-origin '*'` and `null`. A request without an allowed `Origin` header gets a 403 before it reaches Jev, so test it with `curl -H "Origin: http://localhost:9009" …`. Any path works, for example `http://<host>:8787/api/jev`. It logs only method, path, status and time.

    In the sandbox, run it detached in tmux and allow the sandbox URL of the page that calls it (the proxy port and the page's port differ, so list the page's origin):

    ```bash
    npm run build
    tmux new -d -s jev-proxy "node scripts/jev-dev-proxy.mjs --host 0.0.0.0 --port 8787 --allow-origin $(sb-url 9009 | sed 's#/$##') 2>&1 | tee /tmp/jev-proxy.log"
    tmux capture-pane -pt jev-proxy      # shows the listening address and allowed origins
    tmux kill-session -t jev-proxy       # stop it
    ```

    The key comes from the sandbox environment (`JEV_API_KEY`); don't type it on the command line. Point the demo at `connection: { mode: "endpoint", url: "<sb-url 8787>api/jev" }`, or enter that URL in an AI Fill story's endpoint URL control (see [AI Fill stories](#ai-fill-stories)).
- **`scripts/jev-live-check.mjs`** is the live check. It sends one direct-mode request with three questions (a Choice, a Score and a Noul) about one synthetic contact through AI Fill's own client, with no retries, checks each answer with `parseJevAnswer` and the column policies, then sends the same request with a bad key to confirm a 401 becomes an `authentication` error. `--model` defaults to `jev-latest`. `node scripts/jev-live-check.mjs --dry-run` prints the requests, sends nothing and needs no key. It imports internal modules from `packages/core/dist/esm/ai-fill/`.

    **Call budget.** Each question sent to Jev counts as one call, and the bad-key request (which answers no question) counts as one, so one run is **4 calls** (3 with `--skip-401`), although it sends 2 HTTP requests (1 with `--skip-401`). SPST-16 caps live calls at 20 in total; 12 are used (8 in planning, 4 in WP-AI5's run on 2026-09-26). A fill through the dev proxy is billed the same way: one call per cell evaluated. Only run it when your brief allots calls.

    **Procedure.** `npm run build`, then `--dry-run` to check the request, then one run with the key already in the environment (`node scripts/jev-live-check.mjs`; never type the key on the command line). Then add a dated entry to `docs/content/docs/ai-fill/live-validation.mdx`: the date and time, the issue, the number of calls, the requested and the returned model id, each answer as returned with its decision, and any deviation from the contract. Never record the key, and make no accuracy or latency claims. Update the budget line on that page too.

### AI Fill stories

13 stories show AI Fill in Storybook, in four groups under **AI-Data-Grid / AI Fill**. Story names start with `01`…`13`, so they sort in order within a group.

| Storybook group | Stories | File |
| --- | --- | --- |
| `1 Primitives and thresholds` | 01–06 | `packages/core/src/ai-fill/stories/ai-fill-primitives.stories.tsx` |
| `2 Review, errors and rows` | 07–10 | `packages/core/src/ai-fill/stories/ai-fill-review.stories.tsx` |
| `3 Undo with useUndoRedo` | 11 | `packages/source/src/stories/ai-fill-undo.stories.tsx` |
| `4 Menus and opt-out` | 12–13 | `packages/core/src/ai-fill/stories/ai-fill-menus.stories.tsx` |

- **Story 11 lives in the source package** because it uses the real `useUndoRedo`, and core never imports from source. It imports core by package name (`@specstory/ai-data-grid`, `/testing` and `dist/index.css`), so it runs against core's built `dist/`: `npm start` rebuilds core as you edit. Source stays at 9 tests and 5 exports.
- **The core stories** import `DataEditor` from `../../data-editor-all.js`, like core's other stories, and the mock from `@specstory/ai-data-grid/testing` (import rule 5). Shared pieces are in `story-kit.tsx`.
- **No network by default.** Every story turns AI Fill on only through `aiFill` and answers from `createMockJev` with fixed latency and seeded answers. Never put a key in a story.
- **The endpoint URL control.** Every story except 08 (its errors are injected by the mock) and 13 (it has no `aiFill`) has an `endpointUrl` control. Empty means the mock; a URL switches the story to endpoint mode against it. To try a story against real Jev, start the dev proxy (see [Live Jev scripts](#live-jev-scripts-manual-only)) and Storybook, then enter the proxy's URL in the control. In the sandbox: start the proxy detached with the recipe above (its `--allow-origin` is Storybook's sandbox origin on port 9009), start Storybook detached too (`tmux new -d -s storybook "npm start"`), open the URL `sb-url 9009` prints, and enter the proxy's URL (`sb-url 8787` followed by `api/jev`) in the control. From `http://localhost:9009` the proxy allows the origin without `--allow-origin`, and the URL is `http://localhost:8787/api/jev`. Every fill then makes live, billed calls that count against the budget. Stop both sessions when you're done (`tmux kill-session -t jev-proxy`, `tmux kill-session -t storybook`).
- `npm run smoke-storybook` opens the AI Fill stories like any other (126 stories in total); they need no allowlist entries.

## Sample apps (`test-projects/`)

`test-projects/` holds two small apps that install the packages the way users do, from the npm tarballs:

- `vite-app`: Vite 8, React 19, TypeScript. `npm run build` runs `tsc --noEmit && vite build`.
- `next-app`: Next 16 App Router, React 19. `app/page.tsx` is a `"use client"` page that loads the grid component (`components/Grid.tsx`) with `next/dynamic` and `ssr: false`. `npm run build` runs `next build`.

Both render a `DataEditor` with text, number, boolean and star (from `-cells`) columns, and import `@specstory/ai-data-grid/dist/index.css`. `next-app` also has `app/api/jev/route.ts`, a `POST` route built with `createJevHandler` from `@specstory/ai-data-grid/server`. It only checks that `/server` resolves and type-checks from the tarball: its `authorize` rejects every request, so it never calls Jev.

`vite-app` also has an AI Fill scenario, `src/AIFillSmoke.tsx`, which `src/main.tsx` renders instead of the normal app when the URL hash is `#ai-fill`. It's a `DataEditor` with `aiFill`, one Choice column and four synthetic rows, answered by `createMockJev` from `@specstory/ai-data-grid/testing` (no network), with `useMoveableColumns` from `@specstory/ai-data-grid-source` so the source package is imported, type-checked and bundled too. It exposes `window.__aiFillSmoke` for `scripts/check-ai-fill-consumer.mjs`.

Build and check them from the root:

```bash
npm run test-projects
```

This runs `test-projects/bootstrap-projects.sh`, which:

1. runs `npm run build --workspaces` if any package's `dist/` is missing (it doesn't rebuild stale output, so run `npm run build` first after code changes);
2. `npm pack`s the three packages into `test-projects/.packs/`;
3. in each sample, deletes `node_modules` and `package-lock.json`, runs `npm install` with the tarballs, then `npm run build`.

It ends with `All test projects built successfully.` and takes under a minute with a warm npm cache, but it installs about 500 MB of `node_modules` into the samples. It isn't in CI. Run it when you change what users install: package `exports`, `main`/`module`/`types`, `files`, the CSS entry, peer dependencies or dependencies, and in every AI Fill package from WP-AI2 on.

The samples have no `.npmrc`, so npm resolves peers the way it does for users (the root `.npmrc` isn't inherited). Their `package.json` files pin `marked` `^16.1.2`, inside core's `marked` peer range, and depend on `file:../.packs/…-7.0.0.tgz`, so update them if the version changes. `.packs/`, `node_modules/`, `dist/`, `.next/` and the samples' `package-lock.json` are gitignored and regenerated on every run.

To check a built sample in a browser, serve it and run `scripts/check-test-project.mjs <base-url> <sample-node_modules-dir>`. It fails unless a `<canvas>` renders with no console or page errors and every `react` package under the given `node_modules` has the same version. It needs Playwright's Chromium (`npx playwright install chromium`).

`scripts/check-ai-fill-consumer.mjs <base-url>` checks AI Fill in a built, served `vite-app`: it loads the plain page and records its scripts, then loads `#ai-fill`, fills the Persona column through `window.__aiFillSmoke` with the mock, checks that a script the plain page never loaded (AI Fill's lazy chunk) arrived, that every row is `suggested` with the mock's answer, and that `accept` writes the answers into the app's rows through `onCellEdited`. It fails on any console or page error, or any request to another origin. It needs Playwright's Chromium.

```bash
(cd test-projects/vite-app && npm run preview)   # after npm run test-projects
node scripts/check-ai-fill-consumer.mjs http://localhost:4173/
```

### Release consumers (`scripts/release-consumers.sh`)

`npm run test-projects` installs into `test-projects/` itself, and its `npm install <tarballs>` form doesn't print npm's `ERESOLVE` peer warnings. For a release, `scripts/release-consumers.sh` installs the three packages the way a user does:

```bash
scripts/release-consumers.sh --tarballs <dir-with-the-three-tgz> --out <new-dir>
scripts/release-consumers.sh --registry <version> --expect-integrity <INTEGRITY.txt> --out <new-dir>
```

It copies `vite-app` and `next-app` into `<out>/` (without `node_modules`, build output, lockfile or `.npmrc`), points their three `@specstory/*` dependencies at the tarballs (`file:`) or at the exact published version, and runs every npm command with an empty userconfig and globalconfig, a fresh cache in `<out>/npm-cache` and `https://registry.npmjs.org/`: no credentials and npm's default peer resolution. For each app it checks that `legacy-peer-deps` is off, runs `npm install` (log in `<out>/<app>-install.log`), fails on any `ERESOLVE` line, requires exactly one `react` and one `react-dom`, both 19.x, checks each `@specstory/*` lockfile entry's version and integrity (against the tarballs' SHA-512, or against the `INTEGRITY.txt` lines and a `resolved` URL on the public registry), and runs `npm run build`. It exits non-zero on any failure, after running the remaining checks. `<out>` must be new or empty. The browser checks above then run against the apps in `<out>/`.


```bash
(cd test-projects/vite-app && npm run preview)   # Vite's preview server, default port 4173
node scripts/check-test-project.mjs http://localhost:4173/ test-projects/vite-app/node_modules

(cd test-projects/next-app && npm start)         # next start, default port 3000
node scripts/check-test-project.mjs http://localhost:3000/ test-projects/next-app/node_modules
```

Run the servers in another terminal (or detached) and stop them afterwards.

### Article cell editor check

`scripts/check-article-cell-editor.mjs [url]` opens the cells "Custom cells" story in headless Chromium and checks the article cell end to end:

1. It double-clicks an editable article cell (row 1), types a line at the end, types bold text with the toolbar's Bold button, and saves. The story logs `onCellEdited` as `Edit Cell`, and the check fails unless the logged `data.markdown` contains the typed text and the bold text as `**…**`.
2. It reopens the editor and cancels, and fails unless that made no second edit.
3. It double-clicks a read-only article cell (row 0) and fails unless the viewer (`.gdg-article-content`) shows the article's text with no toolbar, editable element, Save or Close button.

It fails on any console error except a `Failed to load resource` 404. The default URL is `http://localhost:9009/iframe.html?id=extra-packages-cells--custom-cells`, so serve a Storybook on port 9009 first, for example:

```bash
npm run prod-storybook                             # builds, then serves storybook-build/ on 9009; leave it running
node scripts/check-article-cell-editor.mjs
```

Or pass another URL as the only argument. It finds the cells by canvas coordinates (the widths of the columns before it), so if you change that story's columns or rows, update the coordinates in the script. If you change the toolbar's labels or the `gdg-article-*` classes, update its selectors too. Run it when you touch the article cell, the article editor or React.

### Article sanitizer check

`scripts/check-article-cell-sanitizer.mjs [--browser chromium|firefox|webkit|all] [consumer-node_modules]` checks the article editor's defenses in headless Chromium, Firefox and WebKit (default `all`), where script execution is observable (the cells unit tests run in jsdom, which doesn't run scripts). It bundles a small page with esbuild that uses only the public `ArticleCell` API, with every package resolved from the given `node_modules` (default `test-projects/vite-app/node_modules`), so it tests what that consumer installed, and it loads cells' CSS the way an app does (`dist/index.css` with its `@import`s inlined). It runs the synthetic payloads in `packages/cells/test/fixtures/article-sanitizer-payloads.mjs` through the viewer, the editor's initial Markdown, a real keyboard paste, drag and drop onto a paragraph and onto a code block, a paste into a code block, an HTML-only paste and drop onto a code block and, in Chromium only, a native drop. That's 115 rows in Chromium and 102 each in Firefox and WebKit.

Each row has a **Native** column: `yes` means the paste or drop reached `document` without being prevented, so the browser's own insertion ran. A row fails if a payload's script ran or left dangerous DOM, if a paste or paragraph drop wasn't applied, if a code-block paste or drop inserted anything but its plain text (an HTML-only one must change nothing), or if Native is `yes`. The run also fails if Save after typing doesn't return the typed Markdown, if dragging a selection within the editor doesn't move it, if pasting a URL into the link dialog's URL field doesn't fill it in, or on any page error. It prints a result table per browser, the bundle's sanitizer-related inputs, the `dompurify` version the cells package resolves and the DOMPurify versions bundled, and whether any Toast UI module was bundled.

```bash
npm run build && npm run test-projects             # the check reads the installed tarballs
node scripts/check-article-cell-sanitizer.mjs                       # all three browsers
node scripts/check-article-cell-sanitizer.mjs --browser firefox     # one browser
```

Pointed at a consumer of a cells build from before SPST-61 (the Toast UI editor), it detects that from the page and runs in **legacy mode**: it uses Toast UI's selectors and CSS, and records the code-block and Native results without failing on them, for a before-and-after comparison. For example, from a `git worktree` of an older commit that has run `npm ci`, `npm run build` and `npm run test-projects`:

```bash
node scripts/check-article-cell-sanitizer.mjs --browser all /path/to/old-worktree/test-projects/vite-app/node_modules
```

It needs Playwright's browsers for every browser it runs (`npx playwright install chromium firefox webkit`), and exits 2 if the consumer has no `@specstory/ai-data-grid-cells` or `--browser` isn't one of the four values. It isn't part of CI. Run it when you touch the article cell, the article editor, the Milkdown or `dompurify` versions, or the fixtures. The payloads are synthetic test fixtures: keep them in `packages/cells/test/` (cells' tarball doesn't ship `test/`) and out of the READMEs, the CHANGELOG, AS-BUILT and the docs site.

## Article editor

ArticleCell's editor and read-only viewer are one Milkdown editor (the viewer has `editable: false`), created by `packages/cells/src/cells/article-editor/create-article-editor.ts` and wrapped by `src/cells/article-cell-editor.tsx`. [AS-BUILT.md](AS-BUILT.md#article-editor-and-sanitizer) explains the design, the defenses D1–D5 and the entry points.

| File in `src/cells/article-editor/` | What it holds |
| --- | --- |
| `create-article-editor.ts` | Creates the editor: the CommonMark and GFM presets, the history plugin, the schema overrides, the task-list plugin, the paste and drop props, and the backstop on the editor's frame. |
| `url-policy.ts` | The private DOMPurify instance, `safeArticleURL` (D1) and `sanitizePastedHTML` (D3). |
| `schema.ts` | The schema overrides (D2). |
| `clipboard.ts` | The paste and drop handlers (D4) and the backstop listeners (D5). |
| `task-list.ts` | The task-list toggle and the checkbox click. |
| `toolbar.tsx` | The toolbar, the heading menu, the link dialog and the table buttons. |
| `styles.ts` | Linaria styles, all scoped under the wrapper. |

Rules:

- **The defenses stay in our code.** D1–D5 use Milkdown's and ProseMirror's public APIs only. Don't rely on a Milkdown default for security, and don't patch or vendor Milkdown.
- **Keep the editor minimal.** Use only the presets and `@milkdown/plugin-history`. Don't add Milkdown's clipboard, upload, slash, block, tooltip or listener plugins, `@milkdown/kit` or Crepe. Don't add node views: the task checkbox is a CSS box with a `mousedown` prop. Never use `innerHTML`, `dangerouslySetInnerHTML` or `insertAdjacentHTML`.
- **Import ProseMirror only through `@milkdown/prose/*`,** never `prosemirror-*` directly, so there's exactly one ProseMirror.
- **Cells' tsconfigs use `module: "ESNext"` with `moduleResolution: "Bundler"`.** Milkdown's type declarations use extensionless relative re-exports that `Node16` resolution can't follow. Don't switch them back.
- **The guards will fail on purpose.** `packages/cells/test/article-cell-guards.test.ts` snapshots the schema and parse rules and runs D2's image, link and code-block parse rules on unsanitized HTML (L01) and the node views and event-handling plugins (L02), spies on every HTML sink across the security corpus (L03), checks the manifest (L04) and tests the URL policy (L05). `article-cell-fidelity.test.tsx` snapshots the edited-save output (F25) and the viewer's DOM (F26). When one of them changes, review the diff as a security and data-format change before you update the snapshot.
- **Don't stub DOMPurify or Milkdown in the tests.** The article tests run the real libraries in jsdom. A pass-through `vi.mock("dompurify", importOriginal)` that only records instances is the one allowed mock.
- **The payloads are test fixtures.** Keep them in `packages/cells/test/fixtures/` and out of the READMEs, the CHANGELOG, AS-BUILT and the docs site.

### Updating the article editor

All `@milkdown/*` dependencies of cells move in lockstep on `~7.22.x` (today `~7.22.2`). Milkdown releases them together, and L04 fails unless they all share one `~7.x.y` range. A `~` range lets patch releases reach apps; a new minor version needs this procedure and a cells release.

1. Change every `@milkdown/*` range in `packages/cells/package.json` together, then run `npm install` and `npm ci`.
2. Run the cells tests. If an L or F snapshot fails, read the diff: a new node, attribute, parse rule, node view or event handler needs a security review, and a serializer change changes how edited articles are saved. Update the snapshots only after that review (`cd packages/cells && npx vitest run -u`).
3. Run the [article editor check](#article-cell-editor-check) and the [article sanitizer check](#article-sanitizer-check) in all three browsers.

**Adding or removing a Milkdown package.** L04 requires every bare import in cells' `src/` to be a declared dependency, and every declared `@milkdown/*` package to be imported. So when you import a new `@milkdown/*` package, add it to `dependencies` with the same `~` range; when you stop importing one, remove it. `@milkdown/ctx` and `@milkdown/transformer` arrive through `@milkdown/core` and aren't declared, because `src/` doesn't import them. L04 also fails if `@toast-ui` appears in cells' manifest, `src/` or the lockfile.

**Raising the DOMPurify floor.** When a DOMPurify advisory affects the range, raise `dompurify` in `packages/cells/package.json`, run `npm install` and then `npm ci`, and run the cells tests and the article sanitizer check. L04 accepts only a `^3.x` range at 3.4.16 or above, so a move to a DOMPurify 4 range needs that test updated too.

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
- The **AI Fill guide**, `docs/content/docs/ai-fill/` (10 pages, ordered by its `meta.json`), is a hand-maintained section with no GitBook source. See [The AI Fill guide (hand-maintained)](#the-ai-fill-guide-hand-maintained).
- Every other page is generated from the Glide Data Grid GitBook docs by the importer, then hand-edited: the product name is replaced, the Extended QuickStart Guide's peer install command names `marked@^16`, the DataEditor editing page's `onRowAppended` paragraph says that the trailing row needs `trailingRowOptions`, and the FAQ links two Storybook stories. Images are in `docs/public/images/`.
- Keep the attribution "Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed." on the welcome page, on the About & License page and in the site footer (`docs/lib/theme-config.ts`).

### Re-running the GitBook importer

```bash
cd docs && node scripts/import-gitbook.mjs
```

This fetches the 36 pages listed in https://docs.grid.glideapps.com/llms.txt, downloads the 17 images again and rewrites every `meta.json`. It skips `index.mdx`, `about.mdx` and the hand-maintained `ai-fill/` section (`HAND_MAINTAINED` and `HAND_MAINTAINED_SECTIONS` in the script), and the root `meta.json` it writes lists `ai-fill` before `about`. It **overwrites every other page**. That undoes the hand edits to those pages: "Glide Data Grid" replaced with "AI Data Grid" (in five pages at the time of writing), `marked@^16` in `extended-quickstart-guide/index.mdx`'s peer install command, the `onRowAppended` paragraph in `api/dataeditor/editing.mdx`, and the Storybook links in `faq.mdx`. After a re-import, review `git diff docs/content` and re-apply those edits before committing.

### The AI Fill guide (hand-maintained)

`docs/content/docs/ai-fill/` is the user guide for AI Fill: overview and quick start, configuration, connecting to Jev, primitives, result policies, fill scopes and review, persistence, commits and undo, examples, limitations, and live validation (the record of live Jev calls). It is written by hand against the code, so update it in the same PR as any AI Fill change that users can see, together with the "AI Fill" chapter of `packages/core/API.md`. To add a page, add it to `ai-fill/meta.json`. To add another hand-maintained top-level section, add it to `HAND_MAINTAINED_SECTIONS` in `docs/scripts/import-gitbook.mjs`. Code in the guide uses only exported names, and no key, token or real row data.

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

With no argument it copies the current root version to the packages. It is also the root `version` script, so `npm version` runs it. Publishing to npm needs the maintainer's explicit approval: see [Releasing](#releasing).

## Releasing

A release publishes `@specstory/ai-data-grid`, `@specstory/ai-data-grid-cells` and `@specstory/ai-data-grid-source` to https://registry.npmjs.org/ at one version, from the maintainer's or the Orchestrator's own runtime. There is no publish workflow: CI only tests. The procedure below is the one used for 7.0.0 (SPST-50, plan SPST-51); `<version>` is the version being released.

**Approval.** Every release needs the maintainer's explicit approval of the version, the packages, the access and the dist-tag. Merging each release PR needs the maintainer's approval of that PR too. Only the Orchestrator or the maintainer publishes, and only they hold the publishing token (`NPMJS_TOKEN` in their environment). Never publish from another role, from CI or with a token typed on a command line.

### Package contents

Each package's `files` list decides what ships:

- **core:** `dist/`, the library `src/` (without `src/docs/`, `src/stories/` and every other `stories/` folder or `*.stories.tsx`), `API.md`, `CHANGELOG.md` and `THIRD_PARTY_NOTICES.md`;
- **cells and source:** `dist/`, the library `src/` (without stories) and `THIRD_PARTY_NOTICES.md`;
- all three: no `*.tsbuildinfo`. npm always adds `package.json`, `README.md` and `LICENSE`.

`src/` ships because the source maps in `dist/` point at it and have no `sourcesContent`. Tests, stories, fixtures and build and lint config don't ship. Each package's `publishConfig` is `{ "access": "public", "registry": "https://registry.npmjs.org/" }`, so a scoped publish can't become restricted or go to another registry, and the root `package.json` is `"private": true`, so the monorepo root can't be published.

**`npm run check-pack`** (`scripts/check-pack.mjs`) checks the contents. With no argument it runs `npm pack --dry-run` for each workspace (run `npm run build` first); with `--tarballs <dir>` it unpacks and checks the three real `.tgz` files and also prints each one's `sha512-…` integrity. It uses Node built-ins and `tar`, with no network. CI runs it after the build. It fails, one line per problem, unless:

- a. there are exactly the three packages, each at the root `version`;
- b. `package.json`, `README.md`, `LICENSE` and `THIRD_PARTY_NOTICES.md` ship, and for core `API.md` and `CHANGELOG.md`;
- c. `LICENSE` and `THIRD_PARTY_NOTICES.md` are byte-identical to the root files, and `LICENSE` has the typeguard line directly followed by the ai-data-grid contributors line;
- d. `main`, `module`, `browser`, `types` and every `exports` target, under every condition, ship;
- e. every `@import` in each `dist/*.css` resolves inside the tarball;
- f. every source map's `sources`, and every `//# sourceMappingURL=` in shipped `.js` and `.d.ts` files, resolve inside the tarball;
- g. every relative import or reference in a shipped `.d.ts` resolves to a shipped declaration;
- h. no forbidden path ships: tests, specs, stories, `src/docs/`, `*.tsbuildinfo`, `build.sh`, ESLint, vitest or tsconfig files, `.env*`, `.npmrc`, `*.tgz`, `node_modules/`, `coverage/`, logs, keys, `.DS_Store`, or a `vendor/` directory outside `dist/`;
- i. `publishConfig` is exactly the one above, there is no `private`, no install or publish lifecycle script, cells and source depend on `@specstory/ai-data-grid` at exactly the root version, the `react` and `react-dom` peers are `^19.0.0`, and no dependency is a `file:`, `link:`, `workspace:`, git or URL specifier;
- j. no shipped file contains a local path (`/home/`, `/Users/`, `multica_workspaces`, `C:\Users`) or a token-shaped string (npm, GitHub or a private key). A legitimate match needs a narrow `CONTENT_ALLOW` entry (one file, one string) with a reason.

Since SPST-61 nothing is vendored, so (h)'s `vendor/` rule, and (g)'s original target (the vendored editor's declarations), have nothing to catch today. Both stay as general guards, and (g) still checks every shipped declaration. When you change `files`, `exports`, the build or a package's layout, run `npm run build && npm run check-pack`, and update the contents in [AS-BUILT.md](AS-BUILT.md#what-ships-in-each-tarball) and the CHANGELOG.

### Preparing a release

1. Set the version with `./update-version.sh <version>` (see [Versioning](#versioning)) and check `npm ci` still passes.
2. Write the release notes in `packages/core/CHANGELOG.md` (it covers all three packages). Don't add a release date: the file is packed before publication.
3. The package READMEs, `API.md` and the CHANGELOG ship and become the npm pages, and they can't change after publication. They use no relative links (npm resolves those against the repository's default branch, not the release): link `API.md` and the CHANGELOG as `https://cdn.jsdelivr.net/npm/@specstory/ai-data-grid@<version>/API.md` (jsDelivr serves raw text, so name a chapter in words instead of an `#anchor`), and the docs site, Storybook, npm or GitHub for everything else.
4. Merge the release PR into `main`. Its merge commit is the release commit, `R`. Nothing else merges into `main` until the release is finished.

### Release verification

An independent Verifier runs this on a clean checkout of `R`, with Node 24, in a new directory outside every agent workdir and `/tmp` (in the dev sandbox, `/work/releases/ai-data-grid/<version>/`; move an earlier attempt aside instead of reusing it):

1. `npm ci`, `npm run build`, the three test suites, `npm run build-storybook`, `npm run smoke-storybook`, `npm run test-projects`, and the [article editor check](#article-cell-editor-check).
2. `npm run build` once more, then `npm pack --workspace packages/<pkg> --pack-destination <artifacts>` for core, cells and source. Nothing rebuilds `dist/` after this.
3. `npm test -- --run bundle-budget server-load` (they read the packed build) and `npm run check-pack -- --tarballs <artifacts>`; `git status --porcelain` must show no change.
4. Record each tarball's integrity the way the registry reports `dist.integrity`, in `INTEGRITY.txt`: `printf '%s  sha512-%s\n' "$f" "$(openssl dgst -sha512 -binary "$f" | base64 -w0)"`. It must equal `npm pack --json`'s `integrity`.
5. `scripts/release-consumers.sh --tarballs <artifacts> --out <dir>/consumers/tarball` (see [Release consumers](#release-consumers-scriptsrelease-consumerssh)), then serve both apps on free ports and run `check-test-project.mjs` for each, `check-ai-fill-consumer.mjs` on `vite-app`, the [article sanitizer check](#article-sanitizer-check) with `--browser all` on each app's `node_modules`, `/api/jev` on `next-app` (POST 403, GET 405), and `import()` and `require()` of `@specstory/ai-data-grid/server` and `/testing` from Node.
6. Check the built consumer bundles for the ArticleCell editor's dependencies (no Toast UI code, one DOMPurify at or above the cells floor), and read `npm audit --omit=dev --json` for both consumers: no finding in `dompurify`, `@milkdown/*`, `prosemirror-*` or `@specstory/*`. Report any other high or critical runtime finding to the maintainer before publishing.
7. Record CI's conclusion for `R`, not just that it started.
8. Make the artifacts read-only, and post `R`, the checks, the `check-pack` table and the three `INTEGRITY.txt` lines, with the tarballs attached.

A changed source tree or a rebuilt tarball needs this again: builds aren't byte-reproducible (see [AS-BUILT.md](AS-BUILT.md#known-limitations-and-risks)), so the published bytes are always the verified ones.

### Publishing

Run everything in the foreground, from a directory with no `package.json` or `.npmrc`. Never `set -x`, and never print the token.

1. Re-check each tarball's SHA-512 against the three lines in the Verifier's report (not against a file on disk), and that each `package.json` has the right name, version and `publishConfig.access`.
2. Write a temporary userconfig that holds only a reference to the environment variable, never its value:

    ```bash
    NPMRC_DIR=$(mktemp -d "$HOME/.npm-publish-XXXXXX"); chmod 700 "$NPMRC_DIR"; NPMRC=$NPMRC_DIR/npmrc
    printf '%s\n' '//registry.npmjs.org/:_authToken=${NPMJS_TOKEN}' 'registry=https://registry.npmjs.org/' > "$NPMRC"; chmod 600 "$NPMRC"
    npm whoami --userconfig "$NPMRC" --registry https://registry.npmjs.org/
    ```

3. Immediately before publishing, `npm view <pkg> versions dist-tags --json` for each name, to see what already exists.
4. Publish **core, then cells, then source**, each from its verified tarball: `npm publish <tgz> --access public --tag latest --userconfig "$NPMRC" --registry https://registry.npmjs.org/ --ignore-scripts </dev/null`. After each one, confirm with an unauthenticated read (`npm view <pkg>@<version> dist.integrity` and `npm view <pkg> dist-tags --json`, both with `--userconfig /dev/null --prefer-online`; allow a few minutes to propagate) that the integrity equals the verified value and `latest` is `<version>`, and record it before starting the next package.
5. Always clean up, also after a failure: `rm -rf "$NPMRC_DIR"`, check that there's no `~/.npmrc`, and check that the token isn't in `~/.npm/_logs` or the release directory (`grep -rlF -f <(printenv NPMJS_TOKEN) …`, which keeps the token out of argv).

**If something goes wrong,** never unpublish, overwrite, bump the version, or move or add a dist-tag to work around it, never ask for a one-time password in an issue or PR, and retry only with the same verified tarball. If core isn't published, don't try cells or source.

| Symptom | Action |
| --- | --- |
| `E401`, `ENEEDAUTH`, or `whoami` fails | Stop; nothing is published. The token is missing, invalid or expired. |
| `E403`, or `E404` / "Scope not found" on the publish | Stop and report the exact message: the token can't create or write packages under `@specstory`. Don't change org settings. |
| `E402 Payment Required` | npm treated it as a private publish. Check `--access public` and `publishConfig`; don't retry blindly. |
| `EOTP`, a one-time password prompt or an auth URL | Writes need 2FA that the token doesn't bypass. Stop, and ask the maintainer for a granular token that bypasses 2FA, or to publish from their own terminal. |
| "cannot publish over the previously published versions" | Compare `npm view <pkg>@<version> dist.integrity` with the verified value: equal means it's published, so record it and continue; different means stop and report. |
| A timeout, `ECONNRESET`, `E429`, a 5xx, or an unclear result | Poll `npm view` for about 5 minutes first. If the version appears with the right integrity it's published; otherwise retry the same command once or twice. |
| `latest` isn't `<version>` after a publish | Stop and report. Don't move the tag. |
| A later package fails (partial publication) | Record what's live, report it, fix the cause and publish only the unfinished packages. No tag, GitHub release or docs switch until all three are live. |

### After publication

1. An independent Verifier installs from the registry with no credentials and a fresh cache: `scripts/release-consumers.sh --registry <version> --expect-integrity INTEGRITY.txt --out <dir>/consumers/registry`, then the browser and server checks of step 5 above, the unauthenticated `npm view` of all three, and a look at the three npmjs.com pages.
2. Merge the docs switch PR, which removes pre-release install notes from the docs site and README, and check that the production docs and Storybook deployments for its merge commit are ready and serve the changed pages.
3. Tag `R` as `v<version>` (an annotated tag; check that it doesn't exist yet, and never move one) and create the GitHub release from it, with the npm links and integrities, only once all three packages are confirmed.
4. Remind the maintainer to revoke a token made for the release.

## Rules that must hold

### License and attribution

- Never change the MIT text or the line `Copyright (c) 2021 typeguard, Inc.` in any `LICENSE` file (root, `packages/core`, `packages/cells`, `packages/source`). The line `Copyright (c) 2026 ai-data-grid contributors` sits directly below it and adds to it.
- Keep in-code attributions (for example the `dequal` port in `packages/core/src/common/support.ts`). When you copy or adapt third-party code, keep its notice at the use site and add it to `THIRD_PARTY_NOTICES.md`. Edit only the root `THIRD_PARTY_NOTICES.md`, then copy it over `packages/core/`, `packages/cells/` and `packages/source/THIRD_PARTY_NOTICES.md` (`for p in core cells source; do cp THIRD_PARTY_NOTICES.md packages/$p/; done`); `npm run check-pack` fails unless the copies are byte-identical. If you vendor third-party code, keep its `LICENSE` next to it and make sure it ships in the tarball.
- Every publishable package must ship its `LICENSE` and `THIRD_PARTY_NOTICES.md`. `npm run check-pack` checks both.
- Don't use Glide trademarks (the Glide product name, logos, the `@glideapps` scope, `glideapps.com` URLs) except in attribution text, the 6.x → 7.0.0 migration mapping, and historical CHANGELOG entries.

### API compatibility (7.x)

7.x is API-compatible with 6.x. Don't rename or remove:

- any export or prop, including `DataEditor`;
- the `--gdg-*` CSS variables and the `gdg-` class names;
- the runtime identifiers `glide-cell-{col}-{row}` (DOM id), `glide-select` (class) and `glide_fade_in` (keyframe). Renaming them waits for 8.0.

Each package has a `test/public-api-exports.test.ts`. It reads the package's `src/index.ts` with the TypeScript compiler API and compares the sorted export names with a hard-coded list (core 252, cells 27, source 5). Core's list is the 151 upstream names plus the 101 AI Fill names (see [Export names](#export-names)). Adding, removing or renaming an export fails the test. If the change is intended (a new export is not breaking; removals and renames wait for 8.0), update `expectedExports` in the same PR and say why in the PR description.

## Git and PR workflow

- Branch from `main` as `<issue-key>-<slug>`, lowercase, for example `spst-2-rebrand`.
- Open a PR into `main` with the issue key in the title, for example `SPST-12: Fix fill handle`. Don't use closing keywords unless merging should close the issue.
- Never push to `main`. PRs are merged with a merge commit (squash and rebase merges are disabled) and head branches are deleted after merge.
- Once a PR is open, never rebase or force-push it. Bring base changes in with `git merge`.
- Stacked PRs are based on the branch below them. GitHub retargets them to `main` when that branch merges.

### Expediter delivery

A ticket assigned directly to Expediter by the user follows a single-agent workflow. Expediter owns scoping, implementation, all affected docs, checks, fixes and approved merge on that same ticket. It creates no parent wrapper, child tickets or specialist handoffs, and uses no provider sub-agents or nested coding agents. This is an exception to the normal Planner/Implementor/Documenter/Verifier sequence and separate Documenter ownership. The Orchestrator does not add stages or take over closeout. Multiple runs for approvals or fixes stay on the original ticket. The current Multica project standing rules and Expediter instructions hold the full routing and delivery policy.

Expedited work still meets its acceptance criteria, API/license invariants and required checks. Record the assessed head and evidence; owner self-review does not count as independent verification. Changes affecting access control, credentials, personal data, destructive operations or comparable high-impact behavior require independent verification. Expediter requests Jake's independent human review of the final head/evidence on the same ticket, or an explicit switch to the normal workflow. Merge approval alone does not satisfy that review, and missing required review blocks completion and merge.

Expediter may merge its own PR only after Jake explicitly approves that PR and its assessed head is covered by the approval and all required checks/review. Use a merge commit with an expected-head guard; reassess later changes and get renewed approval for material changes. Never push directly to `main`, bypass protections or enable auto-merge. npm publishing remains outside Expediter's role and with the authorized release workflow; expedited assignment does not grant release credentials or publication approval. Public-repository data rules and live-provider call limits still apply.

Keep one delivery summary on the ticket, distinguish a checked PR awaiting approval from merged/deployed delivery, and update only that ticket's project-state entry. Existing pipelines change ownership only on the user's explicit instruction, after active work and obsolete wakeups have been accounted for.

## CI

`.github/workflows/ci.yml` (job `test`) runs on every pull request and on pushes to `main`, with Node from `.nvmrc`:

```
npm ci → npm run build → npm run check-pack → npm test -- --run → npm run test-cells -- --run → npm run test-source -- --run
```

CI only tests. There are no publish, release, Pages or Dependabot workflows. Storybook build, the smoke test, `npm run test-projects`, `release-consumers.sh` and the `check-*.mjs` browser checks are not in CI; run them locally when you touch what they cover. Vercel builds Storybook separately on every push (see [Hosted Storybook](#hosted-storybook-vercel)), but it doesn't run the smoke test. CI doesn't install or check `docs/` either; its Vercel build is the only automated check (see [Working on the docs site](#working-on-the-docs-site)).

## Keeping the docs current

`README.md` (users), `CONTRIBUTING.md` (developers) and `AS-BUILT.md` (architecture and decision log) must match the code. Update them in the PR that changes behaviour, commands or structure. `AGENTS.md` and `CLAUDE.md` only point here; put content in this file instead.

## Contributing new cells

If you wish to contribute new cells, please add them to the `cells` package. There are already other cells in that package which can be used as an example. If your cell editor requires additional third party dependencies please consider using a React.lazy to allow for code splitting.

## Any contributions you make will be under the MIT Software License

In short, when you submit code changes, your submissions are understood to be under the same MIT License that covers the project. Feel free to contact the maintainers if that's a concern.
