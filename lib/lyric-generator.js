// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// Lyric notation generator and parser for the "Add lyrics" feature.
// generate() turns plain text into the typed notation (syllable joints, hold
// markers, ; and ;; breaks), parse() reads the notation back into syllable tokens.
// Shared between MuseScore extension and Node.js CLI
//
// Usage from QML:
//   LyricGenerator.setSyllabify(Syllabify);
//   var text = LyricGenerator.generate(input, { split: true, language: "es", ties: null });
//   var parsed = LyricGenerator.parse(text);
//
// Usage from Node:
//   var gen = require("./lyric-generator");   (syllabify auto-wired via require)

// --- Injected dependencies ---
var _syllabify = null;
function setSyllabify(s) { _syllabify = s; }

// --- Shared helpers ---

var LOOSE_RE = /^[¡!¿?,.;:"'«»“”‘’()…]+$/;
var OPENING_RE = /^[¡¿«“‘(]+$/;
var TRAIL_RE = /[.,;:!?"'»”’)…]+$/;
var LEAD_RE = /^[¡¿"'«“‘(]+/;

function isLoose(chunk) { return LOOSE_RE.test(chunk); }
function isOpening(chunk) { return OPENING_RE.test(chunk); }

// Splits a line of text into whitespace separated chunks
function chunksOf(line) {
    var parts = line.split(/\s+/);
    var result = [];
    for (var i = 0; i < parts.length; i++) {
        if (parts[i] !== "") result.push(parts[i]);
    }
    return result;
}

// Glues chunks made only of punctuation to the neighbor word: opening marks go
// to the next word, everything else to the previous one.
function mergeLoose(chunks) {
    var result = [];
    var prefix = "";
    for (var i = 0; i < chunks.length; i++) {
        var c = chunks[i];
        if (isLoose(c)) {
            if (isOpening(c) && i < chunks.length - 1) {
                prefix += c;
            } else if (result.length > 0) {
                result[result.length - 1] += c;
            } else {
                prefix += c;
            }
        } else {
            result.push(prefix + c);
            prefix = "";
        }
    }
    if (prefix !== "" && result.length > 0) result[result.length - 1] += prefix;
    return result;
}

// --- Parser ---

// Reads one chunk of notation into syllables with their holds.
// continues is true when the chunk ends with a joint, so the word goes on.
function parseChunk(chunk) {
    var tail = 0;
    var m = /_+$/.exec(chunk);
    if (m) {
        tail = m[0].length;
        chunk = chunk.substring(0, chunk.length - tail);
    }
    var syls = [];
    var cur = "";
    var continues = false;
    var i = 0;
    while (i < chunk.length) {
        if (chunk.charAt(i) === "-") {
            var n = 0;
            while (i < chunk.length && chunk.charAt(i) === "-") { n++; i++; }
            if (cur !== "") {
                syls.push({ text: cur, holds: n - 1, holdKind: n > 1 ? "-" : null });
                cur = "";
                if (i >= chunk.length) continues = true;
            }
        } else {
            cur += chunk.charAt(i);
            i++;
        }
    }
    if (cur !== "") syls.push({ text: cur, holds: 0, holdKind: null });
    if (tail > 0 && syls.length > 0) {
        var last = syls[syls.length - 1];
        last.holds += tail;
        last.holdKind = "_";
    }
    return { syls: syls, continues: continues };
}

function closeWord(word) {
    for (var i = 0; i < word.length; i++) {
        var s;
        if (word.length === 1) s = "single";
        else if (i === 0) s = "begin";
        else if (i === word.length - 1) s = "end";
        else s = "middle";
        word[i].syllabic = s;
    }
}

function parse(text) {
    var chunks = chunksOf(String(text));
    var tokens = [];
    var orphanHolds = 0;
    var word = [];
    var prefix = "";

    for (var i = 0; i < chunks.length; i++) {
        var c = chunks[i];

        if (/^_+$/.test(c)) {
            if (tokens.length > 0) {
                var prev = tokens[tokens.length - 1];
                prev.holds += c.length;
                prev.holdKind = "_";
            } else {
                orphanHolds += c.length;
            }
            continue;
        }

        if (isLoose(c)) {
            if (isOpening(c) && i < chunks.length - 1) {
                prefix += c;
            } else if (tokens.length > 0) {
                tokens[tokens.length - 1].text += c;
            }
            continue;
        }

        var res = parseChunk(c);
        for (var k = 0; k < res.syls.length; k++) {
            var s = res.syls[k];
            if (k === 0 && prefix !== "") { s.text = prefix + s.text; prefix = ""; }
            tokens.push(s);
            word.push(s);
        }
        if (res.syls.length > 0 && !res.continues) {
            closeWord(word);
            word = [];
        }
    }
    if (word.length > 0) closeWord(word);
    if (prefix !== "" && tokens.length > 0) tokens[tokens.length - 1].text += prefix;

    var slots = orphanHolds;
    for (var t = 0; t < tokens.length; t++) slots += 1 + tokens[t].holds;
    return { tokens: tokens, slotCount: slots };
}

function countSlots(text) {
    return parse(text).slotCount;
}

// --- Generator ---

function endsWith(s, suffix) {
    return s.length >= suffix.length && s.substring(s.length - suffix.length) === suffix;
}

// Applies the line end rule: the ordinary ending, or the stanza ending
function withLineEnd(line, stanzaEnd) {
    var out = line;
    if (endsWith(out, "...") || endsWith(out, "..") || endsWith(out, ",,")) {
        out += ";";
    } else if (endsWith(out, ",")) {
        out = out.substring(0, out.length - 1) + ";";
    } else if (!/[.!?;]$/.test(out)) {
        out += ";";
    }
    if (stanzaEnd && !endsWith(out, ";;")) {
        if (endsWith(out, ";")) out += ";";
        else out += ";;";
    }
    return out;
}

// Splits one plain word into its syllables, keeping the punctuation around it.
// Returns { syls: string[], lead: string, trail: string, notated: bool }
function splitWord(word, language, split) {
    if (/[-_]/.test(word)) {
        return { syls: [word], lead: "", trail: "", notated: true };
    }
    var lead = "";
    var trail = "";
    var core = word;
    var m = LEAD_RE.exec(core);
    if (m) { lead = m[0]; core = core.substring(lead.length); }
    m = TRAIL_RE.exec(core);
    if (m && m.index > 0) { trail = m[0]; core = core.substring(0, m.index); }
    var syls = [core];
    if (split && _syllabify && core !== "") syls = _syllabify.syllabifyWord(language, core);
    return { syls: syls, lead: lead, trail: trail, notated: false };
}

function generate(input, opts) {
    opts = opts || {};
    var split = !!opts.split;
    var language = opts.language;
    var ties = opts.ties || null;
    var slot = 0;

    var lines = String(input).replace(/\r\n?/g, "\n").replace(/\t/g, " ").split("\n");

    // Collect verses (arrays of lines) and whether a blank gap follows each
    var verses = [];
    var gap = false;
    for (var l = 0; l < lines.length; l++) {
        var chunks = mergeLoose(chunksOf(lines[l]));
        if (chunks.length === 0) {
            if (verses.length > 0) gap = true;
            continue;
        }
        verses.push({ chunks: chunks, stanzaBreak: false });
        if (gap && verses.length > 1) verses[verses.length - 2].stanzaBreak = true;
        gap = false;
    }

    var out = [];
    for (var v = 0; v < verses.length; v++) {
        var chunkList = verses[v].chunks;
        var bodies = [];
        var holds = [];
        for (var w = 0; w < chunkList.length; w++) {
            var sw = splitWord(chunkList[w], language, split);
            var body = "";
            var holdStr = "";
            if (sw.notated) {
                body = sw.syls[0];
                slot += countSlots(body);
            } else {
                for (var s = 0; s < sw.syls.length; s++) {
                    slot++;
                    var n = 0;
                    while (ties && slot < ties.length && ties[slot] === true) { n++; slot++; }
                    var isLast = s === sw.syls.length - 1;
                    var piece = sw.syls[s];
                    if (s === 0) piece = sw.lead + piece;
                    if (isLast) {
                        // an inner comma must not break the line
                        piece += (sw.trail === "," && w < chunkList.length - 1) ? ",," : sw.trail;
                    }
                    var hold = "";
                    for (var h = 0; h < n; h++) hold += isLast ? "_" : "-";
                    if (isLast) {
                        body += piece;
                        holdStr = hold;
                    } else {
                        body += piece + hold + "-";
                    }
                }
            }
            bodies.push(body);
            holds.push(holdStr);
        }
        bodies[bodies.length - 1] = withLineEnd(bodies[bodies.length - 1], verses[v].stanzaBreak);
        var parts = [];
        for (var b = 0; b < bodies.length; b++) {
            parts.push(bodies[b] + (holds[b] !== "" ? " " + holds[b] : ""));
        }
        out.push(parts.join(" "));
        if (verses[v].stanzaBreak) out.push("");
    }
    return out.join("\n");
}

if (typeof exports !== "undefined") {
    _syllabify = require("./syllabify");

    exports.setSyllabify = setSyllabify;
    exports.generate = generate;
    exports.parse = parse;
    exports.countSlots = countSlots;
}
