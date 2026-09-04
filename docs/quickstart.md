---
title: Quickstart
description: Provision a project by hand with the CLI, fill a prompt with curl, send one log, and see it in the app.
order: 3
---

# Quickstart

Ten minutes, no coding agent: the CLI for provisioning, curl for the two runtime calls. Every step below also exists in the web app at `__APP_URL__`; the CLI is used here because each step is one line. The ids in the responses are examples; yours will differ.

## 1. Install the CLI and sign in

```sh
curl -fsSL __HOME_URL__/install.sh | sh
prompton login
```

The CLI prints a link and a code, opens the link in your browser, and waits:

```text
  Open this URL to approve the login:
    __APP_URL__/device?code=H4KP-T7WR

  Your code: H4KP-T7WR

Waiting for approval…
```

In the browser, enter your email address, type the 6-digit code PromptOn emails you, and press **Approve**. Sign-up is the same step: a new address becomes an account on its first code. Back in the terminal:

```text
Logged in as ada@example.com
Organization: personal
Session stored in /Users/ada/.config/prompton/config.json
```

If the CLI's built-in default host (`https://app.prompton.ai`) is not `__APP_URL__`, run `prompton login --host __APP_URL__` instead; the host is remembered in the config file. With a single organization the CLI adopts it; with several, pick one with `prompton use --org <slug|personal>`.

## 2. Create a project

```sh
prompton projects create helpdesk --name Helpdesk --json
```

```json
{
  "id": "019916f3-6a2e-7c41-8b5d-1f0a9c3e7d21",
  "slug": "helpdesk",
  "name": "Helpdesk",
  "timezone": "Etc/UTC",
  "created_at": "2026-09-03T04:10:11.402113Z",
  "environments": [
    {"id": "019916f3-6a31-7d8a-9c02-4e5b7a1d0f33", "slug": "production", "name": "Production", "protected": true},
    {"id": "019916f3-6a31-7d8a-9c02-4e5b7a1d0f34", "slug": "staging", "name": "Staging", "protected": false}
  ]
}
```

`production` and `staging` are created with the project. Make it the default for the following commands:

```sh
prompton use --project helpdesk
```

## 3. Create a use case

One use case per call site. Declare the variables the app will pass:

```sh
cat > schema.json <<'EOF'
[{"name": "question", "type": "string", "required": true,
  "description": "The customer's message"},
 {"name": "plan", "type": "string", "required": false,
  "description": "free or pro"}]
EOF

prompton use-cases create support_reply --kind chat --name 'Support reply' \
  --input-schema-file schema.json --default-params '{"temperature":0.5}' --json
```

```json
{
  "id": "019916f4-12b0-7e6c-a1d3-8c9f2b4e6a57",
  "key": "support_reply",
  "name": "Support reply",
  "description": null,
  "kind": "chat",
  "input_schema": [
    {"name": "question", "type": "string", "required": true,
     "description": "The customer's message", "example": null},
    {"name": "plan", "type": "string", "required": false,
     "description": "free or pro", "example": null}
  ],
  "default_params": {"temperature": 0.5},
  "tags": [],
  "created_at": "2026-09-03T04:11:02.917345Z"
}
```

A `chat` use case comes with a prompt named `default`, ready for its first version.

## 4. Commit the prompt

The file is your prompt as chat messages; placeholders are Liquid `{{ variable }}` tags.

```sh
cat > messages.json <<'EOF'
[{"role": "system", "content": "You are a friendly support agent for Acme. Answer in two or three sentences; if you are not sure, say so and offer to escalate."},
 {"role": "user", "content": "{{ question }}"}]
EOF

prompton prompts commit support_reply default --file messages.json \
  --message "migrated from the app's hardcoded prompt" --json
```

```json
{
  "id": "019916f5-3c7d-7a12-9e8f-6b4d2a0c1e93",
  "prompt_id": "019916f4-12b8-7f01-b2e4-0d1a3c5e7f89",
  "number": 1,
  "engine": "liquid",
  "messages": [
    {"role": "system", "content": "You are a friendly support agent for Acme. Answer in two or three sentences; if you are not sure, say so and offer to escalate."},
    {"role": "user", "content": "{{ question }}"}
  ],
  "text_template": null,
  "detected_variables": ["question"],
  "message": "migrated from the app's hardcoded prompt",
  "content_sha256": "3f1c0b7e6a9d2c4b8e5f1a7d3c9b2e6f4a8d1c5b7e9f2a4c6d8b0e3f5a7c9d1b",
  "created_at": "2026-09-03T04:12:30.118764Z"
}
```

Nothing is live yet; a version goes live only when a deployment pins it.

## 5. Register the model

Optional: `deploy` registers a provider string it has not seen before. Registering first lets you check what the catalog knows about it.

```sh
prompton models register openai/gpt-4o-mini --json
```

```json
{
  "id": "019916f6-0e5a-7b34-8d1c-2f7e9a3b5c48",
  "provider": "openrouter",
  "model_id": "openai/gpt-4o-mini",
  "display_name": "OpenAI: GPT-4o-mini",
  "metadata": {},
  "provider_options": {},
  "pricing": {"input_per_m": 0.15, "output_per_m": 0.6, "currency": "USD", "unit": "token"},
  "context_length": 128000,
  "capabilities": [],
  "status": "active",
  "created_at": "2026-09-03T04:13:05.551209Z"
}
```

`display_name`, `pricing`, and `context_length` come from the public OpenRouter catalog. If that lookup fails the model is still registered, with `display_name` equal to the model id and `pricing` empty.

## 6. Deploy

```sh
prompton deploy support_reply --model openai/gpt-4o-mini \
  --params '{"temperature":0.3}' --json
```

```json
{
  "id": "019916f7-8b19-7c56-a3e2-5d0f1b7c9e64",
  "revision": 1,
  "environment": "production",
  "model_id": "019916f6-0e5a-7b34-8d1c-2f7e9a3b5c48",
  "model": "openai/gpt-4o-mini",
  "params": {"temperature": 0.3},
  "provider_options": {},
  "prompt_pins": {"default": "019916f5-3c7d-7a12-9e8f-6b4d2a0c1e93"},
  "created_at": "2026-09-03T04:13:40.204518Z"
}
```

Without `--pin`, the newest committed version of every prompt is pinned. Without `--environment`, the revision goes to `production`. It is live as soon as it is committed.

## 7. Issue a runtime key

```sh
PTN_KEY=$(prompton api-keys issue --name 'Helpdesk server' --quiet)
echo "$PTN_KEY"
```

```text
ptn_helpdesk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

The secret is printed once; the server keeps a hash. The key has both scopes (`read`, `logs`) and covers every environment of the project.

## 8. Fill the prompt with curl

```sh
curl -sS "__APP_URL__/api/v1/use-cases/support_reply/prompt" \
  -H "Authorization: Bearer $PTN_KEY" \
  -H 'content-type: application/json' \
  -d '{"variables": {"question": "My invoice shows two charges this month."}}'
```

```json
{
  "key": "support_reply",
  "kind": "chat",
  "deployment": {"id": "019916f7-8b19-7c56-a3e2-5d0f1b7c9e64", "revision": 1},
  "prompt": "default",
  "prompt_names": ["default"],
  "model_id": "019916f6-0e5a-7b34-8d1c-2f7e9a3b5c48",
  "model": "openai/gpt-4o-mini",
  "provider": "openrouter",
  "params": {"temperature": 0.3},
  "provider_options": {},
  "source": "remote",
  "prompt_version": {"id": "019916f5-3c7d-7a12-9e8f-6b4d2a0c1e93", "number": 1},
  "messages": [
    {"role": "system", "content": "You are a friendly support agent for Acme. Answer in two or three sentences; if you are not sure, say so and offer to escalate."},
    {"role": "user", "content": "My invoice shows two charges this month."}
  ],
  "warnings": [],
  "etag": "sha256-9f2e5c1a7b3d8e4f6a0c2b9d1e7f3a5c8b4d6e2f0a1c3b5d7e9f2a4c6b8d0e1f"
}
```

Your app now has everything it needs to call the provider itself: `model`, `params`, and the rendered `messages`. Leave out `variables` to get the raw template; send `"environment": "staging"` to read another environment. In production code, poll `GET /api/v1/use-cases` instead of calling `/use-cases/:key/prompt` per request; see the [runtime API](/api).

## 9. Send one log

After each provider call, report what happened. `id` is generated by your app and is the idempotency key (any UUID is accepted; UUIDv7 keeps ids time-ordered). `started_at` must be within the last 7 days, so the example uses the current time.

```sh
curl -sS "__APP_URL__/api/v1/logs" \
  -H "Authorization: Bearer $PTN_KEY" \
  -H 'content-type: application/json' \
  -d "$(cat <<EOF
{"logs": [{
  "id": "019916f9-c0a1-7d9a-8f2e-3b5d7c1a9e02",
  "use_case": "support_reply",
  "deployment_id": "019916f7-8b19-7c56-a3e2-5d0f1b7c9e64",
  "deployment_revision": 1,
  "prompt": "default",
  "prompt_version_id": "019916f5-3c7d-7a12-9e8f-6b4d2a0c1e93",
  "source": "remote",
  "kind": "chat",
  "model": "openai/gpt-4o-mini",
  "provider": "openrouter",
  "params": {"temperature": 0.3},
  "input": {"variables": {"question": "My invoice shows two charges this month."},
            "messages": [{"role": "system", "content": "You are a friendly support agent for Acme. Answer in two or three sentences; if you are not sure, say so and offer to escalate."},
                         {"role": "user", "content": "My invoice shows two charges this month."}],
            "truncated": false},
  "output": {"content": "It looks like you were billed twice this month. I can check the invoice and refund the duplicate charge — could you confirm the date of the second one?", "tool_calls": [], "truncated": false},
  "status": "ok",
  "finish_reason": "stop",
  "usage": {"input_tokens": 60, "output_tokens": 40, "cost_usd": 0.000033, "cost_source": "provider"},
  "latency_ms": 940,
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}]}
EOF
)"
```

```json
{"accepted": 1, "duplicates": 0, "rejected": []}
```

Run it again with the same `id` and the answer is `{"accepted": 0, "duplicates": 1, "rejected": []}`: resends are absorbed, never stored twice.

## 10. See it in the app

- `__APP_URL__/personal/helpdesk` is the project overview: the use case, its live deployment per environment, and the logs reported in the selected window.
- `__APP_URL__/personal/helpdesk/use-cases/support_reply` opens the use case hub, where the prompt editor, the arena, and the deployment history live.
- `__APP_URL__/personal/usage` lists every log recorded across the organization.

## What next

- Open a second prompt name for a language variant: `prompton prompts open support_reply ko --description Korean`, commit a version, and redeploy with `--pin default=latest --pin ko=latest`. The app selects it with `"prompt": "ko"`.
- Promote to another environment with the same prompt version and model, at staging's own temperature: `prompton deploy support_reply --environment staging --model openai/gpt-4o-mini --params '{"temperature":0.7}'`.
- Roll back: `prompton rollback support_reply --environment production --revision 1`.
- Wire the app: the [agent reference](/agent) has the migration journey, the SDK status per language, and the local use-case document algorithm; the [runtime API](/api) has every field.
