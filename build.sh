#!/bin/sh
# Build lyrics-extractor.mext: minify JS, strip dev files, package as ZIP
set -e

VERSION="${1:-dev}"
OUT="lyrics-extractor.mext"
BUILD_DIR=".build"

rm -rf "$BUILD_DIR" "$OUT"
mkdir -p "$BUILD_DIR/lib" "$BUILD_DIR/extractors" "$BUILD_DIR/ui"

# Minify JS files (compress + mangle local variables)
for f in lib/*.js; do
  npx -y terser "$f" --compress --mangle > "$BUILD_DIR/$f"
done
for f in extractors/*.js; do
  npx -y terser "$f" --compress --mangle > "$BUILD_DIR/$f"
done
for f in ui/*.js; do
  npx -y terser "$f" --compress --mangle > "$BUILD_DIR/$f"
done

# Copy non-JS runtime files
cp manifest.json "$BUILD_DIR/"
cp logo.png "$BUILD_DIR/"
cp ui/LyricsForm.qml "$BUILD_DIR/ui/"

# Set version if provided
if [ "$VERSION" != "dev" ]; then
  sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$BUILD_DIR/manifest.json"
  sed -i.bak "s/version: \"[^\"]*\"/version: \"$VERSION\"/" "$BUILD_DIR/ui/LyricsForm.qml"
  rm -f "$BUILD_DIR/manifest.json.bak" "$BUILD_DIR/ui/LyricsForm.qml.bak"
fi

# Package
cd "$BUILD_DIR"
zip -r "../$OUT" . -x "*.bak"
cd ..

echo "Built $OUT ($(du -h "$OUT" | cut -f1)) with $(find "$BUILD_DIR" -type f | wc -l | tr -d ' ') files"
rm -rf "$BUILD_DIR"
