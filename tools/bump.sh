#!/usr/bin/env bash
# Bump the cache-busting version everywhere at once, so phones never serve a
# stale mix of old and new files. Run after editing any shell file.
set -e
cd "$(dirname "$0")/.."
cur=$(grep -o "lull-v[0-9]*" sw.js | head -1 | sed 's/lull-v//')
next=$((cur + 1))
sed -i "s/lull-v$cur/lull-v$next/" sw.js
sed -i "s/?v=$cur/?v=$next/g" sw.js index.html
echo "bumped v$cur -> v$next"
grep -n "lull-v$next" sw.js | head -1
