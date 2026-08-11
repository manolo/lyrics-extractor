// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// Read .mscz files (ZIP archives) and extract .mscx XML content
// Uses Node.js built-in zlib + custom ZIP parsing (no external dependencies)

var fs = require("fs");
var zlib = require("zlib");

// Minimal ZIP reader: finds and extracts the .mscx file from a ZIP archive
function readZip(buffer) {
    var entries = [];
    var offset = 0;

    while (offset < buffer.length - 4) {
        var sig = buffer.readUInt32LE(offset);
        if (sig !== 0x04034b50) break; // local file header signature

        var compressionMethod = buffer.readUInt16LE(offset + 8);
        var compressedSize = buffer.readUInt32LE(offset + 18);
        var uncompressedSize = buffer.readUInt32LE(offset + 22);
        var nameLen = buffer.readUInt16LE(offset + 26);
        var extraLen = buffer.readUInt16LE(offset + 28);

        var name = buffer.toString("utf8", offset + 30, offset + 30 + nameLen);
        var dataStart = offset + 30 + nameLen + extraLen;
        var data = buffer.slice(dataStart, dataStart + compressedSize);

        entries.push({
            name: name,
            compression: compressionMethod,
            data: data,
            uncompressedSize: uncompressedSize
        });

        offset = dataStart + compressedSize;
    }

    return entries;
}

// Extract the .mscx XML string from a .mscz file
function readMscz(filePath) {
    var buffer = fs.readFileSync(filePath);
    var entries = readZip(buffer);

    // Find the .mscx file (main score XML)
    var mscxEntry = null;
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].name.match(/\.mscx$/) && !entries[i].name.match(/Excerpts\//)) {
            mscxEntry = entries[i];
            break;
        }
    }

    if (!mscxEntry) {
        throw new Error("No .mscx file found in " + filePath);
    }

    var xmlBuffer;
    if (mscxEntry.compression === 8) {
        // Deflate compression
        xmlBuffer = zlib.inflateRawSync(mscxEntry.data);
    } else if (mscxEntry.compression === 0) {
        // Stored (no compression)
        xmlBuffer = mscxEntry.data;
    } else {
        throw new Error("Unsupported compression method: " + mscxEntry.compression);
    }

    return xmlBuffer.toString("utf8");
}

// Extract guitar excerpts from .mscz file
// Returns array of {name, xml} for guitar/guitarra excerpts
function readGuitarExcerpts(filePath) {
    var buffer = fs.readFileSync(filePath);
    var entries = readZip(buffer);
    var excerpts = [];

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        // Look for Excerpts/*Guitar*/*.mscx or Excerpts/*guitarra*/*.mscx
        if (entry.name.match(/Excerpts\/.*([Gg]uitar|guitarra).*\/.*\.mscx$/)) {
            var xmlBuffer;
            if (entry.compression === 8) {
                xmlBuffer = zlib.inflateRawSync(entry.data);
            } else if (entry.compression === 0) {
                xmlBuffer = entry.data;
            } else {
                continue; // Skip unsupported compression
            }
            excerpts.push({
                name: entry.name,
                xml: xmlBuffer.toString("utf8")
            });
        }
    }

    return excerpts;
}

// Read a .mscx file directly (plain XML)
function readMscx(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

// Read either .mscz or .mscx
function readScore(filePath) {
    if (filePath.match(/\.mscz$/i)) {
        return readMscz(filePath);
    } else if (filePath.match(/\.mscx$/i)) {
        return readMscx(filePath);
    } else {
        throw new Error("Unsupported file format. Use .mscz or .mscx");
    }
}

// Read chordSymbolSpelling from the score style sheet (.mss) or excerpts.
// Returns: "solfeggio", "standard", "german", "french", or "standard" (default).
function readSpelling(filePath) {
    if (!filePath.match(/\.mscz$/i)) return "standard";

    var buffer = fs.readFileSync(filePath);
    var entries = readZip(buffer);

    // Try score_style.mss first
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].name === "score_style.mss") {
            var xmlBuffer;
            if (entries[i].compression === 8) {
                xmlBuffer = zlib.inflateRawSync(entries[i].data);
            } else {
                xmlBuffer = entries[i].data;
            }
            var xml = xmlBuffer.toString("utf8");
            var match = xml.match(/<chordSymbolSpelling>([^<]+)<\/chordSymbolSpelling>/);
            if (match) return match[1];
        }
    }

    // Fallback: check first excerpt
    for (var j = 0; j < entries.length; j++) {
        if (entries[j].name.match(/Excerpts\/.*\.mscx$/)) {
            var exBuffer;
            if (entries[j].compression === 8) {
                exBuffer = zlib.inflateRawSync(entries[j].data);
            } else {
                exBuffer = entries[j].data;
            }
            var exXml = exBuffer.toString("utf8");
            var exMatch = exXml.match(/<chordSymbolSpelling>([^<]+)<\/chordSymbolSpelling>/);
            if (exMatch) return exMatch[1];
        }
    }

    return "standard";
}

// Write a modified .mscz file: replace the .mscx entry with new XML content.
// All other entries (images, styles, excerpts) are preserved as-is.
function writeMscz(inputPath, outputPath, newMscxContent) {
    var originalBuffer = fs.readFileSync(inputPath);
    var entries = readZip(originalBuffer);

    var mscxData = zlib.deflateRawSync(Buffer.from(newMscxContent, "utf8"));
    var parts = [];
    var centralEntries = [];

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var isMscx = entry.name.match(/\.mscx$/) && !entry.name.match(/Excerpts\//);
        var data = isMscx ? mscxData : entry.data;
        var uncompressedSize = isMscx ? Buffer.byteLength(newMscxContent, "utf8") : entry.uncompressedSize;
        var compression = isMscx ? 8 : entry.compression;

        var localOffset = 0;
        for (var p = 0; p < parts.length; p++) localOffset += parts[p].length;

        // Local file header
        var nameLen = Buffer.byteLength(entry.name, "utf8");
        var header = Buffer.alloc(30 + nameLen);
        header.writeUInt32LE(0x04034b50, 0);        // signature
        header.writeUInt16LE(20, 4);                  // version needed
        header.writeUInt16LE(0, 6);                   // flags
        header.writeUInt16LE(compression, 8);         // compression method
        header.writeUInt16LE(0, 10);                  // mod time
        header.writeUInt16LE(0, 12);                  // mod date
        header.writeUInt32LE(0, 14);                  // crc32 (0 for simplicity)
        header.writeUInt32LE(data.length, 18);        // compressed size
        header.writeUInt32LE(uncompressedSize, 22);   // uncompressed size
        header.writeUInt16LE(nameLen, 26);            // name length
        header.writeUInt16LE(0, 28);                  // extra length
        header.write(entry.name, 30, "utf8");

        parts.push(header);
        parts.push(data);

        // Central directory entry
        var cdEntry = Buffer.alloc(46 + nameLen);
        cdEntry.writeUInt32LE(0x02014b50, 0);         // signature
        cdEntry.writeUInt16LE(20, 4);                  // version made by
        cdEntry.writeUInt16LE(20, 6);                  // version needed
        cdEntry.writeUInt16LE(0, 8);                   // flags
        cdEntry.writeUInt16LE(compression, 10);        // compression
        cdEntry.writeUInt16LE(0, 12);                  // mod time
        cdEntry.writeUInt16LE(0, 14);                  // mod date
        cdEntry.writeUInt32LE(0, 16);                  // crc32
        cdEntry.writeUInt32LE(data.length, 20);        // compressed size
        cdEntry.writeUInt32LE(uncompressedSize, 24);   // uncompressed size
        cdEntry.writeUInt16LE(nameLen, 28);            // name length
        cdEntry.writeUInt16LE(0, 30);                  // extra length
        cdEntry.writeUInt16LE(0, 32);                  // comment length
        cdEntry.writeUInt16LE(0, 34);                  // disk number
        cdEntry.writeUInt16LE(0, 36);                  // internal attrs
        cdEntry.writeUInt32LE(0, 38);                  // external attrs
        cdEntry.writeUInt32LE(localOffset, 42);        // local header offset
        cdEntry.write(entry.name, 46, "utf8");
        centralEntries.push(cdEntry);
    }

    // Central directory offset
    var cdOffset = 0;
    for (var j = 0; j < parts.length; j++) cdOffset += parts[j].length;

    // Add central directory entries
    var cdSize = 0;
    for (var k = 0; k < centralEntries.length; k++) {
        parts.push(centralEntries[k]);
        cdSize += centralEntries[k].length;
    }

    // End of central directory
    var eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);                // signature
    eocd.writeUInt16LE(0, 4);                          // disk number
    eocd.writeUInt16LE(0, 6);                          // cd disk number
    eocd.writeUInt16LE(entries.length, 8);              // entries on disk
    eocd.writeUInt16LE(entries.length, 10);             // total entries
    eocd.writeUInt32LE(cdSize, 12);                    // cd size
    eocd.writeUInt32LE(cdOffset, 16);                  // cd offset
    eocd.writeUInt16LE(0, 20);                         // comment length
    parts.push(eocd);

    fs.writeFileSync(outputPath, Buffer.concat(parts));
}

module.exports = {
    readMscz: readMscz,
    readMscx: readMscx,
    readScore: readScore,
    readGuitarExcerpts: readGuitarExcerpts,
    readSpelling: readSpelling,
    writeMscz: writeMscz
};
