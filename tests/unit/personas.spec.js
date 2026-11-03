// personas.js: the built-in prompts stay short and keep the model honest.
import { test, expect } from "@playwright/test";
import { PERSONAS, getPersona, DEFAULT_PERSONA_ID } from "../../personas.js";

const builtIn = PERSONAS.filter(p => p.prompt);

test("prompts stay short (small models follow short instructions best)", () => {
  for (const p of builtIn) expect(p.prompt.split("\n").length, p.id).toBeLessThanOrEqual(8);
});

test("every built-in persona stays consistent with itself", () => {
  for (const p of builtIn) expect(p.prompt, p.id).toContain("Stay consistent with what you said earlier in the conversation.");
});

test("every built-in persona corrects the user instead of just agreeing", () => {
  for (const p of builtIn) {
    expect(p.prompt, p.id).toMatch(/gently correct it instead of agreeing|if it is wrong, correct it politely/);
  }
});

test("lookup falls back to the default persona", () => {
  expect(getPersona("nope").id).toBe(DEFAULT_PERSONA_ID);
  expect(getPersona("custom").prompt).toBeNull();
});
