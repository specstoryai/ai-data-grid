#!/bin/bash

# Release consumers: clean copies of the sample apps that install the three
# @specstory packages the way a user does, then build.
#
#   scripts/release-consumers.sh --tarballs <dir> --out <dir>
#       installs the exact .tgz files in <dir>
#   scripts/release-consumers.sh --registry <version> --expect-integrity <INTEGRITY.txt> --out <dir>
#       installs <version> from https://registry.npmjs.org/ and checks each
#       package's integrity against <INTEGRITY.txt> ("<file>  sha512-..." lines)
#
# Each app is copied from test-projects/ to <out>/<app> without node_modules,
# build output, lockfile or .npmrc. Every npm command uses an empty userconfig
# (<out>/npmrc) and globalconfig (<out>/npmrc-global), a fresh cache (<out>/npm-cache) and the public
# registry: no credentials, and npm's default peer resolution. Exits non-zero
# on any failure, including an ERESOLVE warning; the other checks still run so
# the log shows every problem.
#
# `npm run test-projects` (test-projects/bootstrap-projects.sh) is separate and
# unchanged: it packs the workspaces and installs into test-projects/ itself.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY="https://registry.npmjs.org/"
PACKAGES=("@specstory/ai-data-grid" "@specstory/ai-data-grid-cells" "@specstory/ai-data-grid-source")
APPS=("vite-app" "next-app")

usage() {
    echo "Usage: $0 (--tarballs <dir> | --registry <version> --expect-integrity <INTEGRITY.txt>) --out <dir>" >&2
    exit 2
}

MODE="" TARBALLS="" VERSION="" EXPECT="" OUT=""
while [ $# -gt 0 ]; do
    case "$1" in
        --tarballs) MODE=tarballs; TARBALLS="${2:-}"; shift 2 || usage ;;
        --registry) MODE=registry; VERSION="${2:-}"; shift 2 || usage ;;
        --expect-integrity) EXPECT="${2:-}"; shift 2 || usage ;;
        --out) OUT="${2:-}"; shift 2 || usage ;;
        *) usage ;;
    esac
done
[ -n "$MODE" ] && [ -n "$OUT" ] || usage
if [ "$MODE" = tarballs ]; then
    [ -d "$TARBALLS" ] && [ -z "$EXPECT" ] || usage
    TARBALLS="$(cd "$TARBALLS" && pwd)"
    VERSION="$(node -p 'require(process.argv[1]).version' "$ROOT/package.json")"
else
    [ -n "$VERSION" ] && [ -f "$EXPECT" ] || usage
    EXPECT="$(cd "$(dirname "$EXPECT")" && pwd)/$(basename "$EXPECT")"
fi
if [ -e "$OUT" ] && [ -n "$(ls -A "$OUT")" ]; then
    echo "$OUT exists and isn't empty; use a new directory" >&2
    exit 2
fi
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

# The file name npm pack gives a package: @specstory/ai-data-grid-cells -> specstory-ai-data-grid-cells-<v>.tgz
tgz_name() {
    local name="${1#@}"
    echo "${name//\//-}-$VERSION.tgz"
}

# The integrity a tarball has, in the form npm and the registry report.
integrity_of() {
    echo "sha512-$(openssl dgst -sha512 -binary "$1" | base64 -w0)"
}

# The integrity INTEGRITY.txt gives a tarball file name.
expected_integrity() {
    awk -v f="$1" '$1 == f { print $2 }' "$EXPECT"
}

: > "$OUT/npmrc"
: > "$OUT/npmrc-global"
NPM_FLAGS=(--userconfig "$OUT/npmrc" --globalconfig "$OUT/npmrc-global" --cache "$OUT/npm-cache" --registry "$REGISTRY")
FAILURES=()
fail() {
    echo "FAIL $*"
    FAILURES+=("$*")
}

echo "Mode: $MODE, version $VERSION, out $OUT"
node -v
npm -v

for PKG in "${PACKAGES[@]}"; do
    if [ "$MODE" = tarballs ] && [ ! -f "$TARBALLS/$(tgz_name "$PKG")" ]; then
        echo "Missing $TARBALLS/$(tgz_name "$PKG")" >&2
        exit 2
    fi
done

for APP in "${APPS[@]}"; do
    echo
    echo "=== $APP ==="
    DIR="$OUT/$APP"
    mkdir -p "$DIR"
    tar -C "$ROOT/test-projects/$APP" \
        --exclude=./node_modules --exclude=./dist --exclude=./.next \
        --exclude=./package-lock.json --exclude=./.npmrc -cf - . | tar -C "$DIR" -xf -
    pushd "$DIR" > /dev/null

    for PKG in "${PACKAGES[@]}"; do
        if [ "$MODE" = tarballs ]; then
            npm pkg set "dependencies.$PKG=file:$TARBALLS/$(tgz_name "$PKG")"
        else
            npm pkg set "dependencies.$PKG=$VERSION"
        fi
    done
    LPD="$(npm config get legacy-peer-deps "${NPM_FLAGS[@]}")"
    echo "legacy-peer-deps: $LPD"
    [ "$LPD" = false ] || fail "$APP: legacy-peer-deps is $LPD, not false"

    if npm install --no-audit --no-fund "${NPM_FLAGS[@]}" > "$OUT/$APP-install.log" 2>&1; then
        echo "npm install: ok (log: $OUT/$APP-install.log)"
    else
        fail "$APP: npm install exited non-zero (log: $OUT/$APP-install.log)"
        cat "$OUT/$APP-install.log"
        popd > /dev/null
        continue
    fi
    WARNS=$(grep -c "npm warn" "$OUT/$APP-install.log" || true)
    ERESOLVE=$(grep -c "ERESOLVE" "$OUT/$APP-install.log" || true)
    echo "npm warn lines: $WARNS, ERESOLVE lines: $ERESOLVE"
    grep "npm warn" "$OUT/$APP-install.log" | sed 's/^/  /' || true
    [ "$ERESOLVE" -eq 0 ] || fail "$APP: npm install printed $ERESOLVE ERESOLVE line(s)"

    # One react and one react-dom, both 19.x.
    npm query '#react, #react-dom' "${NPM_FLAGS[@]}" > "$OUT/$APP-react.json"
    node -e '
        const found = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        for (const p of found) console.log(`${p.name}@${p.version}  ${p.location}`);
        const bad = [];
        for (const name of ["react", "react-dom"]) {
            const copies = found.filter(p => p.name === name);
            if (copies.length !== 1) bad.push(`${copies.length} copies of ${name}`);
            else if (!copies[0].version.startsWith("19.")) bad.push(`${name} is ${copies[0].version}`);
        }
        if (bad.length > 0) { console.log(bad.join("\n")); process.exit(1); }
    ' "$OUT/$APP-react.json" || fail "$APP: react / react-dom is not exactly one 19.x copy each"

    # The @specstory lockfile entries, and their integrity.
    for PKG in "${PACKAGES[@]}"; do
        read -r LV LR LI < <(node -e '
            const lock = JSON.parse(require("fs").readFileSync("package-lock.json", "utf8"));
            const e = lock.packages["node_modules/" + process.argv[1]] ?? {};
            console.log(e.version ?? "-", e.resolved ?? "-", e.integrity ?? "-");
        ' "$PKG")
        echo "$PKG  version=$LV  resolved=$LR  integrity=$LI"
        [ "$LV" = "$VERSION" ] || fail "$APP: $PKG is $LV in the lockfile, expected $VERSION"
        if [ "$MODE" = tarballs ]; then
            WANT="$(integrity_of "$TARBALLS/$(tgz_name "$PKG")")"
        else
            WANT="$(expected_integrity "$(tgz_name "$PKG")")"
            [ -n "$WANT" ] || fail "$APP: $EXPECT has no line for $(tgz_name "$PKG")"
            case "$LR" in
                "${REGISTRY}@specstory/"*) ;;
                *) fail "$APP: $PKG resolved from $LR, not $REGISTRY" ;;
            esac
        fi
        [ "$LI" = "$WANT" ] || fail "$APP: $PKG integrity $LI != expected $WANT"
    done

    if npm run build "${NPM_FLAGS[@]}" > "$OUT/$APP-build.log" 2>&1; then
        echo "npm run build: ok (log: $OUT/$APP-build.log)"
    else
        fail "$APP: npm run build failed (log: $OUT/$APP-build.log)"
        tail -40 "$OUT/$APP-build.log"
    fi
    popd > /dev/null
done

echo
if [ ${#FAILURES[@]} -gt 0 ]; then
    echo "release-consumers FAILED: ${#FAILURES[@]} problem(s)"
    printf '  %s\n' "${FAILURES[@]}"
    exit 1
fi
echo "release-consumers PASSED: both apps installed ($MODE) and built"
