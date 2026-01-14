#!/bin/bash

# CapGo Packaging Script
# This script builds the application and creates a DMG installer.

APP_NAME="CapGo"
DMG_NAME="CapGo Installer.dmg"
BUILD_DIR="build/bin"

echo "🚀 Starting build process for $APP_NAME..."

# 1. Check if create-dmg is installed
if ! command -v create-dmg &> /dev/null
then
    echo "❌ Error: 'create-dmg' is not installed."
    echo "Please install it using: brew install create-dmg"
    exit 1
fi

# 2. Build the application using Wails
echo "📦 Building application with Wails..."
wails build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# 3. Clean up old DMG and build artifacts
echo "🧹 Cleaning up..."
RELEASE_DIR="Release"
mkdir -p "$RELEASE_DIR"

# Force detach any existing versions to prevent lock issues
hdiutil detach "/Volumes/$APP_NAME Installer" -force 2>/dev/null || true

# Remove old installer from Release folder
rm -f "$RELEASE_DIR/$DMG_NAME"
# Clean up build directory to ensure fresh layout
find "build/bin" -name ".DS_Store" -depth -exec rm {} \;
rm -rf "build/bin/Applications"

# 4. Prepare App
echo "✨ Preparing application bundle..."
touch "build/bin/$APP_NAME.app"

# Remove quarantine attributes that might cause "damaged" error
echo "Correction application permissions..."
xattr -cr "build/bin/$APP_NAME.app"

# Ad-hoc sign the application
echo "🔑 Signing application (ad-hoc)..."
codesign --force --deep --sign - "build/bin/$APP_NAME.app"

# 5. Create the DMG
echo "💿 Creating DMG installer..."
# Removing --background to avoid Finder corruption. macOS defaults to white anyway.
create-dmg \
  --volname "$APP_NAME Installer" \
  --window-pos 200 120 \
  --window-size 600 400 \
  --icon-size 120 \
  --icon "$APP_NAME.app" 150 190 \
  --hide-extension "$APP_NAME.app" \
  --app-drop-link 450 185 \
  "$RELEASE_DIR/$DMG_NAME" \
  "build/bin/"

if [ $? -eq 0 ]; then
    echo "✅ Success! Your installer is ready: $RELEASE_DIR/$DMG_NAME"
    echo "💡 Note: If you still don't see a window, check if it's hidden behind other windows or check the sidebar."
else
    echo "❌ Failed to create DMG."
    exit 1
fi
