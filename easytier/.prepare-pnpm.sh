#!/bin/bash
# SPDX-License-Identifier: LGPL-3.0
#
# Copyright (C) 2026 Anya Lin <hukk1996@gmail.com>

set -eu

CURDIR="$1"
PKG_BUILD_DIR="$2"

die() {
	echo "ERROR: $*" >&2
	exit 1
}

# Check host tools
[ -x "$(command -v node)" ] || die "Host Node.js not found"
[ -x "$(command -v pnpm)" ] || die "Host pnpm not found"

for file in package.json pnpm-lock.yaml pnpm-workspace.yaml; do
	[ -f "$PKG_BUILD_DIR/$file" ] || die "Missing $file"
done

echo "Preparing pnpm environment..."
printf 'Host Node.js: '
node --version

printf 'Host pnpm: '
pnpm --version

cd "$PKG_BUILD_DIR"

# Migrating pnpm settings from package.json to pnpm-workspace.yaml.
PKG_BUILD_DIR="$PKG_BUILD_DIR" node "$CURDIR/.prepare-pnpm.js"

echo "pnpm preparation completed."
