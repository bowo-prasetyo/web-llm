// Replies: Markdown rendering, sanitising, code blocks, copy, thinking
// sections, Regenerate / Retry, and the plain-text fallback.
import { test, expect, check, sleep, sent, clearSent, send, readChats } from "../support/fixtures.js";

test.use({ fakeWorker: true, downloaded: "SmolLM2-135M-Instruct-q0f32-MLC" });

async function start(page, context) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
}
const clipboard = page => page.evaluate(() => navigator.clipboard.readText());
const lastReply = page => page.locator(".message.assistant").last();

test("Markdown replies, safely rendered, with copy buttons", async ({ page, context }) => {
  await start(page, context);
  check(await page.evaluate(() => !!(window.marked && window.DOMPurify && window.hljs)), "Markdown libraries load (with their integrity hashes)");

  await send(page, "md slow", 1500);
  check(await page.locator(".message.streaming .hljs-keyword").count() === 0, "no syntax colours while streaming");
  check(await page.locator(".message.streaming .msg-actions").count() === 0, "no actions while streaming");
  await expect(page.locator(".message.streaming")).toHaveCount(0, { timeout: 10_000 });

  const msg = lastReply(page);
  await expect(msg.locator(".md strong").first()).toHaveText("bold");
  await expect(msg.locator(".md :not(pre) > code").first()).toHaveText("inline");
  await expect(msg.locator("table td")).toHaveCount(2);
  await expect(msg.locator("li")).toHaveCount(2);
  await expect(msg.locator(".code-lang")).toHaveText("js");
  check(await msg.locator(".hljs-keyword").count() > 0, "syntax colours once finished");

  check(!(await page.evaluate(() => window.__xss)), "no script ran");
  check(await msg.locator("img").count() === 0 && (await msg.textContent()).includes("<img src=x"), "raw HTML shown as text");
  check(!(await msg.locator('a:has-text("bad")').getAttribute("href")), "javascript: link removed");
  const good = msg.locator('a:has-text("good")');
  check((await good.getAttribute("target")) === "_blank" && (await good.getAttribute("rel")).includes("noopener"), "links open in a new tab with noopener");

  await msg.locator(".code-copy").click();
  await expect(msg.locator(".code-copy")).toHaveText("Copied");
  check((await clipboard(page)) === "function add(a, b) {\n  return a + b; // sum\n}", "code Copy copies the code");
  await msg.locator('.msg-action:has-text("Copy")').click();
  await sleep(200);
  check((await clipboard(page)).startsWith("Here is **bold**"), "reply Copy copies the Markdown source");
});

test("thinking is shown live, then folded and kept out of copies and history", async ({ page, context }) => {
  await start(page, context);
  await send(page, "md");
  await send(page, "think slow", 1000);
  await expect(page.locator(".message.streaming details.thinking[open] .thinking-live")).toBeVisible();
  await expect(page.locator(".message.streaming")).toHaveCount(0, { timeout: 10_000 });

  const reply = lastReply(page);
  await expect(reply.locator('details.thinking:not([open]) summary:has-text("Thought process")')).toHaveCount(1);
  await expect(reply.locator(":scope > .md")).toHaveText("The answer is 42.");
  await reply.locator("details.thinking summary").click();
  await expect(reply.locator(".thinking-body strong")).toHaveText("this");

  await reply.locator('.msg-action:has-text("Copy")').click();
  await sleep(200);
  check((await clipboard(page)) === "The answer is **42**.", "Copy leaves out the thinking");
  const index = await readChats(page);
  check(index[0].preview.startsWith("The answer is"), "chat preview leaves out the thinking");

  // Regenerate rewinds the model's memory and asks again
  const count = await page.locator(".message").count();
  await clearSent(page);
  await reply.locator('.msg-action:has-text("Regenerate")').click();
  await sleep(500);
  const all = await sent(page);
  const restore = all.find(m => m.type === "restore-history");
  const gen = all.find(m => m.type === "generate");
  check(restore && gen && gen.prompt === "think slow" && all.indexOf(restore) < all.indexOf(gen), "Regenerate rewinds history, then asks again");
  check(restore.history.length === 2 && restore.history.every(m => !m.content.includes("<think>")), "history sent to the model has no <think> blocks");
  await expect(page.locator(".message.streaming")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator(".message")).toHaveCount(count);
  check(await page.locator(".message.assistant").first().locator('.msg-action:has-text("Regenerate")').count() === 0, "Regenerate only on the last reply");
});

test("errors offer Retry; your own messages stay plain text", async ({ page, context }) => {
  await start(page, context);
  await send(page, "fail", 400);
  await expect(page.locator('.message.assistant.error .msg-action:has-text("Retry")')).toBeVisible();
  await send(page, "**not bold** <i>x</i>");
  check(await page.locator(".message.user").last().locator("strong,i").count() === 0, "user message not rendered as Markdown");
});

test("no horizontal scrolling on a phone with code and tables", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, context);
  await send(page, "md", 1200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test("without the Markdown libraries, replies fall back to plain text", async ({ page, context }) => {
  await context.route(/cdn\.jsdelivr\.net\/npm\/(marked|dompurify|@highlightjs)/, r => r.abort());
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await start(page, context);
  await send(page, "md", 1200);
  const reply = lastReply(page);
  await expect(reply.locator(".md-plain")).toHaveCount(1);
  expect(await reply.locator("strong,img").count()).toBe(0);
  expect(errors).toEqual([]);
});
