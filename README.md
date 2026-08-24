# ReelsFactory

ReelsFactory is a macOS Apple Silicon desktop app for turning raw talking-head video into vertical Reels.

## Release baseline: v0.3.0

- Tauri 2 desktop shell
- Native AVFoundation video pipeline
- Apple Vision face-aware 9:16 reframing with person fallback
- Corrected 9:16 crop geometry with canvas-boundary protection
- **AI Cut v1**: transcript-driven selection of the strongest semantic blocks from long talking-head videos
- Long source videos are condensed toward a 35–60 second Reel depending on intensity
- Speech-boundary cuts with padding instead of arbitrary frame cuts
- Conservative pause cleanup inside short videos
- Anti-overcut safeguards
- Auto Zoom accents
- Local Whisper captions (RU/EN auto recognition)
- Dynamic compact captions, with hard failure if captions are requested but none are produced
- Caption presets and keyword emphasis
- MP4 / MOV / M4V import with real metadata
- Projects history for completed local exports
- Full RU / EN interface
- Apple Silicon DMG distribution
- In-app update checks against ReelsFactory GitHub releases
- Update installation from verified DMG + SHA-256 manifest
- Previous app backup before replacement
- Native ARM64 regression tests for rotated metadata, 9:16 export, black-bar prevention and actual caption burn-in

## Update workflow

1. Develop on `reelsfactory-desktop`.
2. Bump the version.
3. Commit a release.
4. GitHub Actions builds and validates the Apple Silicon DMG and manifest.
5. The release is published under the `reelsfactory-vX.Y.Z` tag.
6. Installed ReelsFactory detects the release and offers **Install and restart** without Terminal commands.

ReelsFactory remains isolated from the ScaleUP dashboard application even though its development branch currently lives in the same repository.
