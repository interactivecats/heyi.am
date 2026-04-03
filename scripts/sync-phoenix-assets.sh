#!/usr/bin/env bash
# Sync template CSS and mount.js from CLI/packages to Phoenix static assets.
# Run from the repo root: ./scripts/sync-phoenix-assets.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATES_DIR="$REPO_ROOT/cli/src/render/templates"
PHOENIX_STATIC="$REPO_ROOT/heyi_am_umbrella/apps/heyi_am_public_web/priv/static"
CSS_OUT="$PHOENIX_STATIC/css/templates"

echo "=== Syncing template CSS ==="

# Create output directory
mkdir -p "$CSS_OUT"

# Copy base styles
cp "$TEMPLATES_DIR/styles.css" "$CSS_OUT/base.css"
echo "  base.css ($(wc -c < "$CSS_OUT/base.css" | tr -d ' ')B)"

# Copy per-template styles
count=0
for dir in "$TEMPLATES_DIR"/*/; do
  name="$(basename "$dir")"
  css="$dir/styles.css"
  if [ -f "$css" ]; then
    cp "$css" "$CSS_OUT/$name.css"
    count=$((count + 1))
  fi
done
echo "  $count template CSS files copied"

echo ""
echo "=== Syncing mount.js ==="

# Build mount.js if needed
MOUNT_SRC="$REPO_ROOT/packages/ui/dist/mount.js"
if [ ! -f "$MOUNT_SRC" ]; then
  echo "  Building packages/ui..."
  (cd "$REPO_ROOT/packages/ui" && npm run build)
fi

mkdir -p "$PHOENIX_STATIC/js"
cp "$MOUNT_SRC" "$PHOENIX_STATIC/js/mount.js"
echo "  mount.js ($(wc -c < "$PHOENIX_STATIC/js/mount.js" | tr -d ' ')B)"

echo ""
echo "Done. Assets synced to $PHOENIX_STATIC"
