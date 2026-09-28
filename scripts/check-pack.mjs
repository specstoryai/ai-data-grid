// Checks what the three npm tarballs contain before they are published.
//
// Usage:
//   node scripts/check-pack.mjs                     # `npm pack --dry-run` of each workspace
//   node scripts/check-pack.mjs --tarballs <dir>    # the three real .tgz files in <dir>
//
// Run it after `npm run build`. It uses Node built-ins and the system `tar`, and
// no network. Each failure is one line; the exit code is 1 when there is any.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The packages, in publication order, and the files each must ship besides package.json.
const PACKAGES = [
    { dir: "packages/core", name: "@specstory/ai-data-grid", extra: ["API.md", "CHANGELOG.md"] },
    { dir: "packages/cells", name: "@specstory/ai-data-grid-cells", extra: [] },
    { dir: "packages/source", name: "@specstory/ai-data-grid-source", extra: [] },
];
const REQUIRED = ["package.json", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"];
const PUBLISH_CONFIG = { access: "public", registry: "https://registry.npmjs.org/" };
const LIFECYCLE = [
    "preinstall",
    "install",
    "postinstall",
    "prepare",
    "prepack",
    "postpack",
    "prepublish",
    "prepublishOnly",
    "publish",
    "postpublish",
];
const COPYRIGHT = "Copyright (c) 2021 typeguard, Inc.\nCopyright (c) 2026 ai-data-grid contributors\n";

// h. Forbidden paths. Each test gets the path's segments, so `src/ai-fill/testing/` isn't a `test/` match.
const FORBIDDEN = [
    ["a test/ or __tests__/ directory", s => s.slice(0, -1).some(x => x === "test" || x === "__tests__")],
    ["a test or spec file", s => /\.(test|spec)\.[^/]+$/.test(s.at(-1))],
    ["a story", s => /\.stories\.[^/]+$/.test(s.at(-1)) || s.slice(0, -1).includes("stories")],
    ["Storybook docs pages (src/docs/)", s => s[0] === "src" && s[1] === "docs"],
    ["a tsbuildinfo file", s => s.at(-1).endsWith(".tsbuildinfo")],
    ["build.sh", s => s.at(-1) === "build.sh"],
    ["ESLint config", s => s.at(-1).startsWith(".eslintrc") || s.at(-1) === ".eslintignore"],
    ["vitest config", s => s.at(-1).startsWith("vitest.")],
    ["tsconfig", s => s.at(-1).startsWith("tsconfig")],
    ["a .env file", s => s.at(-1).startsWith(".env")],
    [".npmrc", s => s.at(-1) === ".npmrc"],
    ["a tarball", s => s.at(-1).endsWith(".tgz")],
    ["node_modules/", s => s.includes("node_modules")],
    ["coverage/", s => s.slice(0, -1).includes("coverage")],
    ["a log file", s => s.at(-1).endsWith(".log")],
    ["a key or certificate", s => /\.(pem|key)$/.test(s.at(-1))],
    [".DS_Store", s => s.at(-1) === ".DS_Store"],
    ["vendor/ outside dist/", s => s[0] !== "dist" && s.slice(0, -1).includes("vendor")],
];

// j. Content that must never ship: local paths and token-shaped strings.
const CONTENT = [
    ["a /home/ path", /\/home\//],
    ["a /Users/ path", /\/Users\//],
    ["a multica_workspaces path", /multica_workspaces/],
    ["a C:\\Users path", /C:\\+Users/i],
    ["an npm token", /npm_[A-Za-z0-9]{36}/],
    ["a GitHub token", /gh[pousr]_[A-Za-z0-9]{36,}/],
    ["a GitHub fine-grained token", /github_pat_[A-Za-z0-9_]{22,}/],
    ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
// Legitimate matches, each one file and one exact string: { pkg, file, match, why }. None so far.
const CONTENT_ALLOW = [];

const failures = [];
function fail(pkg, check, message) {
    failures.push(`FAIL ${pkg} [${check}] ${message}`);
}

// --- Collect each package's files ---------------------------------------------

function fromDryRun() {
    return PACKAGES.map(p => {
        const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "--workspace", p.dir], {
            cwd: ROOT,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });
        const [info] = JSON.parse(out);
        const base = join(ROOT, p.dir);
        return {
            ...p,
            base,
            files: info.files.map(f => f.path),
            packed: info.size,
            unpacked: info.unpackedSize,
            manifest: JSON.parse(readFileSync(join(base, "package.json"), "utf8")),
        };
    });
}

function walk(dir, prefix = "") {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) out.push(...walk(join(dir, entry.name), rel));
        else out.push(rel);
    }
    return out;
}

function fromTarballs(dir, scratch) {
    const tgzs = readdirSync(dir).filter(f => f.endsWith(".tgz"));
    if (tgzs.length !== PACKAGES.length) {
        fail("-", "a", `expected ${PACKAGES.length} .tgz files in ${dir}, found ${tgzs.length}: ${tgzs.join(", ")}`);
    }
    const result = [];
    for (const [i, tgz] of tgzs.entries()) {
        const file = join(dir, tgz);
        const into = join(scratch, String(i));
        mkdirSync(into, { recursive: true });
        execFileSync("tar", ["-xzf", file, "-C", into]);
        const base = join(into, "package");
        const manifest = JSON.parse(readFileSync(join(base, "package.json"), "utf8"));
        const pkg = PACKAGES.find(p => p.name === manifest.name);
        if (pkg === undefined) {
            fail(manifest.name ?? tgz, "a", `${tgz} is not one of the release packages`);
            continue;
        }
        const files = walk(base);
        const bytes = readFileSync(file);
        result.push({
            ...pkg,
            base,
            tgz,
            files,
            packed: bytes.length,
            unpacked: files.reduce((sum, f) => sum + statSync(join(base, f)).size, 0),
            integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
            manifest,
        });
    }
    return result;
}

// --- Assertions ---------------------------------------------------------------

function exportTargets(value, out = []) {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach(v => exportTargets(v, out));
    else if (value !== null && typeof value === "object") Object.values(value).forEach(v => exportTargets(v, out));
    return out;
}

function isGitOrLocal(spec) {
    return (
        /^(file|link|workspace|git|git\+[a-z]+|github|gitlab|bitbucket|gist|https?):/.test(spec) ||
        /^[\w.-]+\/[\w.-]+(#.*)?$/.test(spec)
    );
}

// Resolves a .d.ts relative specifier to a shipped declaration.
function declarationCandidates(target) {
    if (/\.(css|json)$/.test(target)) return [target];
    const stem = target.replace(/\.(m|c)?js$/, "");
    const ext = target.endsWith(".mjs") ? ".d.mts" : target.endsWith(".cjs") ? ".d.cts" : ".d.ts";
    return [`${stem}${ext}`, `${stem}.d.ts`, `${stem}/index.d.ts`, target];
}

function check(pkg, rootVersion, rootLicense, rootNotices) {
    const id = pkg.name;
    const files = new Set(pkg.files);
    const read = f => readFileSync(join(pkg.base, f));
    const { manifest } = pkg;

    // a. Name and version.
    if (manifest.version !== rootVersion) fail(id, "a", `version ${manifest.version} != root ${rootVersion}`);

    // b. Required files.
    for (const f of [...REQUIRED, ...pkg.extra]) if (!files.has(f)) fail(id, "b", `missing ${f}`);

    // c. LICENSE and notices.
    if (files.has("LICENSE")) {
        const license = read("LICENSE");
        if (!license.equals(rootLicense)) fail(id, "c", "LICENSE differs from the root LICENSE");
        if (!license.toString("utf8").includes(COPYRIGHT)) {
            fail(id, "c", "LICENSE lacks the typeguard line directly followed by the ai-data-grid contributors line");
        }
    }
    if (files.has("THIRD_PARTY_NOTICES.md") && !read("THIRD_PARTY_NOTICES.md").equals(rootNotices)) {
        fail(id, "c", "THIRD_PARTY_NOTICES.md differs from the root THIRD_PARTY_NOTICES.md");
    }

    // d. Entry points and every exports target, under every condition.
    const entries = ["main", "module", "browser", "types"].filter(k => typeof manifest[k] === "string");
    for (const k of entries) {
        if (!files.has(posix.normalize(manifest[k]))) fail(id, "d", `${k} ${manifest[k]} is not shipped`);
    }
    for (const target of exportTargets(manifest.exports)) {
        if (!files.has(posix.normalize(target))) fail(id, "d", `exports target ${target} is not shipped`);
    }

    // e. CSS @imports.
    for (const f of pkg.files.filter(x => /^dist\/[^/]+\.css$/.test(x))) {
        for (const m of read(f)
            .toString("utf8")
            .matchAll(/@import\s+(?:url\()?["']([^"']+)["']/g)) {
            const target = posix.join(posix.dirname(f), m[1]);
            if (!files.has(target)) fail(id, "e", `${f} imports ${m[1]}, which is not shipped`);
        }
    }

    // f. Source maps: their sources, and the trailers that point at them.
    for (const f of pkg.files) {
        if (f.endsWith(".map")) {
            let map;
            try {
                map = JSON.parse(read(f).toString("utf8"));
            } catch {
                fail(id, "f", `${f} is not valid JSON`);
                continue;
            }
            for (const [i, source] of (map.sources ?? []).entries()) {
                if (map.sourcesContent?.[i] != null) continue;
                const target = posix.normalize(posix.join(posix.dirname(f), map.sourceRoot ?? "", source));
                if (!files.has(target)) fail(id, "f", `${f} points at ${source}, which is not shipped`);
            }
        } else if (/\.(m|c)?js$|\.d\.(m|c)?ts$/.test(f)) {
            for (const m of read(f)
                .toString("utf8")
                .matchAll(/^\/\/# sourceMappingURL=(\S+)\s*$/gm)) {
                if (m[1].startsWith("data:")) continue;
                const target = posix.join(posix.dirname(f), m[1]);
                if (!files.has(target)) fail(id, "f", `${f} points at the map ${m[1]}, which is not shipped`);
            }
        }
    }

    // g. Relative specifiers in declarations.
    const specifier =
        /(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)["'](\.{1,2}\/[^"']+)["']|\/\/\/\s*<reference\s+path=["']([^"']+)["']/gm;
    for (const f of pkg.files.filter(x => /\.d\.(m|c)?ts$/.test(x))) {
        for (const m of read(f).toString("utf8").matchAll(specifier)) {
            const spec = m[1] ?? m[2];
            const target = posix.join(posix.dirname(f), spec);
            if (!declarationCandidates(target).some(c => files.has(c))) {
                fail(id, "g", `${f} refers to ${spec}, which has no shipped declaration`);
            }
        }
    }

    // h. Forbidden paths.
    for (const f of pkg.files) {
        const segments = f.split("/");
        for (const [what, test] of FORBIDDEN) if (test(segments)) fail(id, "h", `${f} is ${what}`);
    }

    // i. The manifest.
    if (JSON.stringify(manifest.publishConfig) !== JSON.stringify(PUBLISH_CONFIG)) {
        fail(id, "i", `publishConfig is ${JSON.stringify(manifest.publishConfig)}`);
    }
    if ("private" in manifest) fail(id, "i", `private is set (${manifest.private})`);
    for (const s of LIFECYCLE) if (manifest.scripts?.[s] !== undefined) fail(id, "i", `has a ${s} script`);
    if (id !== PACKAGES[0].name && manifest.dependencies?.[PACKAGES[0].name] !== rootVersion) {
        fail(
            id,
            "i",
            `depends on ${PACKAGES[0].name}@${manifest.dependencies?.[PACKAGES[0].name]}, not ${rootVersion}`
        );
    }
    for (const peer of ["react", "react-dom"]) {
        if (manifest.peerDependencies?.[peer] !== "^19.0.0") {
            fail(id, "i", `peer ${peer} is ${manifest.peerDependencies?.[peer]}, not ^19.0.0`);
        }
    }
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"]) {
        for (const [dep, spec] of Object.entries(manifest[field] ?? {})) {
            if (isGitOrLocal(spec)) fail(id, "i", `${field}.${dep} is ${spec}`);
        }
    }

    // j. Content scan.
    for (const f of pkg.files) {
        const text = read(f).toString("latin1");
        for (const [what, pattern] of CONTENT) {
            for (const m of text.matchAll(new RegExp(pattern.source, pattern.flags + "g"))) {
                const allowed = CONTENT_ALLOW.some(a => a.pkg === id && a.file === f && a.match === m[0]);
                if (!allowed) fail(id, "j", `${f} contains ${what}`);
            }
        }
    }
}

// --- Main ---------------------------------------------------------------------

const args = process.argv.slice(2);
const tarballDir = args[0] === "--tarballs" ? args[1] : undefined;
if (args.length > 0 && (tarballDir === undefined || args.length !== 2)) {
    console.error("Usage: node scripts/check-pack.mjs [--tarballs <dir>]");
    process.exit(2);
}

const rootVersion = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const rootLicense = readFileSync(join(ROOT, "LICENSE"));
const rootNotices = readFileSync(join(ROOT, "THIRD_PARTY_NOTICES.md"));

const scratch = tarballDir === undefined ? undefined : mkdtempSync(join(tmpdir(), "check-pack-"));
try {
    if (tarballDir !== undefined && !existsSync(tarballDir)) {
        console.error(`No such directory: ${tarballDir}`);
        process.exit(2);
    }
    const packs = tarballDir === undefined ? fromDryRun() : fromTarballs(resolve(tarballDir), scratch);

    // a. Exactly the three names.
    const names = packs.map(p => p.name).sort();
    const expected = PACKAGES.map(p => p.name).sort();
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
        fail("-", "a", `packages are ${names.join(", ")}, expected ${expected.join(", ")}`);
    }

    for (const pkg of packs) check(pkg, rootVersion, rootLicense, rootNotices);

    console.log(`check-pack (${tarballDir === undefined ? "npm pack --dry-run" : `tarballs in ${tarballDir}`})`);
    const header = ["package", "version", "files", "packed B", "unpacked B"];
    if (tarballDir !== undefined) header.push("integrity");
    const rows = packs.map(p => {
        const row = [p.name, p.manifest.version, p.files.length, p.packed, p.unpacked].map(String);
        if (tarballDir !== undefined) row.push(p.integrity);
        return row;
    });
    const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
    for (const row of [header, ...rows])
        console.log(
            row
                .map((c, i) => c.padEnd(widths[i]))
                .join("  ")
                .trimEnd()
        );

    if (failures.length > 0) {
        for (const f of failures) console.error(f);
        console.error(`check-pack FAILED: ${failures.length} problem(s)`);
        process.exitCode = 1;
    } else {
        console.log("check-pack PASSED: assertions a-j hold for all three packages");
    }
} finally {
    if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
}
