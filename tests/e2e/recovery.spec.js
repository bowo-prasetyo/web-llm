// The real worker.js with a scripted WebLLM: when the browser takes the GPU
// away (phones do this in the background), WebLLM disposes the engine. The
// next message reloads the model and answers, instead of failing with
// "The current Object has already been disposed".
import { test, expect, check, seedStorage, send } from "../support/fixtures.js";

const M = "SmolLM2-360M-Instruct-q4f32_1-MLC";
const lastReply = page => page.locator(".message.assistant").last();
const creates = page => page.evaluate(() => window.__calls.filter(c => c.kind === "create").length);
const loseGpu = (page, always = false) => page.evaluate(a =>
  new BroadcastChannel("mock-engine").postMessage({ kind: "lose-gpu", always: a }), always);

async function start(page) {
  await seedStorage(page, {
    "webllm-settings": { model: M, settingsVersion: 2 },
    "webllm-cached-models": [M],
    "webllm-model-health": { [M]: { ok: true } },
  });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
}

test("a lost engine is reloaded and the message is answered", async ({ page }) => {
  await start(page);
  const before = await creates(page);
  await loseGpu(page);
  await send(page, "How can I sleep better?", 1500);
  await expect(lastReply(page)).toContainText("Echo: How can I sleep better?");
  await expect(page.locator(".message.assistant", { hasText: "Error" })).toHaveCount(0);
  check((await creates(page)) === before + 1, "the model was loaded again once");
  await expect(page.locator(".status-bar")).not.toContainText("thinking");
});

test("when reloading doesn't help, the error is clear and Retry works once the GPU is back", async ({ page }) => {
  await start(page);
  await loseGpu(page, true); // every engine fails from now on
  await send(page, "hello", 1500);
  await expect(lastReply(page)).toContainText("The model stopped working");
  await expect(lastReply(page)).not.toContainText("already been disposed");
  await expect(page.locator(".status-bar")).toContainText("Something went wrong");

  // The GPU is usable again: Retry loads a fresh engine and answers
  await page.evaluate(() => new BroadcastChannel("mock-engine").postMessage({ kind: "gpu-back" }));
  await lastReply(page).locator(".msg-action", { hasText: "Retry" }).click();
  await expect(lastReply(page)).toContainText("Echo: hello");
});
