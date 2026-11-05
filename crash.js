// When a model needs more memory than the device has, the browser kills the
// whole tab (common on phones): no JavaScript runs, so nothing can be caught.
// Instead the app leaves a note in localStorage before loading a model or
// asking it something, and removes it when that finishes. A note still there
// when the page opens means the page died part-way. The note is removed while
// the page is hidden or closing normally, so switching apps or closing the
// tab is never mistaken for a crash.
//
// Pure functions over a Storage-like object (getItem/setItem/removeItem), so
// they can be tested without a browser.

export const PENDING_KEY = "webllm-pending";
export const CRASHES_KEY = "webllm-model-crashes";

function readJson(storage, key, fallback) {
  try { return JSON.parse(storage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

// phase: "loading" (loading the model) or "answering" (generating a reply)
export function markPending(storage, model, phase, now = Date.now()) {
  if (!model) return;
  try { storage.setItem(PENDING_KEY, JSON.stringify({ model, phase, ts: now })); } catch {}
}

export function clearPending(storage) {
  try { storage.removeItem(PENDING_KEY); } catch {}
}

export function loadCrashes(storage) {
  const crashes = readJson(storage, CRASHES_KEY, {});
  return crashes && typeof crashes === "object" ? crashes : {};
}

function saveCrashes(storage, crashes) {
  try { storage.setItem(CRASHES_KEY, JSON.stringify(crashes)); } catch {}
}

// Run once when the page opens, before any model loads. If the last page
// died while loading or answering, record the crash for that model and
// return { model, phase }; otherwise null. The note is removed either way.
export function detectCrash(storage, now = Date.now()) {
  const pending = readJson(storage, PENDING_KEY, null);
  clearPending(storage);
  if (!pending || typeof pending.model !== "string" || !pending.model) return null;
  const phase = pending.phase === "answering" ? "answering" : "loading";
  const crashes = loadCrashes(storage);
  crashes[pending.model] = { phase, ts: now };
  saveCrashes(storage, crashes);
  return { model: pending.model, phase };
}

// Record a crash noticed while the page is still alive (the GPU was lost
// and WebLLM gave up), the same way as one found at startup.
export function recordCrash(storage, model, phase, now = Date.now()) {
  const crashes = loadCrashes(storage);
  if (!model) return crashes;
  crashes[model] = { phase: phase === "answering" ? "answering" : "loading", ts: now };
  saveCrashes(storage, crashes);
  return crashes;
}

// A model that loaded and answered here no longer counts as crashing.
export function forgetCrash(storage, model) {
  const crashes = loadCrashes(storage);
  if (!(model in crashes)) return crashes;
  delete crashes[model];
  saveCrashes(storage, crashes);
  return crashes;
}

// Chat models that may fit a modest phone, best answers first.
const LIGHTER_CANDIDATES = [
  "Llama-3.2-1B-Instruct",
  "gemma3-1b-it",
  "Qwen2.5-0.5B-Instruct",
  "SmolLM2-360M-Instruct",
];

// The share of the crashed model's memory a suggestion may need: clearly
// smaller, but close enough to step down one size at a time (Llama 3.2 1B
// 16-bit, 879 MB -> Gemma 3 1B, 711 MB -> SmolLM2 360M, 580 MB).
export const LIGHTER_MAX_SHARE = 0.85;

// A model needing clearly less memory than one that crashed, and not one
// that crashed here itself, or "" when there is none. The best candidate in
// the same precision comes first; after a 16-bit crash, 32-bit models are
// tried next (they run on every GPU). After a 32-bit crash only 32-bit
// models qualify, since 16-bit may be what doesn't work here.
// `sizes` maps model ID -> MB.
export function lighterModel(model, sizes, available, crashes = {}) {
  const precision = (/-(q\d+f\d+(?:_\d+)?)-MLC$/.exec(model || "") || [])[1];
  const current = sizes && sizes[model];
  if (!precision || !current) return "";
  const precisions = /f16/.test(precision) ? [precision, "q4f32_1"] : [precision];
  for (const p of precisions) {
    for (const base of LIGHTER_CANDIDATES) {
      const id = `${base}-${p}-MLC`;
      if (id === model || !available.includes(id) || crashes[id]) continue;
      if (sizes[id] && sizes[id] <= current * LIGHTER_MAX_SHARE) return id;
    }
  }
  return "";
}
