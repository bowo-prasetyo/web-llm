// The real worker.js with a scripted WebLLM: replies are cut off only when
// they stop making progress, and the app shows how fast the model writes,
// suggesting a smaller one when it is slow.
import { test, expect, check, sleep, sent, clearSent, seedStorage, readStorage, send, engineRequests } from "../support/fixtures.js";

const M = "Qwen2.5-Coder-0.5B-Instruct-q4f32_1-MLC";
const Q2 = "Qwen3.5-2B-q4f32_1-MLC";
const Q08 = "Qwen3.5-0.8B-q4f32_1-MLC";
const lastReply = page => page.locator(".message.assistant").last();

async function start(page, { model = M, items = {} } = {}) {
  await seedStorage(page, {
    "webllm-settings": { model, contextWindowSize: 2048, temperature: 0.4, max_tokens: 512, settingsVersion: 2 },
    "webllm-cached-models": [model],
    "webllm-model-health": { [model]: { ok: true } },
    ...items,
  });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
}

test("a reply that stops producing text is cut off, keeping what it wrote", async ({ page }) => {
  await start(page, { items: { "webllm-time-limits": { stallMs: 800 } } });
  await clearSent(page);
  await send(page, "stall", 2500);

  await expect(page.locator(".stop-gen-btn")).toBeHidden();
  await expect(lastReply(page)).toContainText("Here are a few words before it");
  await expect(lastReply(page).locator(".msg-note")).toContainText("stopped writing for a minute");
  await expect(page.locator(".msg-action-primary", { hasText: "Continue" })).toBeVisible();
  const interrupts = await page.evaluate(() => window.__calls.filter(c => c.kind === "interrupt").length);
  check(interrupts >= 1, "the stuck generation is interrupted in the engine");
  // A stalled reply says nothing about speed
  check(!(await readStorage(page, "webllm-model-speed") || {})[M], "no speed recorded from a stall");
});

test("a slow but steady reply is never cut off, however long it takes", async ({ page }) => {
  // Each word comes 250 ms apart: the whole reply takes ~6 s, far longer
  // than the stall limit, but it never stops making progress.
  await start(page, { items: { "webllm-time-limits": { stallMs: 1500, firstTextMs: 1500 } } });
  await send(page, "steady", 7500);
  await expect(page.locator(".stop-gen-btn")).toBeHidden({ timeout: 5000 });
  const text = await lastReply(page).innerText();
  check(text.includes("steady1 ") && text.includes("steady24"), "the whole reply arrived");
  await expect(lastReply(page).locator(".msg-note")).toHaveCount(0);
});

test("the writing speed is measured from replies and shown", async ({ page }) => {
  await start(page);
  await expect(page.locator(".speed-note")).toHaveCount(0); // not known yet
  await send(page, "steady", 7500);
  await expect(page.locator(".stop-gen-btn")).toBeHidden({ timeout: 5000 });

  const speed = (await readStorage(page, "webllm-model-speed"))[M];
  check(speed && speed.source === "reply", "speed comes from the reply");
  check(speed && speed.wps > 2.5 && speed.wps < 6, `about 4 words/sec measured (got ${speed && speed.wps})`);
  await expect(page.locator(".speed-note")).toContainText(/writes about \d words\/sec on this device/);
  await expect(page.locator(".speed-note")).not.toHaveClass(/slow/);
  await expect(page.locator(".speed-switch")).toHaveCount(0);
});

test("a slow model gets a smaller one suggested, and the switch loads it", async ({ page }) => {
  await start(page, {
    model: Q2,
    items: { "webllm-model-speed": { [Q2]: { wps: 1.1, source: "reply" } } },
  });
  const note = page.locator(".speed-note");
  await expect(note).toHaveClass(/slow/);
  await expect(note).toContainText("Qwen3.5 2B writes about 1 word/sec on this device.");
  await expect(page.locator(".speed-switch")).toHaveText("Qwen3.5 0.8B · 32-bit");

  await clearSent(page);
  await page.click(".speed-switch");
  // Not downloaded yet: the usual download confirmation comes first
  await expect(page.locator(".confirm-dialog")).toContainText("Download Model?");
  await page.locator('.confirm-dialog button:has-text("Download & Load")').click();
  await expect.poll(async () => (await sent(page, "set-config")).map(m => m.config.model))
    .toContain(Q08);
  expect((await readStorage(page, "webllm-settings")).model).toBe(Q08);
});

test("the smallest models aren't sent to an even smaller one", async ({ page }) => {
  await start(page, {
    model: Q08,
    items: { "webllm-model-speed": { [Q08]: { wps: 0.5, source: "reply" } } },
  });
  await expect(page.locator(".speed-note")).toContainText("less than 1 word/sec");
  await expect(page.locator(".speed-switch")).toHaveCount(0);
});
