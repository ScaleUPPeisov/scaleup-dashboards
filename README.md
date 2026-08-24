# ReelsFactory

ReelsFactory is a macOS Apple Silicon desktop app for turning raw talking-head video into vertical Reels.

## Release baseline: v0.2.1

- Tauri 2 desktop shell
- Native AVFoundation video pipeline
- Apple Vision face-aware 9:16 reframing
- Smart Cuts based on recognized speech pauses
- Auto Zoom accents
- Local Whisper captions (RU/EN auto recognition)
- Caption presets and keyword emphasis
- MP4 / MOV / M4V import with real metadata
- Projects history for completed local exports
- Full RU / EN interface
- Apple Silicon DMG distribution
- In-app update checks against ReelsFactory GitHub releases
- Update installation from verified DMG + SHA-256 manifest
- Previous app backup before replacement

## Update workflow

1. Develop on `reelsfactory-desktop`.
2. Bump the version.
3. Commit a release with `release: ReelsFactory ...`.
4. GitHub Actions builds the Apple Silicon DMG and manifest.
5. The release is published under the `reelsfactory-vX.Y.Z` tag.
6. Installed ReelsFactory detects the release and offers **Install and restart** without Terminal commands.

ReelsFactory remains isolated from the ScaleUP dashboard application even though its development branch currently lives in the same repository.
