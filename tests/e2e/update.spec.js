// "New version available": a tab that stays open across a deploy offers to
// reload, and the reload brings in the new files.
import fs from "node:fs";
import { test, expect, check, seedStorage } from "../support/fixtures.js";

test.use({ fakeWorker: true, downloaded: "SmolLM2-135M-Instruct-q0f32-MLC" });

const checkNow = page => page.evaluate(() => window.webllmCheckForUpdate());
// A visible text to change in a simulated deploy: the Friendly tagline
const CATALOG_SRC = fs.readFileSync(new URL("../../locales/en.js", import.meta.url), "utf8");

async function start(page) {
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await checkNow(page); // the starting fingerprint (if the timer hasn't taken it yet)
}

test("no banner while nothing changed", async ({ page }) => {
  await start(page);
  expect(await checkNow(page)).toBe(false);
  await expect(page.locator(".update-banner")).toBeHidden();
});

test("a deploy while the tab is open: banner, then Reload loads the new version", async ({ page, context }) => {
  await start(page);
  await page.click('button[title="New chat"]');
  await expect(page.locator(".persona-card:has-text('Friendly')")).not.toContainText("(new)");

  // "Deploy": the English catalog changes on the server
  const updated = CATALOG_SRC.replace("Everyday help and easygoing chat", "Everyday help and easygoing chat (new)");
  await context.route(/\/locales\/en\.js$/, r => r.fulfill({ body: updated, contentType: "text/javascript" }));

  expect(await checkNow(page)).toBe(true);
  const banner = page.locator(".update-banner");
  await expect(banner).toContainText("A new version of the app is available.");
  await banner.locator("button:has-text('Reload')").click();

  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await page.click('button[title="New chat"]');
  await expect(page.locator(".persona-card:has-text('Friendly')")).toContainText("(new)");
  await expect(page.locator(".update-banner")).toBeHidden();
});

test("the banner can be dismissed, and offline checks change nothing", async ({ page, context }) => {
  await start(page);
  await context.setOffline(true);
  expect(await checkNow(page)).toBe(false);
  await context.setOffline(false);

  await context.route(/\/style\.css$/, r => r.fulfill({ body: fs.readFileSync(new URL("../../style.css", import.meta.url), "utf8") + "\n/* changed */", contentType: "text/css" }));
  expect(await checkNow(page)).toBe(true);
  await page.click(".update-dismiss");
  await expect(page.locator(".update-banner")).toBeHidden();
});

test.describe("with the service worker active", () => {
  test.use({ serviceWorkers: "allow" });

  test("Reload gets the new version, not the saved offline copy", async ({ page, context }) => {
    await start(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // now controlled by the service worker, with files saved
    await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
    await checkNow(page);

    const updated = CATALOG_SRC.replace("Everyday help and easygoing chat", "Everyday help and easygoing chat (new)");
    await context.route(/\/locales\/en\.js$/, r => r.fulfill({ body: updated, contentType: "text/javascript" }));
    expect(await checkNow(page)).toBe(true);
    await page.locator(".update-banner button:has-text('Reload')").click();

    await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
    await page.click('button[title="New chat"]');
    await expect(page.locator(".persona-card:has-text('Friendly')")).toContainText("(new)");
    const saved = await page.evaluate(async () => {
      const res = await (await caches.open("webllm-shell-v1")).match(new URL("./locales/en.js", location.href).href);
      return res ? res.text() : "";
    });
    check(saved.includes("(new)"), "the offline copy was refreshed too");
  });
});
