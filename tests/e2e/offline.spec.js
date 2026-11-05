// Offline mode: the service worker saves the app and its libraries, the
// app then starts and chats with no network, and updates still arrive.
import fs from "node:fs";
import { test, expect, check, sleep, seedStorage, send } from "../support/fixtures.js";

test.use({ fakeWorker: true, serviceWorkers: "allow" });

const M = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

async function visitOnline(page) {
  await seedStorage(page, {
    "webllm-settings": { model: M, defaultPersona: "friendly", settingsVersion: 2 },
    "webllm-cached-models": [M],
    "webllm-model-health": { [M]: { ok: true } },
  });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await page.evaluate(() => navigator.serviceWorker.ready);
}

test("after one online visit, the app works with no network", async ({ page, context }) => {
  await visitOnline(page);
  const sw = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { active: !!r?.active, scope: r?.scope };
  });
  expect(sw.active).toBe(true);
  expect(new URL(sw.scope).pathname).toBe("/");

  await page.click("button[title=Settings]");
  await expect(page.locator(".device-info")).toContainText("Yes, the app is saved on this device", { timeout: 15_000 });
  const saved = await page.evaluate(async () => {
    const out = {};
    for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map(r => r.url);
    return out;
  });
  const libs = saved["webllm-libs-v1"] || [];
  for (const lib of ["vue@3.5.44", "vue-router@4.6.4", "marked@18.1.1", "dompurify@3.4.17", "highlightjs", "pdf.min.mjs", "pdf.worker.min.mjs", "web-llm@0.2.84/+esm", "transformers@2.17.2"]) {
    check(libs.some(u => u.includes(lib)), `library saved: ${lib}`);
  }
  check((saved["webllm-shell-v1"] || []).length >= 16, "app files saved");
  await page.click("text=Back");

  // No routes and no network from here on: only the service worker's cache
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.setOffline(true);
  await page.reload();

  await expect(page.locator(".footer textarea")).toBeVisible();
  await expect(page.locator(".offline-badge")).toBeVisible();
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  check(await page.evaluate(() => !!(window.Vue && window.marked && window.DOMPurify && window.hljs && window.pdfjsLib)), "all libraries load from the saved copies");
  await send(page, "hello offline", 800);
  await expect(page.locator(".message.assistant").last()).toContainText("reply");

  // A model that isn't downloaded can't load offline
  await page.selectOption(".model-select", "Llama-3.2-1B-Instruct-q4f16_1-MLC");
  await expect(page.locator(".status-bar")).toContainText("isn't downloaded yet");
  expect(await page.inputValue(".model-select")).toBe(M);

  await page.click('button[title="New chat"]');
  await page.click(".welcome .link-btn");
  await page.click('.picker-option:has-text("Everyday chat")');
  await expect(page.locator('.picker-option.tier:has-text("Fast")')).toContainText("Needs internet");
  await page.click('button:has-text("Back")');
  await page.click("text=Cancel");

  await context.setOffline(false);
  await expect(page.locator(".offline-badge")).toBeHidden();
});

test("updated app files arrive on the next online visit", async ({ page, context }) => {
  await visitOnline(page);
  const updated = fs.readFileSync(new URL("../../personas.js", import.meta.url), "utf8")
    .replace("Everyday help and easygoing chat", "Everyday help and easygoing chat (updated)");
  await context.route(/\/personas\.js$/, r => r.fulfill({ body: updated, contentType: "text/javascript" }));
  await page.reload();
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
  await page.click('button[title="New chat"]');
  await expect(page.locator('.persona-card:has-text("Friendly")')).toContainText("(updated)");
});

test("the app is installable: manifest and icons", async ({ page }) => {
  await page.goto("/style.css");
  const result = await page.evaluate(async () => {
    const manifest = await (await fetch("/manifest.webmanifest")).json();
    const icons = await Promise.all(manifest.icons.map(async i => {
      const r = await fetch("/" + i.src);
      return r.ok && r.headers.get("content-type") === i.type;
    }));
    const html = await (await fetch("/index.html")).text();
    return { manifest, icons, html };
  });
  expect(result.manifest.display).toBe("standalone");
  expect(result.manifest.start_url).toBe("./");
  expect(result.icons.every(Boolean)).toBe(true);
  expect(result.manifest.icons.some(i => i.purpose === "maskable")).toBe(true);
  expect(result.html).toContain('rel="manifest"');
  expect(result.html).toContain('name="theme-color"');
});
