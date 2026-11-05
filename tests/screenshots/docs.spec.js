// The screenshots in the README and the user manual (docs/*.png).
//
//   npm run screenshots
//
// Not part of `npm test`: it rewrites the images. The scenes are rebuilt
// with the same mocks as the browser tests, so no GPU is needed. The chat
// shown is a real conversation with Qwen3.5 2B (32-bit), stored as a saved
// chat: the replies below are that model's own words, not written for the
// picture. Keep them that way when you change the scene.
import { test, expect, seedStorage, legacyChatItems, sleep } from "../support/fixtures.js";

const DOCS = new URL("../../docs/", import.meta.url).pathname;
const M = "Qwen3.5-2B-q4f32_1-MLC";

// Wednesday 4 November 2026, 05:25 (the browser's time zone is set below)
const NOW = new Date("2026-11-04T05:25:00");
const at = (days, h, m) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

const LLM_CHAT = [
  { role: "user", content: "Hi, do you know what an LLM is?" },
  { role: "assistant", content:
`Yes, I do! An **LLM** stands for **Large Language Model**.

It's like an advanced computer program that is trained to read, understand, and generate human-like text. These models learn patterns from vast amounts of data (like books, code, and websites) so they can answer questions, write stories, or help with tasks.` },
  { role: "user", content: "How does an LLM think and feel to understand human language?" },
  { role: "assistant", content:
`That's a great question! LLMs don't "think" or "feel" like humans in the way we do. Instead, they are trained to recognize patterns in human language.

Here's how it works:

1. **They learn patterns:** The model is trained on massive amounts of text, and it learns how words, phrases, and sentences relate to each other.
2. **It predicts what comes next:** When you ask a question, the model predicts the next piece of text based on what it has learned.
3. **It doesn't "feel" emotions:** It doesn't have feelings, emotions, or consciousness. It processes data and produces responses based on patterns.

So, while they can work with human language very well, they don't have internal feelings or consciousness like humans do! 😊` },
];

// Older chats in the list: only their title and first line show
const chats = [
  { id: "llm", title: "What is an LLM?", preview: "LLMs don't think or feel like humans in the way we do.",
    persona: "friendly", ts: at(0, 5, 19), messages: LLM_CHAT },
  { id: "email", title: "Polite email declining a meeting", preview: "Here's a short, friendly draft…",
    persona: "writer", ts: at(0, 4, 19), messages: [] },
  { id: "debounce", title: "Debounce function in JavaScript", preview: "function debounce(fn, wait) {…",
    persona: "coder", ts: at(1, 4, 2), messages: [] },
  { id: "ideas", title: "Weekend side project ideas", preview: "1. A plant-watering reminder…",
    persona: "brainstorm", ts: at(3, 10, 40), messages: [] },
].map(c => ({ ...c, model: M }));

test.use({ fakeWorker: true, timezoneId: "UTC", colorScheme: "dark", deviceScaleFactor: 2 });

test("README and manual: a chat on a computer", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(NOW);
  await seedStorage(page, {
    "webllm-settings": { model: M, defaultPersona: "friendly", settingsVersion: 2 },
    "webllm-cached-models": [M],
    "webllm-model-health": { [M]: { ok: true } },
    ...legacyChatItems(chats),
  });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await expect(page.locator(".message")).toHaveCount(4);
  await page.mouse.move(0, 899); // no hover highlight
  await sleep(300);
  await page.screenshot({ path: DOCS + "screenshot.png" });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });

  test("README and manual: the first-run model picker on a phone", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("What will you mostly use it for?")).toBeVisible();
    await sleep(400);
    await page.screenshot({ path: DOCS + "screenshot-phone.png" });
  });
});
