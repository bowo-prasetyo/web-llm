// The first-run model picker.
import { devices } from "@playwright/test";
import { test, expect, check, sleep, sent, clearSent, seedStorage } from "../support/fixtures.js";

test.use({ fakeWorker: true });

const loads = async page => (await sent(page, "set-config")).map(m => m.config);
// navigator.deviceMemory as the device would report it
const setMemory = (context, gb) =>
  context.addInitScript(v => Object.defineProperty(navigator, "deviceMemory", { get: () => v }), gb);
const { defaultBrowserType, ...pixel7 } = devices["Pixel 7"];

test.describe("on an 8 GB laptop", () => {
  test.beforeEach(({ context }) => setMemory(context, 8));

  test("first launch asks before downloading anything", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".modal.picker")).toBeVisible();
    await expect(page.locator("#picker-title")).toContainText("Welcome");
    await sleep(500);
    expect(await loads(page)).toEqual([]);

    await page.click('.picker-option:has-text("Coding")');
    const tiers = await page.locator(".picker-option.tier").allInnerTexts();
    check(tiers.length === 3 && tiers[0].includes("Qwen2.5 Coder 1.5B") && tiers[1].includes("Qwen2.5 Coder 3B") && tiers[2].includes("Qwen2.5 Coder 7B"), "coding picks: 1.5B / 3B / 7B");
    check(tiers[1].includes("Recommended"), "Balanced recommended");
    await expect(page.locator(".picker-option.tier.active")).toContainText("Balanced");
    check(tiers[0].includes("1.6 GB"), "download sizes shown");
    await expect(page.locator(".picker-device")).toContainText("16-bit GPU math supported");

    await page.click('button:has-text("Download & start")');
    await sleep(600);
    const [load] = await loads(page);
    check(load.model === "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC", "the chosen model loads");
    await expect(page.locator(".modal-overlay")).toBeHidden(); // no second download dialog
    check(load.max_tokens === 1024 && load.defaultPersona === "coder", "its defaults and the Coder persona are applied");
    check((await page.inputValue(".persona-select")) === "coder", "this chat uses Coder");
  });

  test("reopened from Settings; labels downloaded and current models", async ({ page }) => {
    await page.goto("/");
    await page.click('.picker-option:has-text("Coding")');
    await page.click('button:has-text("Download & start")');
    await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");

    await page.click("button[title=Settings]");
    await page.click("text=Help me choose a model");
    await expect(page.locator("#picker-title")).toContainText("Choose a model");
    await expect(page.locator('.picker-option.active:has-text("Coding")')).toHaveCount(1);
    await page.click('.picker-option:has-text("Everyday chat")');
    await page.click('.picker-option.tier:has-text("Fast")');
    await clearSent(page);
    await page.click('button:has-text("Download & start")');
    await sleep(600);
    const [load] = await loads(page);
    check(load.model === "Llama-3.2-1B-Instruct-q4f16_1-MLC" && load.defaultPersona === "friendly", "switches to the Fast chat model");

    await page.locator(".welcome .link-btn").click();
    await page.click('.picker-option:has-text("Everyday chat")');
    const fast = await page.locator('.picker-option.tier:has-text("Fast")').innerText();
    check(fast.includes("Already downloaded") && fast.includes("In use"), "downloaded and in-use labels");
    await page.click('button:has-text("Back")');
    await page.click("text=Cancel");
    await expect(page.locator(".modal.picker")).toBeHidden();

    await page.reload();
    await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
    await expect(page.locator(".modal.picker")).toBeHidden(); // returning users aren't asked
  });

  test("picks q4f32 models where 16-bit GPU math fails", async ({ page, app }) => {
    app.setMode({ f16: false });
    await page.goto("/");
    await page.click('.picker-option:has-text("Coding")');
    await expect(page.locator(".picker-device")).toContainText("q4f32");
    await page.click('.picker-option.tier:has-text("Fast")');
    await page.click('button:has-text("Download & start")');
    await sleep(500);
    expect((await loads(page))[0].model).toBe("Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC");
  });

  test("a recorded q4f16 failure also switches picks to q4f32", async ({ page }) => {
    await seedStorage(page, { "webllm-model-health": { "Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC": { ok: false, reason: "one word repeated", sample: "outer outer" } } });
    await page.goto("/");
    await page.click('.picker-option:has-text("Everyday chat")');
    await page.click('button:has-text("Download & start")');
    await sleep(500);
    expect((await loads(page))[0].model).toBe("Qwen2.5-1.5B-Instruct-q4f32_1-MLC");
  });
});

test.describe("on a phone", () => {
  test.use(pixel7);
  test.beforeEach(({ context }) => setMemory(context, 4));

  test("recommends Fast, fits the screen, and Skip downloads nothing", async ({ page }) => {
    await page.goto("/");
    await page.click('.picker-option:has-text("Writing")');
    await expect(page.locator('.picker-option.tier:has-text("Fast")')).toContainText("Recommended");
    await expect(page.locator(".picker-option.tier.active")).toContainText("Fast");
    await expect(page.locator(".picker-device")).toContainText("Phone");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

    await page.click('button:has-text("Back")');
    await page.click("text=Skip, I'll choose myself");
    await expect(page.locator(".modal.picker")).toBeHidden();
    await expect(page.locator(".status-bar")).toContainText("Choose a model");
    await expect(page.locator(".choose-model-btn")).toBeVisible();
    expect(await loads(page)).toEqual([]);

    await page.fill(".footer textarea", "hi");
    await page.locator(".send-btn").click();
    await expect(page.locator(".modal.picker")).toBeVisible();
    expect(await sent(page, "generate")).toEqual([]);
  });
});
