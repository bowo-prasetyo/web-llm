// Markdown rendering for assistant replies, plus handling of the
// <think>…</think> reasoning blocks that models such as Qwen3 and
// DeepSeek-R1 emit before their answer.
//
// Uses the pinned globals loaded in index.html: marked (parser),
// DOMPurify (sanitizer) and hljs (syntax highlighting). If they fail to
// load (offline, blocked CDN), replies fall back to escaped plain text.
//
// Nothing here touches the DOM or window at import time, so worker.js can
// import stripThinking too.

import { t } from "./i18n.js";

// ── Thinking blocks ─────────────────────────────────────────────────────

const OPEN = "<think>";
const CLOSE = "</think>";

// Split a reply into its reasoning and its answer.
// Returns { thinking, answer, thinkingDone }; thinking is null when the
// reply has no (non-empty) reasoning block.
export function splitThinking(content) {
  const text = content || "";
  const open = text.indexOf(OPEN);
  const close = text.indexOf(CLOSE);

  // Reply starts with <think> (leading whitespace allowed)
  if (open !== -1 && text.slice(0, open).trim() === "") {
    if (close === -1) {
      // Still reasoning: everything so far is thinking
      return clean(text.slice(open + OPEN.length), "", false);
    }
    return clean(text.slice(open + OPEN.length, close), text.slice(close + CLOSE.length), true);
  }

  // Some chat templates insert the opening tag themselves, so the model's
  // output only contains the closing one.
  if (open === -1 && close !== -1) {
    return clean(text.slice(0, close), text.slice(close + CLOSE.length), true);
  }

  return { thinking: null, answer: text, thinkingDone: true };
}

function clean(thinking, answer, thinkingDone) {
  const t = thinking.trim();
  return {
    // Empty blocks (e.g. "<think>\n\n</think>" when thinking is off) are dropped
    thinking: t || (thinkingDone ? null : ""),
    answer: answer.replace(/^\s+/, ""),
    thinkingDone,
  };
}

// The answer without its reasoning: what gets copied, previewed, and sent
// back to the model as conversation history.
export function stripThinking(content) {
  return splitThinking(content).answer;
}

// ── Markdown ────────────────────────────────────────────────────────────

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let parsers = null; // { plain, highlighted } Marked instances, built lazily
let purifyReady = false;

function libsAvailable() {
  return typeof window !== "undefined" &&
    window.marked && typeof window.marked.Marked === "function" &&
    window.DOMPurify && typeof window.DOMPurify.sanitize === "function";
}

function codeBlock(text, lang, highlight) {
  const language = (lang || "").trim().split(/\s+/)[0].toLowerCase();
  let body;
  if (highlight && language && window.hljs && window.hljs.getLanguage(language)) {
    try {
      body = window.hljs.highlight(text, { language, ignoreIllegals: true }).value;
    } catch {
      body = escapeHtml(text);
    }
  } else {
    body = escapeHtml(text);
  }
  const label = escapeHtml(language || t("message.code-label"));
  const cls = language ? ` class="hljs language-${escapeHtml(language)}"` : ` class="hljs"`;
  return `<div class="code-block"><div class="code-head"><span class="code-lang">${label}</span>` +
    `<button type="button" class="code-copy" aria-label="${escapeHtml(t("message.copy-code"))}">${escapeHtml(t("message.copy"))}</button></div>` +
    `<pre><code${cls}>${body}</code></pre></div>`;
}

function makeParser(highlight) {
  const parser = new window.marked.Marked({ gfm: true, breaks: true });
  parser.use({
    renderer: {
      code(token) {
        return codeBlock(token.text, token.lang, highlight);
      },
      // Show raw HTML written by the model as text instead of rendering it.
      html(token) {
        return escapeHtml(token.text);
      },
    },
  });
  return parser;
}

function setupPurify() {
  if (purifyReady) return;
  purifyReady = true;
  // Links open in a new tab and don't leak the page to the target.
  window.DOMPurify.addHook("afterSanitizeAttributes", node => {
    if (node.tagName === "A" && node.getAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

const cache = new Map();
const CACHE_LIMIT = 300;

// Render markdown to sanitized HTML. `highlight` turns on syntax colors;
// it is off while a reply is streaming, to keep each update cheap.
export function renderMarkdown(text, { highlight = true } = {}) {
  const source = text || "";
  const key = (highlight ? "1" : "0") + "\u0000" + source;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let html;
  if (libsAvailable()) {
    if (!parsers) {
      parsers = { plain: makeParser(false), highlighted: makeParser(true) };
    }
    setupPurify();
    try {
      const raw = (highlight ? parsers.highlighted : parsers.plain).parse(source);
      html = window.DOMPurify.sanitize(raw, { ADD_ATTR: ["target"] });
    } catch {
      html = plainHtml(source);
    }
  } else {
    html = plainHtml(source);
  }

  cache.set(key, html);
  if (cache.size > CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
  return html;
}

function plainHtml(text) {
  return `<p class="md-plain">${escapeHtml(text)}</p>`;
}
