# VYRON CONTROL — Cloudflare Workers + D1

A live Cloudflare Workers deployment and its D1 database already exist:

https://vyron-control.endlume-peisov-3ee6109f.workers.dev/

The current feature branch is a release candidate and may be newer than the live Worker. Passing CI does not deploy it. Use the guarded default-branch release workflow described below; never run an ad-hoc production deploy.

**Protect the existing database:** the `database_id` in `wrangler.jsonc` points to the live D1 database. Do not run `wrangler d1 create`, replace that ID, or initialize a second database when updating this deployment. The existing D1 data includes channel registry, snapshots, events and encrypted OAuth profile records.

Never commit any Google credentials, OAuth tokens, macOS Keychain data, private VAPID keys or real production logs to this public GitHub repository.

## Why Cloudflare

- Public counters refresh hourly, with dedicated `0 0 * * *` = 07:00 Krasnoyarsk and
  `0 15 * * *` = 22:00 Krasnoyarsk (UTC+7) slots. Newly enrolled VYRON channels
  receive an immediate targeted public-counter sync. Private Analytics runs separately
  in eleven three-channel batches at 07:05, 07:10, 07:15, 07:20, 07:25,
  07:30, 07:35, 07:40, 07:45, 07:50 and 07:55, then again at 22:05–22:55.
  Each batch stays below Workers Free's 50-subrequest limit and covers up to
  33 authorized channels per reporting window.
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

## Existing production release path

For the already provisioned Worker and D1 database:

1. Review and merge application PR #25 into `feature/vyron-control-cloud-mvp-20261113`.
2. Create or update `release/vyron-control-production` at the exact HEAD of that reviewed branch.
3. Review and merge the small workflow-only PR #26 into `main`. GitHub exposes `workflow_dispatch` workflows only after the workflow file is present on the default branch.
4. In GitHub Actions, run **VYRON CONTROL — guarded Cloudflare release** with `operation=preflight` first. This runs tests, reads remote migration state and builds a Worker dry-run; it does not write to D1 or deploy.
5. Only after the preflight is clean, a separate manual run with `operation=deploy` and `confirm_production=true` can proceed. The workflow additionally requires PR #25 to be merged and the release snapshot SHA to exactly match the reviewed feature branch HEAD.
6. Verify the public `/api/health` response reports all 16 D1 tables after deployment.

The existing production app is not affected by PRs or CI runs alone. The workflow does not print Cloudflare secrets and does not modify VYRON, ENDLUME, Keychain or the macOS updater.

Web Push is currently optional and is not configured in the live service: without `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`, push notifications remain disabled. This does not prevent the dashboard or cloud counters from working.

## Fresh isolated environment (only when creating a separate new deployment)

The following setup steps are for a completely separate Cloudflare environment. Do not use them to recreate or replace the existing production database.

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

After the D1 binding and `CONTROL_TOKEN` are configured, the first successful
dashboard login checks `/api/health`. If application tables are missing, the
authenticated dashboard runs a fixed, idempotent bootstrap that creates only the
16 application tables and their indexes; it never drops or overwrites data.
This removes the need to paste a multi-statement SQL script into the D1 Console.
For later schema changes, keep using versioned Wrangler migrations.

4. Create the secrets directly in the Cloudflare account:

   ```sh
   npx wrangler secret put CONTROL_TOKEN -c cloudflare/wrangler.jsonc
   npx wrangler secret put YOUTUBE_API_KEY -c cloudflare/wrangler.jsonc
   ```

   Use an independently generated random string of 32+ characters for CONTROL_TOKEN.
   AGENT_TOKEN is optional: the owner dashboard can derive a separate Mac-only
   telemetry token from CONTROL_TOKEN. That derived token is accepted only on
   /api/agent/* and cannot read owner dashboard endpoints. Rotating CONTROL_TOKEN
   also rotates the derived agent token. If you prefer a separately managed agent
   secret, you may still configure AGENT_TOKEN directly in Cloudflare. The YouTube
   API key must be from the owner's Google Cloud project and restricted to YouTube
   Data API v3; it must never be embedded in the iPhone website.

5. Deploy through your authorized Cloudflare account:

   ```sh
   npx wrangler deploy -c cloudflare/wrangler.jsonc
   ```

6. Open the generated HTTPS `*.workers.dev` URL from iPhone; enter CONTROL_TOKEN
   on the login screen. Once the Mac Bridge is installed, new channels added in
   VYRON are enrolled automatically; manual `POST /api/channels` is only a fallback.
   Do not paste
   passwords/tokens into GitHub, commits, screenshots or this chat.

   Example request for an owner-controlled terminal:

   ```sh
   curl -X POST "https://YOUR_WORKER.workers.dev/api/channels" \
     -H "Authorization: Bearer YOUR_CONTROL_TOKEN" \
     -H "Content-Type: application/json" \
     --data '[{"id":"UCxxxxxxxxxxxxxxxxxxxxxx","name":"Example"}]'
   ```

   Replace all placeholders with real values. Once the Mac Bridge is installed,
   VYRON channel changes are enrolled automatically; this manual endpoint is a fallback.

## Independent private YouTube Analytics (read-only OAuth)

Cloudflare code includes an independent Google OAuth 2.0 / PKCE flow. It never
reads the macOS Keychain. The owner may alternatively select an explicitly
exported, password-protected `.vyron` migration bundle in the dashboard. That
bundle is decrypted locally in the browser with Argon2id + XChaCha20-Poly1305;
the bundle and password are never uploaded. Only validated read-only OAuth
profiles are sent over HTTPS and re-encrypted with AES-256-GCM before D1 storage.

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
5. On the dashboard either select **Подключить Google-каналы** and authorize
   each Google identity, or export a package from VYRON under
   **Настройки → Backup & Migration** and import it with its one-time password.
   The importer preserves one-to-many mappings: one Google OAuth profile can
   be associated with several YouTube channels. Every mapped channel is checked
   against Google and stored as its own channel binding. Repeated imports are
   idempotent and never delete existing profiles.
   The cloud stores **AES-256-GCM encrypted** refresh tokens in D1; access
   tokens are temporary and never sent to the iPhone.
6. Public counters refresh hourly, with dedicated baseline slots at **07:00 and
   22:00 Krasnoyarsk**. Private Analytics reporting windows begin at those two
   times and run in eleven three-channel batches from :05 through :55. The dashboard's **Обновить всё** button runs public counters and
   then processes all authorized Analytics channels in sequential three-profile
   batches. Each private report covers 90 days and includes daily views, engaged
   and unique viewers, watch time, retention, subscriber changes, likes/dislikes/
   comments/shares, YouTube Premium views, playlist additions/removals, top videos,
   traffic sources, devices, operating systems, countries, audience age/gender,
   subscriber vs non-subscriber views, sharing services, playback locations,
   live/on-demand split and a retention curve for the network's top video. Only
   data Google has already processed will be available in the report.

Only `youtube.readonly` and `yt-analytics.readonly` OAuth scopes are
requested. This does **not** grant YouTube publishing permission. Revenue
requires a distinct monetary scope, channel eligibility and explicit future
owner consent. Thumbnail impression CTR is not returned by the channel reports
used here, so the dashboard marks it unavailable instead of substituting an
unrelated click metric. Google OAuth refresh-token availability and expiry
depend on Google consent-screen configuration.
Additional YouTube Analytics request/quota limits apply separately.

## Free-tier behavior and constraints

- The public-counter sync is ready to run without waking the Mac. Hourly and
  dedicated 07/22 slots are **at-most-once** by idempotent D1 `sync_runs`.
  Errors are recorded.
- Data is durable in D1, not an ephemeral Worker filesystem.
- Snapshots persist per refresh; old events are not auto-deleted.
- Subscriber milestone crossing is approximate because YouTube rounds displayed
  public channel counts. The first successful snapshot is baseline only.
- `api/status` shows the number of YouTube Data API calls reserved by this
  service on the current Pacific-time quota date. Other project-level consumers
  are not included.
- Private Analytics is read-only and updates independently of the Mac. Reports are retained for 90 days and include engagement, top videos, traffic sources, devices, countries and audience age/gender where Google returns data. Missing breakdowns are explicitly marked; the service does not fabricate CTR or revenue.
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

The Mac bridge reads the **read-only state mirror explicitly written by VYRON** by default:

`~/Documents/VYRON/State/app-state.json`

This is the path created by `src-tauri/src/storage.rs` (`state_mirror_file`), not
VYRON's private application-data `state.json`.

It does not modify, migrate or replace the state. Only allowlisted fields
(channel IDs/names, job counters, permitted journal events, and summaries of
cached analytics) are exported to a **private** `~/.vyron-control-agent/`
folder. The local `youtubeProfileId` is converted to a one-way SHA-256 binding
fingerprint; the raw profile ID, OAuth tokens, Keychain data, music paths,
passwords, file paths and freeform metadata are never sent to Cloudflare.

No VYRON or ENDLUME application rebuild is needed for this initial,
read-only connection. It uses the existing application journal and therefore
cannot manufacture missing fine-grained events that the current VYRON version
does not record. ENDLUME-specific progress still depends on the data VYRON has
already recorded.

The dashboard includes a guided Mac setup button: **Подготовить подключение Mac**.

1. Sign in to VYRON CONTROL and click that button.
2. Copy the install command and run it in Terminal on the Mac.
3. When the installer prompts for the agent key, return to the dashboard, copy the
   Mac-only key, and paste it into Terminal. The prompt hides typed characters.

The installer downloads the dedicated agent source from this repository, checks
for macOS, Git and Node.js 22+, installs its dependency, and installs a separate
studio.vyron.control.agent LaunchAgent. While the Mac is awake and online, it
checks the VYRON state mirror every 45 seconds. A newly added VYRON channel is
then enrolled in Cloudflare automatically, and its public counters are fetched
immediately; subsequent public counters refresh hourly even while the Mac sleeps.
If the Mac is asleep when a channel is added, enrollment resumes after wake.
The token is stored only in
~/.vyron-control-agent/config.json with mode 0600; it is not placed in the plist
or shell history. The LaunchAgent starts on login and retries safely after network
loss while preserving event IDs/offsets for idempotent recovery. It runs only
while the Mac is awake; cloud analytics continues on the independent Worker.

Uninstall without touching VYRON application data:
`npm run agent:uninstall`. This preserves private agent configuration and
sync history; rotate AGENT_TOKEN in Cloudflare to revoke remote access.

To use another state mirror location, set
`VYRON_AGENT_STATE_MIRROR=/full/path/to/app-state.json` **before launching
the agent** and ensure the LaunchAgent has permission to read it. Never
grant the bridge Full Disk Access unnecessarily.

### Automatic channel and Analytics sync

- Adding a YouTube channel in VYRON updates the native state mirror. The Mac Bridge
  detects the change within its next 45-second cycle and sends only the channel ID,
  display name and optional one-way OAuth-profile fingerprint.
- Cloudflare inserts the channel idempotently and immediately fetches its public
  counters. A failed initial sync is not cached by the Mac Bridge; it retries with
  backoff. Public counters then refresh hourly from the cloud.
- If the channel's fingerprint matches a VYRON OAuth profile already imported into
  CONTROL, the Worker refreshes that profile and asks Google to confirm the new
  channel before copying the encrypted token binding. No Keychain or local token
  access is performed by the Bridge.
- A new channel whose Google profile has never been authorized in CONTROL still
  needs a one-time read-only Google authorization in CONTROL (or a new encrypted
  VYRON migration import). After authorization, Analytics is queued automatically
  and processed in batches of up to two profiles every five minutes. The daily
  07:05–07:55 and 22:05–22:55 reporting windows remain in place.
- Public counters continue hourly while the Mac sleeps. Detecting a newly added
  local VYRON channel necessarily waits until the Mac wakes and the Bridge can read
  the local mirror; no cloud service can observe a local-only change while the Mac
  is offline.

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
