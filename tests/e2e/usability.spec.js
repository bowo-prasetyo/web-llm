// Download progress, readable model names, scrolling while a reply streams,
// the message box on phones, and the Settings layout.
import { test, expect, check, sleep, sent, clearSent, send, readStorage } from "../support/fixtures.js";

const M = "Qwen3.5-2B-q4f16_1-MLC";          // downloaded
const BIG = "Qwen2.5-7B-Instruct-q4f16_1-MLC"; // not downloaded

test.use({ fakeWorker: true, downloaded: M });

async function ready(page) {
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
}
const loads = async page => (await sent(page, "set-config")).map(m => m.config.model);

const STEPS = [
  { text: "Start to fetch params", progress: 0 },
  { text: "Fetching param cache[5/57]: 1024MB fetched. 20% completed, 10 secs elapsed. It can take a while when we first visit this page to populate the cache.", progress: 20 },
  { text: "Fetching param cache[11/57]: 2048MB fetched. 40% completed, 20 secs elapsed. It can take a while when we first visit this page to populate the cache.", progress: 40 },
];

test.describe("download progress", () => {
  test("a download shows a progress bar, and Cancel goes back to the previous model", async ({ page, app }) => {
    await ready(page);
    await send(page, "hello");
    await page.locator(".settings-select, .model-select").first(); // menus are ready
    app.setMode({ download: STEPS, downloadDelay: 150, downloadHang: true });
    await clearSent(page);
    await page.selectOption(".model-select", BIG);
    await page.click('.confirm-dialog button:has-text("Download & Load")');

    const panel = page.locator(".load-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".load-title")).toHaveText("Downloading Qwen2.5 7B · 16-bit");
    const bar = panel.locator('[role="progressbar"]');
    await expect(bar).toHaveAttribute("aria-valuenow", "40");
    await expect(panel.locator(".load-detail")).toContainText(/40% · 2\.0 GB of ~\d+(\.\d)? GB/);
    check((await panel.locator(".load-fill").evaluate(e => e.style.width)) === "40%", "the bar is 40% full");
    await expect(page.locator(".status-text")).toContainText("Downloading Qwen2.5 7B · 16-bit · 40%");
    check(await page.locator(".cancel-download-btn").count() === 0, "no second Cancel button in the toolbar");

    app.setMode({});
    await panel.locator('button:has-text("Cancel")').click();
    await expect(panel).toHaveCount(0);
    await expect.poll(() => page.inputValue(".model-select")).toBe(M);
    await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
    check((await loads(page)).at(-1) === M, "the previous model loads again");
    check((await readStorage(page, "webllm-settings")).model === M, "and is saved as the model");
    check(!(await readStorage(page, "webllm-cached-models")).includes(BIG), "the cancelled model isn't marked as downloaded");
    await send(page, "still here?");
    await expect(page.locator(".message.assistant").last()).not.toHaveClass(/error/);
  });

  test("loading a downloaded model has no Cancel, and the bar goes away when it's ready", async ({ page, app }) => {
    app.setMode({ download: [
      { text: "Loading model from cache[3/57]: 250MB loaded. 5% completed, 2 secs elapsed.", progress: 5 },
      { text: "Loading GPU shader modules[10/60]: 16% completed, 3 secs elapsed.", progress: 16 },
    ], downloadDelay: 700 });
    await page.goto("/");
    const panel = page.locator(".load-panel");
    // Before the first report: the bar is indeterminate
    await expect(panel.locator(".load-track.indeterminate")).toBeVisible();
    await expect(panel.locator(".load-title")).toHaveText("Loading Qwen3.5 2B · 16-bit");
    await expect(panel.locator(".load-title")).toHaveText("Loading Qwen3.5 2B · 16-bit from this device");
    check(await panel.locator("button").count() === 0, "nothing to cancel");
    await expect(panel.locator(".load-title")).toHaveText("Preparing Qwen3.5 2B · 16-bit for your GPU");
    await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
    await expect(panel).toHaveCount(0);
  });
});

test("model menus use readable names; the ID stays the value", async ({ page }) => {
  await ready(page);
  const option = page.locator(`.model-select option[value="${M}"]`);
  await expect(option).toHaveText(/^Qwen3\.5 2B · 16-bit · 1010 MB ✓$/);
  const other = page.locator(`.model-select option[value="${BIG}"]`);
  await expect(other).toHaveText(/^Qwen2\.5 7B · 16-bit · 4\.0 GB$/);
  const texts = await page.locator(".model-select option").allTextContents();
  check(!texts.some(t => /MLC|q4f16|Instruct/.test(t)), "no raw IDs in the menu");

  await send(page, "hi");
  await page.click('button[title="Chat history"]');
  await expect(page.locator(".session-item .session-model").first()).toHaveText("Qwen3.5 2B");

  await page.keyboard.press("Escape");
  await page.click('button[title="Settings"]');
  await expect(page.locator("#model-hint .model-id")).toHaveText(M); // full ID for reference
});

test.describe("scrolling while a reply streams", () => {
  test("scrolling up stops following; Jump to latest goes back", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 500 });
    await ready(page);
    for (let i = 0; i < 4; i++) await send(page, "md", 300); // enough to scroll
    await page.fill(".footer textarea", "md slow");
    await page.keyboard.press("Enter");
    await expect(page.locator(".message.streaming")).toHaveCount(1);

    const messages = page.locator(".messages");
    await messages.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll")); });
    await sleep(800);
    check((await messages.evaluate(el => el.scrollTop)) === 0, "the reader stays where they scrolled to");
    const jump = page.locator(".jump-latest");
    await expect(jump).toBeVisible();
    await expect(jump).toContainText("Follow the reply");

    await jump.click();
    await expect(jump).toHaveCount(0);
    await expect.poll(() => messages.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(5);
    await expect(page.locator(".message.streaming")).toHaveCount(0, { timeout: 15_000 });
    // following again until the end, including the finished reply's growth
    await expect.poll(() => messages.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(5);

    // Sending always goes to the bottom
    await messages.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll")); });
    await send(page, "hello again", 0);
    await expect.poll(() => messages.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(5);
  });
});

test.describe("message box with a keyboard", () => {
  test("Enter sends, Shift+Enter is a new line, composing text doesn't send, the box grows", async ({ page }) => {
    await ready(page);
    const box = page.locator(".footer textarea");
    await expect(box).toHaveAttribute("placeholder", /Enter to send/);
    await expect(box).toHaveAttribute("enterkeyhint", "send");
    const h0 = await box.evaluate(e => e.offsetHeight);

    await clearSent(page);
    await box.fill("line one");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("line two");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("line three");
    check((await box.evaluate(e => e.offsetHeight)) > h0, "the box grows with its text");

    // Enter that confirms an IME composition must not send
    await box.evaluate(e => e.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, isComposing: true, bubbles: true, cancelable: true })));
    await sleep(200);
    check((await sent(page, "generate")).length === 0, "composition Enter doesn't send");

    await page.keyboard.press("Enter");
    await sleep(400);
    expect((await sent(page, "generate")).map(m => m.prompt)).toEqual(["line one\nline two\nline three"]);
    await expect(box).toHaveValue("");
    check((await box.evaluate(e => e.offsetHeight)) <= h0 + 1, "and shrinks back when sent");
  });
});

test.describe("message box on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("Enter is a new line, the Send button sends, no keyboard hints", async ({ page }) => {
    await ready(page);
    const box = page.locator(".footer textarea");
    await expect(box).toHaveAttribute("placeholder", "Ask something…");
    await expect(box).toHaveAttribute("enterkeyhint", "enter");
    check((await box.evaluate(e => getComputedStyle(e).fontSize)) === "16px", "16px text, so iOS doesn't zoom in");

    await clearSent(page);
    await box.fill("first line");
    await box.press("Enter");
    await page.keyboard.type("second line");
    await sleep(200);
    check((await sent(page, "generate")).length === 0, "Enter doesn't send");
    await expect(box).toHaveValue("first line\nsecond line");

    await page.locator(".send-btn").tap();
    await sleep(400);
    expect((await sent(page, "generate")).map(m => m.prompt)).toEqual(["first line\nsecond line"]);

    // Ctrl/Cmd+Enter still sends from a hardware keyboard
    await box.fill("from a keyboard");
    await box.press("Control+Enter");
    await sleep(400);
    check((await sent(page, "generate")).length === 2, "Ctrl+Enter sends");
  });
});

test.describe("Settings", () => {
  test("advanced settings start folded; Max Tokens shows words", async ({ page }) => {
    await ready(page);
    await page.click('button[title="Settings"]');
    await expect(page.locator(".settings-saved")).toHaveText("Changes are saved automatically");
    await expect(page.locator('input[aria-label="Temperature"]')).toBeVisible();
    await expect(page.locator('input[aria-label="Top P"]')).toBeHidden();
    await page.click("summary:has-text('Advanced sampling')");
    await expect(page.locator('input[aria-label="Top P"]')).toBeVisible();
    await expect(page.locator('input[aria-label="Repetition Penalty"]')).toBeVisible();
    await expect(page.locator(".setting-sub")).toHaveText(/≈ \d+ words/);
    check(await page.locator("text=Apply Settings").count() === 0, "no Apply button");
  });

  test("a new context window offers a reload, which loads it", async ({ page }) => {
    await ready(page);
    await page.click('button[title="Settings"]');
    await expect(page.locator(".setting-pending")).toHaveCount(0);
    await clearSent(page);
    const slider = page.locator('input[aria-label="Context Window"]');
    const now = Number(await slider.inputValue());
    const next = now === 2048 ? 1024 : 2048;
    await slider.fill(String(next));
    await expect(page.locator(".setting-pending")).toContainText("needs to reload");
    await sleep(300);
    check((await loads(page)).length === 0, "nothing reloads by itself");

    await page.click("text=Reload model now");
    await expect.poll(async () => (await sent(page, "set-config")).map(m => m.config.contextWindowSize)).toEqual([next]);
    await expect(page.locator(".setting-pending")).toHaveCount(0);
  });

  test("Reset asks, then restores the model's recommended settings", async ({ page }) => {
    await ready(page);
    await page.click('button[title="Settings"]');
    const temp = page.locator('input[aria-label="Temperature"]');
    const original = await temp.inputValue();
    await temp.fill("1.9");
    await page.click("text=Reset to this model's recommended settings");
    const dialog = page.locator(".confirm-dialog");
    await expect(dialog).toContainText("Reset reply settings?");
    await dialog.locator('button:has-text("Cancel")').click();
    await expect(temp).toHaveValue("1.9");

    await page.click("text=Reset to this model's recommended settings");
    await dialog.locator('button:has-text("Reset")').click();
    await expect(temp).toHaveValue(original);
  });
});
