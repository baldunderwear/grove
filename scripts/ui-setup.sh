#!/bin/bash
# Grove UI dependency setup
# The NAS (Z: drive) blocks creation of directories named "node_modules".
# This script installs dependencies on the local C: drive and configures NODE_PATH.
#
# Usage: source scripts/ui-setup.sh  (sets NODE_PATH for current shell)
#    or: bash scripts/ui-setup.sh    (installs/updates dependencies only)

GROVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_NM="$HOME/grove-src-ui/node_modules"
LOCAL_DIR="$HOME/grove-src-ui"

# Ensure local directory exists
mkdir -p "$LOCAL_DIR"

# Copy package files if changed
cp "$GROVE_ROOT/src-ui/package.json" "$LOCAL_DIR/"
if [ -f "$GROVE_ROOT/src-ui/package-lock.json" ]; then
  cp "$GROVE_ROOT/src-ui/package-lock.json" "$LOCAL_DIR/"
fi

# Install dependencies on local drive
cd "$LOCAL_DIR" && npm ci --prefer-offline 2>/dev/null || npm install

# Export NODE_PATH for module resolution
export NODE_PATH="$LOCAL_NM"
echo "NODE_PATH set to: $NODE_PATH"
