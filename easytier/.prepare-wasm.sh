#!/bin/bash
# SPDX-License-Identifier: LGPL-3.0
#
# Copyright (C) 2026 Anya Lin <hukk1996@gmail.com>
#
# https://github.com/EasyTier/EasyTier/commit/e31bde18363325a9ad8781f78f9080ced5c1c96a
# https://github.com/EasyTier/EasyTier/blob/v2.7.0/.github/actions/prepare-pnpm/action.yml#L26

set -eu

CURDIR="$1"
PKG_BUILD_DIR="$2"
export CARGO_HOME="$3"
export RUSTUP_HOME="$4"

YQ="$("$CURDIR"/.prepare-yq.sh)"
TARGET_RUST_VERSION=$(rustc --version | awk '{print $2}')
RUST_CHANNEL="$("$YQ" -p=toml '.toolchain.channel // "'"$TARGET_RUST_VERSION\"" "$PKG_BUILD_DIR/rust-toolchain.toml" 2>/dev/null)"
RUST_PROFILE="$("$YQ" -p=toml '.toolchain.profile // "minimal"' "$PKG_BUILD_DIR/rust-toolchain.toml" 2>/dev/null)"

# Use the isolated Rust toolchain.
export RUSTUP_TOOLCHAIN="$RUST_CHANNEL"
export PATH="$CARGO_HOME/bin:$PATH"

die() {
	echo "ERROR: $*" >&2
	exit 1
}

mkdir -p "$RUSTUP_HOME"

# Install rustup into the isolated directory.
RUSTUP="$CARGO_HOME/bin/rustup"
if [ ! -x "$RUSTUP" ]; then
	echo "Installing Rustup..."

	curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs |
		sh -s -- \
			-y \
			--no-modify-path \
			--profile $RUST_PROFILE \
			--default-toolchain none
fi

# Install the pinned official Rust toolchain and WASM target.
if ! "$RUSTUP" toolchain list | grep -q "^${RUSTUP_TOOLCHAIN}-"; then
	echo "Installing Rust $RUSTUP_TOOLCHAIN..."

	"$RUSTUP" toolchain install "$RUSTUP_TOOLCHAIN" \
		--profile $RUST_PROFILE \
		--no-self-update
fi

# Add rust wasm32 toolchain
echo "Installing Rust toolchain: $RUSTUP_TOOLCHAIN..."
WASM_TARGET="wasm32-unknown-unknown"
"$RUSTUP" target add \
	--toolchain "$RUSTUP_TOOLCHAIN" \
	"$WASM_TARGET"

# Install wasm-pack only when the required version is missing.
echo "Installing wasm-pack..."
cargo install wasm-pack \
	--locked \
	--root "$CARGO_HOME"

echo "Target Rust:"
echo $TARGET_RUST_VERSION

echo "Rust toolchain:"
rustc --version --verbose

echo "Installed targets:"
rustup target list --installed

echo "wasm-pack:"
wasm-pack --version

echo "wasm-pack preparation completed."
printf 'CARGO_HOME="%s"\nRUSTUP_HOME="%s"\nRUSTUP_TOOLCHAIN="%s"\nPATH="%s"\n' \
	"$CARGO_HOME" "$RUSTUP_HOME" "$RUSTUP_TOOLCHAIN" "$CARGO_HOME/bin:$PATH" > "$PKG_BUILD_DIR/toolchain.env"
