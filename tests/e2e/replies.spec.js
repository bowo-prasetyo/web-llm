// The real worker.js with a scripted WebLLM (tests/support/mock-webllm.js):
// cut-off replies and Continue, the repeated-sentence guard, junk replies,
// Stop, engine errors, the context window option and the settings migration.
import { test, expect, check, sleep, sent, clearSent, seedStorage, readStorage, send, engineRequests } from "../support/fixtures.js";

const M = "Qwen2.5-Coder-0.5B-Instruct-q4f32_1-MLC";
const lastReply = page => page.locator(".message.assistant").last();

async function start(page, settings) {
  await seedStorage(page, {
    "webllm-settings": { model: M, contextWindowSize: 2048, defaultPersona: "coder", ...settings },
    "webllm-cached-models": [M],
    "webllm-model-health": { [M]: { ok: true } },
  });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
}

test("old default settings are upgraded; the context window reaches WebLLM", async ({ page }) => {
  await start(page, { temperature: 0.2, max_tokens: 128 });
  const st = await readStorage(page, "webllm-settings");
  expect([st.max_tokens, st.temperature, st.settingsVersion]).toEqual([512, 0.4, 2]);
  const create = await page.evaluate(() => window.__calls.find(c => c.kind === "create"));
  expect(create.chatOpts.context_window_size).toBe(2048);
});

test("customised settings are kept by the upgrade", async ({ page }) => {
  await start(page, { temperature: 0.9, max_tokens: 300 });
  const st = await readStorage(page, "webllm-settings");
  expect([st.max_tokens, st.temperature]).toEqual([300, 0.9]);
});

test("a cut-off reply ends cleanly, and Continue finishes it in the same bubble", async ({ page }) => {
  await start(page, { temperature: 0.4, max_tokens: 512, settingsVersion: 2 });
  await clearSent(page);
  await send(page, "long", 900);
  let requests = await engineRequests(page);
  check(requests.length === 1, "one engine request: no automatic continuation");
  check(requests[0].max_tokens === 512, "uses Max Tokens");
  await expect(lastReply(page).locator(".msg-note")).toContainText("Cut off at the Max Tokens limit (512)");
  await expect(lastReply(page).locator('.msg-action:has-text("Continue")')).toHaveCount(1);

  const count = await page.locator(".message").count();
  await clearSent(page);
  await lastReply(page).locator('.msg-action:has-text("Continue")').click();
  await sleep(900);
  requests = await engineRequests(page);
  const messages = requests[0].messages;
  check(messages.at(-1).role === "user" && messages.at(-1).content.startsWith("Your previous reply was cut off"), "Continue sends a clear instruction");
  check(messages.at(-2).role === "assistant" && messages.at(-2).content.startsWith("Here is the first part"), "with the reply so far");
  await expect(lastReply(page).locator(".md")).toContainText("is used to The rest of the answer, finished properly.");
  await expect(page.locator(".message")).toHaveCount(count);
  await expect(lastReply(page).locator(".msg-note")).toHaveCount(0);
  await expect(lastReply(page).locator('.msg-action:has-text("Continue")')).toHaveCount(0);

  await clearSent(page);
  await send(page, "next question");
  const memory = (await engineRequests(page))[0].messages.filter(m => m.role === "assistant").map(m => m.content);
  check(memory.some(c => c.includes("used to The rest of the answer")), "the model remembers the whole continued reply");
});

test("a reply that repeats itself is cut back to before the repeats", async ({ page }) => {
  await start(page, { temperature: 0.4, max_tokens: 512, settingsVersion: 2 });
  await send(page, "loop", 1500);
  const text = await lastReply(page).locator(".md").innerText();
  check((text.match(/is a built-in function in JavaScript that can be used to write/g) || []).length <= 1, "repeats removed");
  check(!text.includes("toThe"), "no glued words");
  check(text.trim().endsWith("to the console.") && text.includes("To show the output on a browser"), "the good part is kept and ends at a sentence");
  await expect(lastReply(page).locator(".msg-note")).toContainText("started repeating itself");

  await clearSent(page);
  await send(page, "after loop");
  const memory = (await engineRequests(page))[0].messages.filter(m => m.role === "assistant");
  check(memory.every(m => (m.content.match(/can be used to write the string/g) || []).length <= 1), "the model remembers the cut reply, not the loop");
});

test("junk, Stop and engine errors", async ({ page }) => {
  await start(page, { temperature: 0.4, max_tokens: 512, settingsVersion: 2 });
  await send(page, "junk", 1200);
  await expect(lastReply(page)).toContainText("collapsed into repeated words");

  await page.fill(".footer textarea", "slow");
  await page.keyboard.press("Enter");
  await sleep(1200);
  await page.click(".stop-gen-btn");
  await expect(page.locator(".stop-gen-btn")).toBeHidden();
  await expect(lastReply(page)).toContainText("word word");
  await expect(lastReply(page).locator(".msg-note")).toHaveCount(0);

  await send(page, "boom", 1200);
  const replies = await page.locator(".message.assistant").allInnerTexts();
  check(replies.at(-2).includes("Partial text before the crash"), "text before the error is kept");
  check(replies.at(-1).includes("Error: Something broke"), "the error is shown");
  await expect(page.locator(".message.streaming")).toHaveCount(0);
});
