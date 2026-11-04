// Light and dark themes: following the device, the choice in Settings, no
// dark flash on load, and readable contrast for every visible text.
import { test, expect, check, sleep, send } from "../support/fixtures.js";

test.use({ fakeWorker: true, downloaded: "Qwen3.5-2B-q4f16_1-MLC" });

async function ready(page) {
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
}
const theme = page => page.evaluate(() => document.documentElement.dataset.theme);
const bodyBg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const metaColor = page => page.locator('meta[name="theme-color"]').getAttribute("content");

test("follows the device's setting by default, also when it changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await ready(page);
  expect(await theme(page)).toBe("light");
  expect(await bodyBg(page)).toBe("rgb(246, 244, 239)");
  expect(await metaColor(page)).toBe("#f6f4ef");
  check((await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)) === "light", "native controls are light too");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => theme(page)).toBe("dark");
  expect(await bodyBg(page)).toBe("rgb(15, 15, 15)");
  expect(await metaColor(page)).toBe("#0f0f0f");
});

test("the theme is set before the page is drawn (no dark flash)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  // Record the theme at the first moment there is a body to draw
  await page.addInitScript(() => {
    document.addEventListener("readystatechange", () => {
      if (!window.__firstTheme) window.__firstTheme = document.documentElement.dataset.theme || "none";
    });
    new MutationObserver((_, obs) => {
      if (document.body) { window.__firstTheme = document.documentElement.dataset.theme || "none"; obs.disconnect(); }
    }).observe(document.documentElement, { childList: true });
  });
  await ready(page);
  expect(await page.evaluate(() => window.__firstTheme)).toBe("light");
});

test("Settings → Appearance: Light, Dark or System, remembered", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await ready(page);
  await page.click('button[title="Settings"]');
  const group = page.locator('[role="radiogroup"][aria-labelledby="appearance-label"]');
  await expect(group).toBeVisible();
  await expect(group.locator('input[value="system"]')).toBeChecked();
  await expect(page.locator(".section-hint", { hasText: "Follows this device" })).toContainText("dark right now");

  await group.locator('label:has-text("Light")').click();
  expect(await theme(page)).toBe("light");
  await expect(group.locator('input[value="light"]')).toBeChecked();
  await expect(page.locator(".section-hint", { hasText: "Always light" })).toBeVisible();

  // Remembered, and it wins over the device
  await page.reload();
  expect(await theme(page)).toBe("light");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await sleep(100);
  expect(await theme(page)).toBe("light");

  // Keyboard: arrow keys move through the choices (the reload kept us on Settings)
  await expect(group).toBeVisible();
  await page.locator('input[name="theme"][value="light"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('input[value="dark"]')).toBeChecked();
  expect(await theme(page)).toBe("dark");

  await page.locator('label:has-text("System")').click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => theme(page)).toBe("light");
  expect(await page.evaluate(() => localStorage.getItem("webllm-theme"))).toBe(null);
});

// ── Contrast ──────────────────────────────────────────────────────────────
// Every visible text against what is really behind it (translucent layers
// blended down to the first opaque background). WCAG AA: 4.5:1, or 3:1 for
// large text (24px, or 18.66px bold). Disabled controls are exempt.
function lowContrast(page, scope = "body") {
  return page.evaluate(sel => {
    const parse = c => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const blend = (top, bottom) => {
      const a = top[3] + bottom[3] * (1 - top[3]);
      if (!a) return [0, 0, 0, 0];
      return [0, 1, 2].map(i => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a);
    };
    const lum = ([r, g, b]) => {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const backdrop = el => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg[3] > 0) layers.push(bg);
        if (bg[3] >= 1) break;
      }
      let out = parse(getComputedStyle(document.documentElement).backgroundColor);
      if (out[3] < 1) out = [255, 255, 255, 1];
      for (let i = layers.length - 1; i >= 0; i--) out = blend(layers[i], out);
      return out;
    };
    const problems = [];
    const root = document.querySelector(sel);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const el = node.parentElement;
      if (!el || el.closest(".sr-only") || !el.getClientRects().length) continue;
      if (el.closest(":disabled, [aria-disabled='true']")) continue;
      let opacity = 1;
      for (let n = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
      if (opacity < 1) continue; // fading or disabled
      const style = getComputedStyle(el);
      if (style.visibility === "hidden") continue;
      const fg = parse(style.color);
      const bg = backdrop(el);
      const color = blend(fg, bg);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      const r = ratio(color, bg);
      if (r < need) problems.push(`${r.toFixed(2)} <${el.tagName.toLowerCase()} class="${el.className}">${node.textContent.trim().slice(0, 30)}`);
    }
    return problems;
  }, scope);
}

for (const scheme of ["light", "dark"]) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });

    test(`all text has readable contrast (${scheme})`, async ({ page }) => {
      await ready(page);
      expect(await theme(page)).toBe(scheme);
      await expect(page.locator(".welcome")).toBeVisible();
      expect(await lowContrast(page), "welcome screen").toEqual([]);

      await send(page, "md", 600);
      await page.locator('.message.assistant .msg-action:has-text("Copy")').last().waitFor();
      await send(page, "fail", 400);
      await page.fill(".sidebar .search-input", "bold");
      await sleep(500);
      expect(await lowContrast(page), "chat, error reply, chat list and search").toEqual([]);
      await page.fill(".sidebar .search-input", "");

      await page.click('button[title="Settings"]');
      await page.click("summary:has-text('Advanced sampling')");
      expect(await lowContrast(page), "Settings").toEqual([]);

      await page.click('button:has-text("Clear Conversation")');
      await expect(page.locator(".confirm-dialog")).toBeVisible();
      expect(await lowContrast(page, ".confirm-dialog"), "delete dialog").toEqual([]);
      await page.keyboard.press("Escape");

      await page.click("text=Help me choose a model");
      await page.click('.picker-option:has-text("Everyday chat")');
      expect(await lowContrast(page, ".modal.picker"), "model picker").toEqual([]);
    });
  });
}
