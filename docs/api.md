---
title: Runtime API
description: The three endpoints an app calls with a runtime key — use-case documents, rendered prompts, and logs — with every field, error, and limit.
order: 5
---

# Runtime API

The runtime API does two things: it hands your app its configuration (**config-fetch**: `GET /use-cases`, `POST /use-cases/:key/prompt`) and it receives what happened (**logs**: `POST /logs`). Your app calls the model provider itself, with its own key. There is no proxy endpoint. Provisioning (creating projects, use cases, prompts, deployments, keys) is a different layer with a different credential; see the [management API](/management-api).

## Conventions

| Item | Value |
|---|---|
| Base URL | `__APP_URL__/api/v1` |
| Authentication | `Authorization: Bearer ptn_<project_slug>_<random>` — a runtime key issued for one project |
| Environment | A request parameter, `environment` (query string or JSON body), default `production`. Keys are not tied to an environment |
| Format | JSON in and out; snake_case keys; ids are bare UUID strings; timestamps are ISO 8601 UTC |
| Body limit | 5 MB; larger requests get `413` with code `payload_too_large` |
| Versioning | v1 only adds fields. The use-case document carries an integer `schema_version` (currently `4`) |

### Scopes

| Scope | Opens |
|---|---|
| `read` | `GET /use-cases`, `POST /use-cases/:key/prompt` |
| `logs` | `POST /logs` |

### Errors

Every error, including 404 for an unknown route and 413 for an oversized body, is:

```json
{"error": {"code": "invalid_request", "message": "use_case is required", "details": {}}}
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `invalid_request` | Missing or malformed field. `details` names the field where useful |
| 401 | `unauthorized` | No key, wrong key, revoked key, the key's project is archived, or a CLI session token was used here |
| 403 | `forbidden` | The key lacks the scope (`message`: `API key lacks the read scope`) |
| 404 | `not_found` | Unknown use case, environment, prompt name, or no live deployment. `details` says which |
| 413 | `payload_too_large` | Body over 5 MB |
| 500 | `internal_error` | Server error; internal messages are never included |
| 503 | `unavailable` | Storage failure on `/logs`; `Retry-After` header and `details.retry_after` in seconds |

Ash validation errors come back as 400 with `details.errors` as a list of `{"field", "message"}`.

Two unauthenticated endpoints exist for load balancers: `GET /health` answers `{"status": "ok"}`; `GET /health/ready` answers `{"status": "ok", "db": "ok", "migrations": "ok"}` or 503 when the database is unreachable or migrations are pending.

## GET /use-cases

The production path. One request returns the use-case document for one environment: every deployment, the prompt versions and models they pin, and the use case metadata. Read it locally, cache it, poll for changes.

```sh
curl -sS "__APP_URL__/api/v1/use-cases?environment=production" \
  -H "Authorization: Bearer $PTN_KEY" \
  -H 'If-None-Match: "sha256-9f2e5c1a…"'
```

Response headers:

| Header | Value |
|---|---|
| `ETag` | `"sha256-<hex>"`: the SHA-256 of the canonical body (sorted keys, no whitespace), quoted |
| `Last-Modified` | The newest change among the live deployments and the resources they pin |
| `Cache-Control` | `max-age=30` |

Send the ETag back as `If-None-Match` (quoted, weak `W/"…"`, or in a comma-separated list) and an unchanged use-case document answers `304` with an empty body and the same `ETag`.

Body (`schema_version` 4):

```json
{
  "schema_version": 4,
  "project": "helpdesk",
  "environment": "production",
  "use_cases": {
    "support_reply": {
      "id": "019916f4-12b0-7e6c-a1d3-8c9f2b4e6a57",
      "kind": "chat",
      "input_schema": [{"name": "question", "type": "string", "required": true},
                       {"name": "plan", "type": "string", "required": false}],
      "default_params": {"temperature": 0.5},
      "payload_policy": {"mode": "full", "sample_rate": 1.0, "max_bytes": 262144, "retention_days": 30, "encrypt": true}
    }
  },
  "deployments": {
    "support_reply": {
      "id": "019916f7-8b19-7c56-a3e2-5d0f1b7c9e64",
      "revision": 3,
      "model_id": "019916f6-0e5a-7b34-8d1c-2f7e9a3b5c48",
      "params": {"temperature": 0.3},
      "provider_options": {"allow_fallbacks": false},
      "prompt_pins": {"default": "019916f5-3c7d-7a12-9e8f-6b4d2a0c1e93", "ko": "019916fa-1b2c-7d3e-8f4a-5b6c7d8e9f01"}
    }
  },
  "prompt_versions": {
    "019916f5-3c7d-7a12-9e8f-6b4d2a0c1e93": {
      "id": "019916f5-3c7d-7a12-9e8f-6b4d2a0c1e93",
      "prompt_id": "019916f4-12b8-7f01-b2e4-0d1a3c5e7f89",
      "number": 2,
      "engine": "liquid",
      "messages": [{"role": "system", "content": "…"}, {"role": "user", "content": "…"}],
      "text_template": null
    }
  },
  "models": {
    "019916f6-0e5a-7b34-8d1c-2f7e9a3b5c48": {
      "id": "019916f6-0e5a-7b34-8d1c-2f7e9a3b5c48",
      "provider": "openrouter",
      "model_id": "openai/gpt-4o-mini",
      "display_name": "OpenAI: GPT-4o-mini",
      "metadata": {},
      "provider_options": {"only": ["OpenAI"]},
      "capabilities": ["tools"],
      "status": "active"
    }
  }
}
```

| Field | Notes |
|---|---|
| `use_cases` | Keyed by use case key. `kind` is `chat`, `text`, or `embedding`. `input_schema` entries carry `name`, `type` (`string`, `number`, `boolean`, `list`, `map`), `required` |
| `deployments` | Keyed by use case key; one live revision per use case. A use case with no live deployment is simply absent. `prompt_pins` maps prompt name to prompt version id; it is `{}` for `embedding` |
| `prompt_versions` | Keyed by version id. Chat versions carry `messages` (each `role`, `content`, and `name` when set); text versions carry `text_template` |
| `models` | Keyed by catalog id. `model_id` is the provider-side string your app sends to the provider |

Read locally (`<-` is a shallow merge, right side wins):

```text
deployment       = document.deployments[use_case]                     # absent: no live deployment (an error, not a fallback)
version          = document.prompt_versions[deployment.prompt_pins[prompt_name or "default"]]   # name not pinned: an error
model            = document.models[deployment.model_id]
params           = document.use_cases[use_case].default_params <- deployment.params
provider_options = model.provider_options <- deployment.provider_options
```

An environment with no deployments is not an error: `deployments` and `prompt_versions` are `{}`. An unknown environment is `404` with `details.environment`; an empty `environment=` is `400`.

Polling advice: poll every 10 seconds by default with `If-None-Match` (a `304` carries no body), keep the last good document in memory and on disk, and keep serving it when a poll fails. The server caches the use-case document per environment for about 5 seconds, so a just-committed revision can lag that long here (never on `/use-cases/:key/prompt`).

## POST /use-cases/:key/prompt

The server-side prompt filler. Use it to smoke-test a deployment, to debug template filling, or from a client that does not want to fill prompts locally. It is not cached: a revision committed a moment ago shows immediately. Do not call it once per request on a hot path; cache the use-case document instead.

```sh
curl -sS "__APP_URL__/api/v1/use-cases/support_reply/prompt" \
  -H "Authorization: Bearer $PTN_KEY" \
  -H 'content-type: application/json' \
  -d '{"environment": "production", "prompt": "ko",
       "variables": {"question": "My invoice shows two charges this month."}}'
```

| Request field | Required | Notes |
|---|---|---|
| `environment` | no | Default `production` |
| `prompt` | no | Prompt name; default `default`. The only selection axis |
| `variables` | no | An object. Present: the template is rendered. Absent: the raw template is returned |

```json
{
  "key": "support_reply",
  "kind": "chat",
  "deployment": {"id": "019916f7-8b19-7c56-a3e2-5d0f1b7c9e64", "revision": 3},
  "prompt": "ko",
  "prompt_names": ["default", "ko"],
  "model_id": "019916f6-0e5a-7b34-8d1c-2f7e9a3b5c48",
  "model": "openai/gpt-4o-mini",
  "provider": "openrouter",
  "params": {"temperature": 0.3},
  "provider_options": {"only": ["OpenAI"], "allow_fallbacks": false},
  "source": "remote",
  "prompt_version": {"id": "019916fa-1b2c-7d3e-8f4a-5b6c7d8e9f01", "number": 1},
  "messages": [
    {"role": "system", "content": "당신은 Acme의 친절한 고객 지원 상담원입니다."},
    {"role": "user", "content": "My invoice shows two charges this month."}
  ],
  "warnings": [],
  "etag": "sha256-9f2e5c1a7b3d8e4f6a0c2b9d1e7f3a5c8b4d6e2f0a1c3b5d7e9f2a4c6b8d0e1f"
}
```

This request asked for `"prompt": "ko"`, the Korean variant of `support_reply`, so the system message comes back in Korean; the user message is the same `{{ question }}` template rendered with the value that was sent.

| Response field | Notes |
|---|---|
| `prompt_names` | Every prompt name the live revision pins |
| `model` / `provider` | The provider-side model string and provider name to call |
| `params`, `provider_options` | After layering, ready to send |
| `source` | Where the deployed use-case document came from (`remote` for this endpoint) |
| `prompt_version` | `null` for `embedding` |
| `messages` | `chat` only. For `text` the field is `text` (a string). `embedding` has neither, with `prompt` `null` and `prompt_names` `[]` |
| `warnings` | Strings such as `missing_model: <id>` |
| `etag` | The use-case document ETag this answer was read from, without quotes |

Errors:

| HTTP | `code` | `details` | When |
|---|---|---|---|
| 400 | `invalid_request` | | `variables` not an object; `prompt` not a non-empty string; `environment` not a string |
| 400 | `invalid_request` | `{"missing_variable": "question"}` | A variable the template needs was not sent |
| 404 | `not_found` | `{"key": "nope"}` | Unknown use case |
| 404 | `not_found` | `{"environment": "canary"}` | Unknown environment |
| 404 | `not_found` | `{"reason": "unresolved"}` | No live deployment in that environment |
| 404 | `not_found` | `{"reason": "unknown_prompt", "prompt": "ja", "available_prompts": ["default", "ko"]}` | The name is not pinned by the live revision |

## POST /logs

Monitoring logs: batched, idempotent, partially accepted. Send one record per model call your app made, including failures, in batches. The `environment` parameter is forced onto the whole batch, so send one batch per environment.

```sh
curl -sS "__APP_URL__/api/v1/logs?environment=production" \
  -H "Authorization: Bearer $PTN_KEY" \
  -H 'content-type: application/json' \
  -d @batch.json
```

Request body: `{"logs": [ … ]}`, at most 200 records. A body that is not that shape, or has more than 200 records, is `400`.

```json
{
  "id": "019916f9-c0a1-7d9a-8f2e-3b5d7c1a9e02",
  "use_case": "support_reply",
  "model": "openai/gpt-4o-mini",
  "status": "ok",
  "started_at": "2026-09-03T04:12:03.123Z",

  "kind": "chat",
  "deployment_id": "019916f7-8b19-7c56-a3e2-5d0f1b7c9e64",
  "deployment_revision": 3,
  "prompt": "default",
  "prompt_version_id": "019916f5-3c7d-7a12-9e8f-6b4d2a0c1e93",
  "model_id": "019916f6-0e5a-7b34-8d1c-2f7e9a3b5c48",
  "source": "remote",
  "provider": "openrouter",
  "model_used": "openai/gpt-4o-mini",
  "upstream_provider": "OpenAI",
  "params": {"temperature": 0.3},
  "input": {"variables": {"question": "My invoice shows two charges this month."},
            "messages": [{"role": "system", "content": "…"}, {"role": "user", "content": "…"}],
            "truncated": false},
  "output": {"content": "…", "tool_calls": [], "truncated": false},
  "finish_reason": "stop",
  "stop_kind": "stop",
  "usage": {"input_tokens": 512, "output_tokens": 96, "cost_usd": 0.000134, "cost_source": "provider", "raw": {}},
  "latency_ms": 940,
  "trace_id": "ticket:88213",
  "sequence": 1,
  "end_user_ref": "cust_8f31",
  "context": {"language": "en", "plan": "pro"},
  "metadata": {"ticket_id": 88213},
  "sdk": {"name": "myapp-prompton-client", "version": "0.1.0"}
}
```

Required fields: `id`, `use_case`, `model`, `status`, `started_at`.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Generated by the app before the provider call; the idempotency key. Any UUID is accepted; UUIDv7 keeps ids time-ordered |
| `use_case` | string | Unknown keys are stored, not rejected |
| `model` | string | The provider-side model string |
| `status` | `ok` \| `error` | |
| `started_at` | ISO 8601 | At most 5 minutes in the future and 7 days in the past |
| `kind` | `chat` \| `text` \| `embedding` | Default `chat` |
| `deployment_id`, `prompt_version_id`, `model_id` | UUID or null | Soft references from the selected pin |
| `deployment_revision` | integer | |
| `prompt` | string | The prompt name that was used |
| `source` | `remote` \| `disk` \| `bundle` \| `manual` | Where the configuration came from |
| `provider`, `model_used`, `upstream_provider` | string | `model_used` and `upstream_provider` are stored under `metadata` |
| `params` | object | Over 4 KB: blanked and listed in `metadata.truncated_fields` |
| `input` | object or string | `{"variables", "messages", "truncated"}` or `{"text", "truncated"}`; a plain string is stored as `{"text": "…"}` |
| `output` | object or string | `{"content", "tool_calls", "truncated"}`; a plain string is stored as `{"content": "…"}` |
| `finish_reason` | string | The provider's raw value |
| `stop_kind` | `stop` \| `length` \| `tool_call` \| `content_filter` \| `other` | Kept as sent when it is one of the five; otherwise derived from `finish_reason` (`tool_calls`/`tool_use` → `tool_call`, `max_tokens`/`length` → `length`, …). Null when both are absent |
| `error` | object | For `status: "error"`: `kind` (`http_4xx`, `http_5xx`, `rate_limited`, `timeout`, `transport`, `parse`, `app`), `status` (HTTP status, stored as `metadata.http_status`), `message` |
| `usage` | object | `input_tokens`, `output_tokens`, `cost_usd`, `cost_source` (`provider` \| `catalog` \| `unknown`), `raw`. `raw` over 16 KB is blanked and listed in `metadata.truncated_fields` |
| `latency_ms` | integer | |
| `trace_id`, `sequence`, `end_user_ref` | string, integer, string | Correlation |
| `context` | object | At most 2 KB, or the record is rejected |
| `metadata` | object | At most 4 KB, or the record is rejected |
| `sdk` | object | `name`, `version` of the client that sent it |

Top-level string fields (`use_case`, `model`, `prompt`, `finish_reason`, `trace_id`, `end_user_ref`, `model_used`, `upstream_provider`) are limited to 512 bytes; `error.message` is not.

Response, `202`:

```json
{
  "accepted": 98,
  "duplicates": 2,
  "rejected": [
    {"index": 5, "id": "019916f9-…", "code": "invalid_request", "message": "started_at is more than 7 days in the past"}
  ]
}
```

Per-record outcomes:

| Situation | Outcome |
|---|---|
| Schema or type violation, `context` over 2 KB, `metadata` over 4 KB, `started_at` outside the window | `rejected` with `invalid_request`; the batch continues |
| A value the database cannot store: an integer outside int8, a string with a NUL byte or invalid UTF-8 | `rejected` with `invalid_request`, that record only |
| `params` over 4 KB, `usage.raw` over 16 KB | Accepted; the field is blanked and named in `metadata.truncated_fields` |
| The same `id` already stored for this project, or repeated inside the batch | `duplicates` + 1; nothing is written |
| An `id` already stored by another project | `rejected` with `conflict` (`id already exists in another project`) |
| Storage failure | `503 unavailable` with `Retry-After: 5`; resend the same batch with the same ids and the duplicates are absorbed |

### Log content storage, sampling, and truncation

What happens to `input` and `output` follows the use case's log content policy (`payload_policy`) from the use-case document:

| `mode` | Stored |
|---|---|
| `full` | The payload, encrypted at rest, subject to sampling and truncation |
| `hash` | Only the SHA-256 and byte size of each part |
| `none` | Nothing; the record itself is kept |

Sampling is deterministic on `id`: `bucket = first 4 bytes of sha256(id) as an unsigned big-endian integer mod 10000`; the payload is stored when `bucket < round(sample_rate × 10000)`. Records with `status: "error"` or `stop_kind: "length"` are always stored. A client may pre-hash by sending `input` or `output` as exactly `{"sha256": "<64 hex>", "bytes": n}` (optionally `"hashed": true`); the server stores the hash and size and never sees the text. A malformed pre-hash (not 64 hex characters, `bytes` not an integer) rejects the record.

Truncation limits are relative to `max_bytes` (default 262144, at most 1048576):

| Part | Limit | Measured as |
|---|---|---|
| One message `content` | `max_bytes / 8` | String bytes (JSON bytes for non-string content) |
| `input.messages` in total | `max_bytes` | JSON bytes, including the truncation marker |
| `input.text` | `max_bytes` | String bytes |
| `input.variables` | `max_bytes` | JSON bytes |
| `output.content` | `max_bytes / 4` | String bytes |
| `output.tool_calls` | `max_bytes / 4` | JSON bytes |

Truncate before sending, keep head and tail, and set `"truncated": true`; the server re-checks with the same rules.

### Batching rules

- Batch on a size or time trigger; never one HTTP call per log.
- Never resend records that were accepted; read `rejected` and fix those.
- `503` is the only status worth retrying; on `4xx`, fix the record.
- Retention is per plan and per use case: the Free plan keeps the most recent 1,000 monitoring logs of each use case for at most 7 days (whichever bites first); Team keeps 100,000 for 30 days, Pro 100,000 for 90 days. Older logs and their payloads are purged nightly; ingest itself is never refused for retention.

## Rate limits

The three endpoints above have no per-key request limit. Per-IP limits exist only on the unauthenticated device-login endpoints of the [management API](/management-api).
