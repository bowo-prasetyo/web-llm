// Settings: persistence, live updates without reloading the model, model
// switching, GPU crash recovery and session storage limits.
import { test, expect, check, sleep, sent, clearSent, seedStorage, readStorage, send } from "../support/fixtures.js";

test.use({ fakeWorker: true, downloaded: "SmolLM2-135M-Instruct-q0f32-MLC" });

const BASE_SETTINGS = {
  model: "SmolLM2-135M-Instruct-q0f32-MLC",
  temperature: 1.3, max_tokens: 999, top_p: 0.5, contextWindowSize: 2048,
  frequency_penalty: 0, presence_penalty: 0, repetition_penalty: 1,
  maxFileSizeMB: 50, system_prompt: "custom prompt", defaultPersona: "custom", settingsVersion: 2,
};

test("a downloaded model loads on first launch with its own defaults", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  const st = await readStorage(page, "webllm-settings");
  expect(st.model).toBe("SmolLM2-135M-Instruct-q0f32-MLC");
  expect(st.max_tokens).toBe(256);
});

test("custom settings survive a reload", async ({ page }) => {
  await seedStorage(page, { "webllm-settings": BASE_SETTINGS, "webllm-cached-models": [BASE_SETTINGS.model] });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await page.reload();
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  const st = await readStorage(page, "webllm-settings");
  expect([st.temperature, st.max_tokens, st.top_p, st.system_prompt]).toEqual([1.3, 999, 0.5, "custom prompt"]);
});

test("settings apply live, without reloading the model", async ({ page }) => {
  await seedStorage(page, { "webllm-settings": { ...BASE_SETTINGS, defaultPersona: "friendly" }, "webllm-cached-models": [BASE_SETTINGS.model] });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await send(page, "hello");

  await page.click("button[title=Settings]");
  await page.fill(".system-prompt-editor", "edited prompt");
  await sleep(600);
  const setsBefore = (await sent(page, "set-config")).length;
  await page.click("text=Apply Settings");
  await sleep(300);
  check((await sent(page, "set-config")).length === setsBefore, "Apply with the same model doesn't reload it");
  check((await sent(page, "update-config")).length > 0, "Apply sends update-config");
  check((await readStorage(page, "webllm-settings")).system_prompt === "edited prompt", "system prompt edit is saved");

  await page.click("text=Reset to Friendly instructions");
  check((await page.inputValue(".system-prompt-editor")).startsWith("You are a friendly"), "Reset restores the Friendly instructions");

  await page.click("text=Back");
  await send(page, "second");
  const gen = (await sent(page, "generate")).pop();
  check(gen.config.system_prompt.startsWith("You are a friendly") && gen.config.temperature === 1.3, "generate carries the current settings");
  check((await sent(page, "init")).length === 1 && (await sent(page, "set-config")).length === 1, "visiting Settings and back doesn't reload the model");
});

test("switching models keeps the conversation and applies the new model's defaults", async ({ page }) => {
  await seedStorage(page, { "webllm-settings": BASE_SETTINGS, "webllm-cached-models": [BASE_SETTINGS.model, "Qwen2.5-1.5B-Instruct-q4f16_1-MLC"] });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await send(page, "hello");
  await send(page, "second");
  await page.selectOption(".model-select", "Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
  await sleep(800);
  const all = await sent(page);
  const restore = all.filter(m => m.type === "restore-history").pop();
  const lastSet = all.filter(m => m.type === "set-config").pop();
  check(lastSet.config.model === "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", "new model loads");
  check(restore && restore.history.length === 4 && all.lastIndexOf(restore) > all.lastIndexOf(lastSet), "the chat is handed to the new model");
  check((await readStorage(page, "webllm-settings")).max_tokens === 768, "new model's defaults applied");
});

test("a GPU crash falls back to the lightest model once, then stops", async ({ page, app }) => {
  const models = [BASE_SETTINGS.model, "SmolLM2-360M-Instruct-q4f32_1-MLC", "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"];
  await seedStorage(page, { "webllm-settings": BASE_SETTINGS, "webllm-cached-models": models });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await clearSent(page);
  app.setMode({ crash: true });
  await page.selectOption(".model-select", "Qwen2.5-0.5B-Instruct-q4f16_1-MLC");
  await expect(page.locator(".webgpu-error-overlay")).toBeVisible();
  await sleep(500);
  const loads = (await sent(page, "set-config")).map(m => m.config.model);
  expect(loads).toEqual(["Qwen2.5-0.5B-Instruct-q4f16_1-MLC", "SmolLM2-360M-Instruct-q4f32_1-MLC"]);

  app.setMode({});
  await page.click("text=Try Again");
  await expect(page.locator(".webgpu-error-overlay")).toBeHidden();
  await expect(page.locator(".status-bar")).toContainText("loaded");
});
