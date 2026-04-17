#!/bin/sh
# Build lyrics-extractor.mext: minify, obfuscate filenames, package as ZIP
set -e

VERSION="${1:-dev}"
OUT="lyrics-extractor.mext"
BUILD_DIR=".build"

rm -rf "$BUILD_DIR" "$OUT"
mkdir -p "$BUILD_DIR/m" "$BUILD_DIR/ui"

# File mapping: original path -> obfuscated name (stable hash-like IDs)
# All JS goes into m/ with short opaque names
cat > /tmp/fmap.txt << 'MAP'
lib/text-utils.js:e4a.js
lib/chord-utils.js:b7c.js
lib/word-builder.js:d2f.js
lib/line-builder.js:a9e.js
lib/repeat-structure.js:f1b.js
lib/performance-stream.js:c6d.js
lib/intro-chords.js:e8a.js
lib/formatter.js:b3f.js
lib/navigation.js:d5c.js
lib/orchestrator.js:a1d.js
lib/chord-formatter.js:f4e.js
lib/pdf-writer.js:c2b.js
lib/fretboard-renderer.js:e6c.js
lib/constants.js:b9a.js
lib/lyrics-fixer.js:d7f.js
extractors/musescore-extractor.js:a4b.js
extractors/fretdiagram-fallback.js:f8d.js
extractors/xml-chord-reader.js:c1e.js
extractors/xml-extractor.js:e3d.js
ui/help-text.js:d0a.js
MAP

# Minify JS files into m/ with obfuscated names
while IFS=: read -r src dst; do
  npx -y terser "$src" --compress --mangle > "$BUILD_DIR/m/$dst"
done < /tmp/fmap.txt

# Replace require() paths in minified JS files
# Build sed script from mapping
SED_SCRIPT=""
while IFS=: read -r src dst; do
  base=$(basename "$src")
  name="${base%.js}"
  # require("./module") or require("../lib/module")
  SED_SCRIPT="$SED_SCRIPT -e 's|require(\"[^\"]*${name}\")|require(\"./${dst%.js}\")|g'"
  SED_SCRIPT="$SED_SCRIPT -e 's|require(\"[^\"]*${name}\.js\")|require(\"./${dst}\")|g'"
done < /tmp/fmap.txt

# Apply require replacements to all minified JS
for f in "$BUILD_DIR"/m/*.js; do
  eval sed -i.bak $SED_SCRIPT "\"$f\""
done
rm -f "$BUILD_DIR"/m/*.bak

# Copy QML and update import paths
cp ui/LyricsForm.qml "$BUILD_DIR/ui/"
while IFS=: read -r src dst; do
  case "$src" in
    lib/*)     old="../lib/$(basename "$src")" ;;
    extractors/*) old="../extractors/$(basename "$src")" ;;
    ui/*)      old="$(basename "$src")" ;;
  esac
  sed -i.bak "s|\"$old\"|\"../m/$dst\"|g" "$BUILD_DIR/ui/LyricsForm.qml"
done < /tmp/fmap.txt
rm -f "$BUILD_DIR/ui/"*.bak

# Obfuscate QML import aliases: extract all "as Name" from JS imports,
# assign single-letter replacements, replace both imports and usages
QML="$BUILD_DIR/ui/LyricsForm.qml"
ALIASES=$(grep 'import ".*\.js" as ' "$QML" | sed 's/.* as //' | tr -d '\r')
IDX=0
SED_ARGS=""
for ALIAS in $ALIASES; do
  # A=65 in ASCII, generate A, B, C...
  LETTER=$(printf "\\$(printf '%03o' $((65 + IDX)))")
  SED_ARGS="$SED_ARGS -e 's/ as ${ALIAS}/ as ${LETTER}/'"
  SED_ARGS="$SED_ARGS -e 's/${ALIAS}\\./${LETTER}./g'"
  IDX=$((IDX + 1))
done
eval sed -i.bak $SED_ARGS "\"$QML\""
rm -f "$QML.bak"
# Strip JS-style comments from QML
sed -i.bak '/^[[:space:]]*\/\//d' "$QML"
rm -f "$QML.bak"

# Copy non-JS runtime files
cp manifest.json "$BUILD_DIR/"
cp logo.png "$BUILD_DIR/"

# Set version if provided
if [ "$VERSION" != "dev" ]; then
  sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$BUILD_DIR/manifest.json"
  sed -i.bak "s/version: \"[^\"]*\"/version: \"$VERSION\"/" "$BUILD_DIR/ui/LyricsForm.qml"
  rm -f "$BUILD_DIR/"*.bak "$BUILD_DIR/ui/"*.bak
fi

# Package
cd "$BUILD_DIR"
zip -r "../$OUT" . -x "*.bak"
cd ..

echo "Built $OUT ($(du -h "$OUT" | cut -f1)) with $(find "$BUILD_DIR" -type f | wc -l | tr -d ' ') files"
rm -rf "$BUILD_DIR" /tmp/fmap.txt
