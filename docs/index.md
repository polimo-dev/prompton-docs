---
title: PromptOn documentation
description: What PromptOn is, the two ways to start, and a map of the other pages.
order: 1
---

# PromptOn documentation

PromptOn is the control plane for your app's LLM prompts. For every **use case** (one per place your code calls a model) and every **environment** it holds one **pin**: a prompt version, a model, and parameters. Your app fetches that configuration (`GET /api/v1/use-cases` or `POST /api/v1/use-cases/:key/prompt`), calls the model provider itself with its own key, and reports each call back as a **log** (`POST /api/v1/logs`). PromptOn is config-fetch, not a proxy: it is never in the request path, it never sees your provider key, and if it is down your app keeps running on the last use-case document it fetched.

## Two ways in

### Paste this into your coding AI

This is the prompt from the landing page. Paste it into Claude Code, Codex, Cursor, or whatever runs in your codebase. It explains PromptOn, checks whether your app is a fit before asking you to sign up for anything, writes a migration plan and waits for your OK, then migrates in a new git worktree and shows you the diff.

```text
Set up PromptOn for this app. Read __DOCS_URL__/agent first and
follow it step by step.

1. Tell me what PromptOn is: one line, a before-and-after code example, why
   it isn't a proxy, and what it automates (picking the model and prompt per
   use case, evaluating logs, catching drift).
2. Make sure you can see this project's code. If you can't, tell me to paste
   this into an AI that can, and stop. If you see several projects, ask which.
3. Check the fit: find every LLM call. PromptOn is for apps whose server calls
   LLM providers for several use cases, each with its own prompt and model.
   If that's not this app, say so and stop.
4. Install the CLI (curl -fsSL __HOME_URL__/install.sh | sh) and run
   `prompton login`. Walk me through signing up and approving it, then wait.
5. Write a migration plan from how our prompts are managed today. Wait for
   my OK.
6. Migrate in a new git worktree (ask me first if this isn't a git repo).
   Use the official PromptOn SDK for our language if there is one; otherwise
   follow the guide's client section. Keep our provider keys and HTTP calls.
   If PromptOn is ever unreachable, keep using the last use-case document you fetched.
7. Show me the diff.
```

The page the first line points at is the [agent reference](/agent): the whole contract on one page, written for a program to read.

### Or do it by hand

The [quickstart](/quickstart) walks through the same result with the CLI and curl in about ten minutes. Everything the CLI does is also in the web app at `__APP_URL__`.

## Signing in for the first time

Sign-up and sign-in are the same step. There are no passwords.

1. Install the CLI: `curl -fsSL __HOME_URL__/install.sh | sh`
2. Run `prompton login`. The CLI prints a link of the form `__APP_URL__/device?code=H4KP-T7WR` together with the code, opens it in your browser, and waits.
3. Open the link if the browser did not open by itself.
4. Sign in with your email address. PromptOn emails you a 6-digit code; type it into the same page. A new address becomes an account, with its own personal organization, the moment its code is accepted.
5. The browser lands back on the device page showing the CLI's name and code. Press **Approve**.
6. The CLI prints `Logged in as you@example.com` and stores a session token in `~/.config/prompton/config.json`. The session does not expire; revoke it with `prompton logout` or from **Logged-in devices** on `__APP_URL__/account`.

## Pages

| Page | What it covers |
|---|---|
| [Concepts](/concepts) | Organizations, projects, environments, use cases, prompts and versions, deployments as pins, models, API keys, monitoring logs, CLI sessions |
| [Quickstart](/quickstart) | Sign in, provision a project with the CLI, fill a prompt with curl, send one log, see it in the app |
| [CLI reference](/cli) | Installation, login, configuration precedence, every command, `--json`, exit codes, `--idempotent` |
| [Runtime API](/api) | The endpoints your app calls with a runtime key: use-case documents, rendered prompts, logs |
| [Management API](/management-api) | The endpoints the CLI calls with a session token: device login, organizations, and provisioning |
| [Agent reference](/agent) | The single page a coding agent reads to migrate an app |
| [Security](/security) | Sign-in, session revocation, encryption at rest, what PromptOn never sees |

## SDKs

There is an official PromptOn SDK for eight languages. Each one is written and tested, lives in its own repository under [polimo-dev](https://github.com/polimo-dev), and is **not on a package registry yet** — until it is, depend on the repository. The [agent reference](/agent) has the install line and the registry check for each.

| Language | Package | Repository |
|---|---|---|
| Python | `prompton-sdk` on PyPI, `import prompton` | [prompton-python](https://github.com/polimo-dev/prompton-python) |
| Node.js / TypeScript | `prompton-sdk` on npm | [prompton-nodejs](https://github.com/polimo-dev/prompton-nodejs) |
| Go | `github.com/polimo-dev/prompton-go` | [prompton-go](https://github.com/polimo-dev/prompton-go) |
| Ruby | `prompton-sdk` on RubyGems, `require "prompton"` | [prompton-ruby](https://github.com/polimo-dev/prompton-ruby) |
| Java | `dev.polimo:prompton-sdk`, package `dev.polimo.prompton` | [prompton-java](https://github.com/polimo-dev/prompton-java) |
| Kotlin | `dev.polimo:prompton-sdk`, package `dev.polimo.prompton` | [prompton-kotlin](https://github.com/polimo-dev/prompton-kotlin) |
| Rust | crate `prompton-sdk`, `use prompton::…` | [prompton-rust](https://github.com/polimo-dev/prompton-rust) |
| Elixir | `prompton_sdk` on Hex, module `PromptOnSDK` | [prompton-elixir](https://github.com/polimo-dev/prompton-elixir) |

All eight implement the same contract: a 10-second use-case document cache with ETag polling, a memory → disk → bundled use-case document fallback so your app keeps running when PromptOn is unreachable, local prompt rendering, and batched logs. They call no external service of their own. For any other language, your coding agent writes the client from the [agent reference](/agent).

## Source code

PromptOn is on GitHub under [polimo-dev](https://github.com/polimo-dev): [prompton](https://github.com/polimo-dev/prompton) — the server (FSL-1.1-ALv2) · [prompton-cli](https://github.com/polimo-dev/prompton-cli) — the CLI (Apache-2.0) · the eight SDK repositories listed above (Apache-2.0) · [prompton-home](https://github.com/polimo-dev/prompton-home) — the landing page (MIT) · [prompton-docs](https://github.com/polimo-dev/prompton-docs) — this site (MIT for the code, CC BY 4.0 for the pages).
