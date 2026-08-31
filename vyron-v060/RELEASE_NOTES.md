# VYRON 0.6.0 — YouTube Intelligence

- Compact Existing Videos Manager with real YouTube thumbnails, collapsed cards and an expanded editor.
- macOS system typography (SF Pro stack) and denser premium layout.
- Own-channel YouTube Analytics API integration: views, watch time, average view duration/percentage, subscriber gains/losses, likes, comments, shares, daily trend, top videos, traffic sources and countries.
- Competitor Radar now uses the connected channel OAuth, stores historical snapshots, shows deltas and recent videos, and can update automatically.
- Automatic YouTube Intelligence refresh while VYRON is running (default every 180 minutes, configurable).
- Public videos are no longer preselected for mass scheduling after synchronization.
- YouTube thumbnail CSP support for i.ytimg.com / yt3.ggpht.com.

Notes:
- Private channel analytics require YouTube Analytics API to be enabled in the same Google Cloud project and the YouTube OAuth profile to be reconnected once so VYRON receives the yt-analytics.readonly scope.
- Competitor analytics are limited to public YouTube data; private competitor CTR, audience retention and revenue are not exposed by YouTube APIs.
- Test DMG is ad-hoc signed, not Apple Developer ID notarized.
