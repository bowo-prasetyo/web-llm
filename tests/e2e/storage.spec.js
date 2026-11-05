// Downloads that won't fit in the browser's storage (private windows allow
// very little): warned about before downloading, and explained if they fail.
import { test, expect, check, sleep, seedStorage } from "../support/fixtures.js";

const Q2 = "Qwen3.5-2B-q4f32_1-MLC";
const Q08 = "Qwen3.5-0.8B-q4f32_1-MLC";

// Make the browser report a private window's storage: 300 MB allowed
async function smallStorage(page, { persisted = false } = {}) {
  await page.addInitScript(p => {
    const s = navigator.storage;
    s.estimate = async () => ({ quota: 300 * 1048576, usage: 20 * 1048576 });
    s.persisted = async () => p;
    window.__persistCalls = 0;
    s.persist = async () => { window.__persistCalls++; return true; };
  }, persisted);
}

test("the picker warns when a model won't fit", async ({ page }) => {
  await smallStorage(page);
  await seedStorage(page, {});
  await page.goto("/");
  await page.locator(".picker-option", { hasText: "Everyday chat" }).click();
  const fast = page.locator('.picker-option.tier:has-text("Fast")');
  await expect(fast.locator(".picker-space")).toContainText("only about 280 MB more");
  await expect(fast.locator(".picker-space")).toContainText("Private (incognito) windows have very little storage");
});

test("a normal window low on disk space gets the disk-space hint", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.estimate = async () => ({ quota: 3000 * 1048576, usage: 0 });
  });
  await seedStorage(page, {});
  await page.goto("/");
  await page.locator(".picker-option", { hasText: "Everyday chat" }).click();
  const smart = page.locator('.picker-option.tier:has-text("Smart")');
  await expect(smart.locator(".picker-space")).toContainText("Free some disk space, or choose a smaller model.");
  await expect(smart.locator(".picker-space")).not.toContainText("incognito");
  await expect(page.locator('.picker-option.tier:has-text("Fast") .picker-space')).toHaveCount(0);
});

test("the download question warns too", async ({ page }) => {
  await smallStorage(page);
  await seedStorage(page, {
    "webllm-settings": { model: Q2, settingsVersion: 2 },
    "webllm-cached-models": [Q2],
    "webllm-model-health": { [Q2]: { ok: true } },
  });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await page.selectOption(".model-select", Q08);
  await expect(page.locator(".confirm-dialog")).toContainText("Download Model?");
  await expect(page.locator(".confirm-dialog")).toContainText("this model needs 1.8 GB");
});

test("no warning when there is room", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.estimate = async () => ({ quota: 60000 * 1048576, usage: 500 * 1048576 });
  });
  await seedStorage(page, {});
  await page.goto("/");
  await page.locator(".picker-option", { hasText: "Everyday chat" }).click();
  await expect(page.locator(".picker-option.tier").first()).toBeVisible();
  await expect(page.locator(".picker-space")).toHaveCount(0);
});

test("a full disk gives a plain explanation instead of 'Quota exceeded'", async ({ page }) => {
  await seedStorage(page, {
    "webllm-settings": { model: Q2, settingsVersion: 2 },
    "webllm-cached-models": [Q2, Q08],
    "webllm-model-health": { [Q2]: { ok: true }, [Q08]: { ok: true } },
  });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await page.evaluate(() => new BroadcastChannel("mock-engine").postMessage({ kind: "storage-full" }));
  await sleep(100);
  await page.selectOption(".model-select", Q08);
  const reply = page.locator(".message.assistant").last();
  await expect(reply).toContainText("Not enough storage space to download this model");
  await expect(reply).not.toContainText("Quota exceeded");
});

test("after a model loads, the browser is asked once to keep the downloads", async ({ page }) => {
  await smallStorage(page);
  await seedStorage(page, {
    "webllm-settings": { model: Q2, settingsVersion: 2 },
    "webllm-cached-models": [Q2],
    "webllm-model-health": { [Q2]: { ok: true } },
  });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await sleep(300);
  expect(await page.evaluate(() => window.__persistCalls)).toBe(1);

  await page.click('button[title="Settings"]');
  const row = page.locator(".device-row", { hasText: "Storage" });
  await expect(row).toContainText("used of about 300 MB allowed");
  check((await row.locator(".device-val").getAttribute("class")).includes("warn"), "little storage is flagged");
});
