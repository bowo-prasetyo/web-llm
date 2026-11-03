// Personas: welcome screen, per-chat persona, Settings, and migration of
// settings saved before personas existed.
import fs from "node:fs";
import { test, expect, check, sleep, sent, seedStorage, readStorage, send } from "../support/fixtures.js";

test.use({ fakeWorker: true, downloaded: "SmolLM2-135M-Instruct-q0f32-MLC" });

const lastGenerate = async page => (await sent(page, "generate")).pop();
const chatIndex = page => readStorage(page, "webllm-sessions-index");
const LEGACY_PROMPT = Function(`return ${fs.readFileSync(new URL("../../app.js", import.meta.url), "utf8")
  .match(/LEGACY_DEFAULT_SYSTEM_PROMPT = (".*");/)[1]}`)();

async function ready(page) {
  await expect(page.locator(".status-bar")).toContainText("Model loaded successfully");
}

test("welcome screen, starters and a persona per chat", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const st = await readStorage(page, "webllm-settings");
  check(st.defaultPersona === "friendly" && st.system_prompt.startsWith("You are a friendly"), "Friendly is the default");
  await expect(page.locator(".persona-card")).toHaveCount(6);
  await expect(page.locator(".persona-card.active")).toContainText("Friendly");

  await page.click(".starter-chip >> nth=0");
  check((await page.inputValue(".footer textarea")).startsWith("Explain how a rainbow"), "a starter fills the input");

  await page.click('.persona-card:has-text("Coder")');
  await expect(page.locator('.starter-chip:has-text("debounces")')).toBeVisible();
  await send(page, "write fizzbuzz");
  check((await lastGenerate(page)).config.system_prompt.startsWith("You are an expert programming assistant"), "Coder prompt sent");
  check((await chatIndex(page))[0].persona === "coder", "chat saved with its persona");
  await expect(page.locator(".welcome")).toBeHidden();

  await page.selectOption(".persona-select", "writer");
  await sleep(200);
  check((await chatIndex(page))[0].persona === "writer", "switching mid-chat is saved");
  await send(page, "polish this");
  check((await lastGenerate(page)).config.system_prompt.startsWith("You are a helpful writing partner"), "and applies to the next message");

  await page.click('button[title="New chat"]');
  check((await page.inputValue(".persona-select")) === "friendly", "a new chat starts with the default persona");
  await expect(page.locator(".welcome")).toBeVisible();

  await page.click('button[title="Chat history"]');
  await expect(page.locator('.session-persona:has-text("✍️")')).toBeVisible();
  await page.click(".session-item >> nth=0");
  await sleep(300);
  check((await page.inputValue(".persona-select")) === "writer", "reopening a chat restores its persona");
});

test("default persona and the Custom persona in Settings", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.click("button[title=Settings]");
  await page.selectOption(".persona-default-select", "brainstorm");
  await expect(page.locator('.persona-prompt-preview summary:has-text("Brainstorm")')).toBeVisible();
  await page.fill(".system-prompt-editor", "You are a pirate.");
  await sleep(600);
  await page.click("text=Back");

  await page.click('button[title="New chat"]');
  check((await page.inputValue(".persona-select")) === "brainstorm", "new chats use the new default");
  await page.selectOption(".persona-select", "custom");
  await send(page, "ahoy");
  check((await lastGenerate(page)).config.system_prompt === "You are a pirate.", "Custom uses the prompt from Settings");

  await page.click("button[title=Settings]");
  await page.click("text=Reset to Friendly instructions");
  check((await page.inputValue(".system-prompt-editor")).startsWith("You are a friendly"), "Reset restores the Friendly text");
  await page.click("text=Back");
  await sleep(500);

  await page.reload();
  await ready(page);
  check((await page.inputValue(".persona-select")) === "custom", "after a reload the latest chat keeps its persona");
});

test("an unedited old system prompt migrates to Friendly", async ({ page }) => {
  await seedStorage(page, {
    "webllm-settings": { model: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", temperature: 0.9, system_prompt: LEGACY_PROMPT },
    "webllm-cached-models": ["Qwen2.5-0.5B-Instruct-q4f16_1-MLC"],
  });
  await page.goto("/");
  await ready(page);
  const st = await readStorage(page, "webllm-settings");
  expect(st.defaultPersona).toBe("friendly");
  expect(st.system_prompt.startsWith("You are a friendly")).toBe(true);
  expect(st.temperature).toBe(0.9);
});

test("an edited old system prompt becomes the Custom persona", async ({ page }) => {
  await seedStorage(page, {
    "webllm-settings": { model: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", system_prompt: "My own rules." },
    "webllm-cached-models": ["Qwen2.5-0.5B-Instruct-q4f16_1-MLC"],
    "webllm-session:legacy1": [{ role: "user", content: "old q" }, { role: "assistant", content: "old a" }],
    "webllm-sessions-index": [{ id: "legacy1", title: "old", preview: "", model: "m", ts: 1 }],
  });
  await page.goto("/");
  await ready(page);
  const st = await readStorage(page, "webllm-settings");
  check(st.defaultPersona === "custom" && st.system_prompt === "My own rules.", "kept as the Custom persona and default");
  check((await page.inputValue(".persona-select")) === "custom", "a chat saved before personas uses the default persona");
  await send(page, "hi");
  check((await lastGenerate(page)).config.system_prompt === "My own rules.", "the model gets the migrated prompt");
});
