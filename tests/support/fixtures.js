// Shared Playwright fixtures for the browser tests.
//
// Every test gets a browser context where:
// - the pinned CDN libraries (Vue, Vue Router, marked, DOMPurify,
//   highlight.js) are served from node_modules, PDF.js and Google Fonts are
//   stubbed, and WebLLM / Transformers.js are replaced by mocks, so tests
//   need no network, GPU or model downloads;
// - messages the page sends to its worker are recorded in window.__sent,
//   and mock-engine reports in window.__calls;
// - `fakeWorker: true` (test.use) swaps worker.js for fake-worker.js, whose
//   behaviour the test sets with app.setMode({...});
// - `downloaded: "<model id>"` marks a model as already downloaded, so the
//   app loads it instead of opening the first-run model picker.
import { test as base, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { workerModels } from "./models.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const nm = p => path.join(ROOT, "node_modules", p);

const JS = "text/javascript; charset=utf-8";
const CORS = { "Access-Control-Allow-Origin": "*" };

// Keep in sync with index.html, worker.js and sw.js.
export const LIBRARIES = {
  "https://unpkg.com/vue@3.5.44/dist/vue.global.prod.js": nm("vue/dist/vue.global.prod.js"),
  "https://unpkg.com/vue-router@4.6.4/dist/vue-router.global.prod.js": nm("vue-router/dist/vue-router.global.prod.js"),
  "https://cdn.jsdelivr.net/npm/marked@18.1.1/lib/marked.umd.js": nm("marked/lib/marked.umd.js"),
  "https://cdn.jsdelivr.net/npm/dompurify@3.4.17/dist/purify.min.js": nm("dompurify/dist/purify.min.js"),
  "https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.12.0/highlight.min.js": nm("@highlightjs/cdn-assets/highlight.min.js"),
  "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.84/+esm": path.join(HERE, "mock-webllm.js"),
  "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2": path.join(HERE, "mock-transformers.js"),
};

const PDF_STUB =
  "export const GlobalWorkerOptions = {};\n" +
  "export function getDocument() { throw new Error('PDF parsing is not available in tests'); }\n";

function fakeWorkerSource() {
  const src = fs.readFileSync(path.join(HERE, "fake-worker.js"), "utf8");
  return src.replace("__MODELS__", JSON.stringify(workerModels()));
}

async function routeLibraries(context) {
  for (const [url, file] of Object.entries(LIBRARIES)) {
    await context.route(url, r => r.fulfill({ path: file, contentType: JS, headers: CORS }));
  }
  await context.route("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/**", r =>
    r.fulfill({ body: PDF_STUB, contentType: JS, headers: CORS }));
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r =>
    r.fulfill({ body: "", contentType: "text/css", headers: CORS }));
}

export const test = base.extend({
  fakeWorker: [false, { option: true }],
  downloaded: [null, { option: true }],

  app: [async ({ context, fakeWorker, downloaded }, use) => {
    const state = { mode: { f16: true } };
    await routeLibraries(context);
    await context.route("**/__mode", r => r.fulfill({ json: state.mode }));
    if (fakeWorker) {
      const body = fakeWorkerSource();
      await context.route(/\/worker\.js(\?.*)?$/, r => r.fulfill({ body, contentType: JS }));
    }
    await context.addInitScript(() => {
      window.__sent = [];
      window.__calls = [];
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message) {
        try { window.__sent.push(JSON.parse(JSON.stringify(message))); } catch {}
        return post.call(this, message);
      };
      new BroadcastChannel("mock-engine").onmessage = e => window.__calls.push(e.data);
    });
    if (downloaded) {
      await context.addInitScript(id => {
        try {
          if (!localStorage.getItem("webllm-cached-models")) {
            localStorage.setItem("webllm-cached-models", JSON.stringify([id]));
          }
        } catch {}
      }, downloaded);
    }
    await use({
      setMode(mode) { state.mode = mode; },
    });
  }, { auto: true }],
});

export { expect };

// ── helpers ────────────────────────────────────────────────────────────────

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Soft check: the test continues and all failures are reported together.
export function check(condition, message) {
  expect.soft(condition, message).toBeTruthy();
}

// Messages the page sent to its worker (optionally of one type).
export function sent(page, type) {
  return page.evaluate(t => window.__sent.filter(m => !t || m.type === t), type);
}

export function clearSent(page) {
  return page.evaluate(() => { window.__sent = []; window.__calls = []; });
}

// Requests the mock engine received (streamed replies only by default).
export function engineRequests(page, { stream = true } = {}) {
  return page.evaluate(s => window.__calls.filter(c => c.kind === "request" && c.stream === s), stream);
}

// Write localStorage before the app starts: from a page on the same origin
// that doesn't run the app, so the app can't overwrite it on unload.
export async function seedStorage(page, items, { clear = true } = {}) {
  await page.goto("/style.css");
  await page.evaluate(([entries, clr]) => {
    if (clr) localStorage.clear();
    for (const [k, v] of Object.entries(entries)) {
      localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    }
  }, [items, clear]);
}

export function readStorage(page, key) {
  return page.evaluate(k => {
    const v = localStorage.getItem(k);
    try { return JSON.parse(v); } catch { return v; }
  }, key);
}

// Type a message and send it with Enter.
export async function send(page, text, wait = 600) {
  await page.fill(".footer textarea", text);
  await page.keyboard.press("Enter");
  await sleep(wait);
}

// Chats as the app stores them in IndexedDB (newest first), each with its
// messages. Waits briefly so queued writes land first.
export async function readChats(page) {
  await sleep(150);
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("webllm-chats");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("chats")) { db.close(); resolve([]); return; }
      const tx = db.transaction(["chats", "messages"], "readonly");
      const chats = tx.objectStore("chats").getAll();
      const msgs = tx.objectStore("messages").getAll();
      tx.oncomplete = () => {
        const byId = Object.fromEntries(msgs.result.map(m => [m.id, m.messages]));
        db.close();
        resolve(chats.result
          .map(c => ({ ...c, messages: byId[c.id] || [] }))
          .sort((a, b) => b.ts - a.ts));
      };
      tx.onerror = () => reject(tx.error);
    };
  }));
}

// Chats in the localStorage format used before IndexedDB (and by the
// fallback): the index and one key per chat.
export function legacyChatItems(chats) {
  const items = { "webllm-sessions-index": chats.map(({ messages, ...meta }) => meta) };
  for (const c of chats) items["webllm-session:" + c.id] = c.messages || [];
  return items;
}

// Documents stored for a chat (or for all chats), from IndexedDB.
export function readAttachments(page, chatId = null) {
  return page.evaluate(id => new Promise((resolve, reject) => {
    const open = indexedDB.open("webllm-chats");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("attachments")) { db.close(); resolve([]); return; }
      const req = db.transaction("attachments").objectStore("attachments").getAll();
      req.onsuccess = () => { db.close(); resolve(req.result.filter(a => !id || a.chatId === id)); };
      req.onerror = () => reject(req.error);
    };
  }), chatId);
}

// Attach a text file to the chat on screen
export function attachText(page, name, text) {
  return page.setInputFiles(".upload-btn input[type=file]", {
    name, mimeType: "text/plain", buffer: Buffer.from(text),
  });
}

// Answer "Delete chat" in the confirmation that deleting or clearing a chat
// shows, and wait for it to close.
export async function confirmDelete(page) {
  const dialog = page.locator(".confirm-dialog");
  await dialog.locator('button:has-text("Delete chat")').click();
  await expect(dialog).toHaveCount(0);
}
