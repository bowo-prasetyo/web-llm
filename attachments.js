// Documents attached to a chat: splitting them into chunks, and choosing
// what to put in front of the model for a question.
//
// - If everything attached fits the budget, the full text goes in.
// - Otherwise, the chunks that match the question (by embedding) go in,
//   best first, until the budget is used.
// - When nothing matches well (a general request such as "summarize
//   this"), or there are no embeddings (not indexed yet, or the embedding
//   model couldn't load), the beginning of each document goes in.
//
// Pure functions, no DOM: imported by worker.js and unit-tested.

import { estimateTokens } from "./context.js";

// Documents longer than this are split and embedded when attached, so
// questions can pull out the relevant parts.
export const INDEX_MIN_CHARS = 2000;

// A chunk must be at least this similar to the question, and at least
// half as similar as the best chunk, to be used as an excerpt.
export const MIN_RELEVANCE = 0.2;

// Largest document text accepted (~200 pages)
export const MAX_ATTACHMENT_CHARS = 500000;

const tokens = text => estimateTokens([{ content: text }]);

// Split text into overlapping chunks of about `chunkSize` characters,
// breaking at sentence ends, then paragraphs, then words.
export function chunkText(
  text,
  chunkSize = 800,  // ~130 words — enough for a full paragraph
  overlap  = 120   // overlap so boundary sentences aren't split in half
) {

  // Normalize whitespace: collapse multiple blank lines, trim
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length <= chunkSize) {
    return normalized ? [normalized] : [];
  }

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    const end = start + chunkSize;

    if (end >= normalized.length) {
      // Last chunk — take the rest
      chunks.push(normalized.slice(start).trim());
      break;
    }

    // Try to break at a sentence boundary (. ! ?) within the last 200 chars
    let breakAt = -1;
    const window = normalized.slice(end - 200, end + 100);
    const sentenceEnd = window.search(/[.!?][\s\n]/);
    if (sentenceEnd !== -1) {
      breakAt = end - 200 + sentenceEnd + 1;
    }

    // Fall back to paragraph break
    if (breakAt === -1) {
      const paraBreak = normalized.lastIndexOf("\n\n", end);
      if (paraBreak > start + chunkSize / 2) {
        breakAt = paraBreak;
      }
    }

    // Fall back to word boundary
    if (breakAt === -1) {
      const spaceBreak = normalized.lastIndexOf(" ", end);
      if (spaceBreak > start) {
        breakAt = spaceBreak;
      } else {
        breakAt = end; // hard cut only as last resort
      }
    }

    chunks.push(normalized.slice(start, breakAt).trim());
    // Overlap: next chunk starts overlap chars before the break
    let next = Math.max(start + 1, breakAt - overlap);
    // Start the next chunk at a word, not in the middle of one
    const space = normalized.indexOf(" ", next);
    if (next > 0 && /\S/.test(normalized[next - 1]) && space !== -1 && space < breakAt) next = space + 1;
    start = next;
  }

  return chunks.filter(c => c.length > 20); // discard tiny fragments
}

export function cosineSimilarity(a, b) {

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {

    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  const denom = magA * magB;
  
  if (denom === 0) {
    return 0;
  }
  
  return dot / denom;
}

// The text to add to a question about the attached documents.
//   docs:   [{ name, text, chunks: [{ text, embedding }] | null }]
//   queryEmbedding: embedding of the question, or null
//   budgetTokens: how much room the documents may take
// Returns { mode: "full" | "excerpts" | "beginning", text, names } or null.
export function buildAttachmentContext({ docs, queryEmbedding = null, budgetTokens }) {
  const usable = (docs || []).filter(d => d && d.text && d.text.trim());
  if (!usable.length || budgetTokens < 50) return null;

  const section = (name, body) => `### ${name}\n${body.trim()}`;
  const whole = d => section(d.name, d.text);

  // Everything fits: all of it
  if (tokens(usable.map(whole).join("\n\n")) <= budgetTokens) {
    return { mode: "full", text: usable.map(whole).join("\n\n"), names: usable.map(d => d.name) };
  }

  // Short documents go in whole (they're cheap); the rest of the budget
  // goes to the long ones.
  const parts = new Map(); // document index -> text to include
  let budget = budgetTokens;
  usable.forEach((doc, di) => {
    if (doc.text.length > INDEX_MIN_CHARS) return;
    const cost = tokens(whole(doc)) + 2;
    if (cost <= budget) {
      parts.set(di, doc.text);
      budget -= cost;
    }
  });
  const long = usable.map((doc, di) => ({ doc, di })).filter(x => !parts.has(x.di));

  // Long documents: the chunks that match the question, best first
  const scored = [];
  if (queryEmbedding) {
    for (const { doc, di } of long) {
      for (const [ci, chunk] of (doc.chunks || []).entries()) {
        if (!chunk.embedding) continue;
        scored.push({ di, ci, text: chunk.text, score: cosineSimilarity(queryEmbedding, chunk.embedding) });
      }
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.length ? scored[0].score : 0;
  const picked = [];
  if (top >= MIN_RELEVANCE) {
    let used = 0;
    for (const c of scored.filter(c => c.score >= Math.max(MIN_RELEVANCE, top * 0.5))) {
      const cost = tokens(c.text) + 4;
      if (used + cost > budget) continue;
      picked.push(c);
      used += cost;
    }
  }

  if (picked.length) {
    for (const { di } of long) {
      const mine = picked.filter(c => c.di === di).sort((a, b) => a.ci - b.ci).map(c => c.text.trim());
      if (mine.length) parts.set(di, mine.join("\n[…]\n"));
    }
  } else if (long.length) {
    // Nothing matched (or no embeddings): the beginning of each long document
    const chars = Math.max(0, Math.floor(budget / long.length) * 3 - 40);
    if (chars > 0) {
      for (const { doc, di } of long) {
        parts.set(di, doc.text.length > chars ? doc.text.slice(0, chars) + "\n[…]" : doc.text);
      }
    }
  }

  if (!parts.size) return null;
  const order = [...parts.keys()].sort((a, b) => a - b);
  return {
    mode: picked.length ? "excerpts" : "beginning",
    text: order.map(di => section(usable[di].name, parts.get(di))).join("\n\n"),
    names: order.map(di => usable[di].name),
  };
}

// The question as sent to the model, with the documents in front of it.
export function withAttachments(prompt, context) {
  if (!context) return prompt;
  const intro = context.mode === "full"
    ? "Documents attached to this chat (use them when they help answer):"
    : "Parts of the documents attached to this chat (use them when they help answer):";
  return `${intro}\n\n${context.text}\n\n---\nQuestion: ${prompt}`;
}
