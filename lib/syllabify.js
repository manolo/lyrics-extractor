// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// Language registry for syllabification
// Shared between MuseScore extension and Node.js CLI
//
// Usage from QML:
//   Syllabify.register("es", SyllabifyEs);
//   var languages = Syllabify.languages();
//   var syllables = Syllabify.syllabifyWord("es", "canciones");
//
// Usage from Node:
//   var syllabify = require("./syllabify");
//   var syllables = syllabify.syllabifyWord("es", "canciones");
//   (es auto-registered via require)

var _modules = {};
var _names = [];

var LANGUAGE_NAMES = { es: "Español" };

// module: { syllabifyWord(word) -> string[] }
function register(code, module) {
    if (!_modules[code]) _names.push(code);
    _modules[code] = module;
}

// Returns [{ code, name }] for every registered language
function languages() {
    var result = [];
    for (var i = 0; i < _names.length; i++) {
        var code = _names[i];
        result.push({ code: code, name: LANGUAGE_NAMES[code] || code });
    }
    return result;
}

// Split a word with the module of the given language.
// An unknown language leaves the word whole.
function syllabifyWord(code, word) {
    var module = _modules[code];
    if (!module) return [word];
    return module.syllabifyWord(word);
}

if (typeof exports !== "undefined") {
    register("es", require("./syllabify-es"));

    exports.register = register;
    exports.languages = languages;
    exports.syllabifyWord = syllabifyWord;
}
