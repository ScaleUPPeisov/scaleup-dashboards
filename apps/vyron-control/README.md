# VYRON CONTROL — private cloud control plane

Independent, read-only companion service for the existing VYRON macOS app.

**A live Cloudflare Worker deployment already exists:**  
https://vyron-control.endlume-peisov-3ee6109f.workers.dev/

The current feature branch is a release candidate, not the live deployment. A commit or passing CI run does not update production; application changes become live only after the guarded release workflow completes. See [cloudflare/README.md](cloudflare/README.md) and the release entrypoint PR #26.

Does not modify the production VYRON updater, the OAuth Keychain, ENDLUME,
YouTube uploads, PR #22, or any existing SQLite/JSON data.

## Zero-cost architecture (2026-11-13)

The intended no-VPS build is now in **[cloudflare/README.md](cloudflare/README.md)**.
Cloudflare Workers Free refreshes public counters hourly (with dedicated 07:00/22:00
Krasnoyarsk slots), while D1 persists channels and snapshots independently of a sleeping Mac.

The standalone **[agent/run.mjs](agent/run.mjs)** is a read-only Mac bridge.
It reads the VYRON state mirror at `~/Documents/VYRON/State/app-state.json`,
checks it every 45 seconds while the Mac is awake, automatically enrolls new
channels, sends allowlisted events and status, and supports one safe remote
command, `request_status`. It never reads Keychain or sends OAuth credentials.
A one-way fingerprint can match a newly added channel to an already imported
VYRON OAuth profile; otherwise a one-time Google authorization in CONTROL is
required for private Analytics.

The original `src/server.mjs` Docker/Node implementation remains available
for local development, but it is not the zero-cost always-on deployment.

## Implemented

- Responsive Russian-language iPhone browser dashboard/PWA shell: channel list,
  total subscriber/view/video counts, search, quota used by this service, milestone event log.
- **All registered channels auto-refresh hourly**, with dedicated 07:00 and
  22:00 Asia/Krasnoyarsk slots. Newly enrolled channels receive an immediate
  targeted refresh. All times are resolved independently of the host/server time zone.
- Public `channels.list(part=snippet,statistics)` via the YouTube Data API.
  Requests batch up to **50 IDs per request**, with one local-budget unit reserved
  before each attempt. The Google Cloud project's real quota is shared with
  **other callers** and is not visible to this service.
- Optional manual refresh, minimum 5 minutes between manual requests.
  Local in-app status polling every 60 seconds does not call YouTube.
- Newly authorized private Analytics reports are queued and processed in batches
  of up to two channels every five minutes.
- Idempotent subscriber milestone log (100/200/300 and onward); initial sync
  establishes baseline without backfilling false celebrations. Subscriber counts
  exposed by YouTube are rounded; milestone detection is approximate.
- Snapshots and event log persisted to local JSON with atomic writes and 0600
  permissions. Corrupt state causes startup failure rather than resetting silently.
- Bearer token required for all private API endpoints; bound to 127.0.0.1 by default.
- No new npm dependencies.

## Setup (server with Node.js 20+)

1. Create `apps/vyron-control/channels.json` containing IDs **you own/manage**:

   ```json
   [
     { "id": "UCxxxxxxxxxxxxxxxxxxxxxx", "name": "My channel" }
   ]
   ```

   Replace the placeholder with a real 24-character YouTube channel ID. The file
   is gitignored. Never paste Google OAuth tokens into this repository. The
   Cloudflare dashboard can locally decrypt an owner-created `.vyron` migration
   package and securely import its read-only profiles without uploading the
   package password.

2. Create a YouTube Data API v3 API key in your own Google Cloud project, restrict
   it to this API, and configure `VYRON_YOUTUBE_API_KEY` **on the server only**.
   Apply suitable API key restrictions for your deployment.

3. Generate a unique secret (e.g. `openssl rand -hex 32`). Set
   `VYRON_CONTROL_TOKEN` to that secret and start the service:

   ```sh
   cd apps/vyron-control
   export VYRON_CONTROL_TOKEN="your-unique-64-character-secret"
   export VYRON_YOUTUBE_API_KEY="your-server-side-youtube-api-key"
   npm start
   ```

4. Open `http://127.0.0.1:8787` on the host and sign in with the access token.
   For iPhone access use HTTPS and a private connection such as Tailscale Serve.
   **Do not expose port 8787 on the open internet**. The first version uses a
   single bearer secret (not multi-user authentication).

5. `npm test` runs schedule, quota, batching, threshold and no-duplicate tests.

## Docker deployment on a persistent private host

The included `Dockerfile` and `compose.yaml` make the service runnable on a
small **always-on** server. Docker does not provide a server by itself.

```sh
cd apps/vyron-control
cp .env.example .env
# Edit .env to insert a unique token and a restricted YouTube API key.
# Create channels.json containing the actual channel IDs.
docker compose up --build -d
```

The Compose service binds to `127.0.0.1:8787` only, stores snapshots in the
persistent `vyron-data` Docker volume, and runs without root permissions.
Configure Tailscale Serve/HTTPS and authorize your own iPhone before accessing
it remotely. Do not use public port forwarding, share your token, or commit
`.env`/`channels.json`. A restart policy maintains the process across VM
reboots; the VM itself must stay online at the two scheduled times.

## Important deployment requirements

This is a persistent **Node process with a durable writable directory**. To
refresh while a Mac sleeps, deploy it to an always-on trusted server or cloud VM.
Launching on the Mac alone will NOT provide updates while it sleeps. Serverless
hosts without durable storage/always-on execution are NOT drop-in replacements.
Only one instance may write to the local JSON state at a time.

The service refreshes **at most once per scheduled slot**, within the first
15 minutes after 07:00/22:00 Krasnoyarsk time. Failed attempts are recorded,
not automatically retried repeatedly. If the host was offline for the entire
window, that slot is missed; use manual refresh after it comes back online.

### Current limits (do not misrepresent)

- It reads only **public counters**. CTR, retention, revenue, real-time Studio
  data and private analytics require a separate YouTube Analytics OAuth backend.
- No live Mac/ENDLUME queue connection, Wake-on-LAN, upload commands, APNs/web
  push, mobile native installer or public production deployment yet.
- Milestones appear in the in-app event log, **not push notifications yet**.
- `quota.spent` is the service's estimated attempted `channels.list` calls,
  **not** the whole project's Google quota. Data API accounting resets on
  `America/Los_Angeles` dates, which handle daylight savings.
- YouTube public subscriber counts can be rounded; per-100 event detection is
  approximate, particularly for larger channels.
- Later Mac-side integration must use a read-only adapter and must not transfer
  live macOS Keychain secrets or bypass the updater security incident hold.

## Roadmap

1. Cloud deployment with persistent database and per-user auth; test on real IDs.
2. Dedicated read-only VYRON Mac agent for render/upload status and history;
   one-way state sync, no duplication of publisher jobs.
3. Authorized private YouTube Analytics per channel, YouTube quota monitoring,
   scheduled reports, secure push notifications and safe command queue.
4. Separate updater key rotation and release-security gates before any remote
   updater controls.
