#!/bin/bash
# SPDX-License-Identifier: LGPL-3.0
#
# Copyright (C) 2026 Anya Lin <hukk1996@gmail.com>
#
# https://github.com/EasyTier/EasyTier/blob/v2.7.0/.github/workflows/core.yml#L271

BIN_PATH="$1"

upx --best "$BIN_PATH" || true
