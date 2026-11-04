// Chat storage in IndexedDB (chatstore.js): migration from localStorage,
// no size limits, delete / clear, search, export / import, and the
// localStorage fallback when IndexedDB is unavailable.
import { test, expect, check, sleep, seedStorage, readStorage, send, readChats, legacyChatItems, confirmDelete } from "../support/fixtures.js";

test.use({ fakeWorker: true });

const M = "Qwen2.5-0.5B-Instruct-q4f32_1-MLC";
const BASE = {
  "webllm-settings": { model: M, defaultPersona: "friendly", settingsVersion: 2 },
  "webllm-cached-models": [M],
  "webllm-model-health": { [M]: { ok: true } },
};

// A chat with n messages: "question i" / "answer i"
function chat(id, n, ts) {
  const messages = [];
  for (let i = 0; i < n; i++) {
    messages.push(i % 2 === 0
      ? { role: "user", content: `question ${i} in ${id}` }
      : { role: "assistant", content: `answer ${i} in ${id}` });
  }
  return { id, title: `Chat ${id}`, preview: "", model: M, persona: "friendly", ts, messages };
}

async function ready(page) {
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await sleep(300);
}

test("chats saved in localStorage move to IndexedDB, nothing lost", async ({ page }) => {
  const long = chat("long", 120, 2000);
  const short = chat("short", 4, 1000);
  await seedStorage(page, {
    ...BASE,
    ...legacyChatItems([long, short]),
    "webllm-conversation": [{ role: "user", content: "the very first chat" }, { role: "assistant", content: "hi" }],
    "webllm-session:orphan": [{ role: "user", content: "left behind by an old version" }],
  });
  await page.goto("/");
  await ready(page);

  const chats = await readChats(page);
  expect(chats.map(c => c.id).sort()).toEqual(expect.arrayContaining(["long", "short"]));
  expect(chats).toHaveLength(3); // + the single pre-multi-chat conversation
  expect(chats.find(c => c.id === "long").messages).toHaveLength(120);
  check(chats.some(c => c.messages[0]?.content === "the very first chat"), "the oldest single conversation is kept");

  const leftover = await page.evaluate(() => Object.keys(localStorage).filter(k =>
    k === "webllm-sessions-index" || k === "webllm-conversation" || k.startsWith("webllm-session:")));
  expect(leftover).toEqual([]); // old keys removed after the copy

  await page.click('button[title="Chat history"]');
  await expect(page.locator(".sidebar-list .session-item")).toHaveCount(3);
  await page.click('.session-item:has-text("Chat long")');
  await expect(page.locator(".message")).toHaveCount(120);
});

test("no limits: long chats and many chats are kept in full", async ({ page }) => {
  const many = Array.from({ length: 60 }, (_, i) => chat("c" + i, 2, 1000 + i));
  const long = chat("long", 120, 9999);
  await seedStorage(page, { ...BASE, ...legacyChatItems([long, ...many]) });
  await page.goto("/");
  await ready(page);
  await expect(page.locator(".message")).toHaveCount(120); // the latest chat opens

  await send(page, "one more question");
  let chats = await readChats(page);
  expect(chats).toHaveLength(61);
  expect(chats[0].id).toBe("long");
  expect(chats[0].messages).toHaveLength(122); // nothing trimmed to 40

  await page.click('button[title="New chat"]');
  await send(page, "a brand-new chat");
  chats = await readChats(page);
  expect(chats).toHaveLength(62); // nothing pruned at 50

  await page.reload();
  await ready(page);
  await page.click('button[title="Chat history"]');
  await expect(page.locator(".sidebar-list .session-item")).toHaveCount(62);
});

test("deleting and clearing remove chats from storage", async ({ page }) => {
  await seedStorage(page, { ...BASE, ...legacyChatItems([chat("a", 2, 1000), chat("b", 2, 2000), chat("c", 2, 3000)]) });
  await page.goto("/");
  await ready(page); // chat c (the newest) is open
  await page.click('button[title="Chat history"]');
  await page.locator('.session-item:has-text("Chat a") .session-delete').click();
  await confirmDelete(page);
  await expect.poll(async () => (await readChats(page)).map(c => c.id)).toEqual(["c", "b"]);

  // Deleting the open chat must not save it back when the new chat starts
  await page.locator('.session-item.active .session-delete').click();
  await confirmDelete(page);
  await expect.poll(async () => (await readChats(page)).map(c => c.id)).toEqual(["b"]);
  await expect(page.locator(".message")).toHaveCount(0);
  await page.click('button[title="Chat history"]'); // starting the new chat closed the list
  await page.click('.session-item:has-text("Chat b")');

  await page.click(".clear-btn:has-text('Clear')");
  await confirmDelete(page);
  await expect.poll(async () => (await readChats(page)).length).toBe(0);
  await expect(page.locator(".message")).toHaveCount(0);
});

test("search finds text deep inside long chats", async ({ page }) => {
  await seedStorage(page, { ...BASE, ...legacyChatItems([chat("long", 120, 2000), chat("other", 2, 1000)]) });
  await page.goto("/");
  await ready(page);
  await page.click('button[title="New chat"]');
  await page.click('button[title="Chat history"]');
  await page.fill(".search-input", "answer 101 in long");
  await expect(page.locator(".search-result-item")).toHaveCount(1);
  await expect(page.locator(".search-result-item")).toContainText("question 0 in long"); // titled by its first question
  await expect(page.locator(".search-result-item .match-snippet").first()).toContainText("answer 101 in long");
});

test("export and import keep every message", async ({ page }, testInfo) => {
  await seedStorage(page, { ...BASE, ...legacyChatItems([chat("long", 120, 2000), chat("short", 4, 1000)]) });
  await page.goto("/");
  await ready(page);
  await page.click("button[title=Settings]");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("text=Export Chats"),
  ]);
  const file = testInfo.outputPath("chats.json");
  await download.saveAs(file);

  await page.click("text=Back");
  await page.click('button[title="Chat history"]');
  await page.locator('.session-item:has-text("Chat short") .session-delete').click();
  await confirmDelete(page);
  await page.locator(".session-item.active .session-delete").click(); // the open chat; the list closes
  await confirmDelete(page);
  await expect.poll(async () => (await readChats(page)).length).toBe(0);

  await page.click("button[title=Settings]");
  await page.locator('label:has-text("Import Chats") input[type=file]').setInputFiles(file);
  await expect.poll(async () => (await readChats(page)).map(c => c.id).sort()).toEqual(["long", "short"]);
  const chats = await readChats(page);
  expect(chats.find(c => c.id === "long").messages).toHaveLength(120);
  await expect(page.locator(".device-info")).toContainText("IndexedDB");
  await expect(page.locator(".device-info")).toContainText("2 chats");
  await page.click("text=Back");
  await expect(page.locator(".status-bar")).toContainText("Imported 2 session");
});

test("without IndexedDB, chats are saved in localStorage", async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { get: () => undefined, configurable: true });
  });
  await seedStorage(page, BASE);
  await page.goto("/");
  await ready(page);
  await send(page, "saved without IndexedDB");
  await expect.poll(() => readStorage(page, "webllm-sessions-index")).toHaveLength(1);

  await page.reload();
  await ready(page);
  await expect(page.locator(".message.user")).toContainText("saved without IndexedDB");
  await page.click("button[title=Settings]");
  await expect(page.locator(".device-info")).toContainText("Local storage, limited to 50 chats of 40 messages");
});
