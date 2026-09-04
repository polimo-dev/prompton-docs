---
title: Security
description: How sign-in works without passwords, how CLI sessions are revoked, what is encrypted at rest, and why PromptOn never sees your provider key.
order: 8
---

# Security

## Sign-in by emailed code

There are no passwords. Signing in at `__APP_URL__/sign-in` sends a 6-digit code to the address you enter; typing it into the same page signs you in. A new address becomes an account, with its own personal organization, the moment its code is accepted, so sign-up is the same step and there is no separate registration page. The account's security is the inbox's security, which is the assumption a password-reset email already made.

What limits a guessed code:

| Control | Value |
|---|---|
| Code lifetime | 5 minutes, single use |
| Attempts per code | 5; after that the code is dead even if the next guess is right |
| Code requests | 3 per address per 10 minutes, 10 per client IP per 10 minutes |
| Code verifications | 20 per client IP per 10 minutes |
| Requesting a new code | Invalidates the previous one, so at most one live code per address |

Over a request limit, the page behaves exactly as if the email had been sent, and a failed verification uses one message whether the code was wrong, expired, exhausted, or throttled; `/sign-in` never reveals whether an address exists or was recently active. Only a hash of each code is stored, the code is never written to logs, and expired rows are swept every 15 minutes.

## CLI sessions

`prompton login` is a device flow: the CLI shows a link and an 8-character code, you sign in and press **Approve** in the browser, and the CLI receives a session token for your user. The token is collected exactly once and the server keeps only a hash of the device code while the request is pending. The two device endpoints are unauthenticated and rate-limited per IP (20 code requests and 600 polls per 10 minutes); pending requests expire after 15 minutes.

A session token never expires on its own. It ends only when revoked:

- `prompton logout` revokes the session on that machine and clears it from `~/.config/prompton/config.json` (written `0600` in a `0700` directory).
- **Logged-in devices** on `__APP_URL__/account` lists every session with its device name, client, and last use, and signs out any one of them, for a laptop you no longer have.
- **Sign out everywhere** on the same page revokes every session except the browser you pressed it in.

Every CLI call runs as you, under your own organization and project memberships. Organizations you do not belong to answer 404 rather than 403, so the API does not confirm they exist. A CLI session token cannot call the runtime API, and a runtime key cannot call the management API.

## Runtime keys

A runtime key (`ptn_<project_slug>_…`) is scoped to one project and to at most two operations: reading configuration (`read`) and sending logs (`logs`). The secret is returned once at issue time; the server stores a SHA-256 hash and later shows only the first 16 characters. Keep it server-side; never ship it to a browser or mobile client.

## Encryption at rest

Two layers, on purpose:

- **The database as a whole** is protected by the storage-level encryption of the managed database it runs on (block-volume / KMS encryption on the cloud provider). That covers disks, backups, prompts, prompt versions, deployments, and everything else. Anyone holding the database credentials still reads those rows in the clear — that is how storage encryption works — so credentials are the boundary, and PromptOn is open source so you can run it on your own database with whatever policy you need.
- **Field-level encryption with a separate key** is reserved for the data that would hurt if the database contents leaked: monitoring-log content, provider keys, and pending device-login tokens (details below). Prompts are deliberately *not* field-encrypted: they are your configuration, they need to be searchable and diffable, and the storage layer already covers them.

- Log content (`input` and `output`) is encrypted at rest with AES-256-GCM when the use case's log content policy has `encrypt` on, which is the default. The policy also controls sampling, size caps, retention, and whether content is stored at all (`mode` `full`, `hash`, or `none`). A client may pre-hash content so the text never leaves the app.
- Organization provider keys (BYOK OpenRouter keys) are encrypted at rest with AES-256-GCM and decrypted only when PromptOn itself calls a model. No endpoint returns the secret; responses carry a masked hint such as `sk-or-v1-••••4Xa2`.
- Tokens waiting to be collected by a CLI during device login are encrypted at rest and deleted on collection.
- Runtime keys are stored only as SHA-256 hashes.

## Not a proxy

PromptOn is never in your app's request path. Your app fetches configuration from PromptOn and calls the model provider directly with its own key and HTTP client; monitoring logs are sent afterwards, in batches. Consequences:

- Your provider keys stay in your app. PromptOn does not need them and never sees them.
- If PromptOn is unreachable, your app keeps running on the last use-case document it fetched. Deploys pause; requests do not.
- The optional organization provider key is used only where PromptOn itself runs a model on your behalf, such as the arena; onboarding finishes without one.
