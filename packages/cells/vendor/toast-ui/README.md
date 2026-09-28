# Vendored Toast UI Editor 3.2.2 (patched)

The ArticleCell editor and read-only viewer in `@specstory/ai-data-grid-cells` use this patched copy of [Toast UI Editor](https://github.com/nhn/tui.editor). It replaces the `@toast-ui/editor` and `@toast-ui/react-editor` npm dependencies (SPST-48). Toast UI Editor is MIT licensed, `Copyright (c) 2020 NHN Cloud Corp.`. See `LICENSE` in this directory for its license and the licenses of the components it bundles.

Upstream is archived: 3.2.2 (February 2023) is the last release, and `nhn/tui.editor` has been read-only since 2024. The input will not change.

## Provenance

| | |
| --- | --- |
| Package | `@toast-ui/editor@3.2.2` (npm) |
| npm integrity | `sha512-ASX7LFjN2ZYQJrwmkUajPs7DRr9FsM1+RQ82CfTO0Y5ZXorBk1VZS4C2Dpxinx9kl55V4F8/A2h2QF4QMDtRbA==` |
| Source tag | `nhn/tui.editor` `editor@3.2.2` (`9b94c04231d4600b42347ff1b99d9813e9becf67`) |
| Input `dist/esm/index.js` sha256 | `ff71315070f5151b638307fc66faa7e22c479a5e8e3fd566442475958401e524` |
| Input `dist/toastui-editor.css` sha256 | `c0ceb967b8c97038dccaa2a35c2222ec35b53a0022febbb6a22715c23ead9211` |
| Output `editor.js` sha256 | `821a4ede314ffb67260aec21f78f7f0fb1db7e85488328faafdbc543927ac55d` |
| Output `toastui-editor.css` | verbatim copy of the input CSS |

## Files

| File | What it is | Ships in the npm package as |
| --- | --- | --- |
| `editor.js` | **Generated.** Toast UI's `dist/esm/index.js` with the patches below. Never edit it by hand. | `dist/vendor/toast-ui/editor.js` |
| `toastui-editor.css` | **Generated.** Verbatim copy of `dist/toastui-editor.css`. | `dist/toastui-editor.css` (export `./dist/toastui-editor.css`) |
| `editor.d.ts` | Hand-written minimal types for what `src/cells/article-cell-editor.tsx` uses. | not shipped (types stay internal) |
| `LICENSE` | Toast UI's MIT license, then the licenses of the bundled components. | `dist/vendor/toast-ui/LICENSE` |
| `README.md` | This file. | `dist/vendor/toast-ui/README.md` |

## Patches

Each patch is marked in `editor.js` with an `ai-data-grid patch Pn` comment. The generator applies exact anchors with expected match counts and fails on any drift.

| Patch | Change | Why |
| --- | --- | --- |
| H0 | A comment header saying the file is generated. | Comment only. |
| P1 | Removes the embedded DOMPurify 2.3.3 (from its `@license` banner through `var purify = createDOMPurify();`). Adds `import DOMPurify from 'dompurify'` and `var purify = DOMPurify();`, a private instance of the external package. `sanitizeHTML` throws if `purify.isSupported` is false. | The embedded 2.3.3 is in range of GHSA-gx9m-whjm-85jf, GHSA-p3vf-v8qc-cwcr and GHSA-mmhx-hmjr-r674, and `npm audit` couldn't see it. A private instance means an app's `setConfig` or `addHook` on the default DOMPurify instance can't weaken article sanitization. DOMPurify 3 returns its input unchanged when unsupported, so the guard makes that fail closed. |
| P2 | `changePastedHTML` (Toast UI's ProseMirror `transformPastedHTML`) sanitizes pasted HTML with `FORBID_ATTR: ['data-raw-html']` before the Office conversion. | The Office list conversion assigned unsanitized clipboard HTML to `innerHTML` of an element in the live document, and the parse rules copied `data-raw-html` from pasted HTML into node attributes. |
| P3 | The 13 parse rules that read `data-raw-html`, and the table-cell rule, go through `safeRawHTMLTag(dom)`. It accepts the value only if it equals the element's own tag name and is one Toast UI itself writes (`b strong i em s del code a img hr br pre ul ol li h1`–`h6 blockquote table thead tbody tr th td`); otherwise it returns `null`. | `rawHTML` becomes the tag name that `toDOM` and the Markdown writer emit, so an arbitrary value could create any element. Toast UI only ever sets it to the element's own tag name (`addRawHTMLAttributeToDOM`). This is also the guard for drops: Toast UI's `dropImage` plugin tells ProseMirror every drop is handled, so dropped HTML never passes through P2. Browsers that insert it natively hand the new DOM to these parse rules (Chromium inserts nothing). |
| P4 | Link `toDOM` `href`, image `toDOM` `src` and `ImageView`'s `image.src` render a URL only if `purify.isValidAttribute(tag, attr, url)` accepts it; otherwise they render an empty value. | Markdown links and images reached the WYSIWYG DOM with no URL check (for example `javascript:`). The model value is unchanged, so saved Markdown stays byte-identical. |

The helpers `RAW_HTML_TAGS`, `safeRawHTMLTag` and `safeURL` are added right after `sanitizeHTML`.

## Regenerate and check

The input is the exact devDependency `"@toast-ui/editor": "3.2.2"` of `packages/cells`. It's only read by the generator: source never imports it and it never ships.

```bash
node scripts/vendor-toast-ui.mjs          # regenerate editor.js and toastui-editor.css
node scripts/vendor-toast-ui.mjs --check  # exit non-zero if the committed files differ
```

`packages/cells/test/article-cell-vendor.test.ts` runs the check on every test run. If you change a patch, change the generator, regenerate, and update the output sha256 above.

## DOMPurify

`editor.js` imports the `dompurify` dependency of `@specstory/ai-data-grid-cells` (`^3.4.16`). Consumers pick up DOMPurify patch releases through their own lockfile. When an advisory lands, raise the floor in `packages/cells/package.json`. Forcing an older `dompurify` with an app-level `overrides` entry isn't supported.
