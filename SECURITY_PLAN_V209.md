# VYRON 2.0.9 Security Hardening

Base exact stable source: `5650ba655eecbed3193fa0916c3f390f8efbdc73` (VYRON 2.0.8).

## Non-breaking rules
- Production / Downloads / ENDLUME / Publisher / Future Channels behavior must remain unchanged.
- Existing plaintext secrets are removed only after successful macOS Keychain writes.
- Runtime API shapes stay compatible: frontend can still read its settings after `load_state`, but persisted JSON is sanitized.
- If Keychain migration fails, VYRON must return an explicit error and must not silently destroy the old credential file.
- No mandatory Touch ID/app-lock in 2.0.9 because background Production/ENDLUME workflows must remain usable.

## Security contracts
1. OAuth access token / refresh token / client secret -> macOS Keychain.
2. Google client secret / YouTube API key -> macOS Keychain.
3. Legacy OAuth/config JSON migrates once, then is rewritten without plaintext secrets.
4. `state.json` writes `youtubeApiKey` and `openaiApiKey` as empty values; Keychain values are rehydrated only in memory on load.
5. Sensitive local files get owner-only `0600` permissions on macOS/Unix.
6. App logs redact bearer tokens, OAuth fields, Google API-key patterns and OpenAI-style key patterns.
7. Full VYRON 2.0.8 regression + signed macOS Apple Silicon build remains green.
