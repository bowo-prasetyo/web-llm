// Settings → Language: choosing the app's language, following the browser,
// and remembering the choice.
//
// Only English ships so far, so these tests add a stand-in second language:
// "de", whose messages are the English ones marked "DE·". Its name in the
// list ("Deutsch") comes from the browser, as for a real translation.
import { test, expect } from "../support/fixtures.js";
import fs from "node:fs";
import en from "../../locales/en.js";

test.use({ fakeWorker: true, downloaded: "SmolLM2-135M-Instruct-q0f32-MLC" });

const I18N_SRC = fs.readFileSync(new URL("../../i18n.js", import.meta.url), "utf8")
  .replace('export const SUPPORTED_LOCALES = ["en"];', 'export const SUPPORTED_LOCALES = ["en", "de"];');

// Every message marked, placeholders and plural forms kept
const mark = v => typeof v === "string" ? "DE·" + v
  : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mark(x)]));
const DE_SRC = `export default ${JSON.stringify(mark(en))};`;

const JS = "text/javascript; charset=utf-8";

test.beforeEach(async ({ context }) => {
  expect(I18N_SRC).toContain('["en", "de"]');
  await context.route(/\/i18n\.js(\?.*)?$/, r => r.fulfill({ body: I18N_SRC, contentType: JS }));
  await context.route(/\/locales\/de\.js(\?.*)?$/, r => r.fulfill({ body: DE_SRC, contentType: JS }));
});

const languagePref = page => page.evaluate(() => localStorage.getItem("webllm-language"));
const html = page => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title }));

async function openSettings(page) {
  await page.goto("/");
  await expect(page.locator(".status-text")).toContainText("Model loaded successfully");
  await page.click(".header-actions .icon-btn:last-child");
  await expect(page.locator(".settings-page")).toBeVisible();
}

test("the list offers Automatic and each language in its own words", async ({ page }) => {
  await openSettings(page);
  const select = page.locator(".language-select");
  await expect(select).toHaveValue("auto");
  await expect(select.locator("option")).toHaveText(["Automatic (English)", "English", "Deutsch"]);
  await expect(select.locator('option[value="de"]')).toHaveAttribute("lang", "de");
  await expect(page.getByRole("combobox", { name: "Language" })).toBeVisible();
  await expect(page.locator("#language-hint a")).toHaveAttribute("href", /docs\/translating\.md$/);
  expect(await languagePref(page)).toBeNull();
  expect(await html(page)).toEqual({ lang: "en", dir: "ltr", title: "Hearth · Private AI chat" });
});

test("choosing a language changes the app at once, and is remembered", async ({ page }) => {
  await openSettings(page);
  await page.locator(".language-select").selectOption("de");

  // No reload: the page follows straight away
  await expect(page.locator(".settings-title")).toHaveText("DE·Settings");
  await expect(page.locator("#language-label")).toHaveText("DE·Language");
  await expect(page.locator(".language-select option").first()).toHaveText("DE·Automatic (English)");
  expect(await languagePref(page)).toBe("de");
  expect(await html(page)).toEqual({ lang: "de", dir: "ltr", title: "DE·Hearth · Private AI chat" });

  // The chat page too, including text built in code (model menu groups)
  await page.click(".back-btn");
  await expect(page.locator(".welcome-title")).toHaveText("DE·What would you like to chat about?");
  await expect(page.locator(".model-select optgroup").first()).toHaveAttribute("label", /^DE·/);

  // Next visit starts in the chosen language
  await page.reload();
  await expect(page.locator(".welcome-title")).toHaveText("DE·What would you like to chat about?");
  expect(await html(page)).toMatchObject({ lang: "de" });
});

test("Automatic goes back to the browser's language and forgets the choice", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("webllm-language", "de"));
  await page.goto("/");
  await expect(page.locator(".welcome-title")).toHaveText("DE·What would you like to chat about?");
  await page.click(".header-actions .icon-btn:last-child");
  await page.locator(".language-select").selectOption("auto");
  await expect(page.locator(".settings-title")).toHaveText("Settings");
  expect(await languagePref(page)).toBeNull();
  expect(await html(page)).toMatchObject({ lang: "en" });
});

test.describe("in a German browser", () => {
  test.use({ locale: "de-DE" });

  test("Automatic picks German, and English can still be chosen", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".welcome-title")).toHaveText("DE·What would you like to chat about?");
    await page.click(".header-actions .icon-btn:last-child");
    await expect(page.locator(".language-select option").first()).toHaveText("DE·Automatic (Deutsch)");

    await page.locator(".language-select").selectOption("en");
    await expect(page.locator(".settings-title")).toHaveText("Settings");
    expect(await languagePref(page)).toBe("en");
    await page.reload();
    await expect(page.locator(".settings-title")).toHaveText("Settings");
  });
});

test("a saved language the app no longer ships falls back to Automatic", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("webllm-language", "xx"));
  await page.goto("/");
  await expect(page.locator(".welcome-title")).toHaveText("What would you like to chat about?");
  await page.click(".header-actions .icon-btn:last-child");
  await expect(page.locator(".language-select")).toHaveValue("auto");
});
