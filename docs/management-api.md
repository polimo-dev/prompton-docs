---
title: Management API
description: The provisioning API behind the CLI — device login, sessions, organizations, and everything under /api/v1/orgs/:org.
order: 6
---

# Management API

The management API creates things: projects, use cases, prompts and versions, models, deployments, and keys. The CLI is a thin client over it, and a coding agent or a script can call it directly. It is a different layer from the [runtime API](/api), with a different credential:

| | Management API | Runtime API |
|---|---|---|
| Credential | A **CLI session token** for one user, from `prompton login` | A **runtime key** `ptn_<project_slug>_…` for one project |
| Caller | CLI, coding agents, scripts | The app at runtime |
| Does | Creates and reads configuration | Fetches configuration, sends monitoring logs |
| Paths | `/api/v1/me`, `/api/v1/sessions/revoke`, `/api/v1/orgs/…` | `/api/v1/snapshot`, `/api/v1/resolve`, `/api/v1/generations` |

Neither credential opens the other door: a runtime key on a management path is `401`, and a session token on `/snapshot` is `401`.

There are no organization-level machine keys. Every call runs as the signed-in user, and what it may do is exactly what that user's organization and project memberships allow.

## Conventions

| Item | Value |
|---|---|
| Base URL | `__APP_URL__/api/v1` |
| Authentication | `Authorization: Bearer <CLI session token>` on everything except the two device-login endpoints |
| Organization | Chosen by the path: `/orgs/:org/…`, where `:org` is a team slug or the reserved segment `personal` |
| Format | JSON; snake_case; ids are bare UUID strings; timestamps are ISO 8601 UTC |
| Success bodies | Bare objects. Lists are an object with one plural key: `{"projects": [...]}` |
| Status codes | Read `200`, create `201`, update and rollback `200` |
| Unknown request fields | Ignored |

### Errors

Same envelope as the runtime API: `{"error": {"code", "message", "details"}}`.

| HTTP | `code` | When |
|---|---|---|
| 400 | `invalid_request` | Missing or mistyped field, or a domain validation failure (`details.errors` as `[{"field", "message"}]`) |
| 401 | `unauthorized` | Token missing, wrong, revoked, or not a CLI session (a browser session or a runtime key) |
| 403 | `forbidden` | An action this user's membership does not allow |
| 404 | `not_found` | An organization the user is not a member of, or an unknown name. Other people's resources are `404`, never `403` |
| 409 | `conflict` | Creating something that already exists. `details` carries the existing resource |
| 500 | `internal_error` | Server error |

The device-token endpoint additionally uses the four RFC 8628 codes described below.

### Addressing is by name

Paths carry no UUIDs: `:org` is a slug or `personal`, `:project` a project slug, `:key` a use case key, `:name` a prompt name, and `environment` an environment slug. UUIDs appear in two places only, both taken from the previous step's response: the catalog model id a deployment pins (`model_id`) and the prompt version ids in `prompt_pins`.

### Foreign organizations are 404

A project lookup is anchored to the organization in the path. A slug that exists in another organization, an organization you are not a member of, and an archived project all answer `404`; the API does not reveal what exists elsewhere. `GET /orgs` lists what you can choose from.

### 409 is idempotency, not failure

Provisioning scripts run twice. Creating a project, use case, prompt, model, or provider key that already exists answers `409`, and `details` holds that resource, so the caller continues with it without a second lookup:

```json
{
  "error": {
    "code": "conflict",
    "message": "a project with key heydiary already exists",
    "details": {
      "project": {
        "id": "019916f3-6a2e-7c41-8b5d-1f0a9c3e7d21", "slug": "heydiary", "name": "HeyDiary",
        "timezone": "Etc/UTC", "created_at": "2026-09-03T04:10:11.402113Z",
        "environments": [
          {"id": "019916f3-6a31-7d8a-9c02-4e5b7a1d0f33", "slug": "production", "name": "Production", "protected": true},
          {"id": "019916f3-6a31-7d8a-9c02-4e5b7a1d0f34", "slug": "staging", "name": "Staging", "protected": false}
        ]
      }
    }
  }
}
```

The key under `details` is `project`, `use_case`, `prompt`, `model`, or `provider_key`. The CLI's `--idempotent` flag turns these into exit 0.

### Two meanings of `model_id`

| Where | Meaning |
|---|---|
| A model object's `id` | The catalog entry's UUID |
| A model object's `model_id`, and `model_id` in `POST /models` | The provider-side string (`anthropic/claude-sonnet-4`) |
| A deployment's `model_id`, and `model_id` in `POST /deployments` | The catalog entry's UUID |
| A deployment's `model`, and `model` in `POST /deployments` | The provider-side string |

Deployments pin by UUID; the catalog registers by string. `POST /deployments` accepts the string too and registers it for you.

## Device login

`prompton login` is an RFC 8628 device flow in three steps. The two endpoints are unauthenticated; the human authenticates in the browser.

```text
1. CLI    POST /api/v1/device/code                      → {device_code, user_code, verification_uri, …}
2. Human  opens verification_uri_complete, signs in with the emailed 6-digit code, presses Approve
3. CLI    POST /api/v1/device/token every `interval` s   → {token, user, organizations}
```

### POST /device/code

```json
{"client": "prompton-cli/0.1.0 (darwin/arm64)", "name": "CLI on lain"}
```

`client` is required and is shown on the approval screen. `name` is an optional label of at most 200 characters; it becomes the device's name under **Logged-in devices** on the account page.

```json
{
  "device_code": "TFzZ…",
  "user_code": "H4KP-T7WR",
  "verification_uri": "__APP_URL__/device",
  "verification_uri_complete": "__APP_URL__/device?code=H4KP-T7WR",
  "expires_in": 900,
  "interval": 5
}
```

`201`. `device_code` is a secret only the CLI holds (at least 256 bits; the server stores its SHA-256). `user_code` is 8 characters, upper-case letters and digits without look-alikes, in the form `XXXX-XXXX`; entry is case- and hyphen-insensitive. The request expires after `expires_in` seconds (15 minutes).

### The browser page `/device`

Shows the signed-in user the client name and code and asks **Approve** or **Deny**. Opened while signed out, it goes to `/sign-in` and returns with the code once the user is in. Sign-in is by emailed 6-digit code only: the user enters an address, gets a code valid for 5 minutes, and types it in. A new address becomes an account, with a personal organization, on its first accepted code. There is no organization picker on the page, because what is issued is the user's session, not an organization credential; the organization is chosen per command (`--org`) or by the CLI config file.

### POST /device/token

```json
{"device_code": "TFzZ…"}
```

After approval, exactly once, `200`:

```json
{
  "token": "eyJhbGciOi…",
  "user": {"id": "019916f0-3a1b-7c2d-8e4f-5a6b7c8d9e0f", "email": "ada@example.com"},
  "organizations": [
    {"id": "019916f0-3a1c-7d3e-9f50-6b7c8d9e0f1a", "name": "Ada", "slug": null, "personal": true, "created_at": "2026-09-03T04:05:00.000000Z"},
    {"id": "019916f1-4b2c-7e4f-a061-7c8d9e0f1a2b", "name": "Acme", "slug": "acme-inc", "personal": false, "created_at": "2026-09-01T10:00:00.000000Z"}
  ]
}
```

While waiting, every answer is `400` and `error.code` says why:

| `code` | Meaning | What the CLI does |
|---|---|---|
| `authorization_pending` | Not approved yet | Wait `interval` seconds, poll again |
| `slow_down` | Polled faster than `interval` | Add 5 seconds to the interval, poll again |
| `expired_token` | The 15 minutes passed, the token was already collected, or the code never existed | Stop; run `prompton login` again |
| `access_denied` | The human pressed Deny | Stop |

An unknown code answers `expired_token` rather than `404`, so an unauthenticated caller cannot probe which codes exist.

Both endpoints are rate-limited per client IP: `/device/code` 20 requests per 10 minutes, `/device/token` 600 per 10 minutes. Over the limit: `429` with `{"error": {"code": "rate_limited", "message": "…", "details": {"retry_after": <seconds>}}}` and a `Retry-After` header. Expired requests are swept every 15 minutes; a token that was approved but never collected is revoked then.

### The CLI session token

| | |
|---|---|
| Form | A user JWT whose `purpose` claim is `cli` |
| Lifetime | None. It ends only by revocation: `POST /sessions/revoke` (`prompton logout`), a device's **Log out** under **Logged-in devices** on `__APP_URL__/account`, or **Sign out everywhere** on the same page |
| Storage | The server's token table, so revocation is immediate |
| Header | `Authorization: Bearer <token>` |

A browser session token does not open this API (`401`): its `purpose` is `user`. Authenticated calls stamp the session's last-used time at 5-minute resolution, which is what the device list shows.

## Session

### GET /me

```sh
curl -sS "__APP_URL__/api/v1/me" -H "Authorization: Bearer $PTN_TOKEN"
```

```json
{
  "user": {"id": "019916f0-3a1b-7c2d-8e4f-5a6b7c8d9e0f", "email": "ada@example.com"},
  "organizations": [
    {"id": "019916f0-3a1c-7d3e-9f50-6b7c8d9e0f1a", "name": "Ada", "slug": null, "personal": true, "created_at": "2026-09-03T04:05:00.000000Z"}
  ]
}
```

The same shape as the device-token response, so a client needs one parser.

### POST /sessions/revoke

Revokes **this** token and nothing else; other machines and the browser stay signed in.

```sh
curl -sS -X POST "__APP_URL__/api/v1/sessions/revoke" -H "Authorization: Bearer $PTN_TOKEN"
```

```json
{"revoked": true}
```

The next call with the same token is `401`.

## Organizations

### GET /orgs

Every organization the user can provision into, personal first.

```json
{
  "organizations": [
    {"id": "019916f0-3a1c-7d3e-9f50-6b7c8d9e0f1a", "name": "Ada", "slug": null, "personal": true, "created_at": "…"},
    {"id": "019916f1-4b2c-7e4f-a061-7c8d9e0f1a2b", "name": "Acme", "slug": "acme-inc", "personal": false, "created_at": "…"}
  ]
}
```

A personal organization has `"slug": null` and is addressed as `personal`; a team organization is addressed by its `slug`.

### GET /orgs/:org

One organization, same shape as a list entry. A non-member or an unknown slug is `404` with `details.organization` set to the value sent.

## Provisioning order

```text
0. prompton login                                          device flow → session token
1. GET  /me  or  GET /orgs                                 where can I create things?
2. POST /orgs/:org/projects                                {key, name}
3. POST /orgs/:org/projects/:project/use-cases             one per call site
4. POST /…/use-cases/:key/prompts                          second and later names only; default exists
5. POST /…/use-cases/:key/prompts/:name/versions           the app's current prompt, verbatim, as v1
6. POST /orgs/:org/projects/:project/models                optional; step 7 registers on the fly
7. POST /…/use-cases/:key/deployments                      the app's current model and params, as revision 1
8. POST /orgs/:org/projects/:project/api-keys              the runtime key; the secret appears once, here
9. POST /orgs/:org/provider-key                            optional; only for the arena and AI drafts
```

Onboarding is done after step 8, when the runtime key answers `POST /api/v1/resolve`.

In the examples below `$PTN_TOKEN` is a CLI session token and `:org` is `personal` or a team slug.

## Projects

### GET /orgs/:org/projects

```json
{
  "projects": [
    {
      "id": "019916f3-6a2e-7c41-8b5d-1f0a9c3e7d21", "slug": "heydiary", "name": "HeyDiary", "timezone": "Etc/UTC",
      "created_at": "2026-09-03T04:10:11.402113Z",
      "environments": [
        {"id": "019916f3-6a31-7d8a-9c02-4e5b7a1d0f33", "slug": "production", "name": "Production", "protected": true},
        {"id": "019916f3-6a31-7d8a-9c02-4e5b7a1d0f34", "slug": "staging", "name": "Staging", "protected": false}
      ]
    }
  ]
}
```

Archived projects are absent here and `404` when addressed.

### POST /orgs/:org/projects

```sh
curl -sS -X POST "__APP_URL__/api/v1/orgs/personal/projects" \
  -H "Authorization: Bearer $PTN_TOKEN" -H 'content-type: application/json' \
  -d '{"key": "heydiary", "name": "HeyDiary", "timezone": "Asia/Seoul"}'
```

| Field | Required | Notes |
|---|---|---|
| `key` | yes | The project slug: lowercase letters, digits, hyphens; unique in the organization. `slug` is accepted as an alias |
| `name` | no | Defaults to `key` |
| `timezone` | no | IANA name; defaults to `Etc/UTC` |

`201` with the same shape as a list entry. `production` (protected) and `staging` are created in the same transaction. Errors: missing or malformed `key`, or a reserved word (`settings`, `members`, `usage`, `api-keys`, `use-cases`, …) → `400`; existing key → `409` with `details.project`.

## Use cases

### GET /orgs/:org/projects/:project/use-cases

```json
{
  "use_cases": [
    {
      "id": "019916f4-12b0-7e6c-a1d3-8c9f2b4e6a57", "key": "diary_generation", "name": "Diary generation",
      "description": null, "kind": "chat",
      "input_schema": [{"name": "transcriptions", "type": "list", "required": true, "description": null, "example": null}],
      "default_params": {"temperature": 0.5}, "tags": [],
      "created_at": "2026-09-03T04:11:02.917345Z"
    }
  ]
}
```

### POST /orgs/:org/projects/:project/use-cases

```sh
curl -sS -X POST "__APP_URL__/api/v1/orgs/personal/projects/heydiary/use-cases" \
  -H "Authorization: Bearer $PTN_TOKEN" -H 'content-type: application/json' \
  -d '{"key": "diary_generation", "name": "Diary generation", "kind": "chat",
       "input_schema": [{"name": "transcriptions", "type": "list", "required": true}],
       "default_params": {"temperature": 0.5}, "tags": ["diary"]}'
```

| Field | Required | Notes |
|---|---|---|
| `key` | yes | Lowercase `[a-z0-9_]`, starting with a letter. Cannot change later |
| `name` | no | Defaults to `key` |
| `kind` | no | `chat` (default), `text`, `embedding` |
| `description` | no | |
| `input_schema` | no | Array of `{"name", "type", "required", "description", "example"}`; `type` is `string`, `number`, `boolean`, `list`, or `map` (default `string`). Declarative: values are not validated against it |
| `default_params` | no | Object; a deployment's `params` are layered over it |
| `tags` | no | Array of strings |

`201` with the object above. A `chat` or `text` use case is created together with a prompt named `default`; `embedding` has no prompts. Errors: missing `key`, unknown `kind`, malformed `input_schema` → `400`; existing key → `409` with `details.use_case`.

### GET /orgs/:org/projects/:project/use-cases/:key

Everything about one use case in one call: the use case, each prompt with its 20 most recent version summaries, and the live deployment of every environment.

```json
{
  "id": "019916f4-12b0-7e6c-a1d3-8c9f2b4e6a57", "key": "diary_generation", "name": "Diary generation",
  "description": null, "kind": "chat",
  "input_schema": [{"name": "transcriptions", "type": "list", "required": true, "description": null, "example": null}],
  "default_params": {"temperature": 0.5}, "tags": [], "created_at": "2026-09-03T04:11:02.917345Z",
  "prompts": [
    {
      "id": "019916f4-12b8-7f01-b2e4-0d1a3c5e7f89", "name": "default", "description": null, "created_at": "…",
      "version_count": 2,
      "versions": [
        {"id": "019916fb-…", "number": 2, "message": "shorter", "detected_variables": ["transcriptions"], "created_at": "…"},
        {"id": "019916f5-3c7d-7a12-9e8f-6b4d2a0c1e93", "number": 1, "message": "migrated from the app's hardcoded prompt", "detected_variables": ["transcriptions"], "created_at": "…"}
      ]
    },
    {"id": "019916fa-…", "name": "ko", "description": "Korean", "created_at": "…", "version_count": 1, "versions": [{"id": "019916fa-1b2c-7d3e-8f4a-5b6c7d8e9f01", "number": 1, "message": null, "detected_variables": ["transcriptions"], "created_at": "…"}]}
  ],
  "deployments": [
    {
      "id": "019916f7-8b19-7c56-a3e2-5d0f1b7c9e64", "revision": 3, "environment": "production",
      "model_id": "019916f6-0e5a-7b34-8d1c-2f7e9a3b5c48", "model": "anthropic/claude-sonnet-4",
      "params": {"temperature": 0.4}, "provider_options": {"only": ["Anthropic"]},
      "prompt_pins": {"default": "019916fb-…", "ko": "019916fa-1b2c-7d3e-8f4a-5b6c7d8e9f01"},
      "created_at": "…"
    }
  ]
}
```

Environments without a deployment are absent from `deployments`. Unknown key → `404` with `details.use_case`.

### PATCH /orgs/:org/projects/:project/use-cases/:key

Changes only the fields present in the body; the three groups may be mixed in one request.

```json
{"name": "…", "description": "…", "tags": ["…"],
 "input_schema": [{"name": "b", "type": "number", "required": true}],
 "default_params": {"temperature": 0.9, "max_tokens": 512}}
```

`input_schema` and `default_params` are replaced, not merged. An empty body `{}` changes nothing and returns the use case. `key` and `kind` cannot be changed. A field of the wrong shape is `400` (`default_params must be an object`).

## Prompts and versions

### POST /orgs/:org/projects/:project/use-cases/:key/prompts

```json
{"name": "ko", "description": "Korean"}
```

`201`:

```json
{"id": "019916fa-2c3d-7e4f-9a5b-6c7d8e9f0a1b", "name": "ko", "description": "Korean", "created_at": "…"}
```

The name is what the app sends as `prompt`. `default` already exists for chat and text use cases; opening it again is `409` with `details.prompt`. Missing `name` → `400`.

### POST /orgs/:org/projects/:project/use-cases/:key/prompts/:name/versions

```sh
curl -sS -X POST "__APP_URL__/api/v1/orgs/personal/projects/heydiary/use-cases/diary_generation/prompts/default/versions" \
  -H "Authorization: Bearer $PTN_TOKEN" -H 'content-type: application/json' \
  -d '{"messages": [{"role": "system", "content": "You write diaries from voice transcriptions."},
                    {"role": "user", "content": "Write a diary from:\n\n{% for t in transcriptions %}{{ forloop.index }}. {{ t }}\n{% endfor %}"}],
       "engine": "liquid", "message": "migrated from the app'"'"'s hardcoded prompt"}'
```

| Field | Required | Notes |
|---|---|---|
| `messages` | for `chat` | Array of `{"role", "content"}` (both strings; optional `name`) |
| `text_template` | for `text` | One string |
| `engine` | no | `liquid` (default) or `raw` |
| `message` | no | Commit message |

`201`:

```json
{
  "id": "019916f5-3c7d-7a12-9e8f-6b4d2a0c1e93", "prompt_id": "019916f4-12b8-7f01-b2e4-0d1a3c5e7f89",
  "number": 1, "engine": "liquid",
  "messages": [{"role": "system", "content": "You write diaries from voice transcriptions."},
               {"role": "user", "content": "Write a diary from:\n\n{% for t in transcriptions %}{{ forloop.index }}. {{ t }}\n{% endfor %}"}],
  "text_template": null,
  "detected_variables": ["transcriptions"],
  "message": "migrated from the app's hardcoded prompt",
  "content_sha256": "…", "created_at": "…"
}
```

Versions are immutable; committing again yields `number + 1`. Committing alone changes nothing at runtime. Liquid templates are linted on commit (tags `for`, `if`, `unless`, `assign`, `break`, `continue`; filters `size`, `join`, `default`; no whitespace control), and `detected_variables` is the list of top-level variables found, ready to mirror into `input_schema`. Errors: content that does not match the use case's kind, a lint failure, a message without `role` or `content` → `400`; unknown prompt name → `404` with `details.prompt` and `details.available_prompts`.

## Models

### GET /orgs/:org/projects/:project/models

```json
{
  "models": [
    {
      "id": "019916f6-0e5a-7b34-8d1c-2f7e9a3b5c48",
      "provider": "openrouter", "model_id": "anthropic/claude-sonnet-4", "display_name": "Anthropic: Claude Sonnet 4",
      "metadata": {}, "provider_options": {"only": ["Anthropic"]},
      "pricing": {"input_per_m": 3.0, "output_per_m": 15.0, "currency": "USD", "unit": "token"},
      "context_length": 200000, "capabilities": ["tools", "streaming"],
      "status": "active", "created_at": "…"
    }
  ]
}
```

Archived entries are excluded; `deprecated` ones remain, since a live deployment may still pin them.

### POST /orgs/:org/projects/:project/models

```json
{"model_id": "anthropic/claude-sonnet-4",
 "provider": "openrouter",
 "display_name": "Claude Sonnet 4",
 "metadata": {"description_key": "chat_model.sonnet4"},
 "provider_options": {"only": ["Anthropic"]},
 "pricing": {"input_per_m": 3.0, "output_per_m": 15.0, "currency": "USD", "unit": "token"},
 "context_length": 200000,
 "capabilities": ["tools", "streaming"],
 "status": "active"}
```

Only `model_id` is required. `provider` defaults to `openrouter` (also `groq`, `openai`, `anthropic`, `google`); `capabilities` are from `tools`, `vision`, `json_mode`, `reasoning`, `streaming`; `status` is `active` or `deprecated`; `pricing` is USD per million tokens. For OpenRouter models, `display_name`, `pricing`, `context_length`, and `capabilities` you leave out are filled from the public OpenRouter catalog; if that lookup fails, registration still succeeds with `display_name` equal to `model_id`. `201` with the list-entry shape. Errors: missing `model_id`, negative pricing → `400`; existing `(provider, model_id)` → `409` with `details.model`.

## Deployments

### GET /orgs/:org/projects/:project/use-cases/:key/deployments

| Query | Returns |
|---|---|
| none | The live revision of each environment |
| `?environment=staging` | Every revision of that environment, newest first |

```json
{
  "deployments": [
    {
      "id": "019916f7-8b19-7c56-a3e2-5d0f1b7c9e64", "revision": 3, "environment": "production",
      "model_id": "019916f6-0e5a-7b34-8d1c-2f7e9a3b5c48", "model": "anthropic/claude-sonnet-4",
      "params": {"temperature": 0.4}, "provider_options": {"allow_fallbacks": false},
      "prompt_pins": {"default": "019916fb-…", "ko": "019916fa-1b2c-7d3e-8f4a-5b6c7d8e9f01"},
      "created_at": "…"
    }
  ]
}
```

### POST /orgs/:org/projects/:project/use-cases/:key/deployments

```sh
curl -sS -X POST "__APP_URL__/api/v1/orgs/personal/projects/heydiary/use-cases/diary_generation/deployments" \
  -H "Authorization: Bearer $PTN_TOKEN" -H 'content-type: application/json' \
  -d '{"environment": "production", "model": "anthropic/claude-sonnet-4",
       "params": {"temperature": 0.4}, "provider_options": {"allow_fallbacks": false}}'
```

| Field | Required | Notes |
|---|---|---|
| `environment` | no | Default `production` |
| `model_id` | one of the two | Catalog UUID |
| `model` | one of the two | Provider string; found in the catalog or registered as an OpenRouter model. `model_id` wins if both are sent |
| `prompt_pins` | no | `{"<name>": "<version id>"}`. Omitted: the newest committed version of every prompt |
| `params` | no | Layered over the use case's `default_params` |
| `provider_options` | no | Layered over the model's `provider_options` |

`201` with the deployment shape above; `revision` is one higher than the previous revision in that environment, and it is live immediately. Rules: if the use case has a `default` prompt it must end up pinned; an `embedding` use case pins `{}`; a revision has no commit message (the prompt version's `message` and the revision number say what changed). Errors: neither `model_id` nor `model` → `400`; unknown `model_id` → `404` with `details.model_id`; unknown environment → `404` with `details.environment`; nothing committed to pin → `400` (`this use case has no committed prompt version to pin`); a pin naming a prompt the use case lacks, or `prompt_pins` not an object of strings → `400`.

Promotion is this request again with another `environment` and the same `model_id` and `prompt_pins`.

### POST /orgs/:org/projects/:project/use-cases/:key/deployments/rollback

```json
{"environment": "production", "revision": 1}
```

`revision` is a positive integer (not a string); `environment` defaults to `production`. `200` with a new revision carrying the old pins: rollback re-commits, it does not rewind. Unknown revision → `404` with `{"revision": 9, "environment": "production", "available_revisions": [2, 1]}`.

## Runtime API keys

### GET /orgs/:org/projects/:project/api-keys

```json
{
  "api_keys": [
    {"id": "019916f8-4d2c-7e78-b5f1-7a3c9d0e2f16", "name": "HeyDiary server", "key_prefix": "ptn_heydiary_a1b",
     "scopes": ["resolve", "logs"], "last_used_at": "2026-09-03T05:00:00.000000Z", "created_at": "…"}
  ]
}
```

No secrets; revoked keys are absent.

### POST /orgs/:org/projects/:project/api-keys

```json
{"name": "HeyDiary server", "scopes": ["resolve", "logs"]}
```

`name` defaults to `CLI key`; `scopes` defaults to both. `201`:

```json
{
  "id": "019916f8-4d2c-7e78-b5f1-7a3c9d0e2f16", "name": "HeyDiary server", "key_prefix": "ptn_heydiary_a1b",
  "scopes": ["resolve", "logs"], "last_used_at": null, "created_at": "…",
  "key": "ptn_heydiary_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

`key` appears in this response only; the server keeps a SHA-256 hash, and `key_prefix` is the first 16 characters. Keys are not tied to an environment. An unknown scope, or `scopes` that is not an array of strings, is `400`.

## Provider key

The organization's BYOK OpenRouter key. It lives outside the project path because the organization owns it. PromptOn uses it only where PromptOn itself calls a model (the arena, AI drafts); the app's own traffic never needs it.

### GET /orgs/:org/provider-key

```json
{"connected": false, "provider": "openrouter"}
```

or, once registered:

```json
{"connected": true, "id": "019916fc-…", "provider": "openrouter", "label": "default",
 "hint": "sk-or-v1-••••4Xa2", "last_used_at": null, "created_at": "…"}
```

### POST /orgs/:org/provider-key

```json
{"secret": "sk-or-v1-…", "label": "default"}
```

`secret` is required; `label` defaults to `default`. `201` with the connected shape. The secret is encrypted at rest (AES-256-GCM) and never returned; only the masked `hint` is. An existing key with the same label → `409` with `details.provider_key`; another label is allowed. Replacing a key is done in the web app at `__APP_URL__/{org}/settings?tab=providers`.

## What a session token cannot do

Its permissions are the user's, no more and no less:

- Organizations the user is not a member of are invisible (`404`, and absent from `GET /orgs`).
- Archiving and deleting projects, use cases, prompts, and models exist only in the web app.
- Creating organizations, changing their name or slug, inviting members, adding or removing environments, and changing a project's payload policy are web-app actions.
- The runtime endpoints `/snapshot`, `/resolve`, `/generations` need a runtime key (`401` otherwise).
