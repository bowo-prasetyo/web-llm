// quality.js: junk detection (model check, collapsed replies) and the
// repeated-sentence guard.
import { test, expect } from "@playwright/test";
import { checkSample, looksDegenerate, findRepeatLoop } from "../../quality.js";
import { LOOPING_REPLY } from "../support/mock-webllm.js";

test.describe("checkSample (model check after loading)", () => {
  test("rejects the broken 16-bit GPU output", () => {
    expect(checkSample(" outer outer outer outer outer outer outer outer outer outer outer outer").ok).toBe(false);
  });
  test("rejects replies without words", () => {
    expect(checkSample("").ok).toBe(false);
    expect(checkSample("!!! ...").ok).toBe(false);
  });
  test("accepts healthy replies in any language and thinking output", () => {
    expect(checkSample("Hello! How can I help you today?").ok).toBe(true);
    expect(checkSample("你好！很高兴见到你。").ok).toBe(true);
    expect(checkSample("<think>\nOkay, the user wants me to say hello").ok).toBe(true);
  });
});

test.describe("looksDegenerate (collapsed reply while streaming)", () => {
  test("detects a reply that collapsed into a few repeated words", () => {
    const junk = "outer ".repeat(30) + "Blo outer outer Bloense outer lemen outer outer ".repeat(3);
    expect(looksDegenerate(junk)).toBe(true);
    expect(looksDegenerate("Here is the answer to your question about the web. " + "the the the the the ".repeat(10))).toBe(true);
  });
  test("leaves short and healthy text alone", () => {
    expect(looksDegenerate("outer outer outer")).toBe(false);
    expect(looksDegenerate("To make a Hello World web app, create an index.html file with a heading, then open it in your browser. You can also add a script tag that writes the text with JavaScript, or use a framework such as Vue or React if you want components and routing later on in the project.")).toBe(false);
  });
  test("leaves code with repeated numbers alone", () => {
    expect(looksDegenerate("```js\nconst a = [0, 0, 0, 0, 0, 0, 0, 0];\nconst b = [1, 2, 3, 4, 5, 6, 7, 8];\nfunction sum(x) { return x.reduce((p, q) => p + q, 0); }\nconsole.log(sum(a), sum(b));\n```")).toBe(false);
  });
});

test.describe("findRepeatLoop (repeated sentences)", () => {
  test("cuts a real looping reply back to a sentence before the repeats", () => {
    const cut = findRepeatLoop(LOOPING_REPLY);
    expect(cut).toBeGreaterThan(0);
    const kept = LOOPING_REPLY.slice(0, cut).trimEnd();
    expect(kept).toMatch(/[.!?]$/);
    expect(kept).toContain("To show the output on a browser");
    expect((kept.match(/```/g) || []).length).toBe(4); // both code blocks kept
    expect((kept.match(/is a built-in function in JavaScript that can be used to write/g) || []).length).toBeLessThanOrEqual(1);
    expect(kept).not.toContain("toThe");
  });
  test("finds no loop in healthy prose, repeated code lines or short text", () => {
    expect(findRepeatLoop("To make a Hello World web page, create index.html with a heading. Then add a script tag. Inside it, call document.getElementById to find the heading and set its textContent. Open the file in a browser to see the result. You can also use console.log to print to the developer console, which is useful for debugging but is not visible on the page itself.")).toBe(-1);
    const code = "```js\n" + Array.from({ length: 12 }, (_, i) => `document.getElementById("item${i}").style.color = "red";`).join("\n") + "\n```\nThat colors every item red.";
    expect(findRepeatLoop(code)).toBe(-1);
    expect(findRepeatLoop("hello hello hello")).toBe(-1);
  });
});
