# VYRON CONTROL FREE CLOUD — Cloudflare Workers + D1

This is the free-tier cloud replacement for a paid VPS. It is **code only** until
the owner creates a Cloudflare account, a D1 database and sets private secrets.
Never commit any Google credentials, OAuth tokens, macOS Keychain data or real
production logs to this public GitHub repository.

## Why Cloudflare

- Public counter cron runs at `0 0 * * *` = 07:00 Krasnoyarsk and
  `0 15 * * *` = 22:00 Krasnoyarsk (UTC+7). Private Analytics runs separately
  in five ten-channel batches at 07:05, 07:10, 07:15, 07:20, 07:25
  and again at 22:05–22:25. This separation avoids exceeding Workers Free's
  50-subrequest limit at 07:00/22:00.
- Workers Free: up to 100,000 requests/day and 5 account-wide cron triggers,
  subject to Cloudflare's current free plan limits.
- D1 Free: 5 million rows read/day, 100,000 rows written/day, 5 GB total storage,
  subject to a **500 MB maximum per single database** on Free at the time of writing.
- The Google YouTube Data API applies separate quotas; the Worker only accounts for
  requests it sends, not another client on the same Google Cloud project.
- Browser dashboard assets are served by the same Worker domain over HTTPS.

Official documentation:
https://developers.cloudflare.com/workers/platform/limits/
https://developers.cloudflare.com/d1/platform/limits/
https://developers.cloudflare.com/workers/configuration/cron-triggers/

## Account setup (owner action required)

1. Register a **Workers Free** Cloudflare account. No paid plan should be selected.
2. In a trusted terminal, from `apps/vyron-control`, authenticate Wrangler.
   This action may open Cloudflare's authorization page:

   ```sh
   npx wrangler login
   npx wrangler d1 create vyron-control
   ```

3. Copy the newly created D1 UUID into
   `cloudflare/wrangler.jsonc` under `database_id` instead of the all-zero
   placeholder; leave it out of any private secrets. Apply initial D1 schema:

   ```sh
   npx wrangler d1 migrations apply vyron-control --remote -c cloudflare/wrangler.jsonc
   ```

4. Create the secrets *directly* in the Cloudflare account. The control token
   authorizes iPhone dashboard reads and safe control commands; the agent token
   is a **different** secret restricted to Mac telemetry and command acknowledgement.

   ```sh
   npx wrangler secret put CONTROL_TOKEN -c cloudflare/wrangler.jsonc
   npx wrangler secret put AGENT_TOKEN -c cloudflare/wrangler.jsonc
   npx wrangler secret put YOUTUBE_API_KEY -c cloudflare/wrangler.jsonc
   ```

   Use independently generated random strings of 32+ characters for the first
   two. The API key must be from the owner's Google Cloud project and restricted
   to YouTube Data API v3; it must never be embedded in the iPhone website.

5. Deploy through your authorized Cloudflare account:

   ```sh
   npx wrangler deploy -c cloudflare/wrangler.jsonc
   ```

6. Open the generated HTTPS `*.workers.dev` URL from iPhone; enter CONTROL_TOKEN
   on the login screen. Add the channel IDs via the authenticated
   `POST /api/channels` endpoint before the next scheduled run. Do not paste
   passwords/tokens into GitHub, commits, screenshots or this chat.

   Example request for an owner-controlled terminal:

   ```sh
   curl -X POST "https://YOUR_WORKER.workers.dev/api/channels" \
     -H "Authorization: Bearer YOUR_CONTROL_TOKEN" \
     -H "Content-Type: application/json" \
     --data '[{"id":"UCxxxxxxxxxxxxxxxxxxxxxx","name":"Example"}]'
   ```

   Replace all placeholders with real values. A standalone Mac agent can later
   import the registry exported by VYRON without manual channel-by-channel entry.

## Independent private YouTube Analytics (read-only OAuth)

Cloudflare code includes an independent Google OAuth 2.0 / PKCE flow. It does
**not** reuse, extract or migrate VYRON's macOS Keychain tokens.

1. In Google Cloud Console, enable **YouTube Data API v3** and
   **YouTube Analytics API**. Configure an OAuth consent screen under your own
   Google Cloud project. The app requires authorization to read the channels
   you own/manage. The Google project may require publishing/verification
   depending on the scope, test-user limits and Google's consent-screen policy.
2. Create an OAuth 2.0 **Web application** client. Register the **exact**
   HTTPS callback
   `https://YOUR_WORKER.workers.dev/api/oauth/callback`.
   Do not register an HTTP URI.
3. Configure the new server-only secrets in Cloudflare (not GitHub):

   ```sh
   npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID -c cloudflare/wrangler.jsonc
   npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET -c cloudflare/wrangler.jsonc
   npx wrangler secret put OAUTH_ENCRYPTION_KEY -c cloudflare/wrangler.jsonc
   ```

   Generate `OAUTH_ENCRYPTION_KEY` as **64 lowercase hexadecimal characters**
   (32 random bytes) and store the only safe backup outside the repository.
   Losing it makes encrypted refresh tokens unreadable; this key must not be
   copied into public messages, logs or GitHub Actions.

4. Set `APP_ORIGIN` to the exact Worker HTTPS origin in the Wrangler
   environment settings, e.g. `https://YOUR_WORKER.workers.dev`.
   Then redeploy and recheck the Google redirect URI.
5. On the iPhone dashboard select **Подключить Google-каналы**. Authorize
   each Google identity/channel you manage and approve read-only scopes.
   The cloud stores **AES-256-GCM encrypted** refresh tokens in D1; access
   tokens are temporary and never sent to the iPhone.
6. Two daily reporting windows begin at **07:00 and 22:00 Krasnoyarsk**.
   YouTube public counters refresh exactly at those times. Detailed private
   reports are processed in batches of 10 authorized channels at **07:00,
   07:05, 07:10, 07:15 and 07:20** and similarly at 22:00–22:20, respecting
   the 50-subrequest Worker Free limit. Only data Google has already processed
   will be available in the report.

Only `youtube.readonly` and `yt-analytics.readonly` OAuth scopes are
requested. This does **not** grant YouTube publishing permission. Revenue
requires a distinct monetary scope and explicit future owner consent;
unavailable CTR metrics are never invented. Google OAuth refresh-token
availability and expiry depend on Google consent-screen configuration.
Additional YouTube Analytics request/quota limits apply separately.

## Free-tier behavior and constraints

- The public-counter sync is ready to run without waking the Mac. The 07/22 cron
  triggers are **at-most-once** by idempotent D1 `sync_runs`. Errors are recorded.
- Data is durable in D1, not an ephemeral Worker filesystem.
- Snapshots persist per refresh; old events are not auto-deleted.
- Subscriber milestone crossing is approximate because YouTube rounds displayed
  public channel counts. The first successful snapshot is baseline only.
- `api/status` shows the number of YouTube Data API calls reserved by this
  service on the current Pacific-time quota date. Other project-level consumers
  are not included.
- Private watch-time, average view duration, average view percentage and subscriber gains/losses have a read-only OAuth backend, but are **not live until Google consent/configuration is completed**. CTR and monetary reports remain unavailable unless supported by the authorized API.
- PWA can show the last Mac state while the computer sleeps, but a sleeping Mac
  cannot render video or process commands. Commands stay queued until agent ACK.
- No cloud URL, Google keys, Cloudflare deployment or live YouTube connections
  have been provisioned through ChatGPT for this branch.

## Mac bridge (owner-run, no Keychain changes)

Run a separate non-privileged process on the Mac while it is awake.
From `apps/vyron-control`:

```sh
export VYRON_CONTROL_URL='https://YOUR_WORKER.workers.dev'
export VYRON_AGENT_TOKEN='YOUR_SEPARATE_AGENT_SECRET'
export VYRON_DEVICE_ID='macbook_m1'
# Optional: explicit read-only export paths from VYRON/ENDLUME:
export VYRON_AGENT_EVENTS_FILE='/private/path/to/vyron-events.jsonl'
export VYRON_AGENT_STATUS_FILE='/private/path/to/vyron-status.json'
export VYRON_AGENT_CHANNELS_FILE='/private/path/to/vyron-channels.json'
npm run agent:start
```

The channel registry file may be either an array of `{id,name}` objects or
an object containing `channels: [{channelId,title}]`. The bridge uploads only
the validated channel IDs and display names; it never sends Google credentials.
A VYRON export in this exact format must be created or adapted on the Mac before
automatic channel enrollment works. Existing cloud channel snapshots survive
later renames.

In manual export mode, the Mac bridge sends a heartbeat every 45 seconds, uploads fine-grained JSONL
events in idempotent batches and resumes from the durable byte cursor. It reads
only explicitly configured paths and does **not** scan Keychain, local channel
databases or YouTube credentials. No publishing, updater or destructive commands
are allowed in the first version. The desktop application must still be wired
to produce these snapshots/JSONL events; this adapter alone does not make the
existing Mac app emit them.

### JSONL example

```json
{"id":"r2026_0001","kind":"render_completed","title":"Video finished","occurredAt":"2026-11-13T00:00:00Z","payload":{"projectId":"demo","durationSeconds":1800}}
```

Supported kinds: `render_started`, `render_progress`, `render_completed`,
`render_failed`, `upload_queued`, `upload_started`, `upload_progress`,
`upload_completed`, `upload_failed`, `schedule_changed`, `disk_offline`,
`disk_online`, `quota_warning`, `channel_sync`, `agent_error`, `agent_info`.

The bridge explicitly allowlists status and event fields; OAuth secrets, API
keys and credentials are never intentionally transmitted.

## Automatic Mac integration with VYRON 6.1.15

The Mac bridge now reads the **existing VYRON app-data state file** by default:

`~/Library/Application Support/studio.channelflow.desktop/state.json`

It does not modify, migrate or replace the state. Only allowlisted fields
(channel IDs/names, job counters, permitted journal events, and summaries of
cached analytics) are exported to a **private** `~/.vyron-control-agent/`
folder. OAuth tokens, Keychain data, music paths, passwords, file paths and
freeform metadata are never sent to Cloudflare.

No VYRON or ENDLUME application rebuild is needed for this initial,
read-only connection. It uses the existing application journal and therefore
cannot manufacture missing fine-grained events that the current VYRON version
does not record. ENDLUME-specific progress still depends on the data VYRON has
already recorded.

Once the Cloudflare Worker has been deployed and `AGENT_TOKEN` configured,
run these steps **on your own Mac**, not in GitHub Actions:

```sh
cd apps/vyron-control
export VYRON_CONTROL_URL='https://YOUR_WORKER.workers.dev'
export VYRON_AGENT_TOKEN='YOUR_SEPARATE_32PLUS_AGENT_TOKEN'
npm run agent:install
```

`agent:install` installs a separate `studio.vyron.control.agent` macOS
LaunchAgent. It creates a dedicated mode-0600 config file under
`~/.vyron-control-agent/config.json` (the token is not placed in the plist).
It then starts the service on login. The agent retries safely after network
loss and preserves event IDs/offsets for idempotent recovery. It runs only
while the Mac is awake; cloud analytics continues on the independent Worker.

Uninstall without touching VYRON application data:
`npm run agent:uninstall`. This preserves private agent configuration and
sync history; rotate AGENT_TOKEN in Cloudflare to revoke remote access.

To use another state mirror location, set
`VYRON_AGENT_STATE_MIRROR=/full/path/to/app-state.json` **before launching
the agent** and ensure the LaunchAgent has permission to read it. Never
grant the bridge Full Disk Access unnecessarily.

### Event coverage

VYRON's existing activity journal is mapped to upload started/progress/accepted,
render completions, production build status, schedule changes, OAuth errors,
statistics refreshes and other allowlisted lifecycle events. At the start,
the most recent 1,000 journal events are considered for import; subsequent
changes are synced with replay protection. Cloud upload-completed events mean
YouTube upload accepted, not guaranteed public publication. The cloud
provides a paginated event timeline with filters for subscribers, render,
upload and error events.

## iPhone Web Push — subscriber milestone and production alerts

The Worker includes opt-in RFC 8291 encrypted Web Push support, with a dedicated
D1 delivery ledger, bounded retry queue and PWA service worker. It notifies on
subscriber milestones (100/200/300 etc.), render completions/failures, upload
acceptance/failures and important system warnings. The Worker checks pending
deliveries every five minutes. Notifications are best-effort and may be delayed
by the push provider or offline device; never treat push as proof of successful
YouTube publication.

**Configure VAPID keys privately, once:**

1. On a trusted local Mac or computer with Node.js 22+, run
   `cd apps/vyron-control && npm run push:keys`.
2. Add the generated **public key** as Cloudflare Worker variable `VAPID_PUBLIC_KEY`.
3. Add the generated **private key** using
   `npx wrangler secret put VAPID_PRIVATE_KEY -c cloudflare/wrangler.jsonc`
   and never commit it or send it in chat. Also set a valid
   `VAPID_SUBJECT` value, e.g. `mailto:YOUR_EMAIL@example.com` (must be
   your actual contact address).
4. Apply the `0004_webpush.sql` D1 migration and deploy the Worker.
5. On iPhone, open the HTTPS Worker URL in Safari, use **Share → Add to Home
   Screen**, open the installed web app, log in, then tap **Включить
   уведомления** and grant notification permission. Apple supports Web Push
   for Home Screen web apps on iOS 16.4+; no Apple Developer subscription is
   required for this PWA workflow.

The push endpoint is only used for allowlisted Apple/Google/Mozilla/Windows
push providers, never arbitrary HTTP destinations. Subscription and revoke
operations require the owner's private CONTROL_TOKEN. Push subscriptions are
not transferred to Google or GitHub. The `request_status` command remains
read-only and does not grant upload or updater access.

## Security / release policy

- The signing-key incident in existing VYRON PR #22 remains a production-release
  blocker. This cloud feature must **not** bypass any Tauri updater controls.
- Do **not** use a public repository's GitHub Actions to print, create or distribute
  Cloudflare/Google secrets. Cloudflare secrets must be entered in its own account.
- Zero-cost depends on staying below free-service limits. Monitor cloud usage;
  check plan boundaries before deployment.
- No remote upload, remote updater, shell execution, or file deletion API has
  been added. `request_status` is safe and waits for the Mac to respond.
- Node legacy local server remains for development. Cloudflare Workers/D1 is the
  intended zero-VPS architecture for production, once deployed by the owner.
