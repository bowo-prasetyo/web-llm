// Detects model output that has collapsed into junk, such as
// "outer outer outer Blo outer…". This is what q4f16 models produce on GPUs
// whose 16-bit math is broken, and what tiny models sometimes fall into.
//
// Shared by worker.js (model check after loading, guard while streaming)
// and testable on its own. No DOM access.

// What would actually show on screen: without special tokens like
// "<|im_start|>", HTML-like tags (removed when the reply is rendered) and
// control characters. GPUs with broken 16-bit math sometimes produce only
// such invisible output.
export function visibleText(text) {
  return (text || "")
    .replace(/<\|[^|>]*\|>/g, " ")
    .replace(/<\/?[A-Za-z_][^<>\n]{0,40}>/g, " ")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\uFEFF\uFFFD]/g, "");
}

// Words: runs of letters/digits/apostrophes in any script, in the text
// that would show on screen.
function words(text) {
  return visibleText(text)
    .toLowerCase()
    .match(/[\p{L}\p{N}']+/gu) || [];
}

// Words for the "Generating… ~N words" counter: only ones people can see.
export function countWords(text) {
  return words(text).length;
}

// True when a reply has streamed many pieces but shows almost nothing:
// blank lines, control characters or tags instead of text. `pieces` is the
// number of streamed pieces (about one per token); real text, even code,
// shows several characters per piece.
export function looksInvisible(text, pieces, { minPieces = 40, minCharsPerPiece = 0.5 } = {}) {
  if (!(pieces >= minPieces)) return false;
  const shown = visibleText(text).replace(/\s+/g, "").length;
  return shown < pieces * minCharsPerPiece;
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

// Blank out fenced code blocks (keeping offsets), so repeated lines of code
// aren't mistaken for a loop.
function maskCode(text) {
  return text.replace(/```[\s\S]*?(?:```|$)/g, m => " ".repeat(m.length));
}

// Finds a reply that keeps repeating the same sentence, e.g.
// "The document.write() function is a built-in function … The
// document.write() function is a built-in function …". Looks for a run of
// `n` words that appears `times` times (not overlapping) in the last
// `tailWords` words. Returns the character index where the second
// occurrence starts (moved back to the end of the previous sentence), so
// the caller can keep the text before the loop, or -1 when there is none.
export function findRepeatLoop(text, { n = 8, times = 3, tailWords = 300 } = {}) {
  const masked = maskCode(text || "");
  const toks = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(masked))) {
    const w = m[0].toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (w) toks.push({ w, i: m.index });
  }
  if (toks.length < n * times) return -1;

  const seen = new Map(); // n-word run -> word indexes where it starts
  let best = -1;
  for (let k = Math.max(0, toks.length - tailWords); k + n <= toks.length; k++) {
    const key = toks.slice(k, k + n).map(t => t.w).join(" ");
    const starts = seen.get(key) || [];
    if (!starts.length || k - starts[starts.length - 1] >= n) starts.push(k);
    seen.set(key, starts);
    if (starts.length >= times) {
      const pos = toks[starts[1]].i;
      if (best === -1 || pos < best) best = pos;
    }
  }
  if (best === -1) return -1;

  // End the kept text at a sentence or line end, not mid-sentence: back up
  // to the last ". ", "! ", "? " or newline before the cut (if one is near).
  const before = text.slice(Math.max(0, best - 300), best);
  const ends = [...before.matchAll(/[.!?](?=\s)|\n/g)];
  if (ends.length) {
    const last = ends[ends.length - 1];
    return Math.max(0, best - before.length) + last.index + 1;
  }
  return best;
}
