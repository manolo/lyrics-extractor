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

module.exports = {
    readMscz: readMscz,
    readMscx: readMscx,
    readScore: readScore,
    readGuitarExcerpts: readGuitarExcerpts,
    readSpelling: readSpelling
};
