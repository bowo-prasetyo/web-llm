// The chat list docked beside the chat on wide screens, the header, and
// the smallest text size.
import { test, expect, check, sleep, send } from "../support/fixtures.js";
import fs from "node:fs";

test.use({ fakeWorker: true, downloaded: "Qwen3.5-2B-q4f16_1-MLC" });

async function ready(page) {
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
}
const menu = page => page.locator('button[title="Chat history"]');

test.describe("wide screens", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the chat list is docked beside the chat, and can be hidden", async ({ page }) => {
    await ready(page);
    await send(page, "first chat");
    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toHaveClass(/docked/);
    await expect(sidebar).toBeInViewport();
    check(!(await sidebar.evaluate(e => e.inert)), "not inert");
    check((await sidebar.getAttribute("role")) === "navigation", "a navigation landmark, not a dialog");
    check((await sidebar.getAttribute("aria-modal")) === null, "not modal");
    await expect(page.locator(".sidebar-overlay.open")).toHaveCount(0);
    await expect(menu(page)).toHaveAttribute("aria-expanded", "true");

    // The chat sits right of the list, not under it
    const list = await sidebar.boundingBox();
    const chat = await page.locator(".container").boundingBox();
    check(chat.x >= list.x + list.width, "the chat column starts after the list");

    // Part of the page: Tab moves on from the list to the chat
    await page.locator(".sidebar .search-input").focus();
    let left = false;
    for (let i = 0; i < 6 && !left; i++) {
      await page.keyboard.press("Tab");
      left = await page.evaluate(() => !document.activeElement.closest(".sidebar"));
    }
    check(left, "focus isn't trapped in the docked list");

    // Opening a chat keeps it there
    await page.click('button[title="New chat"]');
    await send(page, "second chat");
    await page.click('.session-open:has-text("first chat")');
    await expect(page.locator(".message.user")).toHaveText("first chat");
    await expect(sidebar).toHaveClass(/docked/);

    // Hidden with the menu button, and that's remembered
    await menu(page).click();
    await expect(sidebar).not.toHaveClass(/docked/);
    await expect(sidebar).not.toBeInViewport();
    await expect(menu(page)).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
    await expect(sidebar).not.toBeInViewport();
    await menu(page).click();
    await expect(sidebar).toHaveClass(/docked/);

    // × hides it too, and focus goes to the menu button
    await page.click(".sidebar-close");
    await expect(sidebar).not.toHaveClass(/docked/);
    await expect.poll(() => page.evaluate(() => document.activeElement.getAttribute("title"))).toBe("Chat history");
  });

  test("narrower windows get the drawer back", async ({ page }) => {
    await ready(page);
    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toHaveClass(/docked/);
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(sidebar).not.toHaveClass(/docked/);
    check(await sidebar.evaluate(e => e.inert), "the closed drawer is inert");
    check((await sidebar.getAttribute("role")) === "dialog", "a dialog again");
    await menu(page).click();
    await expect(sidebar).toHaveClass(/open/);
    // Widening while the drawer is open docks it and ends the drawer
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(sidebar).toHaveClass(/docked/);
    await expect(sidebar).not.toHaveClass(/open/);
    await expect(page.locator(".sidebar-overlay.open")).toHaveCount(0);
  });
});

test("the header says what the app is", async ({ page }) => {
  await ready(page);
  await expect(page.locator("h1.header-title")).toHaveText("Private AI Chat");
  await expect(page.locator(".header-tagline")).toHaveText("Runs on this device");
  expect(await page.title()).toContain("Private AI Chat");
  const manifest = JSON.parse(fs.readFileSync(new URL("../../manifest.webmanifest", import.meta.url), "utf8"));
  expect(manifest.name).toBe("Private AI Chat");
});

// Every visible piece of text on the page, with its size
function smallText(page) {
  return page.evaluate(() => {
    const found = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const el = node.parentElement;
      if (!el || el.closest(".sr-only") || !el.getClientRects().length) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const size = parseFloat(style.fontSize);
      if (size < 12) found.push(`${size}px <${el.tagName.toLowerCase()} class="${el.className}">${node.textContent.trim().slice(0, 30)}`);
    }
    return found;
  });
}

for (const [name, viewport] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]]) {
  test.describe(name, () => {
    test.use({ viewport });

    test(`no text smaller than 12px (${name})`, async ({ page }) => {
      await ready(page);
      await send(page, "md", 600);
      await page.locator('.message.assistant .msg-action:has-text("Copy")').last().waitFor();
      if (name === "phone") await menu(page).click();
      await sleep(300);
      expect(await smallText(page), "chat and chat list").toEqual([]);
      if (name === "phone") await page.keyboard.press("Escape");

      await page.click('button[title="Settings"]');
      await page.click("summary:has-text('Advanced sampling')");
      expect(await smallText(page), "Settings").toEqual([]);

      await page.click("text=Help me choose a model");
      await page.click('.picker-option:has-text("Everyday chat")');
      expect(await smallText(page), "model picker").toEqual([]);
    });
  });
}
