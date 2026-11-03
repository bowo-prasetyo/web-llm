// markdown.js: splitting <think> reasoning from the answer.
// (Rendering itself needs the browser libraries; see e2e/rendering.spec.js.)
import { test, expect } from "@playwright/test";
import { splitThinking, stripThinking, escapeHtml } from "../../markdown.js";

const cases = [
  ["plain answer", { thinking: null, answer: "plain answer", thinkingDone: true }],
  ["<think>\n\n</think>\n\nHi", { thinking: null, answer: "Hi", thinkingDone: true }],
  ["  <think>abc", { thinking: "abc", answer: "", thinkingDone: false }],
  ["<think>", { thinking: "", answer: "", thinkingDone: false }],
  ["reason only</think>Ans", { thinking: "reason only", answer: "Ans", thinkingDone: true }],
  ["text <think>x</think> y", { thinking: null, answer: "text <think>x</think> y", thinkingDone: true }],
];

for (const [input, expected] of cases) {
  test(`splitThinking ${JSON.stringify(input)}`, () => {
    expect(splitThinking(input)).toEqual(expected);
  });
}

test("stripThinking keeps only the answer", () => {
  expect(stripThinking("<think>x</think>A")).toBe("A");
});

test("escapeHtml escapes markup", () => {
  expect(escapeHtml(`<img src="x" onerror='y'>&`)).toBe("&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;");
});
