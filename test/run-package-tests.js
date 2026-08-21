// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// npm run test:package packages the extension and then drives the whole suite through the
// packaged tree, so that a minification which changes any output fails before a release.
// build.js needs --keep-build for that, and this exists to take the staging directory away
// again afterwards, including when the tests fail.
//
// Leaving it behind is not harmless. While developing, this repository is usually the
// directory MuseScore loads the extension from, and MuseScore looks for manifest.json
// through subdirectories, not just at the top: extensionsloader.cpp scans with the default
// ScanMode::FilesInCurrentDirAndSubdirs, and the filters it passes exclude hidden files but
// nothing stops the walk from descending into a directory whose name begins with a dot. So
// .build/manifest.json reads as a second extension declaring the same uri, and the plugin
// appears twice in the menu, the second one being whatever version was last packaged.
//
// The release workflow does not use this: it packages once with a real version and points
// the suite at that tree by hand, so it must not be rebuilt as a dev version underneath.

var childProcess = require("child_process");
var fs = require("fs");
var path = require("path");

var BASE = path.resolve(__dirname, "..");
var BUILD = path.join(BASE, ".build");

function run(args, env) {
    return childProcess.spawnSync(process.execPath, args, {
        cwd: BASE,
        stdio: "inherit",
        env: env || process.env
    });
}

function cleanUp() {
    fs.rmSync(BUILD, { recursive: true, force: true });
}

var built = run(["build.js", "dev", "--keep-build"]);
if (built.status !== 0) {
    cleanUp();
    process.exit(built.status === null ? 1 : built.status);
}

var env = Object.assign({}, process.env, { LE_CLI: path.join(".build", "cli", "index.js") });
var tested = run(["--test", "test/**/*.test.js"], env);

cleanUp();
process.exit(tested.status === null ? 1 : tested.status);
