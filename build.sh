#!/bin/sh
# Build lyrics-extractor.mext: compile and package extension
set -e

VERSION="${1:-dev}"
OUT="lyrics-extractor.mext"
BUILD_DIR=".build"
FMAP="/tmp/fmap-$$.txt"

rm -rf "$BUILD_DIR" "$OUT"
mkdir -p "$BUILD_DIR/m" "$BUILD_DIR/ui"

# Discover runtime JS files and generate short module IDs from path hash
> "$FMAP"
for f in lib/*.js extractors/*.js ui/help-text.js; do
  hash=$(printf '%s' "$f" | md5 -q 2>/dev/null || printf '%s' "$f" | md5sum | cut -d' ' -f1)
  short=$(echo "$hash" | cut -c1-3)
  echo "$f:${short}.js" >> "$FMAP"
done

# Compile JS modules into m/
while IFS=: read -r src dst; do
  npx -y terser "$src" --compress --mangle > "$BUILD_DIR/m/$dst"
done < "$FMAP"

# Update require() paths to compiled module IDs
SED_SCRIPT=""
while IFS=: read -r src dst; do
  name="$(basename "${src%.js}")"
  SED_SCRIPT="$SED_SCRIPT -e 's|require(\"[^\"]*${name}\")|require(\"./${dst%.js}\")|g'"
  SED_SCRIPT="$SED_SCRIPT -e 's|require(\"[^\"]*${name}\.js\")|require(\"./${dst}\")|g'"
done < "$FMAP"
for f in "$BUILD_DIR"/m/*.js; do
  eval sed -i.bak $SED_SCRIPT "\"$f\""
done
rm -f "$BUILD_DIR"/m/*.bak

# Copy QML and update import paths to m/
cp ui/LyricsForm.qml "$BUILD_DIR/ui/"
while IFS=: read -r src dst; do
  case "$src" in
    lib/*)         old="../lib/$(basename "$src")" ;;
    extractors/*)  old="../extractors/$(basename "$src")" ;;
    ui/*)          old="$(basename "$src")" ;;
  esac
  sed -i.bak "s|\"$old\"|\"../m/$dst\"|g" "$BUILD_DIR/ui/LyricsForm.qml"
done < "$FMAP"
rm -f "$BUILD_DIR/ui/"*.bak

# Shorten QML import aliases to single letters
QML="$BUILD_DIR/ui/LyricsForm.qml"
ALIASES=$(grep 'import ".*\.js" as ' "$QML" | sed 's/.* as //' | tr -d '\r')
IDX=0
SED_ARGS=""
for ALIAS in $ALIASES; do
  LETTER=$(printf "\\$(printf '%03o' $((65 + IDX)))")
  SED_ARGS="$SED_ARGS -e 's/ as ${ALIAS}/ as ${LETTER}/'"
  SED_ARGS="$SED_ARGS -e 's/${ALIAS}\\./${LETTER}./g'"
  IDX=$((IDX + 1))
done
eval sed -i.bak $SED_ARGS "\"$QML\""
rm -f "$QML.bak"

# Remove development comments from QML
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
rm -rf "$BUILD_DIR" "$FMAP"
