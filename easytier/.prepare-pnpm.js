/* SPDX-License-Identifier: LGPL-3.0
 *
 * Copyright (C) 2026 Anya Lin <hukk1996@gmail.com>
 */

const fs = require("fs");
const path = require("path");

const root = process.env.PKG_BUILD_DIR;
console.error(root);
const packageFile = path.join(root, "package.json");
const workspaceFile = path.join(root, "pnpm-workspace.yaml");

const manifest = JSON.parse(fs.readFileSync(packageFile, "utf8"));

const pnpmSettings = manifest.pnpm ?? {};
/*
 * Allow required frontend dependency build scripts.
 * Preserve explicitly configured permissions.
 */
pnpmSettings.allowBuilds = {
	...pnpmSettings.allowBuilds,
	esbuild: true,
	"vue-demi": true,
};

let workspace = fs.readFileSync(workspaceFile, "utf8");
/*
 * Append migrated settings only when they are not already defined
 * in pnpm-workspace.yaml. Existing upstream settings take precedence.
 */
for (const [key, value] of Object.entries(pnpmSettings)) {
	const exists = new RegExp(`^${key}:`, "m").test(workspace);

	if (!exists)
		workspace += `\n${key}: ${JSON.stringify(value)}\n`;
}


if (manifest.pnpm) {
	delete manifest.pnpm;
	fs.writeFileSync(packageFile, JSON.stringify(manifest, null, 2) + "\n");
}
fs.writeFileSync(workspaceFile, workspace);
