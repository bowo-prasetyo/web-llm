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

// ── Full-width frame, readable column ────────────────────────────────────
// The header, status line and message bar fill the window (right of the
// docked list); messages, the composer and Settings stay in a centred
// column. Measured at common laptop widths (1366 and 1920 at 125% zoom,
// 1280, 1920).
const box = (page, sel) => page.locator(sel).first().boundingBox();
const near = (a, b, d = 2) => Math.abs(a - b) <= d;

for (const width of [1093, 1280, 1536, 1920]) {
  test(`fills a ${width}px window, text in a readable column`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await ready(page);
    await send(page, "a question");
    await expect(page.locator(".sidebar")).toHaveClass(/docked/); // also at 1093 (1366 at 125%)
    const list = await box(page, ".sidebar");
    const right = width - (list.x + list.width); // space right of the list

    // The frame spans all of it: no empty bands at the sides
    for (const sel of [".container", ".header", ".status-bar", ".footer-container"]) {
      const b = await box(page, sel);
      check(near(b.x, list.x + list.width) && near(b.width, right), `${sel} fills the space right of the list (${width}px)`);
    }

    // Messages and the composer: a centred column, at most --chat-w wide
    const msgs = await page.locator(".messages").evaluate(el => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight) };
    });
    const footer = await box(page, ".footer");
    const toolbar = await box(page, ".toolbar");
    const mid = list.x + list.width + right / 2;
    check(msgs.right - msgs.left <= 840, `messages column at most 840px (${Math.round(msgs.right - msgs.left)})`);
    check(near((msgs.left + msgs.right) / 2, mid), "messages column centred");
    check(footer.width <= 840 && near(footer.x + footer.width / 2, mid), "message box centred in the same column");
    check(near(toolbar.x, footer.x) && near(toolbar.width, footer.width), "toolbar lines up with the message box");
    if (right > 900) check(msgs.left - (list.x + list.width) > 20, "wide window: space beside the column is inside the frame");

    // A user's message ends at the column's right edge
    const user = await box(page, ".message.user");
    check(near(user.x + user.width, msgs.right), "your messages align to the column");

    // Settings: full-width header, centred column
    await page.click('button[title="Settings"]');
    const head = await box(page, ".settings-header");
    check(near(head.x, 0) && near(head.width, width), "Settings header spans the window");
    const section = await box(page, ".settings-section");
    check(section.width <= 760 && near(section.x + section.width / 2, width / 2), "Settings content is a centred column");
  });
}

test("below 1024px the list is a drawer and the chat uses the whole window", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await ready(page);
  await expect(page.locator(".sidebar")).not.toHaveClass(/docked/);
  const c = await box(page, ".container");
  check(near(c.x, 0) && near(c.width, 1000), "the chat spans the window");
  const footer = await box(page, ".footer");
  check(footer.width <= 840 && near(footer.x + footer.width / 2, 500), "message box in a centred column");
});

test("the header says what the app is", async ({ page }) => {
  await ready(page);
  await expect(page.locator("h1.header-title")).toHaveText("Hearth");
  await expect(page.locator(".header-tagline")).toHaveText("Private AI chat on this device");
  await expect(page.locator(".header-mark")).toBeVisible();
  expect(await page.title()).toBe("Hearth · Private AI chat");
  // The installed app keeps its name on the home screen
  const manifest = JSON.parse(fs.readFileSync(new URL("../../manifest.webmanifest", import.meta.url), "utf8"));
  expect(manifest.name).toBe("Hearth");
  expect(manifest.short_name).toBe("Hearth");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Hearth");
  // The welcome screen shows why it's private
  await expect(page.locator(".welcome-note")).toContainText("No server. No account. Works offline.");
});

test("Settings ends with the name, version and credit", async ({ page }) => {
  await ready(page);
  await page.click('button[aria-label="Settings"]');
  const credit = page.locator(".about-credit");
  await expect(credit).toContainText(/Hearth \d+\.\d+\.\d+/);
  await expect(credit.getByRole("link", { name: "WebLLM" })).toHaveAttribute("href", "https://github.com/mlc-ai/web-llm");
  await expect(credit.getByRole("link", { name: "Open source" })).toHaveAttribute("href", "https://github.com/bowo-prasetyo/web-llm");
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
