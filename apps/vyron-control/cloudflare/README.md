# VYRON CONTROL FREE CLOUD — Cloudflare Workers + D1

This is the free-tier cloud replacement for a paid VPS. It is **code only** until
the owner creates a Cloudflare account, a D1 database and sets private secrets.
Never commit any Google credentials, OAuth tokens, macOS Keychain data or real
production logs to this public GitHub repository.

## Why Cloudflare

- Cron runs on UTC: `0 0 * * *` = 07:00 Krasnoyarsk; `0 15 * * *` = 22:00
  Krasnoyarsk (Asia/Krasnoyarsk is UTC+7 year-round).
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
- Private CTR, audience retention, revenue and detailed YouTube Studio reports
  are **not included yet**. They require safe OAuth / Google API access.
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
npm run agent:start
```

The Mac bridge sends heartbeat every 45 seconds, uploads fine-grained JSONL
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
