// The real worker.js with a scripted WebLLM: replies that stream lots of
// output but show nothing (blank lines, special tokens), as 16-bit models do
// on GPUs with broken 16-bit math, are stopped and explained, and the model
// check after loading catches them too.
import { test, expect, check, sleep, seedStorage, readStorage, send } from "../support/fixtures.js";

const Q16 = "Qwen3.5-0.8B-q4f16_1-MLC";
const Q32 = "Qwen3.5-0.8B-q4f32_1-MLC";
const lastReply = page => page.locator(".message.assistant").last();

async function start(page, items = {}) {
  await seedStorage(page, {
    "webllm-settings": { model: Q16, settingsVersion: 2 },
    "webllm-cached-models": [Q16, Q32],
    "webllm-model-health": { [Q16]: { ok: true } },
    ...items,
  });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
}

for (const kind of ["blank", "tags"]) {
  test(`a reply of invisible ${kind} output is stopped early and explained`, async ({ page }) => {
    await start(page);
    // Watch the word counter while it streams
    await page.evaluate(() => {
      window.__counts = [];
      const bar = document.querySelector(".status-bar");
      new MutationObserver(() => {
        const m = /~(\d+) words/.exec(bar.textContent);
        if (m) window.__counts.push(+m[1]);
      }).observe(bar, { subtree: true, childList: true, characterData: true });
    });
    await send(page, kind, 1500);
    await expect(lastReply(page)).toContainText("collapsed into repeated words or unreadable output");
    await expect(page.locator('.modal-title:has-text("may not work on your GPU")')).toBeVisible();
    await expect(page.locator(".health-suggestion")).toContainText("32-bit");
    const counts = await page.evaluate(() => window.__counts);
    check(counts.every(n => n === 0), `the counter never counts invisible output (saw ${counts.slice(-3)})`);
  });
}

test("the model check after loading fails invisible output", async ({ page }) => {
  await start(page, { "webllm-settings": { model: Q32, settingsVersion: 2 }, "webllm-model-health": { [Q32]: { ok: true } } });
  await page.evaluate(() => new BroadcastChannel("mock-engine").postMessage({ kind: "check-blank" }));
  await sleep(100);
  await page.selectOption(".model-select", Q16); // not checked here yet
  await expect(page.locator('.modal-title:has-text("doesn\'t work on your GPU")')).toBeVisible();
  expect((await readStorage(page, "webllm-model-health"))[Q16].ok).toBe(false);
});
