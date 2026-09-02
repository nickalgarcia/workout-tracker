#!/bin/bash
# ── Mat Log Deploy Script ──
# Run this instead of 'firebase deploy' so the home screen app always gets
# the latest version. It stamps a fresh cache version into the service
# worker, which is what evicts the old module graph.

set -e

VERSION="matlog-v$(date +%Y%m%d%H%M%S)"

echo "🚀 Deploying Mat Log..."
echo "📦 Cache version: $VERSION"

# NOTE: macOS-only. BSD sed requires an argument to -i (here the empty
# string, meaning "no backup file"); GNU sed on Linux would read that ''
# as the script and fail. On Linux this line is: sed -i "s/.../.../" file
sed -i '' "s/const CACHE_VERSION = '.*'/const CACHE_VERSION = '$VERSION'/" service-worker.js

echo "✅ Service worker version updated"

firebase deploy --only hosting

echo ""
echo "✅ Deploy complete. The home screen app will update on next launch."
