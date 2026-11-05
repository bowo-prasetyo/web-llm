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

test("Friendly answers without ending every reply on a question; Brainstorm still asks one", () => {
  expect(getPersona("friendly").prompt).toContain("Don't end every reply with a question");
  expect(getPersona("brainstorm").prompt).toContain("End with one short question");
});

test("every built-in persona knows it runs on the device and offline", () => {
  // So "Can you still answer me offline?" or "Where is my data sent?" get a true answer
  for (const p of builtIn) {
    expect(p.prompt.split("\n")[0], p.id).toContain("You run entirely on the user's device and keep working offline; nothing they write leaves it.");
  }
});

test("every built-in persona knows what it can and can't access", () => {
  // A model claimed it could "hear voice messages" and "read your emails"
  for (const p of builtIn) {
    const first = p.prompt.split("\n")[0];
    expect(first, p.id).toContain("You can only read the messages typed here and the documents attached to this chat");
    expect(first, p.id).toContain("you can't hear, see, browse the web, or open their emails, files or other apps.");
  }
});
