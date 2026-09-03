# prompton-docs

The public documentation for PromptOn — `docs.prompton.ai` (dev: `docs.dev.prompton.ai`). Markdown
in `docs/` is rendered at build time into a static site that serves every page **twice**: as HTML for
browsers and as Markdown for programs (coding agents, `curl`, `fetch`). No framework, no runtime JS
beyond a copy button on code blocks; nginx serves the result.

Sibling repos: [`prompton-home`](https://github.com/polimo-dev/prompton-home) (the landing, `prompton.ai`),
[`prompton-cli`](https://github.com/polimo-dev/prompton-cli), and [`prompton`](https://github.com/polimo-dev/prompton) (the app, `app.prompton.ai`). The
visual system is `DESIGN-resend.md` + `resend-brief.md` (copied from the main repo's `design/`).

## Layout

| Path | What |
|---|---|
| `docs/*.md` | The pages. One file = one URL (`docs/agent.md` → `/agent`). `docs/index.md` is the front page. |
| `build.mjs` | Renders `docs/` into `dist/` (see below). `marked` + `highlight.js`, nothing else. |
| `assets/site.css`, `assets/hljs.css` | The stylesheet (tokens from the design brief) and the code theme. Copied to `dist/assets/`. |
| `static/` | Copied verbatim into `dist/` (`favicon.ico`, `robots.txt`). |
| `nginx/default.conf.template` | The server: Accept negotiation, MIME types, cache, `/health`. |
| `serve.mjs` | Local preview of `dist/` with the same negotiation as nginx. |

## Writing a page

Create `docs/<slug>.md`. The file name is the URL (`[a-z0-9-]`; `assets`, `health` and `llms` are
reserved). Front matter is optional:

```md
---
title: Runtime API
description: The three endpoints an app calls with a runtime key.
order: 40
---

Body in GitHub-flavored Markdown…
```

| Key | Meaning | Default |
|---|---|---|
| `title` | Sidebar label, page heading, `<title>`, `llms.txt` entry | the first `# H1` of the body, else the slug |
| `description` | Subtitle under the heading, `<meta name="description">`, `llms.txt` | none |
| `order` | Integer; sidebar and `llms.txt` position (ascending, then title) | `999` |

Rules the build applies:

- A leading `# H1` in the body is treated as the title and not rendered twice in HTML; the `.md` output
  keeps it. If the body has no H1, the `.md` output gets `# <title>` as its first line.
- Fenced code blocks are highlighted by language (`sh`, `json`/`jsonc`, `ts`, …); unlabeled fences are
  left plain. H2/H3 headings get GitHub-style ids and feed the "On this page" list.
- `__APP_URL__`, `__HOME_URL__` and `__DOCS_URL__` anywhere in a page are replaced at build time
  (defaults `https://app.prompton.ai`, `https://prompton.ai`, `https://docs.prompton.ai`) — the same
  pattern as `prompton-home`. Use them for links to the app or the landing so dev builds point at dev.
- Link between pages with extensionless paths (`[quickstart](/quickstart)`); they resolve in both the
  HTML and the Markdown view.
- If `docs/index.md` is absent, the build generates a front page listing every page.

## Build output

`node build.mjs` (or `make build`) writes `dist/`:

| File | What |
|---|---|
| `<slug>.html` | The page in the site shell (sidebar, top bar, content panel, "On this page"). |
| `<slug>.md` | The raw Markdown, front matter stripped, placeholders substituted. |
| `index.html`, `index.md` | From `docs/index.md`, or generated. |
| `llms.txt` | `# PromptOn Docs`, a one-line description, then `- [Title](<DOCS_URL>/<slug>.md): description` per page, in order. |
| `assets/site.css`, `assets/hljs.css` | Stylesheets. |

## Develop

```sh
make install                      # npm ci
make serve                        # build with production URLs, preview on :8090
DOCS_URL=https://docs.dev.prompton.ai APP_URL=https://app.dev.prompton.ai HOME_URL=https://dev.prompton.ai make serve
```

`make serve` runs `serve.mjs`, which negotiates like nginx so `/agent` and `/agent.md` both work
locally.

## Build the image

```sh
make docker DOCS_URL=https://docs.dev.prompton.ai APP_URL=https://app.dev.prompton.ai HOME_URL=https://dev.prompton.ai TAG=prompton-docs:dev-local
make run TAG=prompton-docs:dev-local PORT=8091     # docker run -p 8091:8080
```

The Dockerfile builds `dist/` in a `node:22-alpine` stage and copies it into `nginx:1.27-alpine`.
The container listens on 8080 and answers `/health`.

## How URLs are served

nginx picks the representation from the request's `Accept` header:

| Request | Response |
|---|---|
| `GET /agent` with `Accept: text/html…` (browsers) | `agent.html`, `text/html; charset=utf-8` |
| `GET /agent` with any other Accept (`*/*`, `text/markdown`, none) | `agent.md`, `text/markdown; charset=utf-8` |
| `GET /agent.md`, `GET /agent.html` | That file, explicitly |
| `GET /` | `index.html` or `index.md`, same rule |
| `GET /llms.txt` | `text/plain` |
| `GET /health` | `200 ok` |

Negotiated responses carry `Vary: Accept`. Everything is cached for 5 minutes and gzipped. Each HTML
page shows its own Markdown URL under the title, so a person can hand it to a coding agent.

```sh
curl -sI -H 'Accept: text/html' https://docs.prompton.ai/agent   # text/html
curl -s https://docs.prompton.ai/agent | head                     # markdown
curl -s https://docs.prompton.ai/llms.txt
```

## Deploy

Kubernetes manifests live in the deployment repository (`deployment/macmini/prompton/31-docs.yaml`
for dev, next to `30-home.yaml`). Production: same image built with the production URLs.

The production image is built by GitHub Actions (`.github/workflows/image.yml`): every push to `main`
and every `v*` tag builds `linux/amd64` + `linux/arm64` with the production URLs and pushes
`ghcr.io/polimo-dev/prompton-docs` tagged `sha-<short sha>`, `main`, and the version on tags. Dev
images are built locally, not by CI.

## License

- **Code** — everything outside `docs/` (`build.mjs`, `serve.mjs`, `assets/`, `nginx/`, `static/`, the
  Dockerfile): MIT, see [LICENSE](LICENSE). Copyright (c) 2026 Polimo.
- **Content** — the pages under `docs/` and their rendered copies: Creative Commons Attribution 4.0
  International (CC BY 4.0), see [LICENSE-CONTENT](LICENSE-CONTENT).

**Trademark.** PromptOn is a trademark of Polimo. The license does not grant permission to use the
PromptOn name or logo; forks and derived services must use a different name.
