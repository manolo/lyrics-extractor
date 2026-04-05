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
        if (entries[i].name.match(/\.mscx$/)) {
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

module.exports = {
    readMscz: readMscz,
    readMscx: readMscx,
    readScore: readScore
};
