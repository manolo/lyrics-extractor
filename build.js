#!/usr/bin/env node
// Build lyrics-extractor.mext: compile and package extension
// Usage: node build.js [version]

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var childProcess = require("child_process");

var version = process.argv[2] || "dev";
var OUT = "lyrics-extractor.mext";
var BUILD = ".build";

// Clean previous build
fs.rmSync(BUILD, { recursive: true, force: true });
try { fs.unlinkSync(OUT); } catch (e) {}
fs.mkdirSync(BUILD + "/m", { recursive: true });
fs.mkdirSync(BUILD + "/ui", { recursive: true });

// Discover runtime JS files
var jsFiles = []
    .concat(glob("lib", ".js"))
    .concat(glob("extractors", ".js"))
    .concat(["ui/help-text.js"]);

// Generate short module ID from path hash
function moduleId(filePath) {
    return crypto.createHash("md5").update(filePath).digest("hex").substring(0, 3) + ".js";
}

// Build file mapping: original path -> obfuscated name
var fileMap = {};
jsFiles.forEach(function(f) { fileMap[f] = moduleId(f); });

// Compile JS with terser
jsFiles.forEach(function(f) {
    var out = path.join(BUILD, "m", fileMap[f]);
    var result = childProcess.execSync(
        "npx -y terser " + quote(f) + " --compress --mangle --ecma 5",
        { encoding: "utf8" }
    );
    fs.writeFileSync(out, result);
});

// Update require() paths in compiled JS
var compiled = glob(BUILD + "/m", ".js");
compiled.forEach(function(f) {
    var code = fs.readFileSync(f, "utf8");
    for (var src in fileMap) {
        var name = path.basename(src, ".js");
        var dst = fileMap[src];
        var dstNoExt = dst.replace(".js", "");
        code = code.replace(
            new RegExp('require\\("[^"]*' + escRe(name) + '(\.js)?"\\)', "g"),
            'require("./' + dstNoExt + '")'
        );
    }
    fs.writeFileSync(f, code);
});

// Copy QML and update import paths
var qmlSrc = fs.readFileSync("ui/LyricsForm.qml", "utf8");

for (var src in fileMap) {
    var oldPath;
    if (src.startsWith("lib/")) oldPath = "../lib/" + path.basename(src);
    else if (src.startsWith("extractors/")) oldPath = "../extractors/" + path.basename(src);
    else if (src.startsWith("ui/")) oldPath = path.basename(src);
    else continue;
    qmlSrc = qmlSrc.split('"' + oldPath + '"').join('"../m/' + fileMap[src] + '"');
}

// Shorten QML import aliases to single letters
var imports = qmlSrc.match(/import ".*\.js" as (\w+)/g) || [];
var aliases = imports.map(function(s) { return s.replace(/.* as /, ""); });
var aliasMap = {};
aliases.forEach(function(a, i) { aliasMap[a] = String.fromCharCode(65 + i); });

// Preserve mods object keys: replace values only
var modsRe = /(property var mods:\s*\(\{)([\s\S]*?)(\}\))/;
var modsMatch = qmlSrc.match(modsRe);
if (modsMatch) {
    var body = modsMatch[2].replace(/(\w+):\s*(\w+)/g, function(m, key, val) {
        return key + ": " + (aliasMap[val] || val);
    });
    qmlSrc = qmlSrc.replace(modsRe, modsMatch[1] + body + modsMatch[3]);
}

// Replace all alias occurrences (longest first to avoid partial matches)
var sorted = aliases.slice().sort(function(a, b) { return b.length - a.length; });
sorted.forEach(function(a) {
    qmlSrc = qmlSrc.replace(new RegExp("\\b" + a + "\\b", "g"), aliasMap[a]);
});

// Restore mods keys that got replaced
var modsMatch2 = qmlSrc.match(modsRe);
if (modsMatch2) {
    var reverseMap = {};
    for (var k in aliasMap) reverseMap[aliasMap[k]] = k;
    var body2 = modsMatch2[2].replace(/(\w+):\s*(\w+)/g, function(m, key, val) {
        return (reverseMap[key] || key) + ": " + val;
    });
    qmlSrc = qmlSrc.replace(modsRe, modsMatch2[1] + body2 + modsMatch2[3]);
}

// Strip single-line JS comments
qmlSrc = qmlSrc.replace(/^\s*\/\/.*$/gm, "");

// Set version
if (version !== "dev") {
    qmlSrc = qmlSrc.replace(/version: "[^"]*"/, 'version: "' + version + '"');
}

fs.writeFileSync(BUILD + "/ui/LyricsForm.qml", qmlSrc);

// Copy static files
fs.copyFileSync("manifest.json", BUILD + "/manifest.json");
fs.copyFileSync("logo.png", BUILD + "/logo.png");

if (version !== "dev") {
    var manifest = fs.readFileSync(BUILD + "/manifest.json", "utf8");
    manifest = manifest.replace(/"version": "[^"]*"/, '"version": "' + version + '"');
    fs.writeFileSync(BUILD + "/manifest.json", manifest);
}

// Package as ZIP
childProcess.execSync("cd " + quote(BUILD) + " && zip -r ../" + quote(OUT) + " .");

var files = countFiles(BUILD);
var size = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log("Built " + OUT + " (" + size + "K) with " + files + " files");

fs.rmSync(BUILD, { recursive: true });

// --- Helpers ---

function glob(dir, ext) {
    try {
        return fs.readdirSync(dir)
            .filter(function(f) { return f.endsWith(ext); })
            .map(function(f) { return dir + "/" + f; });
    } catch (e) { return []; }
}

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

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
