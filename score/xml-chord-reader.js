// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// XML-based chord extraction fallback for MuseScore plugin
// Used when QML API cannot read chord names from FretDiagram annotations
// Self-contained: includes minimal XML parser and measure walking logic
//
// Usage (QML): XmlChordReader.extractChords(xmlString, Constants)
// Usage (Node.js): require("./xml-chord-reader").extractChords(xmlString, require("../lib/constants"))

// --- Minimal XML parser ---

function _parseXml(xml) {
    var pos = 0;

    function skip() { while (pos < xml.length && /\s/.test(xml[pos])) pos++; }

    function attrs() {
        var a = {};
        while (pos < xml.length && xml[pos] !== '>' && xml[pos] !== '/') {
            skip();
            if (xml[pos] === '>' || xml[pos] === '/') break;
            var s = pos;
            while (pos < xml.length && xml[pos] !== '=' && xml[pos] !== '>' && xml[pos] !== '/' && !/\s/.test(xml[pos])) pos++;
            var name = xml.substring(s, pos);
            skip();
            if (xml[pos] === '=') {
                pos++; skip();
                var q = xml[pos];
                if (q === '"' || q === "'") {
                    pos++;
                    var vs = pos;
                    while (pos < xml.length && xml[pos] !== q) pos++;
                    a[name] = xml.substring(vs, pos);
                    pos++;
                }
            }
        }
        return a;
    }

    function node() {
        skip();
        if (pos >= xml.length) return null;
        while (pos < xml.length && xml[pos] === '<' && (xml[pos + 1] === '?' || xml[pos + 1] === '!')) {
            if (xml[pos + 1] === '?' || (xml[pos + 1] === '!' && xml[pos + 2] === '-')) {
                var endM = xml[pos + 1] === '?' ? '?>' : '-->';
                var ei = xml.indexOf(endM, pos);
                if (ei === -1) { pos = xml.length; return null; }
                pos = ei + endM.length;
            } else if (xml[pos + 1] === '!' && xml.substring(pos + 2, pos + 9) === 'DOCTYPE') {
                var dtEnd = xml.indexOf('>', pos);
                if (dtEnd === -1) { pos = xml.length; return null; }
                pos = dtEnd + 1;
            } else { break; }
            skip();
        }
        if (pos >= xml.length || xml[pos] !== '<' || xml[pos + 1] === '/') return null;
        pos++;
        var ts = pos;
        while (pos < xml.length && xml[pos] !== '>' && xml[pos] !== '/' && !/\s/.test(xml[pos])) pos++;
        var tag = xml.substring(ts, pos);
        skip();
        var a = attrs();
        if (xml[pos] === '/') { pos += 2; return { tag: tag, attrs: a, children: [], text: "" }; }
        pos++;
        var children = [], text = [];
        while (pos < xml.length) {
            if (xml[pos] === '<' && xml[pos + 1] === '/') { pos = xml.indexOf('>', pos) + 1; break; }
            if (xml[pos] === '<' && xml[pos + 1] !== '/' && xml[pos + 1] !== '!' && xml[pos + 1] !== '?') {
                var c = node();
                if (c) children.push(c); else break;
            } else if (xml[pos] === '<' && (xml[pos + 1] === '!' || xml[pos + 1] === '?')) {
                var cm = xml[pos + 1] === '?' ? '?>' : '-->';
                var cme = xml.indexOf(cm, pos);
                if (cme === -1) { pos = xml.length; break; }
                pos = cme + cm.length;
            } else {
                var txs = pos;
                while (pos < xml.length && xml[pos] !== '<') pos++;
                var t = xml.substring(txs, pos);
                if (t.trim()) text.push(t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
            }
        }
        return { tag: tag, attrs: a, children: children, text: text.join("") };
    }

    return node();
}

// --- DOM helpers ---

function _fc(n, tag) {
    if (!n || !n.children) return null;
    for (var i = 0; i < n.children.length; i++) if (n.children[i].tag === tag) return n.children[i];
    return null;
}

function _fcs(n, tag) {
    if (!n || !n.children) return [];
    var r = [];
    for (var i = 0; i < n.children.length; i++) if (n.children[i].tag === tag) r.push(n.children[i]);
    return r;
}

function _ct(n, tag) {
    var c = _fc(n, tag);
    return c ? c.text : "";
}

// --- Duration computation ---

function _durToTicks(type, dots, div, mTicks, C) {
    if (type === "measure") return mTicks || (div * 4);
    var f = C.DURATION_MAP[type];
    if (f === undefined) return div;
    var t = f * 4 * div, d = t;
    for (var i = 0; i < dots; i++) { d /= 2; t += d; }
    return Math.round(t);
}

// --- Harmony name extraction ---

function _harmonyName(hNode, C, spelling) {
    var hi = _fc(hNode, "harmonyInfo") || hNode;
    var rn = _fc(hi, "root");
    var tpc = rn ? parseInt(rn.text) : -99;
    var quality = _ct(hi, "name") || "";
    return C.tpcToChordName(tpc, quality, spelling, _bassTpc(hi));
}

// Tick shift declared by a voice-level <location> element
function _locationTicks(locNode, div, mTicks) {
    var ticks = 0;
    var fractions = _ct(locNode, "fractions");
    if (fractions) {
        var parts = String(fractions).split("/");
        var num = parseInt(parts[0]);
        var den = parts.length > 1 ? parseInt(parts[1]) : 1;
        if (!isNaN(num) && !isNaN(den) && den !== 0) ticks += Math.round((num / den) * 4 * div);
    }
    var measures = _ct(locNode, "measures");
    if (measures) {
        var count = parseInt(measures);
        if (!isNaN(count)) ticks += count * (mTicks || div * 4);
    }
    return ticks;
}

// Slash-chord bass note TPC, or -99 when absent (<bass> in MuseScore 4, <base> in MuseScore 3)
function _bassTpc(hi) {
    var text = _ct(hi, "bass") || _ct(hi, "base");
    if (!text) return -99;
    var tpc = parseInt(text);
    return isNaN(tpc) ? -99 : tpc;
}

// --- Main extraction ---
// Extracts all chords (from both standalone Harmony and nested Harmony in FretDiagram)
// Returns: [{tick, chord}] sorted by tick
// spelling: "solfeggio", "standard", etc. Controls chord name language.
function extractChords(xmlString, C, spelling) {
    var root = _parseXml(xmlString);
    if (!root) return [];

    var score = _fc(root, "Score") || root;
    if (score.tag !== "Score") score = _fc(score, "Score") || score;

    var div = parseInt(_ct(score, "Division")) || 480;

    // Detect linked/hidden staves from Part declarations
    var parts = _fcs(score, "Part");
    var linked = {}, hidden = {}, sc = 0;
    for (var p = 0; p < parts.length; p++) {
        var ph = _ct(parts[p], "show") === "0";
        var pStaffs = _fcs(parts[p], "Staff");
        for (var j = 0; j < pStaffs.length; j++) {
            sc++;
            if (_fc(pStaffs[j], "linkedTo")) linked[sc - 1] = true;
            if (ph || _ct(pStaffs[j], "isStaffVisible") === "0") hidden[sc - 1] = true;
        }
    }

    var staves = _fcs(score, "Staff");
    var all = [], counts = {};

    for (var si = 0; si < staves.length; si++) {
        var sn = staves[si];
        var sid = parseInt(sn.attrs.id || (si + 1)) - 1;

        // Walk measures tracking tick positions
        var tick = 0, tsN = 4, tsD = 4, mTicks = div * 4;
        var measures = _fcs(sn, "Measure");

        for (var mi = 0; mi < measures.length; mi++) {
            var m = measures[mi];
            var amTicks = mTicks;
            if (m.attrs.len) {
                var lp = m.attrs.len.split("/");
                if (lp.length === 2) amTicks = Math.round((parseInt(lp[0]) / parseInt(lp[1])) * 4 * div);
            }

            var voices = _fcs(m, "voice");
            var maxT = tick;

            for (var vi = 0; vi < voices.length; vi++) {
                var vt = tick, tuplet = null;
                var elems = voices[vi].children;

                for (var ei = 0; ei < elems.length; ei++) {
                    var e = elems[ei];

                    if (e.tag === "TimeSig") {
                        var n = parseInt(_ct(e, "sigN")), d = parseInt(_ct(e, "sigD"));
                        if (n > 0 && d > 0) {
                            tsN = n; tsD = d;
                            mTicks = Math.round((tsN / tsD) * 4 * div);
                            if (!m.attrs.len) amTicks = mTicks;
                        }
                        continue;
                    }
                    if (e.tag === "Tuplet") {
                        tuplet = (parseInt(_ct(e, "normalNotes")) || 1) / (parseInt(_ct(e, "actualNotes")) || 1);
                        continue;
                    }
                    if (e.tag === "endTuplet") { tuplet = null; continue; }

                    // Voice-level position shift (see locationOffsetTicks in xml-extractor)
                    if (e.tag === "location") {
                        vt += _locationTicks(e, div, amTicks);
                        continue;
                    }

                    // Extract chord from FretDiagram (nested Harmony) or standalone Harmony
                    if (e.tag === "FretDiagram") {
                        var nh = _fc(e, "Harmony");
                        if (nh) {
                            var fname = _harmonyName(nh, C, spelling);
                            if (fname) {
                                if (!counts[sid]) counts[sid] = 0;
                                counts[sid]++;
                                all.push({ staffId: sid, tick: vt, chord: fname });
                            }
                        }
                    } else if (e.tag === "Harmony") {
                        var hname = _harmonyName(e, C, spelling);
                        if (hname) {
                            if (!counts[sid]) counts[sid] = 0;
                            counts[sid]++;
                            all.push({ staffId: sid, tick: vt, chord: hname });
                        }
                    } else if (e.tag === "StaffText" || e.tag === "Expression" || e.tag === "PlayTechAnnotation") {
                        // Inline text annotations on the harmony staff appear in the chord line
                        var inlineText = _ct(e, "text");
                        if (inlineText) {
                            // Collapse internal whitespace to '-' for readability
                            inlineText = inlineText.replace(/\s+/g, "-");
                            if (!counts[sid]) counts[sid] = 0;
                            counts[sid]++;
                            all.push({ staffId: sid, tick: vt, chord: inlineText, isText: true });
                        }
                    }

                    // Advance tick for Chord/Rest (skip grace notes)
                    if (e.tag === "Chord" || e.tag === "Rest") {
                        if (!_fc(e, "acciaccatura") && !_fc(e, "appoggiatura")) {
                            var dt = _ct(e, "durationType") || "quarter";
                            var dn = _fc(e, "dots");
                            var dots = dn ? parseInt(dn.text) || 0 : 0;
                            var dur = _durToTicks(dt, dots, div, amTicks, C);
                            if (tuplet) dur = Math.round(dur * tuplet);
                            vt += dur;
                        }
                        if (vt > maxT) maxT = vt;
                    }
                }
            }
            tick = maxT;
        }
    }

    // Select best harmony staff (most chords, excluding linked/hidden)
    var best = -1, bestC = 0;
    for (var h in counts) {
        var hi = parseInt(h);
        if (linked[hi] || hidden[hi]) continue;
        if (counts[h] > bestC) { bestC = counts[h]; best = hi; }
    }

    // Filter to best staff and sort
    var chords = [];
    for (var ci = 0; ci < all.length; ci++) {
        if (all[ci].staffId === best || best === -1) {
            chords.push({ tick: all[ci].tick, chord: all[ci].chord });
        }
    }
    chords.sort(function(a, b) { return a.tick - b.tick; });
    return chords;
}

// TPC to Spanish solfeo name (for fret diagram chord labels)
var _TPC_SPANISH = [
    "Fbb", "Dobb", "Solbb", "Rebb", "Labb", "Mibb", "Sibb",
    "Fab", "Dob", "Solb", "Reb", "Lab", "Mib", "Sib",
    "Fa", "Do", "Sol", "Re", "La", "Mi", "Si",
    "Fa#", "Do#", "Sol#", "Re#", "La#", "Mi#", "Si#",
    "Fa##", "Do##", "Sol##", "Re##", "La##", "Mi##", "Si##"
];

function _tpcToSpanish(tpc) {
    var idx = tpc + 1;
    return (idx >= 0 && idx < _TPC_SPANISH.length) ? _TPC_SPANISH[idx] : "";
}

// Extract fretboard diagrams from FBox elements in the score XML.
// Returns deduplicated array of {chordName, strings, fretOffset, numFrets, barre}
function extractFretDiagrams(xmlString) {
    var root = _parseXml(xmlString);
    if (!root) return [];

    var score = _fc(root, "Score") || root;
    if (score.tag !== "Score") score = _fc(score, "Score") || score;

    var staves = _fcs(score, "Staff");
    if (staves.length === 0) return [];

    // Find FBox in first staff
    var fboxes = _fcs(staves[0], "FBox");
    if (fboxes.length === 0) return [];

    var diagrams = [];
    var seen = {};

    for (var fb = 0; fb < fboxes.length; fb++) {
        var fds = _fcs(fboxes[fb], "FretDiagram");

        for (var fi = 0; fi < fds.length; fi++) {
            var fd = fds[fi];

            if (_ct(fd, "visible") === "0") continue;

            var harmony = _fc(fd, "Harmony");
            if (!harmony) continue;
            var hInfo = _fc(harmony, "harmonyInfo");
            if (!hInfo) continue;

            var rootTpc = parseInt(_ct(hInfo, "root"));
            var modifier = _ct(hInfo, "name") || "";
            var chordName;
            if (!isNaN(rootTpc)) {
                var rootName = _tpcToSpanish(rootTpc);
                if (!rootName) continue;
                chordName = rootName + modifier;
            } else if (modifier) {
                chordName = modifier;
            } else {
                continue;
            }

            var fdNode = _fc(fd, "fretDiagram");
            if (!fdNode) continue;

            var fretOffset = parseInt(_ct(fd, "fretOffset")) || 0;
            var numFrets = parseInt(_ct(fd, "frets")) || 4;

            // Barre
            var barreElem = _fc(fdNode, "barre");
            var barre = null;
            if (barreElem) {
                var bs = parseInt(barreElem.attrs.start);
                var be = parseInt(barreElem.attrs.end);
                var bf = parseInt(barreElem.text);
                if (bs !== undefined && be !== undefined && bf) {
                    barre = { start: bs, end: be, fret: bf };
                }
            }

            // Strings
            var strings = [];
            var strElems = _fcs(fdNode, "string");
            for (var si = 0; si < strElems.length; si++) {
                var se = strElems[si];
                var sNum = parseInt(se.attrs.no);
                if (sNum === undefined) continue;

                var marker = _ct(se, "marker");
                var dotElem = _fc(se, "dot");
                var sd = { number: sNum };

                if (marker === "cross" || marker === "circle") {
                    sd.marker = marker;
                } else if (dotElem) {
                    var fNum = parseInt(dotElem.attrs.fret);
                    if (fNum) sd.dot = { fret: fNum };
                }
                strings.push(sd);
            }

            // Deduplication
            var fp = chordName + "|";
            for (var di = 0; di < strings.length; di++) {
                var ds = strings[di];
                if (ds.marker) fp += ds.number + ":" + ds.marker + ",";
                else if (ds.dot) fp += ds.number + ":" + ds.dot.fret + ",";
            }
            if (barre) fp += "barre:" + barre.start + "-" + barre.end + ":" + barre.fret;
            if (seen[fp]) continue;
            seen[fp] = true;

            diagrams.push({
                chordName: chordName,
                strings: strings,
                fretOffset: fretOffset,
                numFrets: numFrets,
                barre: barre
            });
        }
    }

    return diagrams;
}

if (typeof exports !== "undefined") {
    exports.extractChords = extractChords;
    exports.extractFretDiagrams = extractFretDiagrams;
}
