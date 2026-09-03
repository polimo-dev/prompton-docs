---
title: PromptOn documentation
description: What PromptOn is, the two ways to start, and a map of the other pages.
order: 1
---

# PromptOn documentation

PromptOn is the control plane for your app's LLM prompts. For every **use case** (one per place your code calls a model) and every **environment** it holds one **pin**: a prompt version, a model, and parameters. Your app fetches that configuration (`GET /api/v1/snapshot` or `POST /api/v1/resolve`), calls the model provider itself with its own key, and reports each call back as a **monitoring log** (`POST /api/v1/generations`). PromptOn is config-fetch, not a proxy: it is never in the request path, it never sees your provider key, and if it is down your app keeps running on the last snapshot it fetched.

## Two ways in

### Paste this into your coding AI

This is the prompt from the landing page. Paste it into Claude Code, Codex, Cursor, or whatever runs in your codebase; it installs the CLI, migrates every LLM call, and shows you the diff first.

```text
Set up PromptOn for this app.

1. Install the CLI (curl -fsSL __HOME_URL__/install.sh | sh) and run
   `prompton login`. Wait for me to approve it in the browser.
2. Find every LLM call in this codebase. For each one, create a use case in
   PromptOn, move its prompt and model there, and deploy it to production.
3. Change each call to fetch its prompt, model, and parameters from PromptOn.
   Keep our own API keys and HTTP calls — PromptOn is config, not a proxy.
4. Report each call's result to PromptOn as a monitoring log.
5. Show me the diff before you change anything.

Everything you need is here: __DOCS_URL__/agent
```

The page the last line points at is the [agent reference](/agent): the whole contract on one page, written for a program to read.

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
| [Quickstart](/quickstart) | Sign in, provision a project with the CLI, resolve a prompt with curl, send one monitoring log, see it in the app |
| [CLI reference](/cli) | Installation, login, configuration precedence, every command, `--json`, exit codes, `--idempotent` |
| [Runtime API](/api) | The endpoints your app calls with a runtime key: snapshot, resolve, generations |
| [Management API](/management-api) | The endpoints the CLI calls with a session token: device login, organizations, and provisioning |
| [Agent reference](/agent) | The single page a coding agent reads to migrate an app |
| [Security](/security) | Sign-in, session revocation, encryption at rest, what PromptOn never sees |

## Source code

PromptOn is on GitHub under [polimo-dev](https://github.com/polimo-dev): [prompton](https://github.com/polimo-dev/prompton) — the server and the Elixir SDK (FSL-1.1-ALv2; the SDK is Apache-2.0) · [prompton-cli](https://github.com/polimo-dev/prompton-cli) — the CLI (Apache-2.0) · [prompton-home](https://github.com/polimo-dev/prompton-home) — the landing page (MIT) · [prompton-docs](https://github.com/polimo-dev/prompton-docs) — this site (MIT for the code, CC BY 4.0 for the pages).
