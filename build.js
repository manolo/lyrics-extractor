#!/usr/bin/env node
// Build lyrics-extractor-<version>.mext: package the extension for MuseScore 4.
//
// Sources ship as they are written: same file names, same relative paths, no
// minification and no renaming, so the QML imports ("../lib/formatter.js") resolve
// inside the package exactly as they do in the working tree.
//
// Usage: node build.js [version] [--install]
//        --install also copies the staged package into the local MuseScore
//        extensions directory, for contributors who do not develop inside it.

var fs = require("fs");
var path = require("path");
var os = require("os");
var childProcess = require("child_process");

var args = process.argv.slice(2);
var doInstall = args.indexOf("--install") !== -1;
var version = args.filter(function(a) { return a.indexOf("--") !== 0; })[0] || "dev";

var OUT = "lyrics-extractor-" + version + ".mext";
var BUILD = ".build";

// Directories copied verbatim into the package
var RUNTIME_DIRS = ["lib", "extractors", "cli"];

// Clean previous build
fs.rmSync(BUILD, { recursive: true, force: true });
fs.rmSync(OUT, { force: true });
fs.mkdirSync(BUILD + "/ui", { recursive: true });

// Copy runtime modules
RUNTIME_DIRS.forEach(function(dir) {
    fs.mkdirSync(path.join(BUILD, dir), { recursive: true });
    jsFiles(dir).forEach(function(f) {
        fs.copyFileSync(f, path.join(BUILD, f));
    });
});

// Copy QML side, stamping the version into the plugin header
fs.copyFileSync("ui/help-text.js", BUILD + "/ui/help-text.js");

var qmlSrc = fs.readFileSync("ui/LyricsForm.qml", "utf8");
if (version !== "dev") {
    qmlSrc = qmlSrc.replace(/version: "[^"]*"/, 'version: "' + version + '"');
}
fs.writeFileSync(BUILD + "/ui/LyricsForm.qml", qmlSrc);

// Static files
fs.copyFileSync("logo.png", BUILD + "/logo.png");

var manifest = fs.readFileSync("manifest.json", "utf8");
if (version !== "dev") {
    manifest = manifest.replace(/"version": "[^"]*"/, '"version": "' + version + '"');
}
fs.writeFileSync(BUILD + "/manifest.json", manifest);

// The CLI entry keeps its shebang so it stays directly executable
ensureShebang(path.join(BUILD, "cli/index.js"));

// Package as ZIP (OUT was removed above, so no stale entries survive)
childProcess.execSync("cd " + quote(BUILD) + " && zip -r -q ../" + quote(OUT) + " .");

var size = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log("Built " + OUT + " (" + size + "K) with " + countFiles(BUILD) + " files");

if (doInstall) install(BUILD);

fs.rmSync(BUILD, { recursive: true, force: true });

// --- Helpers ---

function jsFiles(dir) {
    try {
        return fs.readdirSync(dir)
            .filter(function(f) { return f.endsWith(".js"); })
            .map(function(f) { return dir + "/" + f; });
    } catch (e) { return []; }
}

function ensureShebang(file) {
    if (!fs.existsSync(file)) return;
    var code = fs.readFileSync(file, "utf8");
    if (code.indexOf("#!") !== 0) fs.writeFileSync(file, "#!/usr/bin/env node\n" + code);
}

function extensionsDir() {
    var home = os.homedir();
    if (process.platform === "darwin") {
        return path.join(home, "Library/Application Support/MuseScore/MuseScore4/extensions");
    }
    if (process.platform === "win32") {
        var local = process.env.LOCALAPPDATA || path.join(home, "AppData/Local");
        return path.join(local, "MuseScore/MuseScore4/extensions");
    }
    return path.join(home, ".local/share/MuseScore/MuseScore4/extensions");
}

function install(stagedDir) {
    var target = path.join(extensionsDir(), "lyrics-extractor");
    if (path.resolve(target) === path.resolve(process.cwd())) {
        console.log("Skipping --install: this working tree already is " + target);
        return;
    }
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(stagedDir, target, { recursive: true });
    console.log("Installed into " + target + " (restart MuseScore to reload)");
}

function quote(s) { return "'" + s.replace(/'/g, "'\\''") + "'"; }

function countFiles(dir) {
    var count = 0;
    fs.readdirSync(dir).forEach(function(f) {
        var p = dir + "/" + f;
        if (fs.statSync(p).isDirectory()) count += countFiles(p);
        else count++;
    });
    return count;
}
