// Stand-in for Transformers.js. The "embedding model" is a bag of words
// hashed into 512 numbers (normalised), so texts that share words are
// similar: enough for tests to check that the relevant part of a document
// is chosen, without downloading a model.
const DIMS = 512;

function hash(word) {
  let h = 2166136261;
  for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 16777619);
  return (h >>> 0) % DIMS;
}

function embed(text) {
  const v = new Float32Array(DIMS);
  for (const w of String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) {
    if (w.length > 2) v[hash(w)] += 1; // skip tiny words like "is", "the"
  }
  const norm = Math.hypot(...v) || 1;
  return v.map(x => x / norm);
}

export async function pipeline(task, model) {
  globalThis.__embeddingModelLoads = (globalThis.__embeddingModelLoads || 0) + 1;
  return async (text) => ({ data: embed(text) });
}
