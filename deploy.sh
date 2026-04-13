#!/bin/bash
# ── Train Log Deploy Script ──
# Run this instead of 'firebase deploy' to ensure
# home screen app always gets the latest version

# Generate a timestamp-based version
VERSION="trainlog-v$(date +%Y%m%d%H%M%S)"

echo "🚀 Deploying Train Log..."
echo "📦 Cache version: $VERSION"

# Update the version in service-worker.js
sed -i '' "s/const CACHE_VERSION = '.*'/const CACHE_VERSION = '$VERSION'/" service-worker.js

echo "✅ Service worker version updated"

# Deploy to Firebase
firebase deploy --only hosting

echo ""
echo "✅ Deploy complete! Home screen app will update automatically."
