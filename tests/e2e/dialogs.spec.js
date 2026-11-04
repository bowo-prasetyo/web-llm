// Confirmation before downloads and deletions, and keyboard / screen-reader
// basics: focus in dialogs and the chat list, Escape, accessible names.
import { test, expect, check, sleep, sent, clearSent, seedStorage, send, readChats, confirmDelete } from "../support/fixtures.js";

const M = "Qwen3.5-2B-q4f16_1-MLC";          // downloaded
const BIG = "Qwen2.5-7B-Instruct-q4f16_1-MLC"; // not downloaded, ~5 GB

test.use({ fakeWorker: true, downloaded: M });

async function ready(page) {
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
}
const loads = async page => (await sent(page, "set-config")).map(m => m.config.model);
const dialog = page => page.locator(".confirm-dialog");

test.describe("download confirmation", () => {
  test("picking a model that isn't downloaded asks first (chat toolbar)", async ({ page }) => {
    await ready(page);
    await clearSent(page);
    await page.selectOption(".model-select", BIG);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText("Download Model?");
    await expect(dialog(page)).toContainText("Qwen2.5 7B · 16-bit");
    await expect(dialog(page)).toContainText(/About \d+(\.\d)? GB will be downloaded/);
    await sleep(300);
    check((await loads(page)).length === 0, "nothing loads before the answer");

    await dialog(page).locator('button:has-text("Cancel")').click();
    await expect(dialog(page)).toHaveCount(0);
    expect(await page.inputValue(".model-select")).toBe(M);
    check((await loads(page)).length === 0, "Cancel loads nothing");

    await page.selectOption(".model-select", BIG);
    await dialog(page).locator('button:has-text("Download & Load")').click();
    await expect.poll(() => loads(page)).toEqual([BIG]);
  });

  test("the question also shows when the model is changed in Settings", async ({ page }) => {
    await ready(page);
    await page.click('button[title="Settings"]');
    await clearSent(page);
    await page.selectOption(".settings-select >> nth=0", BIG);
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape"); // same as Cancel
    await expect(dialog(page)).toHaveCount(0);
    expect(await page.inputValue(".settings-select >> nth=0")).toBe(M);
    await sleep(300);
    check((await loads(page)).length === 0, "Escape loads nothing");
  });
});

test.describe("deleting chats", () => {
  test("Clear asks before deleting the chat", async ({ page }) => {
    await ready(page);
    await send(page, "keep me please");
    await page.click(".clear-btn");
    await expect(dialog(page)).toContainText("Delete this chat?");
    await expect(dialog(page)).toContainText("keep me please");
    // The safe answer has focus, so Enter / Space don't delete by accident
    expect(await page.evaluate(() => document.activeElement.textContent.trim())).toBe("Cancel");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator(".message.user")).toHaveText("keep me please");
    expect((await readChats(page)).length).toBe(1);

    await page.click(".clear-btn");
    await confirmDelete(page);
    await expect(page.locator(".message")).toHaveCount(0);
    await expect.poll(async () => (await readChats(page)).length).toBe(0);
  });

  test("Clear Conversation in Settings asks too", async ({ page }) => {
    await ready(page);
    await send(page, "hello");
    await page.click('button[title="Settings"]');
    await page.click('button:has-text("Clear Conversation")');
    await expect(dialog(page)).toBeVisible();
    await dialog(page).locator('button:has-text("Cancel")').click();
    expect((await readChats(page)).length).toBe(1);
  });

  test("the sidebar's delete asks", async ({ page }) => {
    await ready(page);
    await send(page, "first chat");
    await page.click('button[title="Chat history"]');
    await page.locator(".session-item .session-delete").first().click();
    await expect(dialog(page)).toContainText("first chat");
    await dialog(page).locator('button:has-text("Cancel")').click();
    expect((await readChats(page)).length).toBe(1);
    await expect(page.locator(".sidebar.open")).toBeVisible(); // Cancel leaves the list open

    await page.locator(".session-item .session-delete").first().click();
    await confirmDelete(page);
    await expect.poll(async () => (await readChats(page)).length).toBe(0);
  });
});

test.describe("keyboard and screen readers", () => {
  test("the closed chat list is skipped by Tab; open, it holds focus and Escape closes it", async ({ page }) => {
    await ready(page);
    check(await page.locator(".sidebar").evaluate(e => e.inert), "closed list is inert");
    await page.locator('button[title="Chat history"]').focus();
    await page.keyboard.press("Tab");
    check(!(await page.evaluate(() => !!document.activeElement.closest(".sidebar"))), "Tab doesn't go into the closed list");

    await send(page, "a chat");
    await page.locator('button[title="Chat history"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".sidebar.open")).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement.closest(".sidebar"))).toBe(true);
    check((await page.getAttribute('button[title="Chat history"]', "aria-expanded")) === "true", "menu button says the list is open");
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      check(await page.evaluate(() => !!document.activeElement.closest(".sidebar")), `Tab ${i + 1} stays in the list`);
    }
    // A chat in the list is a real button
    const open = page.locator(".session-item .session-open").first();
    expect(await open.evaluate(e => e.tagName)).toBe("BUTTON");
    check((await open.getAttribute("aria-current")) === "true", "the open chat is marked current");

    await page.keyboard.press("Escape");
    await expect(page.locator(".sidebar.open")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement.getAttribute("title"))).toBe("Chat history");

    // The × button closes it too
    await page.click('button[title="Chat history"]');
    await page.click(".sidebar-close");
    await expect(page.locator(".sidebar.open")).toHaveCount(0);
  });

  test("a chat in the list opens with the keyboard", async ({ page }) => {
    await ready(page);
    await send(page, "older chat");
    await page.click('button[title="New chat"]');
    await send(page, "newer chat");
    await page.click('button[title="Chat history"]');
    await page.locator('.session-open:has-text("older chat")').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".message.user")).toHaveText("older chat");
  });

  test("dialogs take focus, keep it, close with Escape and give it back", async ({ page }) => {
    await ready(page);
    await page.click('button[title="New chat"]');
    const opener = page.locator(".welcome .link-btn"); // Help me choose a model
    await opener.focus();
    await page.keyboard.press("Enter");
    const picker = page.locator(".modal.picker");
    await expect(picker).toBeVisible();
    check((await picker.getAttribute("aria-modal")) === "true", "picker is modal");
    await expect.poll(() => page.evaluate(() => !!document.activeElement.closest(".modal.picker"))).toBe(true);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Shift+Tab");
      check(await page.evaluate(() => !!document.activeElement.closest(".modal.picker")), `Shift+Tab ${i + 1} stays in the picker`);
    }
    // Next step: focus follows into the new content
    await page.locator('.picker-option:has-text("Coding")').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".picker-option.tier")).toHaveCount(3);
    await expect.poll(() => page.evaluate(() => !!document.activeElement.closest(".modal.picker"))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement.textContent.trim())).toBe("Help me choose a model");
  });

  test("controls have names, and status changes are announced", async ({ page }) => {
    await ready(page);
    const name = sel => page.locator(sel).getAttribute("aria-label");
    expect(await name(".send-btn")).toBe("Send message");
    expect(await name(".model-select")).toBe("Model");
    expect(await name(".footer textarea")).toBe("Message");
    expect(await name('button[title="Settings"]')).toBe("Settings");
    expect(await name('button[title="New chat"]')).toBe("New chat");
    await expect(page.locator('.status-bar [role="status"]')).toContainText("Model loaded successfully");

    // Attach is a real button: reachable with Tab, and it opens the file picker
    const attach = page.locator(".upload-btn");
    check(await attach.evaluate(e => e.tagName === "BUTTON"), "Attach is a button");
    await attach.focus();
    check(await attach.evaluate(e => e === document.activeElement), "Attach takes focus");
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    check(!!(await chooser), "Enter on Attach opens the file picker");
    // File inputs are hidden: a visible (even tiny) one adds the browser's
    // "No file chosen" text to copied text and screen readers
    await expect(page.locator("input[type=file]:not([hidden])")).toHaveCount(0);

    await page.click('button[title="Settings"]');
    for (const label of ["Temperature", "Top P", "Max Tokens", "Context Window"]) {
      await expect(page.locator(`input[type=range][aria-label="${label}"]`)).toHaveCount(1);
    }
  });
});
