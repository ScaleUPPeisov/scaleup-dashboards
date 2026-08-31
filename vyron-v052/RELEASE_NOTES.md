# VYRON 0.5.2

OAuth reliability hotfix.

- Browser callback no longer claims full YouTube connection before token/channel validation finishes.
- OAuth result is shown persistently inside VYRON instead of disappearing in a short toast.
- Refresh now reports whether profiles were found or an OAuth storage error occurred.
- Corrupted youtube-oauth.json is backed up and recovered automatically.
- OAuth store writes are atomic.
- YouTube channel lookup must succeed before a profile is saved.
- Clear error if YouTube Data API v3 is not enabled for the VYRON Google Cloud project.
- Verifies the OAuth profile was actually saved to disk.
- Keeps Existing Videos Manager from 0.5.1.
