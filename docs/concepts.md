---
title: Concepts
description: The objects PromptOn is built from and how they relate, from organization down to a single monitoring log.
order: 2
---

# Concepts

```text
Organization ── provider key (BYOK) · members
  └─ Project ── runtime API keys · environments (production, staging)
       └─ Use case ── prompts by name (default, ko, …) ── immutable versions
                   └─ deployment revisions (pins), one live per environment
```

Everything below is addressed by name in URLs and in the API: an organization by slug (or `personal`), a project by slug, a use case by key, a prompt by name, an environment by slug. UUIDs appear only where a pin points at a catalog model or a prompt version.

## Organization

The top-level account boundary. Every user has a **personal** organization, created on first sign-in. It has no slug; in URLs and API paths it is the reserved segment `personal` (`__APP_URL__/personal`, `/api/v1/orgs/personal/…`). A **team** organization has a slug (`acme-inc`) and members. The organization owns the BYOK provider key, its members, and usage reporting. Turning a personal organization into a team one is a matter of claiming a slug on `__APP_URL__/personal/settings?tab=general`.

## Project

A project belongs to one organization and is identified by a slug that is unique inside that organization (`heydiary`). It owns the runtime API keys, the environments, the model catalog, and the default payload policy for monitoring logs. Web URL: `__APP_URL__/{org}/{project}`.

## Environment

Every project is created with two environments: `production` (protected) and `staging`. A deployment is committed to one environment, and a runtime request names the environment it wants with the `environment` parameter (default `production`). Runtime keys are not tied to an environment; one key reads both.

## Use case

One use case per place your app calls an LLM. Its **key** (`diary_generation`, lowercase `[a-z0-9_]` starting with a letter) is the app's contract and cannot be renamed; make a new use case instead. Fields:

| Field | Meaning |
|---|---|
| `kind` | `chat` (a list of messages), `text` (one template string), or `embedding` (no prompt at all) |
| `input_schema` | Declared variables: `name`, `type` (`string`, `number`, `boolean`, `list`, `map`), `required`, `description`, `example`. It documents what the template expects and is carried in the snapshot; values are not validated against it |
| `default_params` | Model parameters a deployment's `params` are layered over |
| `name`, `description`, `tags` | For people |

A `chat` or `text` use case is born with one prompt named `default`.

## Prompt

A named prompt document inside a use case. The name is what the app sends as its `prompt` request parameter, so one use case can serve several variants: `default`, `ko`, a tenant-specific one. Requesting a name the live deployment does not pin is an error, never a silent fallback to `default`.

## Prompt version

Versions are immutable. Committing writes a new version with the next `number`; there is no edit. A version holds either `messages` (chat) or `text_template` (text), an `engine` (`liquid` by default, or `raw` for verbatim text), a commit `message`, and `detected_variables` extracted from the template. Liquid templates are linted at commit time: allowed tags are `for`, `if`, `unless`, `assign`, `break`, `continue`; allowed filters are `size`, `join`, `default`; whitespace-control markers (`{%-`, `-%}`) are rejected. Committing a version changes nothing at runtime.

## Deployment (a pin)

A deployment revision is a pin, not a router. Per (use case, environment) it holds exactly four things:

| Field | Meaning |
|---|---|
| `model_id` | The catalog UUID of one model |
| `params` | Layered over the use case's `default_params` |
| `provider_options` | Layered over the model's `provider_options` |
| `prompt_pins` | `{"<prompt name>": "<prompt version id>"}` for every name the app may request; `{}` for `embedding` |

There are no rules, weights, conditions, or A/B splits. The revision is live the moment it is committed; the highest revision in an environment is the live one. **Rollback** re-commits an older revision's pins as a new, higher revision, so history is never rewritten. **Promotion** is committing the same pins to another environment.

## Model

Each project has a model catalog. A catalog entry has an `id` (the UUID a deployment pins), a `provider` (`openrouter` by default; also `groq`, `openai`, `anthropic`, `google`), and a provider-side `model_id` string such as `anthropic/claude-sonnet-4`, plus `display_name`, `pricing` (USD per million tokens), `context_length`, `capabilities`, and `status` (`active` or `deprecated`). For OpenRouter models the server fills display name, pricing, and context length from the public OpenRouter catalog when you do not supply them. Deploying with a provider string that is not in the catalog registers it on the way past.

The organization's **provider key** is a BYOK OpenRouter key. PromptOn uses it only where PromptOn itself calls a model: the arena and AI drafts. Your app's own traffic never needs it, so onboarding finishes without one.

## Runtime API key

A key your app puts in its environment. It belongs to one project, looks like `ptn_<project_slug>_<random>`, and carries scopes: `resolve` for config-fetch (`GET /snapshot`, `POST /resolve`) and `logs` for monitoring logs (`POST /generations`). The secret is shown once, at issue time; the server stores a hash and later lists only the `key_prefix`. A runtime key cannot call the management API.

## Monitoring log

One record per model call your app made, sent in batches to `POST /api/v1/generations` after the call: which use case and deployment revision, which model, tokens, cost, latency, stop reason, and whether it failed. Because PromptOn is not in the request path, these logs are its only view of production; send failures too. Input and output payloads are stored according to the use case's **payload policy** (`mode` `full`, `hash`, or `none`; `sample_rate`; `max_bytes`; `retention_days`; `encrypt`) and are encrypted at rest.

## CLI session

`prompton login` obtains a session token for **you**, not for an organization. Every CLI call runs as you, under your organization and project memberships. Sessions do not expire; they end only when revoked, by `prompton logout` on that machine, per device under **Logged-in devices** on `__APP_URL__/account`, or all at once with **Sign out everywhere** on the same page. A session token cannot call the runtime API.
