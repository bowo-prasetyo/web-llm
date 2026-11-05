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

// Chat models that run on modest phones, largest first.
const LIGHTER_CANDIDATES = [
  "Llama-3.2-1B-Instruct",
  "Qwen2.5-0.5B-Instruct",
  "SmolLM2-360M-Instruct",
];

// A model needing clearly less memory (at most 60%) than one that crashed,
// in the same precision so it also runs on this GPU, and not one that has
// crashed here itself. "" when there is none. `sizes` maps model ID -> MB.
export function lighterModel(model, sizes, available, crashes = {}) {
  const precision = (/-(q\d+f\d+(?:_\d+)?)-MLC$/.exec(model || "") || [])[1];
  const current = sizes && sizes[model];
  if (!precision || !current) return "";
  for (const base of LIGHTER_CANDIDATES) {
    const id = `${base}-${precision}-MLC`;
    if (id === model || !available.includes(id) || crashes[id]) continue;
    if (sizes[id] && sizes[id] <= current * 0.6) return id;
  }
  return "";
}
