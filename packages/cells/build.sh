#!/bin/bash
set -em
source ../../config/build-util.sh

ensure_bash_4

shopt -s globstar

echo -e "\033[0;36m🏗️ Building AI Data Grid Cells 🏗️\033[0m"

compile_esm() {
    compile esm true
}

compile_cjs() {
    compile cjs false
}

# The vendored, patched Toast UI editor (SPST-48) ships as-is. dist/esm/cells and dist/cjs/cells
# both import it as ../../vendor/toast-ui/editor.js. Its CSS stays outside dist/esm so that
# generate_index_css doesn't fold Toast UI's global rules into dist/index.css.
copy_vendor() {
    rm -rf dist/vendor
    mkdir -p dist/vendor/toast-ui
    cp vendor/toast-ui/editor.js vendor/toast-ui/LICENSE vendor/toast-ui/README.md dist/vendor/toast-ui/
    cp vendor/toast-ui/toastui-editor.css dist/toastui-editor.css
}

copy_vendor

run_in_parallel compile_esm compile_cjs

generate_index_css

echo -e "\033[0;36m🎉 Cells Build Complete 🎉\033[0m"