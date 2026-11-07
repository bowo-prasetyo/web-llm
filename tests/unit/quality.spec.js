// quality.js: junk detection (model check, collapsed replies) and the
// repeated-sentence guard.
import { test, expect } from "@playwright/test";
import { checkSample, looksDegenerate, findRepeatLoop, visibleText, countWords, looksInvisible, looksLikeWordSalad, scriptStats, scriptsIn } from "../../quality.js";
import { LOOPING_REPLY, SALAD } from "../support/mock-webllm.js";

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

test.describe("invisible output", () => {
  test("visible text drops special tokens, tags and control characters", () => {
    expect(visibleText("<|im_start|>Hello<|im_end|>").trim()).toBe("Hello");
    expect(visibleText("a<b>c</b>d")).toBe("a c d");
    expect(visibleText("x\u0000​y")).toBe("xy");
    expect(visibleText("if (a < b) return;")).toBe("if (a < b) return;"); // code survives
  });

  test("the word counter counts only words people can see", () => {
    expect(countWords("\n\n\n\n")).toBe(0);
    expect(countWords("<|im_start|> <|im_start|>")).toBe(0);
    expect(countWords("Hello there, friend!")).toBe(3);
  });

  test("many pieces that show nothing are junk", () => {
    expect(looksInvisible("\n".repeat(80), 80)).toBe(true);
    expect(looksInvisible("<|im_start|>".repeat(60), 60)).toBe(true);
    expect(looksInvisible("\n".repeat(20), 20)).toBe(false); // too early to judge
  });

  test("real text and code are never invisible", () => {
    const prose = "The quick brown fox jumps over the lazy dog. ".repeat(10);
    expect(looksInvisible(prose, 100)).toBe(false);
    const code = "```js\nfor (let i = 0; i < n; i++) {\n  sum += a[i];\n}\n```\n".repeat(4);
    expect(looksInvisible(code, 120)).toBe(false);
  });

  test("the model check fails output that shows nothing", () => {
    expect(checkSample("\n\n<|im_start|>\n<|im_start|>\n").ok).toBe(false);
    expect(checkSample("Hello there, nice to meet you!").ok).toBe(true);
  });
});

test.describe("word salad", () => {
  test("the real salad from a broken 16-bit GPU is caught", () => {
    expect(looksLikeWordSalad(SALAD)).toBe(true);
    expect(checkSample(SALAD.slice(0, 90)).ok).toBe(false);
  });

  test("normal answers in one or two writing systems are fine", () => {
    expect(looksLikeWordSalad("The rain falls from clouds when water droplets grow heavy. ".repeat(5))).toBe(false);
    // Chinese and Korean with English terms mixed into words
    expect(looksLikeWordSalad("使用Python可以很容易地处理数据。我们用API获取结果，然后用JSON保存。".repeat(4))).toBe(false);
    expect(looksLikeWordSalad("Python으로 API를 호출하고 JSON을 저장합니다. ".repeat(4))).toBe(false);
    expect(looksLikeWordSalad("Привет! Это ответ на русском языке, совсем обычный. ".repeat(4))).toBe(false);
  });

  test("a multilingual answer keeps each word in one script, so it isn't salad", () => {
    const hello = "Hello in five languages: Japanese こんにちは, Russian Привет, Arabic مرحبا, Korean 안녕하세요, Greek Γειά σου, Thai สวัสดี.";
    expect(scriptStats(hello).scripts).toBeGreaterThanOrEqual(4);
    expect(looksLikeWordSalad(hello)).toBe(false);
  });

  test("the model check accepts a normal greeting, also with a second script", () => {
    expect(checkSample("Hello! How can I help you today?").ok).toBe(true);
    expect(checkSample("Hello! 你好！How can I help?").ok).toBe(true);
    expect(checkSample("Hi щёspflichtetat Output乡的zymy").ok).toBe(false);
  });

  test("scripts are recognised", () => {
    expect([...scriptsIn("abc")]).toEqual(["Latin"]);
    expect([...scriptsIn("щё")]).toEqual(["Cyrillic"]);
    expect([...scriptsIn("こんにちは漢字")]).toEqual(["CJK"]);
    expect([...scriptsIn("Sägeo扑救")].sort()).toEqual(["CJK", "Latin"]);
  });
});

test("words are counted in languages without spaces", () => {
  expect(countWords("東京は日本の首都です。人口は約1400万人です。")).toBe(12);
  expect(countWords("我喜欢学习中文")).toBe(4);
  expect(countWords("กรุงเทพมหานครเป็นเมืองหลวง")).toBe(4);
  expect(countWords("안녕하세요 반갑습니다")).toBe(2);
  expect(countWords("Hello there, friend!")).toBe(3);
});
