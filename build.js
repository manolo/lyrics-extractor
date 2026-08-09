#!/usr/bin/env node
// Build lyrics-extractor-<version>.mext: package the extension for MuseScore 4.
//
// File names and relative paths are the ones in the working tree, so the QML imports
// ("../lib/formatter.js") and the Qt.resolvedUrl("../cli/extract-chords.js") lookup
// resolve inside the package exactly as they do here.
//
// The JavaScript is minified: comments and whitespace go, expressions are compressed.
// Identifiers are NOT mangled, which is deliberate. Mangling once cost two shipping
// bugs, it makes a stack trace in a console.log-only environment useless, and it buys
// little: on this codebase compressing without it already takes the package from 127K
// to 73K, and mangling on top would save 9K more. Read the repository for the sources.
//
// Usage: node build.js [version] [--install] [--no-minify] [--keep-build]
//        --install      also copies the staged package into the local MuseScore
//                       extensions directory, for contributors who do not develop in it
//        --no-minify    ship the sources verbatim, to bisect a packaging problem
//        --keep-build   leave .build/ in place, which npm run test:package then drives
//                       the snapshot suite against

var fs = require("fs");
var path = require("path");
var os = require("os");
var childProcess = require("child_process");

var args = process.argv.slice(2);
var doInstall = args.indexOf("--install") !== -1;
var noMinify = args.indexOf("--no-minify") !== -1;
var keepBuild = args.indexOf("--keep-build") !== -1;
var version = args.filter(function(a) { return a.indexOf("--") !== 0; })[0] || "dev";

var OUT = "lyrics-extractor-" + version + ".mext";
var BUILD = ".build";

var terser = noMinify ? null : loadTerser();
var minified = 0;

// Directories whose .js files go into the package
var RUNTIME_DIRS = ["lib", "score", "cli"];

// Clean previous build
fs.rmSync(BUILD, { recursive: true, force: true });
fs.rmSync(OUT, { force: true });
fs.mkdirSync(BUILD + "/ui", { recursive: true });

// Copy runtime modules
RUNTIME_DIRS.forEach(function(dir) {
    fs.mkdirSync(path.join(BUILD, dir), { recursive: true });
    jsFiles(dir).forEach(function(f) {
        writeJs(f, path.join(BUILD, f));
    });
});

// Copy QML side, stamping the version into the plugin header. The .qml itself is never
// touched beyond the version: it is Qt markup, not JavaScript that terser can read.
writeJs("ui/help.js", BUILD + "/ui/help.js");

// The languages: en.js is code and gets minified like any module, the .json translations are
// copied as they are. Whatever is in ui/i18n/ travels, so adding a language is adding a file.
fs.mkdirSync(BUILD + "/ui/i18n", { recursive: true });
fs.readdirSync("ui/i18n").forEach(function(f) {
    if (/\.js$/.test(f)) writeJs("ui/i18n/" + f, BUILD + "/ui/i18n/" + f);
    else if (/\.json$/.test(f)) fs.copyFileSync("ui/i18n/" + f, BUILD + "/ui/i18n/" + f);
});

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
ensureShebang(path.join(BUILD, "cli/extract-chords.js"));

// Package as ZIP (OUT was removed above, so no stale entries survive)
childProcess.execSync("cd " + quote(BUILD) + " && zip -r -q ../" + quote(OUT) + " .");

var size = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log("Built " + OUT + " (" + size + "K) with " + countFiles(BUILD) + " files" +
    (minified > 0 ? ", " + minified + " minified" : ", sources verbatim"));

if (doInstall) install(BUILD);

// npm run test:package runs the snapshot suite against the staged tree, so it has to
// outlive the build there
if (keepBuild) console.log("Kept " + BUILD + "/ for testing");
else fs.rmSync(BUILD, { recursive: true, force: true });

// --- Helpers ---

// Minify one .js into the staging tree. Identifiers stay as written (see the header), and
// so do the top level declarations QML resolves its imports against, since terser only
// touches top level names when told to.
function writeJs(src, dest) {
    if (noMinify || !terser) {
        fs.copyFileSync(src, dest);
        return;
    }
    var code = fs.readFileSync(src, "utf8");
    var result = terser.minify_sync(code, {
        compress: true,
        mangle: false,
        format: { comments: false }
    });
    if (result.error) throw new Error(src + ": " + result.error);
    fs.writeFileSync(dest, result.code + "\n");
    minified++;
}

function loadTerser() {
    try {
        return require("terser");
    } catch (e) {
        console.log("terser not installed, shipping sources verbatim " +
            "(run: npm install --ignore-scripts)");
        return null;
    }
}

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
