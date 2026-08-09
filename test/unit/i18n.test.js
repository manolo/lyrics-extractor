// The dialog speaks whatever languages are in ui/i18n/, and nobody can run the dialog from a
// test: the QML needs MuseScore. What can be checked here is everything except the drawing,
// and that is where translations actually break.
//
// A missing key is invisible at runtime, because it quietly falls back to English, so it has
// to be visible here.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");

var i18n = require("../../ui/i18n/i18n");
var english = require("../../ui/i18n/en");
var help = require("../../ui/help");

var UI = path.join(__dirname, "..", "..", "ui");
var I18N_DIR = path.join(UI, "i18n");

function translations() {
    return fs.readdirSync(I18N_DIR)
        .filter(function(f) { return /\.json$/.test(f); })
        .map(function(f) {
            return {
                code: f.replace(/\.json$/, ""),
                file: path.join(I18N_DIR, f),
                strings: JSON.parse(fs.readFileSync(path.join(I18N_DIR, f), "utf8"))
            };
        });
}

function placeholders(text) {
    return (String(text).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();
}

// --- the engine ---------------------------------------------------------------

test("a key missing from a translation is read from English", function() {
    i18n._reset();
    i18n.register("en", { "a": "English A", "b": "English B" });
    i18n.register("es", { "a": "Spanish A" });
    i18n.setLocale("es");

    assert.equal(i18n.t("a"), "Spanish A", "translated");
    assert.equal(i18n.t("b"), "English B", "not translated, so English");
});

test("a key nobody wrote shows as itself, which says where to look", function() {
    i18n._reset();
    i18n.register("en", {});
    assert.equal(i18n.t("save.txtDone"), "save.txtDone");
});

test("the region wins over the language, and English is the floor", function() {
    i18n._reset();
    i18n.register("en", {});
    i18n.register("pt", {});
    i18n.register("pt_br", {});

    assert.equal(i18n.setLocale("pt_BR"), "pt_br", "the exact match");
    assert.equal(i18n.setLocale("pt_PT"), "pt", "the language, since pt_pt is not there");
    assert.equal(i18n.setLocale("de_DE"), "en", "nothing at all, so English");
});

test("placeholders are filled, and an unknown one is left alone", function() {
    i18n._reset();
    i18n.register("en", { "sum": "{a} syllables, {b} chords", "odd": "{a} and {nope}" });

    assert.equal(i18n.t("sum", { a: 24, b: 9 }), "24 syllables, 9 chords");
    assert.equal(i18n.t("odd", { a: 1 }), "1 and {nope}",
        "a translator who invents a placeholder sees their own text, not undefined");
});

test("a placeholder with nothing to put in it is left as it stands", function() {
    // The value is read straight off the object: the first version asked hasOwnProperty, which
    // the QML engine does not offer on every object it hands over, and the dialog printed
    // "Debug exportado: {path}" with the path missing
    i18n._reset();
    i18n.register("en", { "p": "saved to {path}" });

    assert.equal(i18n.t("p", { path: "/tmp/a.txt" }), "saved to /tmp/a.txt");
    assert.equal(i18n.t("p", {}), "saved to {path}", "nothing to fill it with");
    assert.equal(i18n.t("p", { path: undefined }), "saved to {path}", "nor an empty value");
    assert.equal(i18n.t("p"), "saved to {path}", "nor no params at all");
    assert.equal(i18n.t("p", { path: 0 }), "saved to 0", "but zero is a value");

    var bare = Object.create(null);   // an object with no prototype, so no hasOwnProperty
    bare.path = "/tmp/b.txt";
    assert.equal(i18n.t("p", bare), "saved to /tmp/b.txt",
        "whatever the caller hands over, the value is read off it directly");
});

test("a translation may order the placeholders as its language needs", function() {
    i18n._reset();
    i18n.register("en", { "p": "{count} chords in {file}" });
    i18n.register("ja", { "p": "{file} に {count} コード" });
    i18n.setLocale("ja");
    assert.equal(i18n.t("p", { count: 3, file: "a.mscz" }), "a.mscz に 3 コード");
});

// --- what the dialog asks for -------------------------------------------------

test("every key the dialog uses exists in English", function() {
    var qml = fs.readFileSync(path.join(UI, "LyricsForm.qml"), "utf8");
    var used = {};
    var re = /\bt\(\s*"([a-zA-Z][a-zA-Z0-9._]*)"/g;
    var m;
    while ((m = re.exec(qml)) !== null) used[m[1]] = true;

    var keys = Object.keys(used).sort();
    assert.ok(keys.length > 40, "the dialog asks for something: " + keys.length);

    var missing = keys.filter(function(k) { return english.strings[k] === undefined; });
    assert.deepEqual(missing, [], "ui/i18n/en.js is missing keys the dialog asks for");
});

test("every key the help page uses exists in English", function() {
    var asked = [];
    help.build(function(key) { asked.push(key); return ""; }, true);

    var missing = asked.filter(function(k) { return english.strings[k] === undefined; });
    assert.deepEqual(missing, [], "ui/i18n/en.js is missing keys the help page asks for");
});

test("the scores directory row appears only when the fallback needs it", function() {
    var withRow = help.build(function(k) { return k; }, true);
    var without = help.build(function(k) { return k; }, false);

    assert.ok(withRow.indexOf("help.scoresDir.label") >= 0);
    assert.equal(without.indexOf("help.scoresDir.label"), -1,
        "a user whose diagrams come from the API is not told to set a directory");
});

// --- the translations ---------------------------------------------------------

translations().forEach(function(lang) {
    test(lang.code + ".json: every key it carries is a real one", function() {
        var unknown = Object.keys(lang.strings).filter(function(k) {
            return english.strings[k] === undefined;
        }).sort();
        assert.deepEqual(unknown, [],
            "a key that is not in en.js is a typo: it would fall back to English forever, " +
            "and nothing would ever say so");
    });

    test(lang.code + ".json: placeholders match the English they translate", function() {
        var wrong = [];
        Object.keys(lang.strings).forEach(function(key) {
            var mine = placeholders(lang.strings[key]);
            var theirs = placeholders(english.strings[key] || "");
            if (mine.join(",") !== theirs.join(",")) {
                wrong.push(key + ": has " + (mine.join(" ") || "none") +
                    ", English has " + (theirs.join(" ") || "none"));
            }
        });
        assert.deepEqual(wrong, [],
            "a translation that drops a placeholder loses the number, and one that adds a " +
            "placeholder prints it as it stands");
    });

    test(lang.code + ".json: no value left in English by mistake", function() {
        // A copied file with untranslated values is worse than a missing key: the fallback
        // would have given the same text, and the key looks done
        var same = Object.keys(lang.strings).filter(function(k) {
            var value = String(lang.strings[k]).trim();
            return value.length > 3 && value === String(english.strings[k]).trim() &&
                !/^(Solfeo|Debug|ChordPro|PDF)/.test(value);
        });
        assert.deepEqual(same, [], "these read exactly like English, so either translate them " +
            "or drop the key and let the fallback do it");
    });
});

test("how complete each translation is", function() {
    i18n._reset();
    i18n.register("en", english.strings);
    var total = Object.keys(english.strings).length;

    translations().forEach(function(lang) {
        i18n.register(lang.code, lang.strings);
        var missing = i18n.missingKeys(lang.code);
        var done = Math.round(100 * (total - missing.length) / total);
        // Informative, not a requirement: a partial translation is a fine contribution
        console.log("    " + lang.code + ": " + done + "% of " + total + " keys" +
            (missing.length ? ", missing " + missing.length : ""));
    });

    assert.ok(total > 100, "English carries the whole dialog: " + total + " keys");
});
