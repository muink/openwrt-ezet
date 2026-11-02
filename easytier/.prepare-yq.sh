#!/bin/bash
# SPDX-License-Identifier: LGPL-3.0
#
# Copyright (C) 2026 Anya Lin <hukk1996@gmail.com>

set -eu

OS=linux
ARCH=amd64
YQVERSION=4.54.1

TMP="$(mktemp -d)"
curl -L "https://github.com/mikefarah/yq/releases/download/v${YQVERSION}/yq_${OS}_${ARCH}" -o "$TMP"/yq
chmod +x "$TMP"/yq
echo "$TMP"/yq
