// context.js: fitting a conversation into the model's context window.
import { test, expect } from "@playwright/test";
import { fitToContext, estimateTokens } from "../../context.js";

const sys = { role: "system", content: "S".repeat(300) };
const turns = [];
for (let i = 0; i < 10; i++) {
  turns.push({ role: "user", content: "q".repeat(600) });
  turns.push({ role: "assistant", content: "a".repeat(900) });
}
const q = { role: "user", content: "What now?" };
const fit = (history, augmentedPrompt = "What now?", contextWindow = 2048, maxTokens = 128) =>
  fitToContext({ history, prompt: "What now?", augmentedPrompt, contextWindow, maxTokens });

test("trims old turns so the prompt and reply fit", () => {
  const r = fit([sys, ...turns, q]);
  expect(estimateTokens(r.history) + 128 + 64).toBeLessThanOrEqual(2048);
  expect(r.history[0]).toBe(sys);
  expect(r.history.at(-1)).toBe(q);
  expect(r.history[1].role).toBe("user");          // never starts with an orphaned reply
  expect(r.history.at(-2)).toBe(turns.at(-1));       // newest turns kept
});

test("leaves a conversation that fits untouched", () => {
  const r = fit([sys, ...turns.slice(0, 2), q], "What now?", 8192, 1024);
  expect(r.history).toHaveLength(4);
  expect(r.droppedContext).toBe(false);
});

test("drops document context that can't fit", () => {
  const r = fit([sys, q], "ctx ".repeat(2000) + "What now?");
  expect(r.droppedContext).toBe(true);
  expect(r.augmentedPrompt).toBe("What now?");
});

test("keeps smaller document context by trimming history instead", () => {
  const augmented = "ctx ".repeat(150) + "What now?";
  const r = fit([sys, ...turns, q], augmented);
  expect(r.droppedContext).toBe(false);
  expect(estimateTokens([...r.history.slice(0, -1), { content: r.augmentedPrompt }]) + 128 + 64).toBeLessThanOrEqual(2048);
});

test("explains when a single message is too long", () => {
  const long = "x".repeat(9000);
  expect(() => fitToContext({ history: [sys, { role: "user", content: long }], prompt: long, augmentedPrompt: long, contextWindow: 2048, maxTokens: 128 }))
    .toThrow(/too long/);
});
