// Detects model output that has collapsed into junk, such as
// "outer outer outer Blo outer…". This is what q4f16 models produce on GPUs
// whose 16-bit math is broken, and what tiny models sometimes fall into.
//
// Shared by worker.js (model check after loading, guard while streaming)
// and testable on its own. No DOM access.

// Words: runs of letters/digits/apostrophes in any script.
function words(text) {
  return (text || "")
    .replace(/<\/?think>/g, " ")
    .toLowerCase()
    .match(/[\p{L}\p{N}']+/gu) || [];
}

// True when a reply's tail has collapsed into a handful of repeated words.
// Checks only the last `window` words so a long, healthy answer that ends
// in a loop is still caught, and needs at least `minWords` to judge.
export function looksDegenerate(text, { window = 40, minWords = 30, maxUnique = 4 } = {}) {
  const all = words(text);
  if (all.length < minWords) return false;
  const tail = all.slice(-window);
  return new Set(tail).size <= maxUnique;
}

// Verdict on the short reply from the model check after loading.
// Healthy: "Hello! How can I help you today?"  Broken: "outer outer outer …"
export function checkSample(text) {
  const all = words(text);
  if (all.length === 0) {
    return { ok: false, reason: "no words" };
  }
  if (all.length >= 6) {
    const counts = new Map();
    for (const w of all) counts.set(w, (counts.get(w) || 0) + 1);
    const top = Math.max(...counts.values());
    if (top / all.length >= 0.5) {
      return { ok: false, reason: "one word repeated" };
    }
    if (counts.size / all.length < 0.35) {
      return { ok: false, reason: "few distinct words" };
    }
  }
  return { ok: true, reason: "" };
}
