// GPUs with broken 16-bit math: the model check after loading, q4f32
// replacements, collapsed and empty replies, and Settings → This device.
import { test, expect, check, sleep, sent, clearSent, seedStorage, readStorage, send } from "../support/fixtures.js";

test.use({ fakeWorker: true });

const Q32 = "Qwen2.5-0.5B-Instruct-q4f32_1-MLC";
const CODER16 = "Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC";
const CODER32 = "Qwen2.5-Coder-0.5B-Instruct-q4f32_1-MLC";
const LLAMA16 = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

const settings = model => ({ model, temperature: 0.4, max_tokens: 512, contextWindowSize: 2048, defaultPersona: "friendly", settingsVersion: 2 });
const options = page => page.locator(".model-select option").allTextContents();
const loads = async page => (await sent(page, "set-config")).map(m => ({ model: m.config.model, selfTest: m.config.selfTest }));

test("a healthy device: one quiet check per model, nothing else changes", async ({ page }) => {
  await seedStorage(page, { "webllm-settings": settings(Q32), "webllm-cached-models": [Q32, CODER32] });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  check((await loads(page))[0].selfTest === true, "first load asks for the model check");
  check((await readStorage(page, "webllm-model-health"))[Q32].ok === true, "the result is remembered");
  await expect(page.locator(".modal-overlay")).toBeHidden();
  const opts = await options(page);
  check(!opts.some(o => o.startsWith(CODER32)) && !opts.some(o => o.includes("⚠")), "no alternatives or warnings in the model list");
  await page.reload();
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  check((await loads(page))[0].selfTest === false, "not checked again on reload");
});

test("a q4f16 model that gives garbled text: dialog, warnings and a q4f32 switch", async ({ page, app }) => {
  await seedStorage(page, { "webllm-settings": settings(Q32), "webllm-cached-models": [Q32, CODER16, CODER32], "webllm-model-health": { [Q32]: { ok: true } } });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  app.setMode({ check: { [CODER16]: "bad" } });
  await page.selectOption(".model-select", CODER16);

  await expect(page.locator(".modal-title")).toContainText("doesn't work on your GPU");
  await expect(page.locator(".health-suggestion")).toContainText(CODER32);
  await expect(page.locator(".modal-body").first()).toContainText("outer outer");
  const opts = await options(page);
  check(opts.some(o => o.startsWith(CODER32)), "q4f32 alternatives appear in the model list");
  check(opts.some(o => o.includes(CODER16) && o.includes("garbled on this GPU")), "the failed model is marked");
  check(opts.some(o => o.includes(LLAMA16) && o.includes("16-bit, may not work")), "other q4f16 models are marked");

  await clearSent(page);
  await page.click("text=Switch model");
  await sleep(500);
  const last = (await loads(page)).at(-1);
  check(last.model === CODER32 && last.selfTest === true, "Switch loads the q4f32 version and checks it");
  check((await page.inputValue(".model-select")) === CODER32, "the model list shows it");
});

test("collapsed, timed-out and stopped replies are explained, not shown as junk", async ({ page }) => {
  await seedStorage(page, { "webllm-settings": settings(LLAMA16), "webllm-cached-models": [LLAMA16], "webllm-model-health": { [LLAMA16]: { ok: true } } });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await send(page, "hello");
  await send(page, "degen");

  const reply = page.locator(".message.assistant").last();
  await expect(reply).toContainText("collapsed into repeated words");
  await expect(reply).toHaveClass(/error/);
  check(!(await reply.innerText()).includes("outer outer"), "the junk isn't kept");
  await expect(page.locator('.modal-title:has-text("may not work on your GPU")')).toBeVisible();
  await page.click("text=Keep this model");

  await clearSent(page);
  await reply.locator('.msg-action:has-text("Retry")').click();
  await sleep(500);
  const restore = (await sent(page, "restore-history"))[0];
  check(restore && restore.history.every(m => !/collapsed|outer/.test(m.content)), "Retry leaves the failed reply out of the model's memory");
  check(!(await page.isVisible(".modal-overlay")), "after 'Keep this model' the dialog doesn't come back");

  await send(page, "timeout");
  await expect(page.locator(".message.assistant").last()).toContainText("time limit");
  const count = await page.locator(".message").count();
  await send(page, "stopnow");
  await expect(page.locator(".message")).toHaveCount(count + 1); // just the question, no empty bubble
  await expect(page.locator(".status-bar")).toContainText("Stopped");
});

test("Settings → This device shows the GPU, 16-bit support and check results", async ({ page }) => {
  await seedStorage(page, {
    "webllm-settings": settings(Q32), "webllm-cached-models": [Q32],
    "webllm-model-health": { [Q32]: { ok: true }, [CODER16]: { ok: false, reason: "one word repeated", sample: " outer outer outer" } },
  });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await page.click("button[title=Settings]");
  const info = page.locator(".device-info");
  await expect(info).toContainText("0.2.84");
  await expect(info).toContainText("test gpu");
  await expect(info).toContainText("Garbled output detected");
  await expect(page.locator(".device-failed")).toContainText(CODER16);

  await page.click("text=/Forget check results/");
  await expect(info).toContainText("Not checked yet");
  await expect(page.locator(".device-failed")).toBeHidden();
  await page.click("text=Back");
  const opts = await options(page);
  check(!opts.some(o => o.includes("⚠")) && !opts.some(o => o.startsWith("Qwen3-0.6B-q4f32")), "warnings and extra models are gone");
});

test("a GPU without 16-bit support", async ({ page, app }) => {
  app.setMode({ f16: false, check: { [LLAMA16]: "no-f16" } });
  await seedStorage(page, { "webllm-settings": settings(LLAMA16), "webllm-cached-models": [LLAMA16] });
  await page.goto("/");
  await expect(page.locator('.modal-body:has-text("needs 16-bit GPU support")')).toBeVisible();
  check(!(await page.evaluate(() => document.querySelector(".model-select").disabled)), "the UI isn't stuck loading");
  check((await options(page)).some(o => o.startsWith("Qwen3-0.6B-q4f32_1-MLC")), "q4f32 alternatives are offered");
});
