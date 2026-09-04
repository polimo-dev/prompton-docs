---
title: CLI reference
description: Installing prompton, signing in, configuration precedence, every command with an example, JSON output, exit codes, and idempotent provisioning.
order: 4
---

# CLI reference

`prompton` provisions PromptOn from a terminal: projects, use cases, prompts, models, deployments, and keys. It is built to be driven by a coding agent as much as by a person: every command takes `--json`, exits `0`/`1`/`2`, and turns "already exists" into something a re-run survives. It talks to the [management API](/management-api); it does not fetch config or send logs, which is the app's job through the [runtime API](/api).

## Installation

```sh
curl -fsSL __HOME_URL__/install.sh | sh
prompton --version
```

The script detects OS and architecture (macOS and Linux, amd64 and arm64), downloads the matching release archive, verifies its SHA-256 against the release's `checksums.txt`, and installs to `/usr/local/bin` when that is writable or `~/.local/bin` otherwise. Two environment variables override it:

| Variable | Effect |
|---|---|
| `PTN_VERSION` | Version to install, e.g. `v0.1.0` (default: latest release) |
| `PTN_INSTALL_DIR` | Where to put the binary |

Other routes: the [release archives on GitHub](https://github.com/polimo-dev/prompton-cli/releases) (which also include a Windows amd64 zip), `go install github.com/polimo-dev/prompton-cli@latest`, and a Homebrew tap (`brew install polimo-dev/tap/prompton`) once published.

### Uninstall

```sh
curl -fsSL __HOME_URL__/uninstall.sh | sh
```

Signs the CLI out (the session token is revoked on the server), removes the binary, and deletes
`~/.config/prompton`. `PTN_KEEP_CONFIG=1` keeps the configuration directory. Homebrew installs:
`brew uninstall prompton`.

## Signing in

```sh
prompton login
```

The CLI asks the server for a code, prints the approval link and the code, opens the link in your browser (skip that with `--no-browser`), and polls every 5 seconds for up to 15 minutes:

```text
  Open this URL to approve the login:
    __APP_URL__/device?code=H4KP-T7WR

  Your code: H4KP-T7WR

Waiting for approval…

Logged in as ada@example.com
Organization: personal
Session stored in /Users/ada/.config/prompton/config.json
```

In the browser you sign in with an emailed 6-digit code (a new address becomes an account on the spot) and press **Approve**. What the CLI stores is a session token for **you**, not a key for an organization: every later command runs as you, under your organization and project memberships, and anything outside them answers 404. The session does not expire; `prompton logout` revokes it. See [security](/security).

If the person presses **Deny** the command exits 1 with `login was denied in the browser`; after 15 minutes it exits 1 with `the login request expired`.

After login, with exactly one organization the CLI adopts it as the default. With several, an interactive terminal asks which one; a non-interactive run prints a warning and leaves it unset, so run `prompton use --org <slug|personal>` next. `--org` on `login` picks one up front.

## Configuration and precedence

Every value resolves in the same order: **flag, then environment variable, then config file, then built-in default**. A one-off `--org acme` never disturbs what `prompton use` stored, and CI can set `PTN_TOKEN` with no config file at all.

| Flag | Environment | Config key | Default |
|---|---|---|---|
| `--host` | `PTN_HOST` | `host` | `https://app.prompton.ai` |
| `--token` | `PTN_TOKEN` | `token` | none |
| `--org` | `PTN_ORG` | `org` | none |
| `--project` | `PTN_PROJECT` | `project` | none |

The host is normalized: a trailing slash is dropped, a bare host name gets `https://`, and `localhost`/`127.0.0.1` get `http://`.

Two more variables: `PTN_CONFIG` overrides the config file path, and `PTN_OPENROUTER_KEY` is read by `provider-key set` when `--secret` is absent.

The config file is `~/.config/prompton/config.json` (`$XDG_CONFIG_HOME/prompton/config.json` when `XDG_CONFIG_HOME` is set), written with mode `0600` inside a `0700` directory because it holds the token:

```json
{
  "host": "__APP_URL__",
  "token": "…",
  "user": {"id": "019916f0-…", "email": "ada@example.com"},
  "organizations": [
    {"id": "019916f0-…", "name": "Ada", "personal": true},
    {"id": "019916f1-…", "name": "Acme", "slug": "acme", "personal": false}
  ],
  "org": "acme",
  "project": "helpdesk"
}
```

If this documentation's host, `__APP_URL__`, is not the built-in default, pass `--host __APP_URL__` to `prompton login` (it is then remembered in the file) or export `PTN_HOST=__APP_URL__`.

## Global flags

Available on every command.

| Flag | Effect |
|---|---|
| `--host H` | PromptOn host |
| `--token T` | CLI session token |
| `--org O` | Organization slug, or `personal` |
| `--project P` | Project slug |
| `--json` | Print one JSON document on stdout; progress goes to stderr |
| `--quiet` | Print only essential output |
| `--idempotent` | Treat "already exists" (HTTP 409) as success |
| `--version` | Print the CLI version |

## Commands

### Session

| Command | What it does | Example |
|---|---|---|
| `login [--no-browser] [--org O]` | Browser approval; stores a session token | `prompton login --no-browser` |
| `logout` | Revokes the token server-side, then clears it locally (the host is kept) | `prompton logout` |
| `whoami` | The signed-in user, their organizations, and the active scope | `prompton whoami --json` |
| `orgs list` | Organizations you belong to | `prompton orgs list` |
| `use --org O [--project P]` | Remembers the default scope; both values are verified against the server first | `prompton use --org acme --project helpdesk` |

`whoami --json` prints `{"host", "user", "organizations", "org", "project"}`. `login --json` prints `{"host", "user", "organizations", "org", "config"}` and never the token. `logout --json` prints `{"revoked": true, "config": "<path>"}`; with no stored session it prints `{"revoked": false, "reason": "no stored session"}`. Changing the organization with `use` forgets a remembered project, since projects belong to an organization.

### Projects

| Command | What it does | Example |
|---|---|---|
| `projects list` | The organization's projects | `prompton projects list --json` |
| `projects create <slug> [--name N] [--timezone TZ]` | Creates a project with its `production` and `staging` environments | `prompton projects create helpdesk --name Helpdesk --timezone Etc/UTC` |

The slug is lowercase letters, digits, and hyphens, unique inside the organization. `--name` defaults to the slug; `--timezone` (IANA, for reporting) defaults to `Etc/UTC`.

### Use cases

| Command | What it does | Example |
|---|---|---|
| `use-cases list` | Every call site in the project | `prompton use-cases list` |
| `use-cases get <key>` | The use case with its prompts, recent versions, and live deployments | `prompton use-cases get support_reply --json` |
| `use-cases create <key> [--kind chat\|text\|embedding] [--name N] [--description D] [--input-schema-file F] [--default-params JSON] [--tags a,b]` | Creates a use case; `--kind` defaults to `chat` | `prompton use-cases create support_reply --kind chat --input-schema-file schema.json --default-params '{"temperature":0.5}'` |
| `use-cases update <key> [--name N] [--description D] [--tags a,b] [--input-schema-file F] [--default-params JSON]` | Changes only the flags given; schema and params are replaced, not merged | `prompton use-cases update support_reply --default-params '{"temperature":0.3}'` |

`--input-schema-file` takes a JSON array of fields (`{"name", "type", "required", "description", "example"}`) or an object with an `input_schema` array, so a file copied from a `get --json` response works unchanged; `-` reads stdin. The key and kind cannot change after creation. Aliases: `use-case`, `usecases`.

### Prompts

| Command | What it does | Example |
|---|---|---|
| `prompts open <use-case> <name> [--description D]` | Opens a new prompt name (`default` already exists for chat and text use cases) | `prompton prompts open support_reply ko --description Korean` |
| `prompts commit <use-case> <name> --file F [--engine liquid\|raw] [--message M] [--format auto\|messages\|text]` | Commits an immutable version | `prompton prompts commit support_reply default --file messages.json --message "v1"` |

With `--format auto` (the default) a file holding a JSON array, or an object with a `messages` array, is committed as chat messages; anything else is committed as a text template, so a Liquid template that begins with `{%` is read as text rather than misparsed as JSON. `--file -` reads stdin. Alias: `prompt`.

### Models

| Command | What it does | Example |
|---|---|---|
| `models list` | The project's catalog | `prompton models list` |
| `models register <model-id> [--display-name N] [--provider P]` | Adds a provider model; `--provider` is `openrouter` (default), `groq`, `openai`, `anthropic`, or `google` | `prompton models register openai/gpt-4o-mini` |

For OpenRouter models the server fills display name, pricing, context length, and capabilities from the public catalog; registration still succeeds when that lookup fails. The catalog id it prints is what a deployment pins. Alias: `model`.

### Deployments

| Command | What it does | Example |
|---|---|---|
| `deploy <use-case> --model M [--environment E] [--params JSON] [--provider-options JSON] [--pin name=version ...]` | Commits a revision | `prompton deploy support_reply --environment production --model openai/gpt-4o-mini --params '{"temperature":0.3}' --pin default=1 --pin ko=latest` |
| `deployments list <use-case> [--environment E]` | Without `--environment`: the live revision of every environment. With it: that environment's history, newest first | `prompton deployments list support_reply --environment production` |
| `rollback <use-case> --revision N [--environment E]` | Re-commits a past revision as a new, higher one | `prompton rollback support_reply --environment production --revision 2` |

- `--model` takes a provider string or a catalog UUID. A provider string not yet in the catalog is registered on the way past.
- `--pin name=version` takes a version number, the word `latest`, or a version UUID; it is repeatable. Numbers and `latest` are resolved through `use-cases get`, which carries the 20 most recent versions, so an older version has to be pinned by UUID. Omit `--pin` entirely to pin the newest committed version of every prompt.
- `--environment` defaults to `production` on the server.
- Promotion is the same `deploy` against another `--environment` with the same pins.

Alias: `deployment`.

### Keys

| Command | What it does | Example |
|---|---|---|
| `api-keys issue [--name N] [--scopes read,logs]` | Mints a runtime key for the app; the secret is shown once | `prompton api-keys issue --name 'Helpdesk server' --scopes read,logs` |
| `api-keys list` | Live runtime keys, without secrets | `prompton api-keys list` |
| `provider-key set [--secret S] [--label L]` | Stores the organization's OpenRouter key; the secret comes from `--secret`, then `PTN_OPENROUTER_KEY`, then a hidden prompt | `PTN_OPENROUTER_KEY=sk-or-v1-… prompton provider-key set` |
| `provider-key status` | Whether a key is connected, and its masked hint | `prompton provider-key status` |

`api-keys issue --quiet` prints exactly the secret, for `PTN_KEY=$(prompton api-keys issue --quiet)`. `--name` defaults to `CLI key`; `--scopes` defaults to both. Replacing an existing provider key is done in the web app (`__APP_URL__/{org}/settings?tab=providers`). Alias: `api-key`.

## For programs

### `--json`

Under `--json`, stdout carries exactly one JSON document and nothing else, so `prompton … --json | jq` is always safe. Create and get commands print the object; list commands print `{"projects": [...]}`, `{"use_cases": [...]}`, `{"models": [...]}`, `{"deployments": [...]}`, `{"api_keys": [...]}`, or `{"organizations": [...]}`.

```sh
prompton use-cases get support_reply --json | jq -r '.deployments[].model'
prompton projects list --json | jq -r '.projects[].slug'
```

Failures are JSON too, on stderr, in the API's envelope plus the HTTP `status`:

```json
{
  "error": {
    "code": "not_found",
    "message": "unknown revision: 9",
    "status": 404,
    "details": {"revision": 9, "environment": "production", "available_revisions": [2, 1]}
  }
}
```

A failure that never reached the server (a missing flag, an unreadable file) has `"code": "cli_error"` and no `status`.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | The request was well-formed but did not work: server error, network failure, "already exists" without `--idempotent`, denied or expired login |
| `2` | The invocation was wrong: unknown command or flag, wrong argument count, no organization or project selected, malformed JSON in a flag |

Code 2 always means retyping the command can fix it.

### `--idempotent`

Creating something that already exists is HTTP 409, and the API returns the existing resource inside the error. The CLI prints that resource either way; the flag decides the exit code:

```sh
prompton projects create helpdesk                # exit 1: "already exists"
prompton projects create helpdesk --idempotent   # exit 0: prints the existing project
```

It applies to `projects create`, `use-cases create`, `prompts open`, `models register`, and `provider-key set`. A provisioning script therefore runs cleanly the second time:

```sh
set -e
prompton projects create helpdesk --idempotent --json > project.json
prompton use-cases create support_reply --kind chat --idempotent --json > uc.json
```

## Logging out and other devices

`prompton logout` revokes this machine's session on the server and clears it from the config file; other machines' sessions and your browser login stay signed in. A machine you no longer have is signed out from **Logged-in devices** on `__APP_URL__/account`, which lists each session by the name the CLI sent (`CLI on <hostname>`), its client string, and when it was last used. **Sign out everywhere** on the same page revokes every session at once; each CLI then gets 401 and needs `prompton login` again.
