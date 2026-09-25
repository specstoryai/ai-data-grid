#!/usr/bin/env node
/**
 * import-gitbook.mjs
 *
 * Imports the Glide Data Grid GitBook documentation (https://docs.grid.glideapps.com)
 * and converts it to unmint/Fumadocs MDX content for the AI Data Grid docs site.
 *
 * Source index: https://docs.grid.glideapps.com/llms.txt (36 pages).
 * Per-page Markdown is fetched from `<page-url>.md`.
 *
 * What it does:
 *   - writes MDX under content/docs/ mirroring the GitBook URL paths
 *     (a page that has children becomes the folder's index.mdx)
 *   - writes Fumadocs meta.json files that preserve the llms.txt order
 *   - downloads images hosted on 369991932-files.gitbook.io to public/images/
 *     and rewrites their URLs
 *   - converts GitBook/HTML syntax: <figure>/<img> -> MDX images, HTML <table>s
 *     -> Markdown tables, {% content-ref %} -> unmint <Card>
 *   - rewrites absolute docs.grid.glideapps.com links to site-relative /docs links
 *   - rewrites @glideapps/* package imports to @specstory/*
 *   - escapes characters MDX cannot take in prose ({, }, <)
 *
 * Re-run from the docs/ directory with:  node scripts/import-gitbook.mjs
 * Hand-maintained pages (content/docs/index.mdx welcome page, content/docs/about.mdx)
 * are NOT overwritten; everything else under content/docs/ is regenerated.
 */

import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DOCS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT_DIR = path.join(DOCS_ROOT, 'content', 'docs')
const IMAGES_DIR = path.join(DOCS_ROOT, 'public', 'images')

const GITBOOK_BASE = 'https://docs.grid.glideapps.com'
const INDEX_URL = `${GITBOOK_BASE}/llms.txt`

/** Pages maintained by hand; the importer never overwrites them. */
const HAND_MAINTAINED = new Set(['index', 'about'])

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.text()
}

/** Parse llms.txt into an ordered list of { title, path, description }. */
function parseIndex(llmsTxt) {
  const pages = []
  for (const line of llmsTxt.split('\n')) {
    const m = line.match(/^- \[([^\]]+)\]\(https:\/\/docs\.grid\.glideapps\.com(\/.+?)\.md\)(?::\s*(.*))?$/)
    if (m) pages.push({ title: m[1], path: m[2], description: m[3] ?? null })
  }
  return pages
}

/**
 * Split markdown into segments, tagging fenced code blocks so prose-only
 * transforms never touch code samples.
 */
function splitByCodeFences(md) {
  const lines = md.split('\n')
  const segments = []
  let inCode = false
  let buf = []
  for (const line of lines) {
    if (/^```/.test(line)) {
      segments.push({ code: inCode, text: buf.join('\n') })
      buf = [line]
      inCode = !inCode
      continue
    }
    buf.push(line)
  }
  segments.push({ code: inCode, text: buf.join('\n') })
  return segments
}

/** Rewrite a GitBook-internal URL to a site-relative /docs URL. */
function rewriteUrl(url) {
  const m = url.match(/^(?:https:\/\/docs\.grid\.glideapps\.com)?(\/[^#]*?)\.md(#.*)?$/)
  if (!m) return url
  const p = m[1] === '/welcome-to-glide-data-grid' ? '' : m[1]
  return `/docs${p}${m[2] ?? ''}`
}

/** Convert an HTML table to a Markdown table. */
function convertTable(html) {
  const cellText = (cell) =>
    cell
      .replace(/<a href="([^"]+)">([\s\S]*?)<\/a>/g, (_, href, text) => `[${text}](${rewriteUrl(href)})`)
      .replace(/<code>([\s\S]*?)<\/code>/g, (_, code) => `\`${code}\``)
      .replace(/<[^>]+>/g, '')
      .replace(/\|/g, '\\|')
      .trim()

  const headers = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => cellText(m[1]))
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((tr) => [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => cellText(m[1])))
    .filter((cells) => cells.length > 0)

  if (headers.length === 0) return html
  const out = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((cells) => `| ${cells.join(' | ')} |`),
  ]
  return `\n\n${out.join('\n')}\n\n`
}

/** Escape characters MDX cannot parse in prose, skipping inline code spans. */
function escapeForMdx(prose) {
  return prose
    .split(/(`[^`\n]*`)/)
    .map((part, i) => {
      if (i % 2 === 1) return part // inline code span: leave untouched
      return part.replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/</g, '&lt;')
    })
    .join('')
}

/** Apply all prose-level GitBook -> MDX conversions to one prose segment. */
function convertProse(text) {
  const cards = []
  const stashCard = (title, href) => {
    cards.push({ title, href })
    return `\n\n@@CARD${cards.length - 1}@@\n\n`
  }

  let out = text

  // Unwrap GitBook layout divs (<div align="left" data-full-width="false"> ... </div>)
  out = out.replace(/<div[^>]*>/g, '').replace(/<\/div>/g, '')

  // {% content-ref url="..." %} [Title](link) {% endcontent-ref %} -> <Card />
  out = out.replace(
    /\{%\s*content-ref[^%]*%\}\s*\[([^\]]+)\]\(([^)]+)\)\s*\{%\s*endcontent-ref\s*%\}/g,
    (_, title, href) => stashCard(title, rewriteUrl(href))
  )

  // <figure><img ...><figcaption>caption</figcaption></figure> -> image + caption
  out = out.replace(
    /<figure><img\s+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>(?:<figcaption>([\s\S]*?)<\/figcaption>)?<\/figure>/g,
    (_, src, alt, caption) => {
      const cap = caption ? caption.replace(/<[^>]+>/g, '').trim() : ''
      return `\n\n![${alt}](${src})\n${cap ? `\n*${cap}*\n` : ''}`
    }
  )

  // bare <img ...> -> image
  out = out.replace(/<img\s+[^>]*?src="([^"]+)"[^>]*?alt="([^"]*)"[^>]*>/g, (_, src, alt) => `\n\n![${alt}](${src})\n`)
  out = out.replace(/<img\s+[^>]*?src="([^"]+)"[^>]*>/g, (_, src) => `\n\n![](${src})\n`)

  // HTML tables -> Markdown tables
  out = out.replace(/<table[^>]*>[\s\S]*?<\/table>/g, (html) => convertTable(html))

  // absolute + internal links -> site-relative /docs links
  out = out.replace(/\]\((https:\/\/docs\.grid\.glideapps\.com)?(\/[^)\s]+?\.md)(#[^)\s]*)?\)/g, (_, _abs, p, hash) => {
    const target = p === '/welcome-to-glide-data-grid.md' ? '' : p.replace(/\.md$/, '')
    return `](/docs${target}${hash ?? ''})`
  })

  // MDX-unsafe characters in prose (Card placeholders contain no {, } or <)
  out = escapeForMdx(out)

  // restore Card placeholders
  out = out.replace(/@@CARD(\d+)@@/g, (_, n) => {
    const card = cards[Number(n)]
    return `<Card title=${JSON.stringify(card.title)} icon="book" href=${JSON.stringify(card.href)} />`
  })

  return out
}

/** Decode the HTML entities GitBook emits inside HTML-wrapped code blocks. */
function decodeEntities(text) {
  return text
    .replace(/&#x3C;/g, '<')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Full per-page conversion. Returns { frontmatter: {title, description?}, body }. */
function convertPage(md, page) {
  // Drop the GitBook "available as Markdown" boilerplate header.
  let body = md.replace(/^> For the complete documentation index[\s\S]*?\n\n/, '')

  // GitBook sometimes emits code blocks as <pre><code> HTML (with <strong>
  // highlight markers) instead of fences. Convert these before anything else.
  body = body.replace(/<pre class="language-(\w+)"><code[^>]*>([\s\S]*?)<\/code><\/pre>/g, (_, lang, code) => {
    const decoded = decodeEntities(code.replace(/<\/?strong>/g, ''))
    return `\n\n\`\`\`${lang}\n${decoded.trim()}\n\`\`\`\n\n`
  })

  // Extract the H1 into frontmatter.
  const h1 = body.match(/^#\s+(.+)$/m)
  const title = h1 ? h1[1].trim() : page.title
  if (h1) body = body.replace(h1[0], '').replace(/^\n+/, '')

  const segments = splitByCodeFences(body)
  body = segments.map((seg) => (seg.code ? seg.text : convertProse(seg.text))).join('\n')

  // Package renames apply everywhere, including code samples.
  body = body
    .replaceAll('@glideapps/glide-data-grid-cells', '@specstory/ai-data-grid-cells')
    .replaceAll('@glideapps/glide-data-grid-source', '@specstory/ai-data-grid-source')
    .replaceAll('@glideapps/glide-data-grid', '@specstory/ai-data-grid')

  return { title, description: page.description, body: body.trim() + '\n' }
}

async function main() {
  console.log(`Fetching ${INDEX_URL}`)
  const llmsTxt = await fetchText(INDEX_URL)
  const pages = parseIndex(llmsTxt)
  console.log(`Found ${pages.length} pages`)

  // A page is a folder index when another page lives beneath its path.
  const allPaths = new Set(pages.map((p) => p.path))
  const isFolderIndex = (p) => [...allPaths].some((other) => other.startsWith(`${p}/`))

  // Fetch all pages.
  const raw = new Map()
  for (const page of pages) {
    const url = `${GITBOOK_BASE}${page.path}.md`
    console.log(`Fetching ${url}`)
    raw.set(page.path, await fetchText(url))
  }

  // Discover and download GitBook-hosted images (deterministic names per page).
  await mkdir(IMAGES_DIR, { recursive: true })
  const imageMap = new Map() // remote url -> /images/<file>
  for (const page of pages) {
    const md = raw.get(page.path)
    const urls = [...md.matchAll(/https:\/\/369991932-files\.gitbook\.io\/[^")\s]+/g)].map((m) => m[0])
    let n = 0
    for (const rawUrl of urls) {
      const url = rawUrl.replaceAll('&amp;', '&')
      if (imageMap.has(url)) continue
      n += 1
      const fileName = `${page.path.slice(1).replaceAll('/', '-')}-${String(n).padStart(2, '0')}.png`
      console.log(`Downloading image ${url} -> public/images/${fileName}`)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
      await writeFile(IMAGES_DIR + '/' + fileName, Buffer.from(await res.arrayBuffer()))
      imageMap.set(url, `/images/${fileName}`)
    }
  }
  console.log(`Downloaded ${imageMap.size} images`)

  // Convert and write pages.
  await mkdir(CONTENT_DIR, { recursive: true })
  for (const page of pages) {
    let md = raw.get(page.path)
    // Rewrite remote image URLs to local files before conversion.
    for (const [remote, local] of imageMap) {
      md = md.replaceAll(remote, local).replaceAll(remote.replaceAll('&', '&amp;'), local)
    }
    const { title, description, body } = convertPage(md, page)

    const frontmatter = ['---', `title: ${JSON.stringify(title)}`]
    if (description) frontmatter.push(`description: ${JSON.stringify(description)}`)
    frontmatter.push('---', '')

    const slug = page.path.slice(1) // e.g. "api/dataeditor/required-props"
    // The welcome page becomes the docs landing page (content/docs/index.mdx).
    const outRel =
      page.path === '/welcome-to-glide-data-grid' ? 'index.mdx' : isFolderIndex(page.path) ? `${slug}/index.mdx` : `${slug}.mdx`
    const outPath = path.join(CONTENT_DIR, outRel)
    if (HAND_MAINTAINED.has(outRel.replace(/\.mdx$/, ''))) {
      console.log(`Skipping hand-maintained page ${outRel}`)
      continue
    }
    await mkdir(path.dirname(outPath), { recursive: true })
    await writeFile(outPath, frontmatter.join('\n') + body)
  }

  // Write meta.json files preserving llms.txt order.
  // folder path -> { title, pages: [] }
  const folders = new Map([['', { title: 'AI Data Grid', pages: [] }]])
  const folderTitle = (dir) => {
    const indexPage = pages.find((p) => p.path.slice(1) === dir)
    if (indexPage) return indexPage.title
    return dir.split('/').pop().replace(/(^|-)(\w)/g, (_, __, c) => ` ${c.toUpperCase()}`).trim()
  }
  // Walk pages in llms.txt order, registering each folder in its parent the
  // first time it is seen so the tree order matches the index exactly.
  const ensureFolder = (dir) => {
    if (dir === '' || folders.has(dir)) return
    const parent = path.posix.dirname(dir) === '.' ? '' : path.posix.dirname(dir)
    ensureFolder(parent)
    folders.set(dir, { title: folderTitle(dir), pages: [] })
    folders.get(parent).pages.push(dir.split('/').pop())
  }
  for (const page of pages) {
    const slug = page.path.slice(1)
    if (page.path === '/welcome-to-glide-data-grid') {
      folders.get('').pages.push('index')
    } else if (isFolderIndex(page.path)) {
      ensureFolder(slug)
      folders.get(slug).pages.push('index')
    } else {
      const parent = path.posix.dirname(slug) === '.' ? '' : path.posix.dirname(slug)
      ensureFolder(parent)
      folders.get(parent).pages.push(path.posix.basename(slug))
    }
  }
  // The About page is hand-maintained and always listed last.
  folders.get('').pages.push('about')

  for (const [dir, meta] of folders) {
    const metaPath = path.join(CONTENT_DIR, dir, 'meta.json')
    await mkdir(path.dirname(metaPath), { recursive: true })
    await writeFile(metaPath, JSON.stringify({ title: meta.title, pages: meta.pages }, null, 2) + '\n')
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
