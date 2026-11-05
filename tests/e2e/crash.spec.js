// The real worker.js with a scripted WebLLM. A phone that runs out of memory
// kills the page: the next visit must not load that model again (which
// would crash again), but explain and offer a lighter model.
import { test, expect, check, sleep, seedStorage, readStorage, send } from "../support/fixtures.js";

const Q08 = "Qwen3.5-0.8B-q4f32_1-MLC";
const LLAMA = "Llama-3.2-1B-Instruct-q4f32_1-MLC";
const dialog = page => page.locator('[aria-labelledby="crash-title"]');
const creates = page => page.evaluate(() => window.__calls.filter(c => c.kind === "create").map(c => c.model));

async function open(page, items = {}, { waitLoaded = true } = {}) {
  await seedStorage(page, {
    "webllm-settings": { model: Q08, settingsVersion: 2 },
    "webllm-cached-models": [Q08],
    "webllm-model-health": { [Q08]: { ok: true } },
    ...items,
  });
  await page.goto("/");
  if (waitLoaded) await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
}

const crashedWhile = phase => ({ "webllm-pending": { model: Q08, phase, ts: 1 } });

test("after a crash the model isn't loaded again; a lighter one is offered", async ({ page }) => {
  await open(page, crashedWhile("answering"), { waitLoaded: false });
  await expect(dialog(page)).toContainText("closed while answering with Qwen3.5 0.8B");
  await expect(dialog(page)).toContainText("Suggested: Llama 3.2 1B · 32-bit");
  await sleep(500);
  expect(await creates(page)).toEqual([]); // nothing loaded: no crash loop
  await expect(page.locator(".status-bar")).toContainText("closed the page last time");
  expect(Object.keys(await readStorage(page, "webllm-model-crashes"))).toEqual([Q08]);

  await dialog(page).getByRole("button", { name: "Use Llama 3.2 1B" }).click();
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  expect(await creates(page)).toEqual([LLAMA]);
  expect((await readStorage(page, "webllm-settings")).model).toBe(LLAMA);

  // The crashed model is marked in the menu
  const label = await page.locator(`.model-select option[value="${Q08}"]`).textContent();
  check(label.includes("crashed on this device"), "the menu warns about the crashed model");
});

test("Try again loads it; a successful answer clears the warning", async ({ page }) => {
  await open(page, crashedWhile("loading"), { waitLoaded: false });
  await expect(dialog(page)).toContainText("closed while loading Qwen3.5 0.8B");
  await dialog(page).getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  expect(await creates(page)).toEqual([Q08]);

  await send(page, "hello", 800);
  await expect(page.locator(".message.assistant").last()).toContainText("Echo: hello");
  expect(await readStorage(page, "webllm-model-crashes")).toEqual({});
  const label = await page.locator(`.model-select option[value="${Q08}"]`).textContent();
  check(!label.includes("crashed on this device"), "warning gone after it worked");
});

test("Choose another model opens the picker", async ({ page }) => {
  await open(page, crashedWhile("loading"), { waitLoaded: false });
  await dialog(page).getByRole("button", { name: "Choose another model" }).click();
  await expect(page.locator(".modal.picker")).toBeVisible();
  expect(await creates(page)).toEqual([]);
});

test("a note is kept only while answering with the page visible", async ({ page }) => {
  await open(page);
  check(await readStorage(page, "webllm-pending") === null, "no note once loaded");

  await page.fill(".footer textarea", "slow");
  await page.keyboard.press("Enter");
  await sleep(400);
  expect((await readStorage(page, "webllm-pending"))).toMatchObject({ model: Q08, phase: "answering" });

  // Switching apps: hidden pages are never counted as crashes
  const setVisibility = v => page.evaluate(state => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
  }, v);
  await setVisibility("hidden");
  check(await readStorage(page, "webllm-pending") === null, "removed while hidden");
  await setVisibility("visible");
  check((await readStorage(page, "webllm-pending"))?.phase === "answering", "back while visible again");

  await page.click(".stop-gen-btn");
  await expect(page.locator(".stop-gen-btn")).toBeHidden();
  check(await readStorage(page, "webllm-pending") === null, "removed when the reply ends");
});

test("reloading the page normally is not a crash", async ({ page }) => {
  await open(page);
  await page.fill(".footer textarea", "slow");
  await page.keyboard.press("Enter");
  await sleep(400);
  await page.reload();
  // The model loads again (and resumes the unanswered question, so the
  // "loaded" status only flashes by): wait for the load itself.
  await expect.poll(() => creates(page)).toEqual([Q08]);
  await expect(dialog(page)).toHaveCount(0);
  expect(await readStorage(page, "webllm-model-crashes")).toBeNull();
});

test("a GPU crash while answering keeps the text, explains, and loads nothing", async ({ page }) => {
  await open(page);
  await send(page, "gpu-lost", 2000);
  const reply = page.locator(".message.assistant").last();
  await expect(reply).toContainText("Here is part of an answer before the GPU");
  await expect(reply).toContainText("Cut off: the GPU stopped working.");
  await expect(reply.locator(".msg-action", { hasText: "Copy" })).toHaveCount(1);
  await expect(dialog(page)).toContainText("The GPU stopped working while answering with Qwen3.5 0.8B");
  await expect(dialog(page)).toContainText("Suggested: Llama 3.2 1B · 32-bit");
  await sleep(500);
  const loaded = await creates(page);
  check(loaded.every(m => m === Q08), "never switched to another model by itself");
  expect((await readStorage(page, "webllm-settings")).model).toBe(Q08);
  expect(Object.keys(await readStorage(page, "webllm-model-crashes"))).toEqual([Q08]);
});

test.describe("on a phone", () => {
  test.use({
    viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  });

  test("the picker's Fast choice is the lighter Llama 3.2 1B", async ({ page }) => {
    await seedStorage(page, {});
    await page.goto("/");
    await expect(page.locator(".modal.picker")).toBeVisible();
    await page.locator(".picker-option", { hasText: "Everyday chat" }).click();
    await expect(page.locator('.picker-option.tier:has-text("Fast")')).toContainText("Llama 3.2 1B");
  });
});
