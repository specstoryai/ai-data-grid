#!/bin/bash

# Tarball harness for the sample apps.
#
# Packs the three built workspace packages into test-projects/.packs/ (gitignored),
# installs those tarballs into each sample, then builds each sample. This tests
# exactly what users install: the npm tarballs with their LICENSE, exports map
# and CSS paths, against a single React 19.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKS="$ROOT/test-projects/.packs"

cd "$ROOT"

if [ ! -d packages/core/dist ] || [ ! -d packages/cells/dist ] || [ ! -d packages/source/dist ]; then
    echo "Package dist/ output missing; building workspaces first..."
    npm run build --workspaces
fi

rm -rf "$PACKS"
mkdir -p "$PACKS"

for PKG in core cells source; do
    npm pack --workspace "packages/$PKG" --pack-destination "$PACKS" > /dev/null
done

echo "Packed tarballs:"
ls -1 "$PACKS"

for DIR in "vite-app" "next-app"; do
    echo
    echo "=== Setting up test-projects/$DIR ==="
    pushd "$ROOT/test-projects/$DIR" > /dev/null
    rm -rf node_modules package-lock.json
    npm install "$PACKS"/*.tgz
    npm run build
    popd > /dev/null
done

echo
echo "All test projects built successfully."
