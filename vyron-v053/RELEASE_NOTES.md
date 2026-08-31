# VYRON 0.5.3 — Google OAuth Client Secret fix

- Added one-time Google OAuth Client Secret input for Desktop OAuth clients.
- Client Secret is not returned in OAuth profile lists and is not written to application logs.
- After successful OAuth, Client Secret is stored only inside the local OAuth profile store with 0600 permissions on macOS/Unix so refresh tokens can be renewed.
- Authorization-code exchange and refresh-token exchange now both send client_secret.
- Existing OAuth profiles created without a Client Secret are rejected with a clear reconnect message.
- Existing Videos Manager from 0.5.1 and OAuth reliability diagnostics from 0.5.2 remain intact.
