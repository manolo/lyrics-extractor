// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE.

// The translation engine: which dictionary is in use, and what a key resolves to.
//
// It holds no strings and reads no files. The dialog registers English from ui/i18n/en.js,
// which is imported statically and so can never be missing, then registers whatever
// translation it managed to read from ui/i18n/<code>.json. Everything below is pure, which
// is what lets test/unit/i18n.test.js drive it without QML.
//
// Shared between the MuseScore extension and Node.js, like the rest of the project.

var _dicts = {};      // { "en": {...}, "es": {...} }
var _lang = "en";     // the code chosen by setLocale

// A translation may be partial: whatever it does not carry falls through to English, so a
// dictionary with three keys in it is a perfectly good contribution.
function register(code, dict) {
    if (!code || !dict) return;
    _dicts[String(code).toLowerCase()] = dict;
}

// name is what Qt.locale().name returns: "es", "es_ES", "pt_BR". The full name wins over the
// bare language, so a pt_BR dictionary beats a pt one, and English is the floor.
function setLocale(name) {
    var wanted = String(name || "").toLowerCase().replace("-", "_");
    var language = wanted.split("_")[0];

    if (_dicts[wanted]) _lang = wanted;
    else if (_dicts[language]) _lang = language;
    else _lang = "en";

    return _lang;
}

function locale() { return _lang; }

// Which languages are registered, English first: for the log line the dialog prints
function languages() {
    var out = [];
    for (var code in _dicts) if (_dicts.hasOwnProperty(code)) out.push(code);
    out.sort();
    return out;
}

// Fill {placeholders} from params. An unknown one is left as it stands rather than printed as
// "undefined": a translator who invents a placeholder sees their own text, not a defect.
//
// The value is read straight off the object rather than through hasOwnProperty, which the QML
// engine does not offer on every object it hands over: the first version of this used it and
// the dialog printed "Debug exportado: {path}".
function _fill(text, params) {
    if (!params) return text;
    return text.replace(/\{([a-zA-Z0-9_]+)\}/g, function(whole, name) {
        var value = params[name];
        return (value === undefined || value === null) ? whole : String(value);
    });
}

// The active dictionary, then English, then the key itself. A key nobody wrote shows up as
// "status.noScore" in the dialog, which says where to look.
function t(key, params) {
    var dict = _dicts[_lang];
    var text = (dict && dict[key] !== undefined) ? dict[key] : null;
    if (text === null) {
        var en = _dicts["en"];
        text = (en && en[key] !== undefined) ? en[key] : key;
    }
    return _fill(text, params);
}

// What a language is missing, for the completeness report of the test suite
function missingKeys(code) {
    var en = _dicts["en"] || {};
    var dict = _dicts[String(code).toLowerCase()] || {};
    var out = [];
    for (var key in en) {
        if (en.hasOwnProperty(key) && dict[key] === undefined) out.push(key);
    }
    return out.sort();
}

// Only the tests reach for this, to start from a known state
function _reset() { _dicts = {}; _lang = "en"; }

if (typeof exports !== "undefined") {
    exports.register = register;
    exports.setLocale = setLocale;
    exports.locale = locale;
    exports.languages = languages;
    exports.t = t;
    exports.missingKeys = missingKeys;
    exports._reset = _reset;
}
