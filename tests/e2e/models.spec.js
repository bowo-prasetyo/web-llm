// The model list: newer models in the right size groups, and thinking
// (Qwen3 / Qwen3.5 reasoning) off by default but switchable.
import { test, expect, check, sleep, seedStorage, send, engineRequests, clearSent } from "../support/fixtures.js";

const Q35 = "Qwen3.5-2B-q4f32_1-MLC";

async function start(page, model, extra = {}, { checked = true } = {}) {
  await seedStorage(page, {
    "webllm-settings": { model, defaultPersona: "friendly", settingsVersion: 2, ...extra },
    "webllm-cached-models": [model],
    ...(checked ? { "webllm-model-health": { [model]: { ok: true } } } : {}),
  });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
}

test.describe("model list", () => {
  test.use({ fakeWorker: true });

  test("newer models appear in the right size groups", async ({ page }) => {
    await start(page, Q35);
    const groups = await page.locator(".model-select optgroup").evaluateAll(gs =>
      Object.fromEntries(gs.map(g => [g.label, [...g.querySelectorAll("option")].map(o => o.value)])));
    const groupOf = id => Object.entries(groups).find(([, ids]) => ids.includes(id))?.[0];
    check(groupOf("Qwen3.5-0.8B-q4f16_1-MLC") === "Micro (0.5–0.8B)", "Qwen3.5 0.8B is micro");
    check(groupOf("gemma3-1b-it-q4f16_1-MLC") === "Lightweight (1–1.7B)", "Gemma 3 1B is lightweight");
    check(groupOf("OLMo-2-0425-1B-Instruct-q4f32_1-MLC") === "Lightweight (1–1.7B)", "OLMo 2 1B is lightweight");
    check(groupOf("Qwen3.5-2B-q4f32_1-MLC") === "Mid (2–4B)", "Qwen3.5 2B is mid");
    check(groupOf("Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC") === "Mid (2–4B)", "Ministral 3 3B is mid");
    check(groupOf("Phi-4-mini-instruct-q4f32_1-MLC") === "Upper-mid (3.8B)", "Phi-4-mini is upper-mid");
    check(groupOf("Qwen3.5-9B-q4f16_1-MLC") === "Large (7–9B)", "Qwen3.5 9B is large");
    check(!("Other" in groups), "nothing ends up in Other");

    // The tiniest models are kept, but last and labelled as very limited
    const labels = Object.keys(groups);
    const tiny = "Tiny (for testing; very limited answers)";
    check(labels.at(-1) === tiny, "the Tiny group comes last");
    expect(groups[tiny]).toEqual(expect.arrayContaining([
      "SmolLM2-135M-Instruct-q0f32-MLC", "SmolLM2-360M-Instruct-q4f32_1-MLC",
    ]));
    check(groups[tiny].every(id => /-(135|360)M-/.test(id)), "only the 135M–360M models are Tiny");
  });

  test("a newer model gets defaults for its size", async ({ page }) => {
    await start(page, "Llama-3.2-1B-Instruct-q4f32_1-MLC");
    await page.evaluate(() => { const c = JSON.parse(localStorage.getItem("webllm-cached-models")); c.push("Qwen3.5-9B-q4f32_1-MLC"); localStorage.setItem("webllm-cached-models", JSON.stringify(c)); });
    await clearSent(page);
    await page.selectOption(".model-select", "Qwen3.5-9B-q4f32_1-MLC");
    await sleep(500);
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem("webllm-settings")));
    expect([st.max_tokens, st.contextWindowSize]).toEqual([1024, 8192]);
  });
});

test.describe("thinking", () => {
  const lastRequest = async page => (await engineRequests(page)).at(-1);

  test("off by default for Qwen3.5, on when switched on in Settings", async ({ page }) => {
    await start(page, Q35, {}, { checked: false }); // first load: the model check runs
    const modelCheck = await page.evaluate(() => window.__calls.filter(c => c.kind === "request" && !c.stream));
    check(modelCheck.length === 1 && modelCheck[0].extra_body?.enable_thinking === false, "the model check doesn't think");
    await clearSent(page);
    await send(page, "hello", 800);
    expect((await lastRequest(page)).extra_body).toEqual({ enable_thinking: false });

    await page.click("button[title=Settings]");
    await page.locator(".thinking-toggle").check();
    await page.click("text=Back");
    await clearSent(page);
    await send(page, "think about it", 800);
    expect((await lastRequest(page)).extra_body).toBeNull();
  });

  test("not used for other models", async ({ page }) => {
    await start(page, "Llama-3.2-1B-Instruct-q4f32_1-MLC");
    await clearSent(page);
    await send(page, "hello", 800);
    expect((await lastRequest(page)).extra_body).toBeNull();
  });
});
