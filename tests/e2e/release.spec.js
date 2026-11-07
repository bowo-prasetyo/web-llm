// Release basics: the version shown in Settings, the "Report a problem"
// link with device details filled in, fonts served by the app itself, and
// file pickers that don't leak "No file chosen" into the page.
import { test, expect, check, seedStorage } from "../support/fixtures.js";
import { APP_VERSION, problemReportUrl } from "../../version.js";
import fs from "node:fs";

const M = "Qwen3.5-2B-q4f32_1-MLC";

async function start(page) {
  await seedStorage(page, {
    "webllm-settings": { model: M, settingsVersion: 2 },
    "webllm-cached-models": [M],
    "webllm-model-health": { [M]: { ok: true } },
  });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
}

test("the version is the same in the app, package.json and the changelog", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  expect(pkg.version).toBe(APP_VERSION);
  expect(fs.readFileSync("CHANGELOG.md", "utf8")).toContain(`## [${APP_VERSION}]`);
});

test("the release is dated and has release notes", () => {
  const log = fs.readFileSync("CHANGELOG.md", "utf8");
  expect(log).toMatch(new RegExp(`## \\[${APP_VERSION.replace(/\./g, "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}`));
  const notes = fs.readFileSync(`docs/release-notes/v${APP_VERSION}.md`, "utf8");
  expect(notes).toContain(`# Hearth ${APP_VERSION}`);
  expect(notes).toContain("Known limitations");
});

test("Settings shows the version and a Report a problem link with device details", async ({ page }) => {
  await start(page);
  await page.click('button[title="Settings"]');
  const row = page.locator(".device-row", { hasText: "App version" });
  await expect(row).toContainText(APP_VERSION);

  const link = page.locator(".report-problem a", { hasText: "Report a problem" });
  const href = new URL(await link.getAttribute("href"));
  expect(href.origin + href.pathname).toBe("https://github.com/bowo-prasetyo/web-llm/issues/new");
  const q = Object.fromEntries(href.searchParams);
  expect(q.template).toBe("problem.yml");
  expect(q.version).toBe(APP_VERSION);
  expect(q.model).toBe(M);
  check(q.browser.includes("Chrome"), "browser filled in");
  check(q.webllm && q.webllm !== "Unknown", "WebLLM version filled in");
  expect(await link.getAttribute("target")).toBe("_blank");
});

test("the issue form has a field for every detail the link fills in", () => {
  const form = fs.readFileSync(".github/ISSUE_TEMPLATE/problem.yml", "utf8");
  const ids = [...form.matchAll(/^\s+id: (\S+)/gm)].map(m => m[1]);
  const filled = [...new URL(problemReportUrl()).searchParams.keys()].filter(k => k !== "template");
  for (const key of filled) expect(ids, key).toContain(key);
});

test("fonts come from the app, not a third party", async ({ page }) => {
  const thirdPartyFonts = [];
  page.on("request", r => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) thirdPartyFonts.push(r.url()); });
  await start(page);
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(async () => {
    await document.fonts.load("16px 'DM Sans'");
    await document.fonts.load("16px 'DM Mono'");
    return [...document.fonts].filter(f => f.status === "loaded").map(f => f.family.replace(/["']/g, ""));
  });
  expect(thirdPartyFonts).toEqual([]);
  expect(loaded).toContain("DM Sans");
  expect(loaded).toContain("DM Mono");
});

test("every font file the stylesheet names exists and is saved for offline use", () => {
  const css = fs.readFileSync("style.css", "utf8");
  const sw = fs.readFileSync("sw.js", "utf8");
  const files = [...css.matchAll(/url\('(fonts\/[^']+)'\)/g)].map(m => m[1]);
  expect(files.length).toBeGreaterThan(0);
  for (const f of new Set(files)) {
    expect(fs.existsSync(f), f).toBe(true);
    expect(sw, f).toContain(`"./${f}"`);
  }
});

test("Import buttons open a file picker; no stray file-input text on the page", async ({ page }) => {
  // Turn on file-chooser interception now: waitForEvent("filechooser")
  // turns it on without waiting, so a picker opened right after could be
  // missed (1 in 10 runs under load).
  page.on("filechooser", () => {});
  await start(page);
  await page.click('button[title="Settings"]');
  for (const name of ["Import Settings", "Import Chats"]) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name }).click();
    check(!!(await chooser), `${name} opens a file picker`);
  }
  // Hidden inputs: no "No file chosen" text for copying or screen readers
  await expect(page.locator("input[type=file]:not([hidden])")).toHaveCount(0);
});
