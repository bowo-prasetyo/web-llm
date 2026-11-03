// attachments.js: chunking documents and choosing what goes in front of
// the model.
import { test, expect } from "@playwright/test";
import { chunkText, buildAttachmentContext, withAttachments, INDEX_MIN_CHARS } from "../../attachments.js";

// A tiny embedding: one dimension per keyword
const KEYWORDS = ["cat", "dog", "bird", "fish"];
const embed = text => KEYWORDS.map(k => (text.toLowerCase().includes(k) ? 1 : 0));

test("chunkText makes overlapping chunks that break at sentences", () => {
  const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} talks about something.`).join(" ");
  const chunks = chunkText(text);
  expect(chunks.length).toBeGreaterThan(1);
  for (const c of chunks) expect(c.length).toBeLessThanOrEqual(900);
  expect(chunks.slice(0, -1).every(c => /[.!?]$/.test(c))).toBe(true);
  expect(chunks.slice(1).every(c => /^[A-Z0-9]/i.test(c) && !/^(entence|umber|alks)/.test(c))).toBe(true); // whole words
  expect(chunkText("short note")).toEqual(["short note"]);
});

test("everything that fits goes in whole", () => {
  const ctx = buildAttachmentContext({
    docs: [{ name: "a.txt", text: "Alpha text." }, { name: "b.md", text: "Beta text." }],
    budgetTokens: 500,
  });
  expect(ctx.mode).toBe("full");
  expect(ctx.text).toBe("### a.txt\nAlpha text.\n\n### b.md\nBeta text.");
  expect(ctx.names).toEqual(["a.txt", "b.md"]);
});

test("too much: the chunks that best match the question, grouped by document", () => {
  const topics = ["cat", "dog", "bird", "fish"];
  const chunks = topics.map(t => ({ text: `All about the ${t}. `.repeat(20), embedding: embed(t) }));
  const doc = { name: "pets.txt", text: chunks.map(c => c.text).join(""), chunks };
  // Room for three of the four chunks: only the matching one may go in
  const ctx = buildAttachmentContext({ docs: [doc], queryEmbedding: embed("tell me about the dog"), budgetTokens: 450 });
  expect(ctx.mode).toBe("excerpts");
  expect(ctx.text).toContain("All about the dog.");
  for (const other of ["cat", "bird", "fish"]) expect(ctx.text).not.toContain(`All about the ${other}.`);
  expect(ctx.text.startsWith("### pets.txt\n")).toBe(true);
});

test("a general question with no matching part: the beginning instead", () => {
  const chunks = ["cat", "dog"].map(t => ({ text: `All about the ${t}. `.repeat(30), embedding: embed(t) }));
  const doc = { name: "pets.txt", text: chunks.map(c => c.text).join(""), chunks };
  const ctx = buildAttachmentContext({ docs: [doc], queryEmbedding: embed("summarize this please"), budgetTokens: 150 });
  expect(ctx.mode).toBe("beginning");
  expect(ctx.text.startsWith("### pets.txt\nAll about the cat.")).toBe(true);
});

test("a short document goes in whole next to excerpts of a long one", () => {
  const topics = ["cat", "dog", "bird", "fish"];
  const chunks = topics.map(t => ({ text: `All about the ${t}. `.repeat(40), embedding: embed(t) }));
  const manual = { name: "manual.txt", text: chunks.map(c => c.text).join(""), chunks };
  const note = { name: "note.txt", text: "Meeting on Tuesday.", chunks: null };

  const aboutDog = buildAttachmentContext({ docs: [note, manual], queryEmbedding: embed("the dog?"), budgetTokens: 400 });
  expect(aboutDog.mode).toBe("excerpts");
  expect(aboutDog.text.startsWith("### note.txt\nMeeting on Tuesday.\n\n### manual.txt\nAll about the dog.")).toBe(true);
  expect(aboutDog.text).not.toContain("All about the cat.");

  const aboutMeeting = buildAttachmentContext({ docs: [note, manual], queryEmbedding: embed("when is the meeting"), budgetTokens: 400 });
  expect(aboutMeeting.mode).toBe("beginning");
  expect(aboutMeeting.text).toContain("Meeting on Tuesday.");
  expect(aboutMeeting.names).toEqual(["note.txt", "manual.txt"]);
});

test("without embeddings: the beginning of each document", () => {
  const long = "First part. " + "More words here. ".repeat(500);
  const ctx = buildAttachmentContext({ docs: [{ name: "long.txt", text: long }], budgetTokens: 100 });
  expect(ctx.mode).toBe("beginning");
  expect(ctx.text).toContain("First part.");
  expect(ctx.text.length).toBeLessThan(long.length);
  expect(ctx.text.endsWith("[…]")).toBe(true);
});

test("nothing to add", () => {
  expect(buildAttachmentContext({ docs: [], budgetTokens: 500 })).toBeNull();
  expect(buildAttachmentContext({ docs: [{ name: "a", text: "x" }], budgetTokens: 10 })).toBeNull();
  expect(withAttachments("Hi?", null)).toBe("Hi?");
});

test("the question comes after the documents", () => {
  const full = withAttachments("What does it say?", { mode: "full", text: "### a.txt\nAlpha.", names: ["a.txt"] });
  expect(full).toBe("Documents attached to this chat (use them when they help answer):\n\n### a.txt\nAlpha.\n\n---\nQuestion: What does it say?");
  expect(withAttachments("Q", { mode: "excerpts", text: "x", names: [] })).toContain("Parts of the documents");
  expect(INDEX_MIN_CHARS).toBeGreaterThan(0);
});
