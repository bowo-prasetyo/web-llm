// Documents attached to a chat (the real worker.js, a scripted WebLLM and a
// word-based stand-in for the embedding model).
import { test, expect, check, sleep, seedStorage, send, engineRequests, clearSent, readChats, readAttachments, attachText } from "../support/fixtures.js";

const M = "Qwen2.5-0.5B-Instruct-q4f32_1-MLC";
const NOTE = "The team meeting is on Tuesday at 10am in room 4B.";
const lastQuestion = async page => (await engineRequests(page)).at(-1).messages.at(-1).content;
const chips = page => page.locator(".attachment-chip");

// About 100 paragraphs (~7000 characters, more than fits this model's
// context), one of them with the answer
const LONG_DOC = Array.from({ length: 100 }, (_, i) =>
  i === 23 ? "The secret launch code for the rocket is PURPLE-42."
  : i === 5 ? "Banana bread needs very ripe bananas and some cinnamon."
  : `Paragraph ${i} is about growing tomatoes, watering plants and garden soil.`).join("\n\n");

async function start(page, extra = {}) {
  await seedStorage(page, {
    "webllm-settings": { model: M, contextWindowSize: 2048, max_tokens: 512, defaultPersona: "friendly", settingsVersion: 2 },
    "webllm-cached-models": [M],
    "webllm-model-health": { [M]: { ok: true } },
    ...extra,
  });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await sleep(300);
}

test("a small document goes in whole, and only into its own chat", async ({ page }) => {
  await start(page);
  await attachText(page, "notes.txt", NOTE);
  await expect(chips(page)).toHaveCount(1);
  await expect(chips(page)).toContainText("notes.txt");
  await expect(chips(page).locator(".attachment-meta")).toHaveText(`${NOTE.length} chars`);

  await clearSent(page);
  await send(page, "When is the meeting?");
  const q = await lastQuestion(page);
  check(q.includes(`### notes.txt\n${NOTE}`), "the whole document is in the question");
  check(q.endsWith("Question: When is the meeting?"), "followed by the question");
  const firstChat = (await readChats(page))[0].id;

  // Another chat doesn't see it
  await page.click('button[title="New chat"]');
  await expect(chips(page)).toHaveCount(0);
  await clearSent(page);
  await send(page, "hello");
  check((await lastQuestion(page)) === "hello", "a new chat has no documents");

  // Back in the first chat, it's there again
  await page.click('button[title="Chat history"]');
  await page.click(`.session-item:has-text("When is the meeting")`);
  await expect(chips(page)).toHaveCount(1);
  await clearSent(page);
  await send(page, "And where?");
  check((await lastQuestion(page)).includes(NOTE), "the first chat still uses it");

  // It survives a reload
  await page.reload();
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await expect(chips(page)).toContainText("notes.txt");
  check((await readAttachments(page, firstChat)).length === 1, "stored with its chat");
});

test("a large document is indexed, then only the relevant part is used", async ({ page }) => {
  await start(page);
  await attachText(page, "manual.txt", LONG_DOC);
  await expect(chips(page).locator(".attachment-meta")).toHaveText(/k chars/, { timeout: 15_000 });
  const [stored] = await readAttachments(page);
  check(stored.chunks && stored.chunks.length > 1 && stored.chunks[0].embedding.length === 512, "chunks and embeddings are stored");

  await clearSent(page);
  await send(page, "What is the secret launch code for the rocket?");
  const q = await lastQuestion(page);
  check(q.startsWith("Parts of the documents attached to this chat"), "excerpts, not the whole document");
  check(q.includes("PURPLE-42"), "the relevant paragraph is included");
  check(!q.includes("Banana bread"), "an unrelated paragraph is left out");
  check(q.length < LONG_DOC.length, "shorter than the document");
  check(!/\n(ing|ering|atoes) /.test(q), "excerpts start at a whole word");

  // Indexed once: after a reload it's ready straight away
  await page.reload();
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await expect(chips(page).locator(".attachment-meta")).toHaveText(/k chars/);
  check(!(await page.evaluate(() => window.__sent.filter(m => m.type === "set-attachments").some(m => m.docs.some(d => !d.chunks)))), "stored chunks are reused");
});

test("removing documents, and chats that only hold a document", async ({ page }) => {
  await start(page);
  await attachText(page, "notes.txt", NOTE);
  await expect(chips(page)).toHaveCount(1);
  await page.click('button[title="Chat history"]');
  await expect(page.locator(".sidebar-list .session-item")).toContainText("📎 notes.txt");
  await page.click(".sidebar-overlay");

  await page.click(".attachment-remove");
  await expect(chips(page)).toHaveCount(0);
  await expect.poll(async () => (await readChats(page)).length).toBe(0); // the chat was only the document
  expect(await readAttachments(page)).toEqual([]);

  await attachText(page, "notes.txt", NOTE);
  await expect(chips(page)).toHaveCount(1);
  await send(page, "first question");
  await page.click(".attachment-remove");
  await clearSent(page);
  await send(page, "second question");
  check((await lastQuestion(page)) === "second question", "a removed document isn't used any more");
  check((await readChats(page)).length === 1, "the chat itself stays");
});

test("deleting a chat deletes its documents", async ({ page }) => {
  await start(page);
  await attachText(page, "notes.txt", NOTE);
  await send(page, "hi");
  await expect.poll(async () => (await readAttachments(page)).length).toBe(1);
  await page.click('button[title="Chat history"]');
  await page.locator(".session-item.active .session-delete").click();
  await expect.poll(async () => (await readAttachments(page)).length).toBe(0);
});

test("exported chats carry their documents", async ({ page }, testInfo) => {
  await start(page);
  await attachText(page, "notes.txt", NOTE);
  await send(page, "hi");
  await page.click("button[title=Settings]");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("text=Export Chats")]);
  const file = testInfo.outputPath("chats.json");
  await download.saveAs(file);
  const exported = JSON.parse(await (await import("node:fs/promises")).readFile(file, "utf8"));
  check(exported.sessions[0].attachments?.[0]?.text === NOTE, "the document's text is in the export");

  await page.click("text=Back");
  await page.click('button[title="Chat history"]');
  await page.locator(".session-item.active .session-delete").click();
  await expect.poll(async () => (await readAttachments(page)).length).toBe(0);
  await expect.poll(async () => (await readChats(page)).length).toBe(0); // not saved back as a document-only chat

  await page.click("button[title=Settings]");
  await page.locator('label:has-text("Import Chats") input[type=file]').setInputFiles(file);
  await expect.poll(async () => (await readAttachments(page)).map(a => a.text)).toEqual([NOTE]);
});

test("documents shared by all chats in earlier versions", async ({ page }) => {
  await page.goto("/style.css");
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const w = await (await root.getFileHandle("vector-db.json", { create: true })).createWritable();
    await w.write(JSON.stringify([{ filename: "old-report.pdf", text: "x", embedding: [1] }, { filename: "old-notes.md", text: "y", embedding: [1] }]));
    await w.close();
  });
  await start(page);
  const note = page.locator(".legacy-docs-note");
  await expect(note).toContainText("old-report.pdf, old-notes.md");
  await note.locator("text=Remove them").click();
  await expect(note).toBeHidden();
  await sleep(300);
  const exists = await page.evaluate(async () => {
    try { await (await navigator.storage.getDirectory()).getFileHandle("vector-db.json"); return true; } catch { return false; }
  });
  expect(exists).toBe(false);
  await page.reload();
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await expect(note).toBeHidden();
});

test("an empty file is refused with a message", async ({ page }) => {
  await start(page);
  await attachText(page, "empty.txt", "   ");
  await expect(page.locator(".status-bar")).toContainText("No text found in empty.txt");
  await expect(chips(page)).toHaveCount(0);
});
