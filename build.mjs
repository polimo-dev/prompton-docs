// prompton-docs build: docs/*.md -> dist/ (HTML + Markdown + llms.txt).
//
//   DOCS_URL=https://docs.dev.prompton.ai APP_URL=https://app.dev.prompton.ai HOME_URL=https://dev.prompton.ai node build.mjs
//
// Front matter (all optional): title, description, order (integer; missing = 999).
// A page without a title takes its first H1; without an H1 it takes its slug.
// __APP_URL__ / __HOME_URL__ / __DOCS_URL__ inside Markdown are replaced from the environment.

import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hljs from "highlight.js";
import { Marked } from "marked";
import { getHeadingList, gfmHeadingId, resetHeadings } from "marked-gfm-heading-id";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(ROOT, "docs");
const DIST = path.join(ROOT, "dist");

const env = {
  DOCS_URL: (process.env.DOCS_URL || "https://docs.prompton.ai").replace(/\/+$/, ""),
  APP_URL: (process.env.APP_URL || "https://app.prompton.ai").replace(/\/+$/, ""),
  HOME_URL: (process.env.HOME_URL || "https://prompton.ai").replace(/\/+$/, ""),
};

const SITE_NAME = "PromptOn Docs";
const SITE_DESCRIPTION =
  "PromptOn is the control plane for your app's LLM prompts: prompts, models and pins live outside the codebase, your app fetches its config and calls the provider itself.";
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Geist:wght@400;500&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap";
const DEFAULT_ORDER = 999;
const RESERVED_SLUGS = new Set(["assets", "health", "llms"]);
const LANG_ALIASES = { jsonc: "json", json5: "json", shell: "bash", console: "bash", yml: "yaml", ts: "typescript", js: "javascript", py: "python" };

// ---------------------------------------------------------------------------
// Helpers

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function substitutePlaceholders(text) {
  return text.replace(/__APP_URL__/g, env.APP_URL).replace(/__HOME_URL__/g, env.HOME_URL).replace(/__DOCS_URL__/g, env.DOCS_URL);
}

// Minimal front matter: a leading `---` block of `key: value` lines. Values may be quoted.
function splitFrontMatter(src) {
  const m = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of (m[1] || "").split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    meta[kv[1]] = value;
  }
  return { meta, body: src.slice(m[0].length) };
}

function parseOrder(value) {
  if (value === undefined || value === "") return DEFAULT_ORDER;
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) throw new Error(`front matter "order" must be an integer, got ${JSON.stringify(value)}`);
  return n;
}

// Plain text of an inline Markdown string (for titles): drop code ticks, emphasis, link syntax.
function plainText(inline) {
  return inline
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Markdown pipeline

const marked = new Marked(
  { gfm: true, breaks: false },
  gfmHeadingId(),
  {
    renderer: {
      code({ text, lang }) {
        const info = (lang || "").trim().split(/\s+/)[0].toLowerCase();
        const language = LANG_ALIASES[info] || info;
        let body;
        let cls = "hljs";
        if (language && hljs.getLanguage(language)) {
          body = hljs.highlight(text, { language, ignoreIllegals: true }).value;
          cls += ` language-${language}`;
        } else {
          body = escapeHtml(text);
        }
        return `<figure class="code"><pre><code class="${cls}">${body}</code></pre><button class="copy" type="button" aria-label="Copy code">Copy</button></figure>\n`;
      },
    },
  },
);

// Long path-like headings (`POST /orgs/:org/projects/:project/…`) get a break opportunity after
// each slash outside tags, so narrow columns wrap at segment boundaries instead of mid-word.
function breakAfterSlashes(html) {
  return html.replace(/\/(?![^<]*>)/g, "/<wbr>");
}

function postprocess(html) {
  return html
    .replace(
      /<h([2-6]) id="([^"]+)">([\s\S]*?)<\/h\1>/g,
      (_, level, id, text) =>
        `<h${level} id="${id}">${breakAfterSlashes(text)}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`,
    )
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");
}

// Splits off a leading H1 (ATX or setext), returning its text and the remaining body.
function takeLeadingH1(body) {
  const tokens = marked.lexer(body);
  let offset = 0;
  for (const token of tokens) {
    if (token.type === "space") {
      offset += token.raw.length;
      continue;
    }
    if (token.type === "heading" && token.depth === 1) {
      return { h1: plainText(token.text), rest: body.slice(offset + token.raw.length) };
    }
    break;
  }
  return { h1: null, rest: body };
}

function renderMarkdown(body) {
  resetHeadings();
  const html = postprocess(marked.parse(body));
  const headings = getHeadingList().filter((h) => h.level === 2 || h.level === 3);
  return { html, headings };
}

// ---------------------------------------------------------------------------
// Pages

async function loadPages() {
  const entries = (await readdir(DOCS_DIR, { withFileTypes: true }))
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort();
  const pages = [];
  for (const file of entries) {
    const slug = file.slice(0, -3);
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) throw new Error(`docs/${file}: file name must be [a-z0-9-] (it becomes the URL)`);
    if (RESERVED_SLUGS.has(slug.toLowerCase())) throw new Error(`docs/${file}: "${slug}" is a reserved path`);
    const raw = substitutePlaceholders(await readFile(path.join(DOCS_DIR, file), "utf8"));
    const { meta, body } = splitFrontMatter(raw);
    const { h1, rest } = takeLeadingH1(body);
    const title = meta.title || h1 || slug;
    const trimmedBody = body.replace(/^\s+/, "").replace(/\s+$/, "");
    const markdown = (h1 ? trimmedBody : `# ${title}\n\n${trimmedBody}`) + "\n";
    pages.push({
      slug,
      file,
      title,
      description: meta.description || "",
      order: parseOrder(meta.order),
      body: rest,
      markdown,
      generated: false,
    });
  }
  pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return pages;
}

function hrefOf(page) {
  return page.slug === "index" ? "/" : `/${page.slug}`;
}

// ---------------------------------------------------------------------------
// HTML shell

function navList(pages, current) {
  return pages
    .map((p) => {
      const active = p.slug === current.slug;
      return `<a href="${hrefOf(p)}"${active ? ' aria-current="page"' : ""}>${escapeHtml(p.title)}</a>`;
    })
    .join("\n          ");
}

function tocHtml(headings) {
  if (headings.length === 0) return "";
  const items = headings
    .map((h) => `<li class="toc-${h.level}"><a href="#${h.id}">${breakAfterSlashes(escapeHtml(h.raw))}</a></li>`)
    .join("\n            ");
  return `<nav class="toc" aria-label="On this page">
          <p class="toc-title"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>On this page</p>
          <ul>
            ${items}
          </ul>
        </nav>`;
}

function shell({ page, pages, contentHtml, headings }) {
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description || SITE_DESCRIPTION);
  const canonical = `${env.DOCS_URL}${hrefOf(page)}`;
  const mdPath = `/${page.slug}.md`;
  const docTitle = page.slug === "index" ? SITE_NAME : `${title} — ${SITE_NAME}`;
  const links = navList(pages, page);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${docTitle}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" type="text/markdown" href="${mdPath}" title="${title} (Markdown)" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${canonical}" />
    <meta name="twitter:card" content="summary" />
    <meta name="theme-color" content="#000000" />
    <link rel="icon" href="/favicon.ico" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${FONTS_HREF}" rel="stylesheet" />
    <link rel="stylesheet" href="/assets/site.css" />
    <link rel="stylesheet" href="/assets/hljs.css" />
  </head>
  <body>
    <div class="layout">
      <aside class="side">
        <div class="side-brand"><a class="wordmark" href="/">PromptOn <span>Docs</span></a></div>
        <p class="side-label">Documentation</p>
        <nav class="side-nav" aria-label="Pages">
          ${links}
        </nav>
        <div class="side-foot">
          For agents: <a href="/llms.txt">llms.txt</a> lists every page as Markdown.
        </div>
      </aside>
      <div class="main">
        <header class="top">
          <a class="wordmark wordmark-top" href="/">PromptOn <span>Docs</span></a>
          <nav class="top-links" aria-label="Sites">
            <a href="${env.HOME_URL}">Home</a>
            <a class="btn-ghost" href="${env.APP_URL}">App</a>
          </nav>
          <details class="menu">
            <summary aria-label="Menu"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></summary>
            <div class="menu-panel">
              <p class="side-label">Documentation</p>
              <nav class="side-nav" aria-label="Pages">
                ${links}
              </nav>
              <p class="side-label">Sites</p>
              <nav class="side-nav" aria-label="Sites">
                <a href="${env.APP_URL}">App</a>
                <a href="${env.HOME_URL}">Home</a>
              </nav>
            </div>
          </details>
        </header>
        <main class="panel">
          <div class="panel-in">
            <article class="content">
              <header class="page-head">
                <p class="eyebrow">Documentation</p>
                <h1 class="page-title">${title}</h1>
                ${page.description ? `<p class="page-desc">${escapeHtml(page.description)}</p>` : ""}
                <p class="md-hint">Markdown: <a href="${mdPath}">${mdPath}</a> · give this URL to your coding AI</p>
              </header>
              <div class="prose">
${contentHtml}
              </div>
            </article>
            ${tocHtml(headings)}
          </div>
        </main>
      </div>
    </div>
    <script>
      document.addEventListener("click", function (e) {
        var b = e.target.closest("button.copy");
        if (!b) return;
        var code = b.parentNode.querySelector("code");
        if (!code) return;
        var done = function () {
          b.textContent = "Copied";
          b.classList.add("is-done");
          setTimeout(function () { b.textContent = "Copy"; b.classList.remove("is-done"); }, 1500);
        };
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(code.textContent).then(done, function () {});
          return;
        }
        var s = window.getSelection(), r = document.createRange();
        r.selectNodeContents(code); s.removeAllRanges(); s.addRange(r);
        try { if (document.execCommand("copy")) done(); } catch (_) {}
        s.removeAllRanges();
      });
    </script>
  </body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Generated index (used when docs/index.md is absent)

function generatedIndex(pages) {
  const cards = pages
    .map(
      (p) => `<a class="card" href="${hrefOf(p)}"><p class="card-title">${escapeHtml(p.title)}</p>${
        p.description ? `<p>${escapeHtml(p.description)}</p>` : ""
      }</a>`,
    )
    .join("\n");
  const html = `<p>${escapeHtml(SITE_DESCRIPTION)}</p>
<div class="cards">
${cards}
</div>
<p>Every page is also served as Markdown: append <code>.md</code> to its URL, or fetch it with <code>Accept: text/markdown</code>. <a href="/llms.txt">/llms.txt</a> lists all pages.</p>`;
  const markdown =
    `# ${SITE_NAME}\n\n${SITE_DESCRIPTION}\n\n` +
    pages.map((p) => `- [${p.title}](${env.DOCS_URL}/${p.slug}.md)${p.description ? `: ${p.description}` : ""}`).join("\n") +
    `\n\nEvery page is served as Markdown at its \`.md\` URL. \`${env.DOCS_URL}/llms.txt\` lists all pages.\n`;
  return { slug: "index", file: null, title: "Overview", description: SITE_DESCRIPTION, order: Number.NEGATIVE_INFINITY, html, markdown, generated: true };
}

function llmsTxt(pages) {
  const lines = [`# ${SITE_NAME}`, "", `> ${SITE_DESCRIPTION}`, ""];
  for (const p of pages) {
    lines.push(`- [${p.title}](${env.DOCS_URL}/${p.slug}.md)${p.description ? `: ${p.description}` : ""}`);
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Main

async function main() {
  const docPages = await loadPages();
  if (docPages.length === 0) throw new Error("docs/ has no .md files");

  let pages = docPages;
  if (!docPages.some((p) => p.slug === "index")) pages = [generatedIndex(docPages), ...docPages];

  await rm(DIST, { recursive: true, force: true });
  await mkdir(path.join(DIST, "assets"), { recursive: true });

  for (const page of pages) {
    let contentHtml;
    let headings;
    if (page.generated) {
      contentHtml = page.html;
      headings = [];
    } else {
      ({ html: contentHtml, headings } = renderMarkdown(page.body));
    }
    await writeFile(path.join(DIST, `${page.slug}.html`), shell({ page, pages, contentHtml, headings }));
    await writeFile(path.join(DIST, `${page.slug}.md`), page.markdown);
  }

  await writeFile(path.join(DIST, "llms.txt"), llmsTxt(docPages));
  await cp(path.join(ROOT, "assets", "site.css"), path.join(DIST, "assets", "site.css"));
  await cp(path.join(ROOT, "assets", "hljs.css"), path.join(DIST, "assets", "hljs.css"));
  await cp(path.join(ROOT, "static"), DIST, { recursive: true });

  const list = pages.map((p) => `  ${hrefOf(p).padEnd(14)} ${p.title}${p.generated ? " (generated)" : ""}`).join("\n");
  console.log(`dist/ rendered for DOCS_URL=${env.DOCS_URL} APP_URL=${env.APP_URL} HOME_URL=${env.HOME_URL}\n${list}`);
}

main().catch((err) => {
  console.error(`build failed: ${err.message}`);
  process.exit(1);
});
