# AS-BUILT: AI Data Grid

**Last updated:** 2026-09-28 (SPST-63: the docs for SPST-61, PR #23 at the Implementor's head `1fc240d2` plus this docs commit)
**Covers:** the rebranded library packages, license and attribution files, toolchain, CI and Storybook (work package WP1, PR #12), React 19 only with the `test-projects/` sample apps (WP2, PR #14), Storybook hosting on Vercel (WP3, PR #13), the documentation site in `docs/` (WP4, SPST-3 / PR #11), AI Fill in core (WP-AI1 to WP-AI5, SPST-19, 23, 26, 29 and 32 / PRs #16 to #20, merged 2026-09-27), the article sanitizer fix in cells (SPST-48 / PR #22, merged 2026-09-28), and ArticleCell's Milkdown editor, which replaces SPST-48's vendored Toast UI editor (SPST-61 / PR #23, not merged).

For how to work on these parts, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Packages and workspaces

### Layout

The root `package.json` (name `root`, version `7.0.0`) declares three npm workspaces. All three packages are at `7.0.0`, have `author: SpecStory`, and point `repository`, `homepage` and `bugs` at `specstoryai/ai-data-grid`.

| Workspace | npm name | Depends on | Peer dependencies |
| --- | --- | --- | --- |
| `packages/core` | `@specstory/ai-data-grid` | `@linaria/react`, `canvas-hypertxt`, `react-number-format` | `react`, `react-dom` (`^19.0.0`), `lodash`, `marked`, `react-responsive-carousel` |
| `packages/cells` | `@specstory/ai-data-grid-cells` | `@specstory/ai-data-grid` `7.0.0` (exact), `@linaria/react`, `dompurify` `^3.4.16`, six `@milkdown/*` packages at `~7.22.2` (`core`, `plugin-history`, `preset-commonmark`, `preset-gfm`, `prose`, `utils`), `react-select`. No `prosemirror-*` or `@toast-ui/*` package (see [Article editor and sanitizer](#article-editor-and-sanitizer)). | `react`, `react-dom` (same range) |
| `packages/source` | `@specstory/ai-data-grid-source` | `@specstory/ai-data-grid` `7.0.0` (exact) | `react`, `react-dom` (same range), `lodash` |

None of them is published to npm yet.

### Build outputs

**core and cells.** Their `build.sh` calls `compile` and `generate_index_css` from `config/build-util.sh`:

1. `tsc` compiles `esm` and `cjs` in parallel into `dist/esm-tmp` and `dist/cjs-tmp`. Both runs write declarations into the same `dist/dts-tmp`.
2. `wyw-in-js` extracts the Linaria styles into per-module `.css` files, and the `import "*.css"` lines are then removed from the JS.
3. The tmp directories replace `dist/esm`, `dist/cjs` and `dist/dts` (the esm run moves `dts-tmp`), and the `tsconfig.*.tsbuildinfo` files are deleted.
4. `generate_index_css` writes `dist/index.css`, which `@import`s every extracted `.css` file.

Cells' `build.sh` does nothing else: since SPST-61 it copies no files (SPST-48's `copy_vendor` step is gone). Cells' three tsconfigs set `module: "ESNext"` and `moduleResolution: "Bundler"` (core and source use `Node16`), because Milkdown's `.d.ts` files use extensionless relative re-exports that `Node16` resolution can't follow. The emitted JavaScript is the same ES modules; apart from the article editor's files, cells' `dist/esm`, `dist/cjs` and `dist/dts` were byte-identical to `main`'s (the Implementor's comparison for PR #23).

**source.** `packages/source/build.sh` doesn't use `compile`. It runs `rm -rf dist`, then `tsc -p tsconfig.esm.json` and `tsc -p tsconfig.cjs.json` in parallel, straight into `dist/esm` and `dist/cjs`. Both configs set `declarationDir` to `dist/dts`, so both runs write declarations there. There is no tmp directory, no `wyw-in-js` step and no CSS. The output is `dist/esm`, `dist/cjs`, `dist/dts` and the two `tsconfig.*.tsbuildinfo` files, which are left in `dist/`.

Because the JS doesn't import any CSS, consumers must import it themselves: `@specstory/ai-data-grid/dist/index.css` for core (also exported as `./index.css`), and `@specstory/ai-data-grid-cells/dist/index.css` for the cells' editor styles, including ArticleCell's (its Linaria styles are extracted to `dist/esm/cells/article-editor/styles.css`, which `dist/index.css` imports). Cells' `exports` are exactly `.` and `./dist/index.css`; SPST-48's `./dist/toastui-editor.css` was removed in SPST-61. `source` has no `dist/index.css` and needs no CSS import. Entry points, the same in all three packages: `main` → `dist/cjs/index.js`, `module`/`browser` → `dist/esm/index.js`, `types` → `dist/dts/index.d.ts`, all mirrored in `exports`. Since WP-AI2, core's `exports` also has `./server` and `./testing` (see [Entry points](#entry-points-server-and-testing)).

### What ships in each tarball (`npm pack --dry-run`)

| Package | `files` | Contents |
| --- | --- | --- |
| core | not set (`.npmignore` excludes only `tsconfig*` and `coverage/*`) | 1,105 files at PR #20 (1,029 at PR #18, 978 at PR #17, 862 at PR #16, 768 before AI Fill): `dist/`, plus `src/` (stories and docs included), `test/`, `API.md`, `CHANGELOG.md`, `build.sh`, ESLint and vitest config, `LICENSE`, `README.md` |
| cells | `["dist"]` | 162 files at PR #23 (124 at PR #22, 120 before it): `dist/`, `LICENSE`, `README.md`, `package.json`. SPST-61 removed `dist/toastui-editor.css` and `dist/vendor/`, and added the article editor's modules and `styles.css`. |
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
- `THIRD_PARTY_NOTICES.md` lists Glide Data Grid (full MIT text), the `dequal` port by Luke Edwards (`packages/core/src/common/support.ts`) and the `use-callback-ref` pattern by Anton Korzunov (`packages/core/src/data-editor/use-initial-scroll-offset.ts`). The in-code attribution comments stay at both sites. SPST-48 added a Toast UI Editor section for the vendored editor; SPST-61 removed it with the editor, so the file is back to its pre-SPST-48 text. Milkdown, ProseMirror, remark and DOMPurify are ordinary npm dependencies, not copied or bundled into the tarball, so they need no entries.
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

### The article editor and React 19 (history)

Until SPST-48, cells used `@toast-ui/react-editor` 3.2.3, which declares a `react ^17.0.1` peer. It worked under React 19 (checked headless during WP2 and SPST-13), but npm printed `npm warn ERESOLVE overriding peer dependency` when installing `-cells`, and `--strict-peer-deps` installs failed; the cells README documented an `overrides` workaround. SPST-48 replaced it with an in-repo wrapper, so the warning and the workaround are gone. SPST-61 rewrote that wrapper for Milkdown, which has no React peer (see below).

## Article editor and sanitizer

ArticleCell (cells) draws the first line of its Markdown on the canvas, with no DOM and no sanitizer. Its overlay editor (`src/cells/article-cell-editor.tsx`, loaded with `React.lazy` by `article-cell.tsx`) is a Milkdown 7.22 editor since SPST-61; the read-only viewer is the same editor with `editable: () => false`. `article-cell.tsx`, `article-cell-types.ts` and cells' 27 exports are unchanged. The design is the SPST-62 plan with the Orchestrator's amendments A1–A6.

Threat model (SPST-49's, unchanged): article Markdown and clipboard or drop content are untrusted (they can come from other users, imports or AI Fill). Nothing from them may execute or leave dangerous DOM in the viewer or the editor, no paste or drop is left to the browser's native insertion, and nothing pasted or dropped can put raw HTML into the stored Markdown.

### Engine and dependencies

- Milkdown's headless packages, all `~7.22.2` and released in lockstep: `@milkdown/core`, `preset-commonmark`, `preset-gfm`, `plugin-history`, `prose` and `utils`. Underneath, ProseMirror does the editing and remark (micromark, mdast) parses and serializes Markdown. `@milkdown/ctx`, `transformer` and `exception` come in through `core` and aren't declared, because `src/` doesn't import them.
- ProseMirror is imported only as `@milkdown/prose/*`, so there's one ProseMirror, the one Milkdown resolves. The eight `prosemirror-*` dependencies, `@toast-ui/editor` and `@types/prosemirror-commands` were removed from cells.
- No other Milkdown plugin is used (no clipboard, upload, slash, block, tooltip or listener plugin), and neither `@milkdown/kit` nor Crepe. There are no node views.
- `dompurify` `^3.4.16` stays, as SPST-48 set it, for D1 and D3.
- Milkdown has no React peer, so the strict-peer consumer installs with no `ERESOLVE` and one React.

### Layout

| File | Contents |
| --- | --- |
| `src/cells/article-cell-editor.tsx` | The wrapper (below). |
| `src/cells/article-editor/create-article-editor.ts` | `createArticleEditor({ root, markdown, readonly, onUpdate })` → `{ view, serialize(), run(), can(), destroy() }`. It configures `editorViewOptionsCtx` with the D3/D4 props, `editable` and the `gdg-article-content` class on the ProseMirror element, uses the presets, history, the D2 schemas and the task-list plugin, and installs D5 on `root` after creation. |
| `…/article-editor/url-policy.ts` | The private DOMPurify instance (`DOMPurify()`), D1 `safeArticleURL` and D3 `sanitizePastedHTML`. |
| `…/article-editor/schema.ts` | D2. |
| `…/article-editor/clipboard.ts` | D4 (`articleClipboardProps`) and D5 (`installPasteDropBackstop`). |
| `…/article-editor/task-list.ts` | `toggleTaskListCommand`, and a plugin whose `handleDOMEvents.mousedown` toggles a task's `checked` when the click lands on the checkbox area. |
| `…/article-editor/toolbar.tsx` | The toolbar, the heading menu, the link dialog and the table buttons. |
| `…/article-editor/styles.ts` | Linaria styles (below). |

### Raw HTML isn't interpreted

Inline HTML (each tag), block HTML and HTML comments in the Markdown become Milkdown `html` atom nodes. They render their source as text (a `span[data-type="html"]`, muted monospace) in the viewer and the editor, and serialize byte for byte. They never reach an HTML parser, live or inert, so no sanitizer is involved. Jake accepted this on 2026-09-28 (plan §13 item 1a, amendment A5); the alternative, a sanitized viewer-only rendering, was rejected. Markdown constructs (links, images, footnotes, code info strings) are parsed by micromark into schema nodes whose attributes are set through DOM APIs, never HTML strings; URLs go through D1.

### Defenses

| ID | Defense | Covers |
| --- | --- | --- |
| D1 | **URL policy.** `safeArticleURL(tag, attr, value)` returns the value only if the private instance's `isValidAttribute(tag, attr, value)` accepts it, otherwise `""`. `https:`, `http:`, `mailto:`, `tel:` and relative URLs pass, `data:` only on `img[src]`; `javascript:`, `vbscript:` and obfuscated forms don't. It fails closed: if `isSupported` is false, every URL is rejected. The model keeps the stored URL, so an unchanged Save still returns the stored Markdown. | Every rendered or parsed link `href` and image `src`, and the link dialog. |
| D2 | **Schema overrides** through `extendSchema`, registered after the presets. The image's `toDOM` and parse rules apply D1 to `src`, and its Markdown runner maps a missing title or alt to `""` (without it Milkdown 7.22.2 throws on `![a](u)` and the image is lost). The link's `toDOM` and parse rules apply D1 to `href`, independently of Milkdown's own `sanitizeLinkHref`. The raw-HTML node has **no parse rule**. Headings render without the `id` Milkdown derives from their text (DOM clobbering). A code block's language parsed from HTML is kept only if it matches `^[\w#+.-]*$`; a language from the Markdown is untouched. | Rendering and copying (ProseMirror's clipboard serializer uses `toDOM`), and HTML parsing for paste, drop and ProseMirror's DOM observer (native mutations). |
| D3 | **Paste and drop HTML sanitizer.** `transformPastedHTML` runs clipboard and drop HTML through the private instance with `FORBID_ATTR: ["data-type", "data-value"]` (how Milkdown's DOM marks raw-HTML, footnote and hard-break nodes) and `FORBID_TAGS: ["style"]` (ProseMirror copies a pasted stylesheet's rules onto the elements). Configuration is per call; nothing calls `setConfig` on the instance. If `isSupported` is false it returns `""`, so the paste falls back to plain text. | Every HTML paste and drop that ProseMirror parses. Defense in depth: ProseMirror already parses in a detached document. |
| D4 | **ProseMirror handlers** (`handlePaste`, `handleDrop`). **A1:** a paste or an external drop into a node whose type has `spec.code` inserts only the `text/plain` flavor (`\r\n` normalized), or nothing if there is none, and is prevented; an HTML-only clipboard therefore adds nothing. An image **file** becomes a `data:image/…` image (through D1, alt = file name); any other file is ignored and prevented. An empty parsed slice inserts the plain-text flavor as paragraphs instead of falling back to ProseMirror's native `capturePaste` (this is also where a paste lands when D3 fails closed). Internal drag-moves (`view.dragging`) stay ProseMirror's. | Code-block paste and drop (P6), empty, files-only and unknown-type pastes, image-file paste and drop. |
| D5 | **Backstop listeners** for `paste` and `drop`, bubble phase, on the editor's frame (the element that contains the ProseMirror element), added after creation and removed on destroy, in the viewer too. They call `preventDefault()` on any event not yet prevented. **A2:** they aren't on an ancestor of the toolbar popovers, so the link dialog's `<input>`s accept an ordinary paste. | Anything ProseMirror leaves to the browser: a paste during composition, a drop it can't place, an event on the frame outside the ProseMirror element. |

The wrapper never uses `innerHTML`, `dangerouslySetInnerHTML` or `insertAdjacentHTML`.

### Entry points

| Path | Handled by | Defenses |
| --- | --- | --- |
| Opening a cell (viewer or editor) | micromark → mdast → schema nodes → `toDOM` | D1, D2; raw HTML stays text |
| HTML paste into text (paragraph, list, table, heading) | D3 → ProseMirror parse in a detached document → schema | D3, D2, D1 |
| Paste into a code block | D4 inserts `text/plain` only, or nothing | D4 (A1), D5 |
| Empty, files-only or unknown-type paste | consumed by D4 | D4, D5 |
| Paste during IME composition | left unhandled by ProseMirror | D5 |
| Drop of HTML, text or a file on text | same parse as a paste | D3, D4, D5 |
| Drop on a code block | D4 inserts `text/plain` only, or nothing | D4 (A1), D5 |
| Drag-moving a selection within the editor | ProseMirror moves the slice | unchanged |
| Native DOM mutations (autocorrect, extensions) | ProseMirror's DOM observer applies the parse rules | D2 |
| Link dialog | `safeArticleURL` before the command runs | D1 |
| Pasting into the link dialog's inputs | the browser (plain-text `<input>`), outside D5's frame | A2 |
| Copying from the editor | ProseMirror serializes with `toDOM` | D1, D2 |

A library update can't silently bypass these: every defense is our code on public Milkdown and ProseMirror APIs, and the guards below fail when one changes. L01 snapshots the schema and its parse rules' tags and styles, and runs D2's guarded parse rules (image URL, link URL, code-block language) and the raw-HTML exclusion directly; L02 snapshots the node views and event-handling plugins; F25 and F26 snapshot the serializer output and the viewer's DOM.

### Wrapper and toolbar

`article-cell-editor.tsx` keeps the default export (`ProvideEditorComponent<ArticleCell>`) and the DOM contract: `#gdg-markdown-wysiwyg`, `#gdg-markdown-readonly`, `.gdg-footer`, `.gdg-save-button`, `.gdg-close-button`, the `onKeyDown` `stopPropagation`, the read-only padding, and a `75vh` height, with the toolbar fixed above a scrolling content frame (`.gdg-article-frame`).

- **Lifecycle.** A `useEffect` appends a fresh element to the frame and calls `createArticleEditor`, which is async: if the effect is cleaned up before it resolves, the result is destroyed as soon as it arrives. Cleanup destroys the editor and removes the element, so StrictMode's double mount leaves one editor. The editable editor takes focus once created.
- **Save.** Right after creation the wrapper records `serialize()` as a baseline. If the document still serializes to it, Save returns `p.value.data.markdown` byte for byte; otherwise it returns `{ ...p.value, data: { ...p.value.data, markdown: serialize() } }`. **Close** calls `onFinishedEditing(undefined)`.
- **Creation failure.** If `createArticleEditor` rejects (for example a Milkdown parse error), the cell shows the stored Markdown as React-escaped plain text in `pre.gdg-article-fallback`, and Save returns the stored Markdown unchanged.
- **Read-only.** No toolbar and no footer; D5 is installed.
- **Toolbar.** Five groups as before: headings (a menu with paragraph and H1–H6), bold, italic, strike | rule, quote | bullet, ordered and task list, indent, outdent | table, link | inline code, code block. Each button has `aria-label`, `title`, `type="button"` and an active or disabled state from the editor state, and `mousedown` is prevented so the editor keeps its selection. Commands are the presets' (`wrapInHeadingCommand`, `turnIntoTextCommand`, `toggleStrongCommand`, `toggleEmphasisCommand`, `toggleStrikethroughCommand`, `wrapInBlockquoteCommand`, `wrapInBulletListCommand`, `wrapInOrderedListCommand`, `sinkListItemCommand`, `liftListItemCommand`, `insertTableCommand`, `toggleLinkCommand`, `updateLinkCommand`, `toggleInlineCodeCommand`, `createCodeBlockCommand`), with these of our own:
  - the rule button runs our `insertRule`, which inserts the rule after the current block and moves the caret to the next block (Milkdown's `insertHrCommand` left an empty paragraph that saves as `<br />`);
  - the task button runs `toggleTaskListCommand` (items become tasks or plain items again; outside a list it wraps the selection in a bullet list of open tasks);
  - inside a table, buttons add a row or a column (`addRowAfterCommand`, `addColAfterCommand`) and delete the row, column or table with prosemirror-tables' `deleteRow`, `deleteColumn` and `deleteTable` (through `@milkdown/prose/tables`), which work with a caret in a cell; there's no context menu.
- **Link dialog.** URL (and text when the selection is empty), Apply, Cancel and Remove. Apply rejects a URL that D1 rejects with an inline error.
- **Popovers** (the heading menu, the link dialog) render inside the wrapper, not in a portal, so the grid's overlay doesn't treat clicks on them as clicks outside.
- The presets' keyboard shortcuts and history's undo and redo work as in Milkdown.

### Styles

`styles.ts` holds Linaria styles scoped under the wrapper; there are no global `.ProseMirror` rules. They cover ProseMirror's base rules, every node's typography, task checkboxes (a CSS `::before` box on `li[data-item-type="task"]`), the raw-HTML atom, footnotes, the toolbar and popovers, using `--gdg-*` variables. The build extracts them to `dist/esm/cells/article-editor/styles.css`, which `dist/index.css` imports, so apps have one CSS import (see [Build outputs](#build-outputs)). No `gdg-` class or variable was renamed.

### Markdown fidelity

- **Unchanged save** returns the stored bytes (the baseline above).
- **Edited save** returns remark's GFM for the whole document. It keeps the meaning of every case in the fidelity corpus and is idempotent, with these normalizations: tables padded and alignment rows `:-`, `:-:`, `-:`; bullets written with `*`, except that a bullet list directly after another bullet list alternates between `*` and `-` (remark's `bulletOther`, so adjacent lists stay separate; F06), `---` and `___` rules `***`; setext headings become ATX; indented and `~~~` code blocks become backtick fences; reference links become inline links and bare URLs `<url>`; two-space hard breaks become `\`; named entities become characters; a trailing newline is added. Raw HTML, HTML comments and `$$…$$` blocks round-trip byte for byte.
- **Compared with the Toast UI viewer** (plan §4.3; Jake accepted these on 2026-09-28, amendment A6): every toolbar feature renders equivalently; raw HTML and comments show as source (above); reference links, bare URLs, single-tilde strike and footnotes now render; `$$…$$` blocks render as ordinary paragraphs, not a custom widget (no custom renderer was ever configured); `javascript:` links and images render with an empty URL, as before; a pasted Office list keeps its text and paragraphs but isn't converted into a list (that was Toast UI's own `mso-list` code; support is ticketed as SPST-66); and the toolbar, link dialog and table editing look and work differently.

### DOMPurify range and deduplication

- `dompurify` `^3.4.16` is a cells dependency. On 2026-09-28, 3.4.13 was the highest first-patched version of any 3.x advisory, and 3.4.16 was `latest` and tested, so it's the floor (SPST-48).
- It's used only through the private instance in `url-policy.ts`, so an app's `setConfig` or `addHook` on the default instance can't weaken D1 or D3, even when the module is shared.
- In a consumer, npm hoists one copy if the app's own range overlaps; otherwise it nests one under `@specstory/ai-data-grid-cells/node_modules`, and bundlers resolve the editor's import from there. Only an app-level `overrides` entry can force a lower version, which isn't supported.
- `npm audit` sees `dompurify` and Milkdown's tree; nothing is vendored any more.

### Tests

All run in jsdom 26 against the real Milkdown and the real DOMPurify; the only mock is a pass-through `vi.mock("dompurify", importOriginal)` that records instances. `test/article-cell-harness.tsx` holds the shared mount, paste, drop, layout-shim and HTML-sink-spy helpers. The payloads (`test/fixtures/article-sanitizer-payloads.mjs`, shared with the browser check) and the benign corpus (`test/fixtures/article-markdown-corpus.mjs`) are synthetic and don't ship.

- `test/article-cell-sanitizer.test.tsx`, 129 tests: R01–R25 through the viewer and the editor's initial load (50); P01–P13 pasted, P10 dropped, with P13 also checking that the saved code fence has no language (13); D01 (12 drops onto a paragraph) and D13–D17, including an image-file drop, a `text/plain` drop, a drop onto a code block, a drop D5 must prevent and A1's HTML-only drop onto a code block (17); C01 (12 pastes into a code block) and C13–C15, including a no-flavor paste, a paste D5 must prevent and A1's HTML-only paste (15); S01–S10, S11 (15, one per toolbar feature) and S12–S16, safe content and behavior (30); I01–I04, the private instance, isolation from the app's `setConfig`/`addHook`, a prototype-pollution case and failing closed (4).
- `test/article-cell-fidelity.test.tsx`, 26 tests: F01–F24, one per corpus document (unchanged Save returns the input bytes, serialize∘parse is idempotent, no text is lost), F25 (snapshot of the edited-save output) and F26 (snapshot of the viewer DOM).
- `test/article-cell-guards.test.ts`, 5 tests: L01 schema lock (a snapshot of nodes, marks, attributes and the parse rules' tags and styles, plus assertions that `html` has no parse rule and that D2's image, link and code-block parse rules, run directly on HTML that hasn't been through D3, clear unsafe values and keep safe ones); L02 node views (none) and the plugins with paste, drop, clipboard or DOM-event props; L03 no markup reaches a live-document HTML sink across the R, P, D and C corpus; L04 no `@toast-ui` in cells' manifest, `src/` or the lockfile, every bare import declared, no `prosemirror-*`, every declared `@milkdown/*` imported and on one `~7.x.y` range, a `dompurify` floor of `^3.4.16`, and exports exactly `.` and `./dist/index.css`; L05 the D1 URL table.
- Cells went from 142 to **225** (142 − 74 for the old sanitizer file − 3 for the vendor test + 129 + 26 + 5). Core (863), source (9) and every export snapshot are unchanged.
- With A1's code-block handling disabled, exactly C15 and D17 fail; with D5 disabled, exactly C14 and D16 fail (the Implementor's self-check at PR #23).
- The browser checks (Chromium, Firefox and WebKit) are described under [Check scripts](#check-scripts).

### The vendored Toast UI editor (history)

From SPST-48 (PR #22, merged 2026-09-28 as `4be24f85`) until SPST-61, cells ran a reproducibly generated, patched copy of Toast UI Editor 3.2.2's ESM build (`packages/cells/vendor/toast-ui/`, from `scripts/vendor-toast-ui.mjs`) with patches P1–P5, which replaced its embedded DOMPurify 2.3.3 with a private `dompurify` 3 instance and hardened paste, drop and URL rendering, and shipped its CSS as `dist/toastui-editor.css`. SPST-61 removed the vendored files, the generator, the vendor test, `build.sh`'s copy step and the CSS export. See the decision log for both.

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

They need Playwright's Chromium (the article sanitizer check also Firefox and WebKit) and aren't in CI.

- `scripts/check-test-project.mjs <base-url> <sample-node_modules-dir>` scans the given `node_modules` (including nested and scoped `node_modules`) for `react` packages, then loads the URL in headless Chromium, waits for a `<canvas>` (30 s) and 2 s more. It fails if there's no canvas, any console or page error, or the `react` copies don't share exactly one version. Missing arguments print the usage and exit 2.
- `scripts/check-article-cell-editor.mjs [url]` defaults to `http://localhost:9009/iframe.html?id=extra-packages-cells--custom-cells`. It double-clicks the article cell at fixed canvas coordinates (the Article column, index 8, at x = 1250 + 75 px; row *r* at y = 36 + 34 *r* + 17 px), retrying up to 3 times. On row 1 it clicks `.gdg-article-content`, presses Ctrl+End and Enter, types a line, types `Bold text` between two clicks on the toolbar's `[aria-label="Bold"]` button, and saves; it fails unless the story's `Edit Cell` log (`onCellEdited`) carries a `data.markdown` containing the typed line and `**Bold text**`. It reopens and cancels, and fails unless there was exactly one edit. On row 0, a read-only article, it fails unless `#gdg-markdown-readonly .gdg-article-content` shows the article's text and there's no `.gdg-article-toolbar`, `[contenteditable="true"]`, Save or Close button (the saved-value and read-only steps were added in SPST-48, the Bold step and the selectors in SPST-61). Console errors fail it, except `Failed to load resource` 404s (the story's image cell with an undefined URL).
- `scripts/check-article-cell-sanitizer.mjs [--browser chromium|firefox|webkit|all] [consumer-node_modules]` (SPST-48, updated in SPST-61) runs in each browser given (default `all`; any other `--browser` value exits 2). The consumer defaults to `test-projects/vite-app/node_modules`, and the script exits 2 if that has no `@specstory/ai-data-grid-cells`. It bundles an in-memory page with esbuild that uses only the public `ArticleCell.provideEditor(cell).editor`, with React, the cells package and `dompurify` resolved from that consumer, and cells' CSS as a consumer loads it: `dist/index.css` with its `@import`s inlined by esbuild.
  - **Rows.** For each fixture it runs the viewer, the editor's initial Markdown, a trusted keyboard paste (the page's copy handler puts the payload on the clipboard), a real drag and drop onto a paragraph and onto a code block, and a paste into a code block (P10, the drop case, isn't pasted), plus A1's HTML-only paste and drop onto a code block (the fixture's `htmlOnlyCodePayload`). In Chromium only, it also runs a "native drop": the payload dropped on a plain contenteditable, where Chromium applies its own drop sanitization, then inserted into the editor's DOM for ProseMirror's DOM observer (D2); other browsers don't sanitize that staging drop. That's 115 rows in Chromium and 102 in Firefox and WebKit.
  - **Native column.** A bubble-phase `paste` and `drop` listener on `document` records whether the event arrived without `defaultPrevented`, meaning the browser's native insertion ran.
  - **Failures.** A row fails if its `window.__xss` sentinel ran, the dangerous-DOM predicate finds anything, a paste or paragraph drop wasn't applied, Native is yes, or a code-block paste or drop changed anything but the code block's text by its plain-text flavor (the check compares the content's structure before and after; the HTML-only rows must change nothing). Save after typing must return the typed Markdown, dragging a selected word within the editor must move it, and pasting a URL into the link dialog's `.gdg-article-link-url` must fill it in (A2). Console and page errors other than failed resource or image loads fail it.
  - **Legacy mode.** If the page has no `.gdg-article-content` (a cells build from before SPST-61), it uses Toast UI's selectors and `dist/toastui-editor.css` (or `@toast-ui/editor`'s CSS for an older tarball), skips the link-dialog step, and records the Native and code-block results without failing on them, for a before-and-after record.
  - **Output.** A result table per browser (ID, case, path, applied, executed, dangerous DOM, Native, result), the bundle's sanitizer-related esbuild inputs, the `dompurify` version resolved from the cells package and bundled, the DOMPurify version literals in the bundle, the number of Toast UI modules in the bundle, and the CSS file used.
  - **Result at PR #23** (the Implementor's run, reused here): on packed `vite-app` and `next-app` consumers, 0 failing rows, Native 0, and save, drag-move and link-dialog paste passing in all three engines; the same script in legacy mode on `main` `4be24f85` recorded 13 Native rows per engine, exactly the code-block pastes (P6).

## Storybook

- Storybook 9 with `@storybook/react-vite` (`.storybook/main.cjs`), stories from `**/src/**/*.stories.tsx`, Linaria through `@wyw-in-js/vite`.
- `npm start` runs `storybook dev -p 9009 --no-open` together with a core watcher. The dev server listens on all interfaces.
- `npm run build-storybook` builds the packages, then a static Storybook into `storybook-build/` (126 stories: 113, plus 13 AI Fill stories at PR #20; see [Stories](#stories-docs-site-guide-and-live-validation-wp-ai5)). The `MoreInfo` styled component exported from `packages/source/src/stories/use-data-source.stories.tsx` is kept out of the story list with `excludeStories`.
- Hosted on Vercel; see [Storybook hosting (Vercel)](#storybook-hosting-vercel).

### Smoke test

`scripts/smoke-storybook.mjs` (`npm run smoke-storybook`) serves `storybook-build/` on `127.0.0.1` at a random port with a small `node:http` server, reads the story ids from `index.json`, opens each story's iframe in headless Chromium (Playwright, a root devDependency) and waits 1.5 s. A story fails when it logs a console error or page error that no substring in `errorAllowlist[storyId]` matches, or when it has no `<canvas>` and isn't in `noCanvasAllowlist`. `FIXED?` flags allowlist entries whose errors no longer occur. The allowlist has 8 entries: one image-cell demo with an undefined URL (404) and seven test-case stories that hotlink an Imgur image (403). Current result: 126 visited, 8 known, 0 unexpected, 0 without a canvas (113 before PR #20; the AI Fill stories need no allowlist entries). It isn't run in CI.

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

- There are 47 pages: the 36 GitBook pages, the hand-maintained `about.mdx`, and the 10 pages of the hand-maintained AI Fill guide in `ai-fill/` (PR #20). The GitBook welcome page is mapped to `index.mdx`, which is hand-maintained. Sections: Extended QuickStart Guide, FAQ, API (DataEditor, DataEditorCore, DataEditorRef, Cells, Common Types), Guides and AI Fill, listed before About.
- `docs/scripts/import-gitbook.mjs` does the following:
  - parses `https://docs.grid.glideapps.com/llms.txt` and fetches each `<page-url>.md`;
  - converts GitBook and HTML syntax to MDX: figures and images, HTML tables to Markdown tables, `{% content-ref %}` to unmint `<Card>`;
  - rewrites absolute GitBook links to `/docs/...` and `@glideapps/*` imports to `@specstory/*`, and escapes `{`, `}` and `<` in prose;
  - downloads the 17 GitBook-hosted images to `docs/public/images/`;
  - rewrites every `meta.json` in llms.txt order, then lists the hand-maintained sections (`HAND_MAINTAINED_SECTIONS`, currently `ai-fill`) and About last.
- Pre-7.0.0-release content:
  - An unmint `<Note title="Not on npm yet">` follows the `npm i @specstory/ai-data-grid` command on the welcome page's Quick Start (`index.mdx`) and in step 1 of `extended-quickstart-guide/index.mdx`. It says 7.0.0 isn't on npm yet and links to the root README's [Installing before the npm release](README.md#installing-before-the-npm-release) section on GitHub instead of repeating the tarball steps.
  - The welcome page's intro says to migrate by upgrading to React 19 first, then changing the package names and imports, matching the README's "Migrating from 6.x".
- Links to the hosted Storybook (https://ai-data-grid-storybook.vercel.app): the welcome page ("Lots of fun examples are in our Storybook"), and two FAQ answers in `faq.mdx`: search (story `ai-data-grid-docs--search`) and custom rendering (story `ai-data-grid-dataeditor-demos--custom-drawing`).
- The importer never writes `index.mdx`, `about.mdx` or anything under `ai-fill/` (`HAND_MAINTAINED` in the script, which includes `HAND_MAINTAINED_SECTIONS`; a page is skipped when its path or its first path segment is listed). It overwrites all other pages. The rebrand edits that replace "Glide Data Grid" in generated prose are manual. A re-import on 2026-09-25 reverted them in five pages (`api/cells/index`, `extended-quickstart-guide/index`, `extended-quickstart-guide/copy-and-paste-support`, `extended-quickstart-guide/working-with-selections`, `faq`). The "Not on npm yet" note in `extended-quickstart-guide/index.mdx` and the two Storybook links in `faq.mdx` are hand edits to generated pages too, and a re-import removes them the same way.

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

AI Fill (SPST-16) is developer-configured AI filling of grid columns with Jev, TypeSafe's Choice, Score and Noul primitives. It is being built into core, `@specstory/ai-data-grid`, in five stacked PRs (WP-AI1 to WP-AI5). The design is SPST-17's plan with its Amendment 1. All five packages exist, none merged: WP-AI1 (PR #16), a pure TypeScript foundation; WP-AI2 (PR #17, stacked on it), the execution layer (Jev clients, scheduler, cache, result store) plus the `/server` and `/testing` entry points; WP-AI3 (PR #18, stacked on PR #17), the grid integration: the optional `aiFill` prop on `DataEditor`, a lazily loaded controller, canvas rendering of AI states, fills, the commit path and undo; WP-AI4 (PR #19, stacked on PR #18), the built-in UI: AI menus that coexist with the app's, the scope confirmation, the status bar, the inspector and configurable shortcuts; and WP-AI5 (PR #20, stacked on PR #19), 13 Storybook stories, the docs site guide and the live check, with no product code change. Core's dependencies are unchanged; WP-AI2 added two `exports` subpaths and two `cycle-check` roots. The user-facing reference is the "AI Fill" chapter of `packages/core/API.md`, and the user guide is the docs site's AI Fill section.

### Module layout

All paths are under `packages/core/src/ai-fill/`. Tests are in `packages/core/test/ai-fill/` (473 tests in 29 files; core also gained two export tests in `test/public-api-exports.test.ts`, for 863 in total). Source has one more, `packages/source/test/ai-fill-undo.test.tsx` (9 in total).

| Module | Contents | Public |
| --- | --- | --- |
| `index.ts` | Barrel of the public names, re-exported by `src/index.ts` with `export *`. | — |
| `contract/` | Jev request, question and answer types (`types.ts`); `parseJevAnswer` (`parse-answer.ts`), which checks a raw answer against its question and returns a `ParsedJevAnswer` (`ChoiceAnswer`, `ScoreAnswer` or `NoulAnswer`) or a reason; `JevEndpointErrorBody` (`endpoint.ts`). | yes |
| `config/` | 41 configuration types (`types.ts`, including `AIFillShortcuts`), 20 result, event and error types (`results.ts`), the API types `AIFillApi`, `AIFillTarget`, `AICellState`, `AIRunState` and `AIMenuItem` plus two unexported helpers, `AIActiveRun` and `AIFillRun` (`api.ts`), and `validateAIFillConfig` (`validate.ts`), which returns every problem as `{ path, message, columnId? }`. | yes |
| `identity/` | `canonicalJson`, `buildQuestion`, `questionFingerprint`, `inputFingerprint`, `cacheKey`, `resolveModel` and `shortHash`. | no |
| `policy/` | `mapAIOutput` (`map-output.ts`), `evaluateAIPolicy` (`evaluate-policy.ts`), `isAIDestinationEmpty` and `defaultToCell` (`cells.ts`), and the commit-guard helpers (`commit-guards.ts`). | the first three |
| `transport/` | `createJevTransport` (`client.ts`) for the endpoint, direct and custom modes; `JevTransportError`, `errorFromResponse` and the status mapping (`errors.ts`); `backoffDelay`, `retryDelay` and an abortable `sleep` (`retry.ts`); `isBrowserEnvironment` (`environment.ts`). | no |
| `engine/` | `AIFillEngine` (`engine.ts`), `AIFillStore` (`store.ts`), `RequestScheduler` (`scheduler.ts`), `TokenBucket` (`token-bucket.ts`), the LRU answer cache (`lru-cache.ts`), `groupRequests` (`requests.ts`), row-state building and missing-input checks (`state.ts`), `defaultExecution` and `resolveExecution` (`defaults.ts`). | no |
| `react/` | `bridge.ts` (static: `AIFillBridge`, `AIFillControllerProps`, `linkAIFillRef`), `controller.tsx` (the lazy controller), `session.ts` (`AIFillSession`: composition, fills, commits, revert, repaints, change notifications), `grid-host.ts` (`AIFillGridHost`, the engine's host), `draw.ts` (canvas presentations and the header badge), `status.tsx` (`AIFillStatus`). | `AIFillStatus` only |
| `react/ui/` | `ui-controller.ts` (`AIFillUI`: popups, menu items, coexistence, confirm decisions, review, Choose, shortcuts), `ui.tsx` (`AIFillUIView`), `menu.tsx`, `confirm.tsx`, `inspector.tsx`, `status-bar.tsx`, `popup.tsx` (`AIPopup`), `styles.ts` (the Linaria styles). | no |
| `server/index.ts` | `createJevHandler`, `toNodeListener`, `JevHandlerOptions`, `JevNodeListener`. | `/server` |
| `testing/index.ts` | `createMockJev`, `MockJev`, `MockJevOptions`, `MockJevRule`, `MockJevCall`. | `/testing` |
| `stories/` | Storybook stories 1–10, 12 and 13 and their `story-kit.tsx` (WP-AI5). Excluded from core's build by `tsconfig`, shipped in the tarball with `src/`. | no |

### Public API

WP-AI1 adds 92 core exports (151 → 243): 5 functions (`validateAIFillConfig`, `parseJevAnswer`, `evaluateAIPolicy`, `mapAIOutput`, `isAIDestinationEmpty`) and 87 types (20 contract types, the 40 config and 20 result types, and 7 helper types: `ParseJevAnswerResult`, `AIFillConfigIssue`, `ValidateAIFillConfigOptions`, `MapAIOutputResult`, `MapAIOutputError`, `EvaluateAIPolicyInput`, `AIPolicyEvaluation`). The configuration, result and event types already describe the later layers (connection modes, execution limits, fill scopes, observers); only the functions above run in this stage.

WP-AI2 adds one type to `.` (`JevEndpointErrorBody`, 244 in total) and makes `AIResultEvent` gain an optional `reason?: "row-missing"`. The `/server` entry exports 4 names and `/testing` 5 (see the table above). The engine and transport are internal: tests and `scripts/jev-live-check.mjs` import them by path.

WP-AI3 adds four types to `.` (`AIFillApi`, `AIFillTarget`, `AICellState`, `AIRunState`; 248 in total), the optional `aiFill` prop on `DataEditorAllProps` (the exported `DataEditor`), the optional `DataEditorRef.aiFill` member, and `onReady` on `AIFillConfig`. The prop and the member add no export names. There is no `AIFillDataEditor` and no public `useAIFill` hook. The five public functions are still exported, now as constants read from module namespaces (see the decision log).

WP-AI4 adds four names to `.` (252 in total): the `AIFillStatus` component (a runtime export, also a namespace constant), and the types `AIFillStatusProps`, `AIMenuItem` and `AIFillShortcuts`. The rest is additive with no new names: `AIFillApi` gains `getMenuItems`, `openMenu`, `openInspector` and `subscribe`; `AIActiveRun` gains `columnTitles`; `AIFillConfig` gains `menus`, `statusBar` and `shortcuts`, which `validateAIFillConfig` checks. The menu target type (`{ column } | { cell }`) is written inline in the signatures and not exported.

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
- **Engine API** (internal): `plan`, `run`, `fill`, `retry` (failed cells, same scope and mode), `rerunStale`, `cancel`, `reject`, `recordCommit`, `markEdited`, `notifyRowsChanged`, `setConfig`, `getRecord`, `subscribe`, `metadata` and `dispose`. `recordCommit` reserves a write: WP-AI3's commit path calls it after its guards and immediately before writing, and writes only the cells it returns in `committed`. It refuses an already-committed result (`commit-blocked`); the other guards run in the commit path. For an `auto-apply` commit it also moves each committed result from `suggested` to `applied` in the counts of the run that settled it, if that run hasn't finished and the result is still the one it counted (each run keeps the `requestSeq` of every cell it counted as `suggested`). WP-AI3 also exposed `planRerun(status, target?)`, which `retry` and `rerunStale` now run through, so the session can report a re-run's plan.
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
| `onKeyDown` | the app's first, with `preventDefault` / `cancel` spied; if neither was called, `ui.shortcut(event)` (see [Keyboard map](#keyboard-map)) |
| `onHeaderMenuClick`, `onHeaderContextMenu`, `onCellContextMenu` | WP-AI4, only with `menus: "built-in"`: on an AI column or cell, open the AI menu (context menus call `preventDefault()`), with "More options…" calling the app's handler when it has one; elsewhere, call the app's handler |
| `onCellClicked` | WP-AI4: calls the app's, then opens the inspector for a left click within 24 px of an AI cell's right edge (the marker) on a result that isn't accepted, applied or rejected |
| `className` | WP-AI4: the app's plus `gdg-ai-grid` and `gdg-ai-grid-<n>` |
| `gridSelection`, `onGridSelectionChange` | untouched when the app controls the selection; wrapped to observe when the app only listens; when it passes neither, AI Fill holds the selection (`heldSelection`) and passes both |

`getCellContent`, `validateCell`, `rows` and `portalElementRef` (read for the popups) pass through untouched, as do the menu callbacks with `menus: "compose"` or `"off"`. Each wrapper is memoized on the app handler it wraps (`Memo` in `session.ts`), so it keeps its identity while the app's does. The session keeps the latest unwrapped app props (`update`), and its own writes call the app's handlers directly, so they aren't observed as user edits.

**The merged ref.** With `aiFill` set, the core grid gets `mergedRef`, which stores the core handle and calls `linkAIFillRef(appRef, handle, api)`: the app's ref gets `{ ...handle, aiFill: api }` once the API exists, and the plain handle before (the handle's methods are closures, so a shallow copy is safe). `onBridge` calls it again when the API appears or goes away. The callback is stable per app `ref`.

**Reading the grid** (`AIFillGridHost`). Everything is addressed by `(rowId, columnId)`. `rowIndex(rowId)` uses `rows.getRowIndex` when given and accepts its answer only if it is an integer in range whose `getRowId` is the same id; otherwise it scans `getRowId` over the rows once and caches the map until a microtask clears it. The session calls `invalidate()` before fills, commits, reverts, edits and `notifyRowsChanged`. `colIndex` maps column ids, cached per `columns` array. `readCell` returns `undefined` when the row or column isn't displayed, so to the engine a filtered-out row looks the same as a deleted one.

**Fills** (`session.fill`). `selection` and `selection-empty` take the AI cells in the selection (the app's, the last one observed, or the held one): whole selected columns, selected rows × AI columns, and the current range and range stack, de-duplicated. `column-empty` and `column` need `rowScope` (otherwise a `configuration` error and nothing is sent); `"displayed"` means every displayed row, and a list is used as given, so rows that aren't displayed are skipped as `unloaded` by `engine.plan`. The engine skips a column whose `fillScopes` doesn't list the scope as `not-applicable`.

**Targets** (`session.resolve`). The method passes the statuses it acts on (`accept`: `suggested`, `review`; `reject`: those plus `withheld`, `stale`; `retry`: `error`; `rerunStale`: `stale`; `clear`: every status except in flight), and the target picks the cells: `{ cells }` as given, `{ selection: true }` the AI cells in the selection, `{ column, filter }` every record in the store for that column. A column filter narrows the statuses: `all` keeps them, `eligible` keeps only `suggested`, `review` only `review`. `accept` then drops a column target's rows that aren't displayed; `reject` and `clear` don't, so on a column they also reach results on filtered-out rows. `retry` and `rerunStale` go through `engine.planRerun`, whose `plan()` skips a row that isn't displayed as `unloaded`.

The built-in UI's result items use the same targets and the same statuses as these methods ("Reject all suggestions" is `rejectable({ column, filter: "all" })`, the set `api.reject` rejects); see "Menus and coexistence" under [Built-in UI (WP-AI4)](#built-in-ui-wp-ai4).

**Store to repaint.** The session subscribes to the engine's record changes. Changed cells are queued and flushed in one microtask: each is located by id and repainted with `ref.updateCells` (no animation loop; `drawAICell` is static). Auto-apply is queued when the record change arrives and written at the start of the same flush: a record that just settled from its own request (its `requestSeq` matches the one seen in flight) as `suggested` with an `apply-candidate` decision in an `apply`-mode run, not manual and not committed, is committed with `source: "auto-apply"`. A result re-decided by a policy change never auto-applies. The flush's microtask is queued when the result settles, before the engine queues the run's finish (`scheduleFinish`), so the write, and `recordCommit`'s recount to `applied`, land before `onRunEnd`. `api.cancel` writes the queued auto-applies (of every run) before it cancels, for the same reason; `clear` doesn't, and the flush then finds no record to write.

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

### Built-in UI (WP-AI4)

The user-facing behaviour is in API.md ("Built-in UI", "Menus in apps that already have menus", "Keyboard"). This is how it is built. All of it is in the lazy controller's chunk; nothing in `react/ui/` is in a grid's initial bundle.

**Structure.** The controller creates an `AIFillSession` and an `AIFillUI` (`react/ui/ui-controller.ts`) and sets `session.ui`. The session calls the UI through `AIFillSessionUI` for `getMenuItems`, `openMenu`, `openInspector`, its part of prop composition (`compose`) and shortcuts (`shortcut`). `AIFillUI` holds the one open popup (`menu`, `confirm` or `inspector`, never two) and the last announcement. The controller renders `AIFillUIView` (`ui.tsx`), which re-renders from `session.subscribe` / `session.version` through `useSyncExternalStore`. The session calls `changed()` on run start, progress and end, after each record-change flush, on selection changes and when the bridge is published; `api.subscribe` exposes the same notifications.

```
AIFillController
  ├─ AIFillSession ◄──► AIFillUI (popup, announcement, menu items, actions)
  └─ AIFillUIView
       ├─ open popup ─► AIPopup ─► portal: portalElementRef ?? #portal   (menu | confirm | inspector)
       ├─ AIStatusBar ─► portal: the grid element (.gdg-ai-grid-<n>)      (unless statusBar: false)
       └─ live region (.gdg-ai-sr, role=status) ─► portal
```

**Portals.** `AIPopup` (`popup.tsx`) renders into `portalElementRef?.current ?? document.getElementById("portal")`, the overlay editor's element, inside a `ClickOutsideContainer`, with the `click-outside-ignore` class so the grid doesn't treat a click in it as a click outside. It is `position: fixed` at the anchor (below a header or cell, from `DataEditorRef.getBounds`, or at a right-click point), shifted back inside the viewport after layout. It copies the `--gdg-*` variables from the grid element's inline style (the `theme` prop) so it follows the grid's theme. The confirm dialog has no anchor and is centred by CSS.

**Menus and coexistence** (`menus`, default `"built-in"`). With `"built-in"`, `compose` wraps the three menu callbacks. On a column or cell whose `GridColumn.id` is an AI column (and, for cells, a row within `rows`), it opens the AI menu with a `more` callback that calls the app's handler with the original arguments; `AIFillUIView` appends it as the "More options…" item after a separator. Anything else goes to the app's handler unchanged. `openMenu` (the API and the menu shortcut) opens the same menu with no `more`. With `"compose"` and `"off"` the callbacks aren't wrapped, `openMenu` returns `false`, and `getMenuItems` still works. The items are computed when the menu opens, from `AIFillUI.getMenuItems`:

- **Column** (`columnItems`): the fill items (`fill-column-empty` and `fill-column` need `rowScope`; `fill-column` also needs `column` in `fillScopes` and `overwrite` other than `"never"`; `fill-selection`; `fill-apply` when the policy has `autoApply`), then the result items below.
- **Cell** (`cellItems`): `fill-selection` and `fill-selection-empty` over every AI column in the selection, `fill-apply` when one of them has `autoApply`, then `accept`, `reject`, `inspect`, `retry` or `rerun` (for a stale or rejected result) and `cancel` during a run.
- **Grid-wide** (`getMenuItems()`, the status bar): the result items over every AI column.
- **Result items** (`resultItems`). Each item does what the API method does with the same target, and each *N* is what the item acts on:
  - `accept-eligible`: `acceptable({ column, filter: "eligible" })` per column (`suggested` only, displayed rows only).
  - `review-next`: "Review *N*" (column, `review`) and grid-wide "Review next" (`review` and `suggested`) count only the results `reviewNext` can reach: a displayed AI column on a displayed row. Disabled with "Nothing to review" when there are none.
  - `reject-all`, column only: `session.rejectable({ column, filter: "all" })`, the same `suggested`, `review`, `withheld` and `stale` results that `api.reject` rejects, including those on filtered-out rows (a column target reads the store). Disabled with "Nothing to reject". `api.reject` and the reject shortcut use `rejectable` too.
  - `retry-failed` and `rerun-stale`: `session.rerun(status, { column, filter: "all" })`, or with no target for the grid-wide items, the same as `api.retry` / `api.rerunStale`. *N* is `cells + failed` of `session.planRerun(status, target)`, the plan the run would start, so results on rows that aren't displayed (skipped as `unloaded`) don't count. Disabled with the plan's error (for example `maxCellsPerRun`), "Nothing failed" / "Nothing is stale" when nothing matches, or "Nothing to retry: …" / "Nothing to re-run: …" with the skip reasons (for example "1 not loaded yet") when everything is skipped.
  - `cancel` during a run: `api.cancel()`, so results queued for auto-apply are written first (see "Store to repaint").

A fill item is disabled with the plan's error, or with "No cells to fill" and the skip reasons when the plan has no cells. `run()` does nothing for a disabled item.

**Confirm dialog** (`confirm.tsx`). A UI fill goes through `AIFillUI.requestFill`, which calls `session.planFill` (the engine's `plan`, which sends nothing). It opens the dialog when the plan has an error, when the scope is `column`, when the mode is `apply`, or when `cells + failed` is over `execution.confirmAbove` (default 100); otherwise it starts the plan it just made (`session.start(plan)`, no second plan). `api.fill` calls `session.fill` (`planFill` then `start`) directly and never asks. The dialog (`role="dialog"`, `aria-modal`) shows the columns, the rows (`rowScope`'s label or the selection), the cells to evaluate, the skipped cells by reason, "About *N*" requests from the plan, and whether anything is written; the columns and the row-scope label are worked out once, in the `AIFillRequest`, not read live. With a plan error it shows only the error and Close, and with no cells to evaluate the confirm button is disabled.

Confirming calls `AIFillUI.confirmFill(shown)`, which plans again with the same scope, columns and mode and compares the two statements: the sorted (rowId, columnId) cells to evaluate (`cells` plus `failed`), the skip counts by reason, the columns, the row-scope label, the estimated requests and the error message (fix round 3). If they are equal it closes the dialog and starts the new plan, which is the one shown, so an unchanged scope starts on the first confirm. If not, nothing starts: the dialog is replaced with the new plan, marked `changed`, and shows "The scope changed while this dialog was open. Check it and confirm again." above it; the `gdg-ai-sr` live region announces the change; focus stays in the dialog, on the confirm button, or on the dialog itself when the button is missing (a new plan with an error, which offers only Close) or disabled. Every UI fill that can ask goes through `requestFill` and `confirmFill`: the menus, `getMenuItems(...).run()` and the fill shortcut.

**Status bar** (`status-bar.tsx`, `AIStatusBar`). It reads only the public API: `getRunState()`, `getMenuItems()` and `subscribe`. While a run is active it shows "Evaluating *titles*: done / total" (`AIActiveRun.columnTitles`) and the enabled `cancel` item; afterwards the last run's summary with the enabled `review-next`, `accept-eligible` and `retry-failed` items, and × (dismissed per run id). The summary puts "*N* applied" first when the run's `counts.applied` is set, which only an auto-apply write during the run does (fix round 2; see "Store to repaint"). `AIFillUIView` portals it into the grid's element with `gdg-ai-status-floating` (`position: absolute`, centred 8 px above the bottom edge; the grid container is `position: relative`), so the grid's size and layout don't change. The element is found with `document.querySelector(".gdg-ai-grid-<n>")` after each commit; the per-grid class comes from a module counter. The public **`AIFillStatus`** (`react/status.tsx`) is a static component that renders nothing while `api` is `undefined`, and otherwise a `Suspense` around `React.lazy(() => import("./ui/status-bar.js"))`, so importing it doesn't put the status bar in an app's initial bundle.

**Inspector** (`inspector.tsx`). `openInspector` needs a displayed cell with a record; it selects the cell (`session.select`), scrolls to it and opens the inspector below it. The content comes only from `AICellState` (status, output, decision reason with measure, actual and threshold, error, blocked reason, manual, model and received time) and the column definition: Choice options by probability (limited by `presentation.alternatives`), Score levels with probabilities, Noul probability and band. Actions: Accept and Reject (`ui.accept` / `ui.reject`), Choose (`ui.choose` → `session.commit(refs, "choose", { value })`, for `suggested`, `review` and `withheld`, with every commit guard), Retry (`session.rerun("error", { cells })`), Re-run (`rerunStale` for a stale result; `session.refill`, a new plan with the record's scope, for a rejected one), and Edit manually (`ui.editManually`: close, select the cell, then on the next tick focus the grid and dispatch a synthetic Enter `keydown` to the focused element, so the grid's own `activateCell` binding opens the editor). "Review next" (`ui.reviewNext`) scans displayed rows from the focused cell, wrapping, over the AI columns in display order.

**Choose values** (`choices` in `inspector.tsx`): Choice options whose `outcome` is `"value"` or that set a `value` (written as `value ?? label ?? id`); Score levels as the index (`store` `"score"` or `"level"`), the label (`"level-label"`) or the level's `value` (`"level-value"`, levels without one skipped), and none for a function `store`; Noul Yes / No as `true` / `false`, the label, or 1 / 0 (`"probability"`).

**Session changes for the UI.** `fill` is split into `planFill` and `start` (public on the internal class, so the confirm dialog starts the plan it compared); `rerun` is split into `planRerun` and `start` the same way; `rejectable(target)` resolves what `reject` covers; `refill` re-plans rejected cells; `commit` takes an optional chosen value; the shortcut handling moved from the session to `AIFillUI.shortcut`; selection writes go through `session.select`; and several session members became public for `react/ui/` (the class itself stays internal).

#### Keyboard map

| Where | Keys | Action |
| --- | --- | --- |
| Grid (`AIFillShortcuts.menu`) | Shift+F10, ContextMenu | Column menu when a whole AI column is selected (`selection.columns.first()`), otherwise the cell menu for the focused AI cell; only with `menus: "built-in"` |
| Grid (`inspect`) | Alt+ArrowDown | Inspector for the focused AI cell with a result |
| Grid (`accept`) | Mod+Enter | `commit(acceptable({ selection: true }), "accept")` |
| Grid (`reject`) | Mod+Backspace | `engine.reject` of the selection's `suggested`, `review`, `withheld` and `stale` results |
| Grid (`fill`) | Mod+Alt+F | `requestFill("selection")` when the selection has AI cells (asks above `confirmAbove`; confirming goes through `confirmFill`) |
| Menu | ArrowDown / ArrowUp (wrapping), Home, End, letters (type-ahead), Enter / Space, Esc / Tab | Move, jump, pick, close |
| Confirm dialog, inspector | Tab / Shift+Tab (trapped by `dialogKeys`), Esc | Cycle through buttons and selects, close |
| Inspector | Enter on the dialog itself | Accept, when the result is `suggested` or `review` |

Grid shortcuts use core's `isHotkey` with the `keybindings` syntax (a letter matches by `keyCode`, so Mod+Alt+F works on macOS, where Alt changes `event.key`). Defaults are in `ui-controller.ts`; each key can be rebound or set to `false`, and `shortcuts: false` turns all off. A shortcut that matches but has nothing to act on returns `false`, and the key goes to the grid. Closing from the keyboard or after an action returns focus to the grid (`ui.close(true)`); a click outside or "More options…" doesn't.

**Styles** (`styles.ts`). One Linaria `css` block, `aiStyles`, applied to every popup, the status bar and the live region, and extracted into core's `dist/index.css` like the rest of core's styles (no new CSS entry). Selectors are `gdg-ai-*` classes; colors read `--gdg-ai-*` variables with `--gdg-*` fallbacks (two, `--gdg-ai-review` and `--gdg-ai-error`, fall back to fixed colors). The canvas markers still use the grid theme. The CSS added 864 B gzip (2,044 → 2,908 B, limit 4,600 B).

### Stories, docs site guide and live validation (WP-AI5)

WP-AI5 (PR #20) changes no product code: it adds stories, the docs site guide, a boundary rule for the stories and the live-check record, and updates core's README and API.md. Exports, tests other than the boundary rule, and the bundle are unchanged.

**Stories.** 13 stories in four Storybook groups under `AI-Data-Grid/AI Fill/`, with names numbered `01`…`13` so Storybook's alphabetical order matches the plan's:

| Group | Stories | File |
| --- | --- | --- |
| `1 Primitives and thresholds` | 01 Buyer-persona Choice (full workflow), 02 Score seniority with level mapping, 03 Noul bands, 04 Threshold boundary 0.79 vs 0.80, 05 Probability ≠ confidence, 06 High Score with low confidence | `packages/core/src/ai-fill/stories/ai-fill-primitives.stories.tsx` |
| `2 Review, errors and rows` | 07 Review queue and auto-apply, 08 Errors (auth, rate limit, timeout, malformed, type mismatch), 09 Stale: editing a source while pending, 10 Sorting and filtering while pending | `packages/core/src/ai-fill/stories/ai-fill-review.stories.tsx` |
| `3 Undo with useUndoRedo` | 11 Bulk accept and undo | `packages/source/src/stories/ai-fill-undo.stories.tsx` |
| `4 Menus and opt-out` | 12 Coexisting with app menus (and compose mode), 13 Disabled (no `aiFill`) | `packages/core/src/ai-fill/stories/ai-fill-menus.stories.tsx` |

- Every story turns AI Fill on only through `aiFill` and answers from `createMockJev` (imported from `@specstory/ai-data-grid/testing`) with fixed latency and seeded answers over synthetic contacts, so it makes no Jev call. `story-kit.tsx` holds the shared contacts, a small editable table with sorting and filtering, the seeded rules, the frame and the endpoint control.
- Every story except 08 (the mock injects its failures) and 13 (no `aiFill`) has an `endpointUrl` control: empty uses the mock, and a URL switches the story to `{ mode: "endpoint", url }` (`useStoryConnection`), for example the dev proxy.
- The core stories import `DataEditor` from `../../data-editor-all.js`, like core's other stories, so Linaria and hot reload work from source. Story 11 is in the source package because it uses the real `useUndoRedo`, and core never imports source; it imports core by package name, so it runs against core's `dist/`.
- Story 10 shows the filtered-row limitation as it is (a row filtered out while pending is logged as `row-missing`), and story 7 shows the applied count: after its "Fill and apply" run the status bar reads "Done: 2 applied · 3 suggested · 2 review · 1 withheld · …", and a log under the grid shows the same counts from `onRunEnd`.

**Docs site guide.** `docs/content/docs/ai-fill/`, 10 pages plus `meta.json`: overview and quick start (`index`), `configuration`, `connecting-to-jev`, `primitives`, `result-policies`, `fill-scopes-and-review`, `persistence-commits-and-undo`, `examples`, `limitations` and `live-validation`. It's hand-maintained (see [Content and importer](#content-and-importer)), and the root `meta.json` lists it after Guides and before About. `packages/core/README.md` and the API.md "AI Fill" chapter link to it at `https://ai-data-grid-docs.vercel.app/docs/ai-fill`; like the stories, it is on the hosted sites only once it reaches `main`.

**Live validation.** One run of `scripts/jev-live-check.mjs` on 2026-09-26 at 00:26 UTC (SPST-32), from Node 24 in direct mode: 4 calls (three questions plus the bad-key check) in 2 HTTP requests, no retries. `jev-latest` was answered by `jev-1.13.0`. The persona Choice (`economic`, probability 1, confidence 1) and the seniority Score (3, confidence 1) were suggested, the budget Noul (0.73) went to review, and the bad key gave HTTP 401, reported as `authentication`. The answer shapes matched the contract with no deviations. The record, with the answers as returned, is `docs/content/docs/ai-fill/live-validation.mdx`; it records no key and makes no accuracy or latency claim. SPST-16 has used 12 of its 20 live calls (8 in planning, 4 here).

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
- **`scripts/jev-live-check.mjs`** (manual only): one direct-mode request with three questions about a synthetic contact, with `maxRetries: 0`, plus one bad-key request expecting 401: 4 counted calls in 2 HTTP requests (3 calls in 1 request with `--skip-401`); `--dry-run` sends nothing. Its header comment gives the same count and names the record page, `docs/content/docs/ai-fill/live-validation.mdx`. It imports `buildQuestion` and `createJevTransport` from `packages/core/dist/esm/ai-fill/`, so it needs a build.
- **Live-Jev guard.** `vitest.setup.ts` installs `test/ai-fill/live-jev-guard.ts` for every core test: it wraps `fetch`, rejects any URL on `typesafe.ai` or a subdomain, and fails the test in `afterEach` even if the code under test swallowed the rejection. `no-live-jev.test.ts` checks it.
- **Node-environment tests.** `vitest.setup.ts` now runs its DOM-only setup (`vitest-canvas-mock`, `ResizeObserver`, `Image.decode`) only when `window` exists, so files marked `// @vitest-environment node` (`boundaries`, `server`, `server-load`) run in plain Node. Under jsdom it behaves as before.
- **Mock Jev** (`testing/index.ts`): rules, fixture replay, generated answers seeded by seed, state and question, latency, error injection for every transport kind and a call log that never records auth values. Its `fetch` speaks Jev's protocol for URLs ending in `/v1/systemone` and the endpoint protocol otherwise, without the handler's checks. It reports `jev-mock-1.0.0` for `jev-latest` and `jev-preview`.

### Guard tests

- `test/ai-fill/boundaries.test.ts` parses every `src/**/*.ts(x)` with the TypeScript compiler and enforces the import rules: (1) `ai-fill/` never imports `src/index.ts`, `src/data-editor-all.tsx` or `@specstory/*`; (2) only `src/index.ts` and `src/data-editor-all.tsx` import `ai-fill/` (plus type-only imports from `src/data-editor/data-editor.tsx`); (3) the graph reachable from `ai-fill/server/index.ts` (relative imports, type-only included) has no `react`, `react-dom` or `@linaria/*` import, no `.tsx` file and no module-level `window` or `document` reference; (4) `ai-fill/testing/` imports only `testing/`, `contract/`, `identity/` and `transport/`; (5) `ai-fill/stories/`, which rule 1 exempts, imports no `@specstory/*` entry but `@specstory/ai-data-grid/testing` and never `src/index.ts`, and nothing outside it imports a story (3 tests, WP-AI5); and core never imports cells or source. It runs in the Node environment.
- `test/public-api-exports.test.ts` pins `.`, `/server` and `/testing` (see [How the API is guarded](#how-the-api-is-guarded)).
- `test/ai-fill/server-load.test.ts` loads the built `/server` with `import()` and `require()` in Node and runs a request through it with a fake `fetch`. Like the bundle budget, it needs `npm run build` first.
- `test/ai-fill/bundle-budget.test.ts`, see below.

### Bundle budget

AI Fill must cost little for apps that render `DataEditor` without `aiFill`. `test/ai-fill/bundle-budget.test.ts` bundles an entry that imports `DataEditor` and `dist/index.css` from core's built `dist/esm`, with the root esbuild CLI (0.25.12): `--bundle --minify --splitting --format=esm`, with `react`, `react-dom`, `marked`, `lodash` and `react-responsive-carousel` external. Sizes are GNU `gzip -9` of the concatenated output files. It uses the CLI because esbuild's JS API refuses to run under jsdom.

| Measure | Baseline (SPST-17 A7, `main` at `a0a121c`) | Measured by the test (`main`, PR #16 and PR #17) | Measured at PR #18 (WP-AI3) | Measured at PR #19 (WP-AI4) | Limit |
| --- | --- | --- | --- | --- | --- |
| Initial JS (entry chunk plus the chunks it imports statically) | 70,374 B | 70,305 B | 70,624 B (+319 B) | 70,639 B | 71,900 B (+1.5 KB) |
| CSS | 2,052 B | 2,044 B | 2,044 B | 2,908 B (+864 B) | 4,600 B (+2.5 KB) |
| AI Fill modules in the initial chunks | — | none | at most `ai-fill/react/bridge.js` (the test passes) | the same | none except `ai-fill/react/bridge.js`; never `transport/`, `engine/`, `server/` or `testing/` (added in WP-AI2) |
| Lazy AI Fill chunks | — | 0 B | 24,244 B | 32,697 B | 40,000 B |

The A7 figures came from a slightly different measurement than the test's (the test gzips the concatenated files); the limits are A7's. It reads `dist/`, so it needs `npm run build` first. CI builds before testing. WP-AI3's numbers were measured on 2026-09-25 from a clean `npm ci` and `npm run build` at `31660d73`, and the lazy chunks again on 2026-09-26 at `869d65de` after fix round 1 (initial JS and CSS unchanged). The initial JS grew by 319 B for the lazy import, the prop wiring and the bridge. The lazy chunks (the controller, session, host, drawing and the engine with everything it imports) were 24,244 B at WP-AI3. WP-AI4's numbers were measured on 2026-09-26 from a clean `npm ci` and `npm run build` at `aa50a7e8`: the built-in UI brought the lazy chunks to 32,255 B (7,745 B left under the 40,000 B cap for WP-AI5), its styles brought the CSS to 2,908 B, and `AIFillStatus` (a lazy wrapper) left the initial JS at 70,638 B, 1,262 B under the limit. After fix round 1 (`8080d6f3`) the bundle test measured 70,639 B initial JS, 2,908 B CSS and 32,329 B of lazy chunks (7,671 B left). After the WP-AI3 merge and fix round 2 (`bafbc5ed`) it measured 70,638 B initial JS, 2,908 B CSS and 32,463 B of lazy chunks (7,537 B left). After fix round 3 (`a9cfb926`) it measured 70,639 B initial JS, 2,908 B CSS and 32,697 B of lazy chunks (7,303 B left); the table gives those. `bridge.js` is still the only AI Fill module in the initial chunks. In the Implementor's `npm run test-projects` run, Vite also emitted the controller as its own chunk (about 23.8 kB gzip) in `test-projects/vite-app`. WP-AI5 (PR #20) changes no product code: the test measured the same 70,639 B / 2,908 B / 32,697 B on 2026-09-26 after merging WP-AI4's `6f86c3e1`.

## Known limitations and risks

- **Raw HTML in articles is shown as source, not rendered** (SPST-61, Jake's decision A5). Articles that used HTML for presentation (for example `<kbd>`, `<details>` or an HTML table) show the tags. The HTML is kept byte for byte, so nothing is lost.
- **A pasted Office list isn't converted into a list.** It keeps its text and paragraphs; Toast UI's `mso-list` conversion is gone (SPST-61, Jake accepted it as A6). Support is the backlog ticket SPST-66.
- **Milkdown has one main maintainer,** and 7.22.2 shipped the untitled-image crash that D2 works around. Mitigated by the `~` range, the L01, L02, F25 and F26 snapshots and defenses that live in our code; the next candidate engine, if needed, is Tiptap 3 with a Markdown layer we own (SPST-62 §2).
- **A consumer `overrides` entry can force an older, vulnerable `dompurify`** on cells. That's documented as unsupported in the cells README. With an old DOMPurify, the ProseMirror schema still limits what a paste can create.
- **Remote images still load** in articles (tracking pixels), as before SPST-61. Apps that need to block them use a CSP.
- **Stored Markdown isn't rewritten.** A `javascript:` link already in an article's Markdown stays there; only its rendering is blocked (D1). Other renderers of the same Markdown must sanitize it.
- **Save normalizes edited articles.** An edited article is saved as remark's GFM for the whole document (see [Markdown fidelity](#markdown-fidelity)), which can re-serialize parts that weren't touched without changing their meaning. Only an unchanged article is saved byte for byte.
- **An app that uses Milkdown itself at another version gets a second copy** nested under cells. It works, but it's bigger.
- **Cells' `dist/cjs` is ES module syntax** (as before), and the lazy editor imports ESM-only Milkdown; the editor it replaced was ESM-only too.
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
- **Popups don't see `--gdg-ai-*` variables set only on the grid's container.** They render in the portal and copy only the `--gdg-*` variables in the grid element's inline style (the `theme` prop). Set `--gdg-ai-*` on `:root` or a common ancestor.
- **The status bar finds its grid by class name** (`gdg-ai-grid-<n>`, composed into `className`), so it appears only after the controller has loaded and composed props, and it is looked up in the whole document with `document.querySelector`. `statusBar: false` with `AIFillStatus` doesn't depend on it.
- **"Edit manually" depends on the grid's Enter handling.** It dispatches a synthetic Enter to the focused grid, so with `keybindings.activateCell` off it only selects the cell.
- **A filtered-out row counts as a deleted row** wherever AI Fill has to find it (accepted for WP-AI3 by the Orchestrator). The only deletion signal is that `getRowId` / `getRowIndex` no longer reach the id among the displayed rows. So an answer that arrives while its row is filtered out is dropped as `row-missing`; `notifyRowsChanged()` while a filter is on drops the decided results of hidden rows; and an `accept({ cells })` naming a hidden row drops that result. WP-AI4's UI doesn't widen this: its menus, shortcuts and inspector open only on displayed cells, and reject and re-run never drop a result. The same commit-path drop happens only when a UI accept or Choose reaches a row that became hidden, for example `getMenuItems({ cell })` items run for a hidden row, or an inspector left open while a filter hides its row. A decided result on a hidden row otherwise keeps its record, and "Accept all eligible" skips it. SPST-17 §5 said a filtered-out row keeps its record in every case. Follow-up: an optional app signal for "row still exists".
- **`useUndoRedo` is position-based.** Undo after a re-sort or filter writes to display positions, and an `onCellsEdited` that returns `true` hides AI Fill's writes from it, as with paste. `revertCommit` is the id-safe path. Commits live in memory only.
- **`npm test` in core needs a build.** `bundle-budget.test.ts` and `server-load.test.ts` read `dist/` and fail on a fresh clone until `npm run build` has run, and they test stale output after source changes. The bundle budget also needs the `gzip` binary.
- **Lazy-chunk headroom.** The lazy AI chunks are 32,697 B gzip at WP-AI4 and WP-AI5, leaving 7,303 B of the 40,000 B cap for later AI Fill work.
- **`AIFillRun` and `AIActiveRun` aren't exported.** They are the return type of `fill` / `retry` / `rerunStale` and the element type of `AIRunState.active`. Apps can reach them only through those types (for example `ReturnType<AIFillApi["fill"]>`).
- **`require("@specstory/ai-data-grid/server")` needs `require(esm)`** (Node 20.19+, 22.12+ or 24), because core's `dist/cjs` is ES modules. Older Node versions must use `import`.
- **Jev's error-body shape isn't fully documented,** so the transport reads the message from `error.message`, `message` or `detail`. A new shape would still map by status, with a generic message.
- **Suggestions aren't restored after a reload.** Results, suggestions and commit records live in memory in the grid's AI Fill session; a reload or unmount loses them, and `revertCommit` works only within the session. Accepted values persist only through the app's own edit handlers (SPST-17 default, no restore).
- **The AI Fill guide and stories reach the hosted sites only from `main`.** Both Vercel production deployments build from `main`, so until PR #20 and the PRs below it merge, the links in core's README and API.md to `/docs/ai-fill` return the docs site's 404 page, and the hosted Storybook has no AI Fill group.

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
| 2026-09-26 | SPST-16 (Jake, answer 3), SPST-29 / PR #19 | Menus coexist with the app's through `aiFill.menus`. Default `"built-in"`: on AI columns and cells the AI menu opens first and ends with "More options…", which calls the app's own handler with the original arguments; other columns and cells go straight to the app. `"compose"` never opens the AI menu and lets the app put `api.getMenuItems(target)` into its own; `"off"` has no AI menus. | Jake approved the default. Apps keep their handlers and their menu is one click away; `compose` and `off` cover apps that need full control. |
| 2026-09-26 | SPST-17 §8.3, SPST-29 / PR #19 | The status bar floats over the bottom edge of the grid (absolutely positioned inside the grid's container) instead of taking layout space. `statusBar: false` hides it, and `AIFillStatus` places it anywhere. | The grid's size and layout must not change when AI Fill is on or a run starts. |
| 2026-09-26 | SPST-29 / PR #19 | The status bar is portalled into the grid's element, found by a per-grid `gdg-ai-grid-<n>` class that AI Fill composes into `className`. | Composing a class reaches the grid's container (which is `position: relative`) with no change to core's grid. |
| 2026-09-26 | SPST-29 / PR #19 | "Edit manually" selects the cell and dispatches a synthetic Enter to the focused grid instead of calling an editor API. | The edit then goes through the grid's normal editing path and the app's `onCellEdited`, with no new core API. |
| 2026-09-26 | SPST-29 / PR #19 | The API grows additively with no new export names: `AIFillApi.subscribe`, `getMenuItems()` without a target (the grid-wide items), `openMenu`, `openInspector`, and `AIActiveRun.columnTitles`. The menu target type stays inline and unexported. | The status bar and app-built UI use only the public API; no new names beyond the four WP-AI4 adds (`AIFillStatus`, `AIFillStatusProps`, `AIMenuItem`, `AIFillShortcuts`). |
| 2026-09-26 | SPST-29 / PR #19 | `session.ts` splits `fill` into `planFill` and `start`, adds `refill` and a chosen-value `commit`, and moves the shortcuts into `AIFillUI`; the confirm decision uses the plan without sending. | The confirm dialog needs the plan's counts before anything is sent, and Choose must use the same commit guards as accept. |
| 2026-09-26 | SPST-29 / PR #19 | `AIFillStatus` is exported as a namespace constant, and is itself a static wrapper around `React.lazy(() => import("./ui/status-bar.js"))`. | The same esbuild code-splitting issue as WP-AI3's helper functions; the wrapper keeps the status bar in the lazy chunk even for apps that import `AIFillStatus`. |
| 2026-09-26 | SPST-17 A6, SPST-29 / PR #19 | The UI's styles are one Linaria block extracted into core's `dist/index.css`, with `gdg-ai-*` classes and `--gdg-ai-*` variables that fall back to `--gdg-*`. Popups portal into `portalElementRef ?? #portal`. | No extra CSS entry for apps, theming through the grid's existing variables, and popups that behave like the overlay editor. |
| 2026-09-26 | SPST-30 review, SPST-29 fix round 1 / PR #19 | A menu or status-bar item does what the API method does with the same target, and its *N* is what it acts on: "Reject all suggestions" is `reject({ column, filter: "all" })` (through the new `session.rejectable`); "Retry *N* failed" and "Re-run *N* stale" are `retry` / `rerunStale` with `{ column, filter: "all" }` or no target, counted from the new `session.planRerun` (the plan the run starts); "Review *N*" and "Review next" count only results on displayed rows and columns. An item with nothing to act on is disabled with a reason ("Nothing to reject", "Nothing failed", "Nothing is stale", "Nothing to retry: …", "Nothing to re-run: …", "Nothing to review", or the plan's error). | The first WP-AI4 head counted every record in the store and rejected fewer statuses than the API, so a count could promise more than the item did, and "Review next" could be enabled with nothing to reach. |
| 2026-09-26 | SPST-29 fix round 2 / PR #19, Orchestrator decision 2026-09-26 01:13 UTC | A result that a "Fill and apply" run's auto-apply writes is recounted from `suggested` to `applied` in that run's counts when `recordCommit` records it, while the run is still going. The session writes the auto-apply in the flush queued when the result settles, which runs before the run's finish, so `onRunEnd`, `getRunState().last` and the status bar count it as `applied`. `api.cancel` (and the Cancel menu and status-bar items, which now call it) writes the queued auto-applies before cancelling. A guard-blocked result stays `suggested`; totals, `onResult` (the settled status) and a plain Fill are unchanged. | The engine counted each result when it settled and the write came a microtask later, so an apply run's summary said `suggested` for cells `getCellState` reported as `applied`, and the status bar's "*N* applied" never showed. Before the fix, a cancel didn't stop the queued writes either; they landed a microtask after it, so writing them first changes only the order and the count. |
| 2026-09-26 | SPST-31 verification round 1 (P1), SPST-29 fix round 3 / PR #19 | Confirming the scope dialog plans the fill again and starts it only if its statement equals the one shown: the sorted (rowId, columnId) cells to evaluate, skips by reason, columns, row-scope label, estimated requests and error. Otherwise the dialog shows the new scope, says it changed and asks again. When no dialog is needed, `requestFill` starts the plan it made. | A filter or data change while the dialog was open could start a larger or different fill than the one the user agreed to, and auto-apply could write to cells they never saw. The cells are compared by identity rather than by count because the same count can cover different rows. An unchanged scope starts from the re-plan it just compared, so there is no third plan and no window for another change. |
| 2026-09-26 | SPST-32 / PR #20, Orchestrator decision 2026-09-26 01:15 UTC | `boundaries.test.ts` gains rule 5 (+3 tests): `ai-fill/stories/` is exempt from rule 1 and may import `data-editor-all` and `@specstory/ai-data-grid/testing` (no other `@specstory/*` entry, never `src/index.ts`), and nothing else in core may import a story. | The plan puts the stories in `ai-fill/stories/`, and they must use `DataEditor` and the mock as an app does. The exemption is limited to that folder, which core's build excludes. |
| 2026-09-26 | SPST-32 / PR #20 | The 13 stories go in four Storybook groups under `AI-Data-Grid/AI Fill/` (`1 Primitives and thresholds`, `2 Review, errors and rows`, `3 Undo with useUndoRedo`, `4 Menus and opt-out`), with story names numbered `01`…`13`. Story 11 lives in the source package. | Storybook sorts stories by name, so the numbers keep the plan's order. Story 11 needs the real `useUndoRedo`, and core can't import source. |
| 2026-09-26 | SPST-32 / PR #20 | Every story uses `createMockJev` with seeded answers by default, and every story except 08 and 13 has an `endpointUrl` control for the local dev proxy. | Storybook must never hold a key or call Jev by itself; the control lets a developer try real answers through the proxy, which keeps the key server-side. |
| 2026-09-26 | SPST-32 / PR #20, Orchestrator decision 2026-09-26 01:15 UTC | `packages/core/README.md` and the API.md "AI Fill" chapter link to the hosted docs site guide (`https://ai-data-grid-docs.vercel.app/docs/ai-fill`). This supersedes the SPST-8 decision that package READMEs don't link to a hosted Storybook or docs site. | The brief asks for the links, and both sites are now public. The guide appears there only once it reaches `main`, and the docs say so where it matters. |
| 2026-09-26 | SPST-32 / PR #20 | The AI Fill guide is a hand-maintained docs site section (`ai-fill/`, `HAND_MAINTAINED_SECTIONS` in the importer), listed before About. | It has no GitBook source, and a re-import must neither overwrite nor unlist it. |
| 2026-09-26 | SPST-32 / PR #20 | The live check ran once (2026-09-26 00:26 UTC): 4 calls, `jev-latest` answered by `jev-1.13.0`, answer shapes as documented. It is recorded in `live-validation.mdx` with the answers as returned and no key, accuracy or latency claim. SPST-16 has used 12 of 20 live calls. | Confirms the contract against the real API once, and keeps live calls separate from mocked tests and within the budget. |
| 2026-09-26 | SPST-32 / PR #20, Orchestrator decision 2026-09-26 01:15 UTC | The applied-count bug (a "Fill and apply" run's summary counts auto-applied results as `suggested`) is documented as a known issue at PR #20's head, not fixed there; WP-AI4's fix round 2 (SPST-29) fixes it. | It's WP-AI3/WP-AI4 code, and WP-AI5 changes no product code. The docs stay true at each head. Closed when PR #20 merged WP-AI4's verified head `6f86c3e1`: the known-issue notes were removed from API.md, the guide and story 7, and story 7 now shows the applied count. |
| 2026-09-28 | SPST-48, plan SPST-49 (option b), PR #22 | Fix ArticleCell's embedded DOMPurify 2.3.3 by vendoring a reproducibly generated, patched copy of Toast UI Editor 3.2.2's ESM build into cells (`vendor/toast-ui/`, from `scripts/vendor-toast-ui.mjs`), with patches P1–P4, and replace `@toast-ui/react-editor` with an in-repo wrapper. No new npm package. This supersedes the 2026-09-25 SPST-4 decision to keep `@toast-ui/react-editor`. | No Toast UI upgrade exists (archived). `customHTMLSanitizer` (option a) covers only the Viewer and the preview, and both 2.3.3 copies would still ship and run. Cells bundles nothing, so a root `overrides` or patch-package fix can't reach consumers. Replacing the editor (option c) means UI work and a Markdown-normalization decision, too much for a release blocker. Vendoring also fixed three Toast UI issues found in planning, and the wrapper removed the `react ^17` peer and the Save bug. |
| 2026-09-28 | SPST-48, SPST-49 §1.4 and §2.2 | `dompurify` `^3.4.16` is an ordinary cells dependency, used through a private instance (`DOMPurify()`) that fails closed when unsupported. | 3.4.16 was `latest` and tested, above every 3.x advisory's fix (3.4.13). A plain semver dependency is visible to `npm audit` and updates through consumers' lockfiles. A private instance can't be weakened by an app's `setConfig` or hooks. DOMPurify 3 returns input unchanged when unsupported, so the guard throws instead. |
| 2026-09-28 | SPST-48 / PR #22 (Implementor deviation 1) | P3 accepts a `data-raw-html` value only if it equals the element's own tag name and is in Toast UI's list, which includes `h1`–`h6`, `blockquote` and the table tags as well as the plan's inline and list tags. | Toast UI's `addRawHTMLAttributeToDOM` writes those tags too; leaving them out would rewrite raw-HTML headings and tables as Markdown on first save. Toast UI only ever writes the element's own name, so the equality check is stricter than a plain allowlist. |
| 2026-09-28 | SPST-48, SPST-49 §2.1 | Ship Toast UI's CSS as `dist/toastui-editor.css` (export `./dist/toastui-editor.css`), outside `dist/esm`. Apps change `import "@toast-ui/editor/dist/toastui-editor.css"` to the new path. | Apps no longer install `@toast-ui/*`, so the CSS has to come from cells. Keeping it out of `dist/esm` stops `generate_index_css` from adding Toast UI's global `.ProseMirror` rules to `dist/index.css` for every cells user. No 7.0.0 is published, so the path change breaks nobody. |
| 2026-09-28 | SPST-48 fix round 1 / PR #22 (`b071d59`), Orchestrator amendment to SPST-49 §2.2 | Add patch P5: Toast UI's `dropImage` plugin reports only a handled image drop, and a `drop` listener on the editor root prevents every drop still unprevented. The vendored file now differs from upstream only by P1–P5. The sanitizer browser check runs in Chromium, Firefox and WebKit. | Verification round 1 found that a real HTML drop ran script in Firefox (as on `main`): upstream's plugin claimed every drop but prevented only image files, so Firefox inserted the HTML natively before ProseMirror or P3 saw it. With P5 a drop is either parsed through P2 or prevented. Dragging within the editor works again as a side effect. |
| 2026-09-28 | SPST-48 fix round 1, Orchestrator | A paste inside a code block or a custom block's inner editor keeps upstream's handling, without P2, for 7.0.0 and is documented as a known limitation, not patched. | The browser sanitizes the paste, ProseMirror keeps only the text, and the full corpus showed no script and no dangerous DOM in any of the three browsers. Closing it fully (P6) is a follow-up option. |
| 2026-09-28 | SPST-61, Jake on SPST-48 (11:38 UTC) | Replace the vendored Toast UI editor before 7.0.0 and close P6 in the same change, as a release blocker. The Orchestrator folded P6 into SPST-61 instead of patching the vendored editor that SPST-61 removes. | We shouldn't own the security of an archived editor in a first public release, and P6 left code-block paste to the browser. |
| 2026-09-28 | SPST-61, plan SPST-62 §2 / PR #23 | Use Milkdown 7.22's headless packages (`core`, `preset-commonmark`, `preset-gfm`, `plugin-history`, `prose`, `utils`) for both the editor and the viewer (the same editor with `editable: false`). Rejected: Tiptap 3 with `@tiptap/markdown`, ProseMirror with `prosemirror-markdown`, react-markdown as the viewer, `@milkdown/kit` and Crepe. This supersedes the SPST-48 decisions to vendor Toast UI and to keep `@toast-ui/react-editor`. | Fidelity decided it: remark kept the meaning of every case in the planning corpus, while `@tiptap/markdown` turned escaped text into headings and lists and lost table data on an ordinary edited save. One rendering path means one set of defenses to test. It has no React peer. `@milkdown/kit` and Crepe pull in UI we don't use. |
| 2026-09-28 | SPST-61, plan SPST-62 §3.2, Jake (12:38 UTC, amendment A5) | Raw HTML inside article Markdown isn't interpreted: the viewer and the editor show it as source text, and Save keeps it byte for byte. Jake agreed ("1. agreed") and rejected the alternative, a sanitized viewer-only rendering. | It removes the raw-HTML attack surface (no HTML parser, so no mXSS), keeps stored content intact, and makes the viewer and the editor show the same thing. The alternative would add an HTML sink and a second rendering path. |
| 2026-09-28 | SPST-61, plan SPST-62 §4.3, Jake (12:38 UTC, amendment A6) | Accept the other differences from Toast UI: an Office list paste keeps its text but doesn't become a list, `$$…$$` blocks are ordinary text instead of a custom widget, and the toolbar, link dialog and table editing look and work differently (table rows and columns through toolbar buttons). Jake agreed ("2. agreed") and asked for a backlog ticket for Office list support, SPST-66. | Every toolbar feature is kept, nothing is lost, and the differences are cosmetic or come from Toast UI's own code. |
| 2026-09-28 | SPST-61, plan SPST-62 §3.3 and amendments A1 and A2 / PR #23 | The defenses D1–D5 live in cells' own code on public Milkdown and ProseMirror APIs: a DOMPurify-based URL policy, schema overrides (no raw-HTML parse rule), a private DOMPurify for paste and drop HTML, ProseMirror paste and drop handlers that give code blocks `text/plain` only, and backstop listeners on the editor's frame (not around the toolbar popovers). The guards L01–L05 and snapshots F25–F26 fail on any schema, handler, node-view or serializer change. | A library update can't silently bypass a defense we own, and a review is forced when the library changes. A1: ProseMirror parses an HTML-only paste into a code block as HTML, so D4 handles code blocks itself. A2: the link dialog's inputs must accept a pasted URL. |
| 2026-09-28 | SPST-61 / PR #23 (Implementor deviation 2) | D2 also strips the text-derived `id` from headings, and keeps a code-block language parsed from HTML only if it looks like a language name. | Article text shouldn't create named `window` or `document` properties (DOM clobbering), and pasted HTML shouldn't carry quotes or handlers into a stored fence's info string. |
| 2026-09-28 | SPST-61, plan SPST-62 §3.3 / PR #23 (deviation 5) | No node views. Code blocks and every other node render with `toDOM`; the task checkbox is a CSS box toggled by a `handleDOMEvents.mousedown` prop (not `handleClickOn`, which depends on layout). | Node views can stop events and hand a paste or drop to the browser, which is how P6 arose. |
| 2026-09-28 | SPST-61 / PR #23 (deviations 3 and 4) | Our own `insertRule` for the rule button, and prosemirror-tables' `deleteRow`, `deleteColumn` and `deleteTable` for the table buttons, instead of Milkdown's `insertHrCommand` and `deleteSelectedCellsCommand`. | `insertHrCommand` left an empty paragraph that saves as `<br />`, and `deleteSelectedCellsCommand` only works on a cell selection, not a caret. |
| 2026-09-28 | SPST-61 / PR #23 (deviation 6) | If the editor can't be created, the cell shows the stored Markdown as plain text, and Save returns it unchanged. | An editor failure mustn't show an empty article or save one. |
| 2026-09-28 | SPST-61, plan SPST-62 §5.5 / PR #23 | Remove `dist/toastui-editor.css` and its export. The editor's Linaria styles, scoped under the wrapper, are part of `dist/index.css`; cells' exports are exactly `.` and `./dist/index.css`. This supersedes SPST-48's CSS decision. | One CSS import for every cells user, and no global `.ProseMirror` rules. No 7.0.0 has been published, so removing the path breaks nobody. |
| 2026-09-28 | SPST-61, plan SPST-62 §2 and §5.2 / PR #23 (deviations 7 and 9) | Every `@milkdown/*` dependency is `~7.22.2`, all on one range, and only the packages `src/` imports are declared (not `@milkdown/ctx`). ProseMirror comes only through `@milkdown/prose`. L04 enforces all three. | Milkdown releases in lockstep. `~` lets patch fixes reach consumers while a minor version needs our review and a cells release. One ProseMirror avoids duplicate-instance bugs. |
| 2026-09-28 | SPST-61 / PR #23 (deviation 1) | Cells' tsconfigs use `module: "ESNext"` and `moduleResolution: "Bundler"`. | Milkdown's `.d.ts` files use extensionless relative re-exports that `Node16` resolution can't follow. The emitted JavaScript of every other cells file is unchanged. |

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
- Article editor: support pasting Office lists as lists (SPST-66, backlog).
- Article editor, optional (SPST-62 §11): remove the root `@types/prosemirror-*` devDependencies, unused since SPST-61, once SPST-50's release-prep PR has merged (it owns the root `package.json` until then); a Storybook story that shows the benign fidelity corpus in read-only cells, for visual review (it changes the smoke count); match Toast UI's unpadded tables through remark-stringify's table options if table diffs after a first edited save prove noisy; and Trusted Types support for apps with a Trusted Types CSP.
- `scripts/check-article-cell-editor.mjs` aims at the article cell by canvas coordinates; make it find the cell some other way if the story changes often.
- AI Fill: once the AI Fill PRs reach `main`, check that `https://ai-data-grid-docs.vercel.app/docs/ai-fill` and the Storybook's AI Fill group serve, and drop "(in development)" from this file's AI Fill heading.
- AI Fill: an optional app signal for "row still exists", so a result or answer for a filtered-out row can be kept instead of dropped as `row-missing` (SPST-17 §5).
