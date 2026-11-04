// First-run model picker: a short, curated choice instead of 40+ raw model
// IDs. Pure data and functions (no DOM); the UI lives in app.js.
//
// Each pick names a q4f16 model and its q4f32 twin. q4f16 is smaller and
// faster but needs working 16-bit GPU math; devices without it get q4f32.

export const USES = [
  {
    id: "chat",
    icon: "💬",
    title: "Everyday chat",
    desc: "Questions, explanations, ideas and conversation",
    persona: "friendly",
  },
  {
    id: "code",
    icon: "💻",
    title: "Coding",
    desc: "Write, explain and fix code",
    persona: "coder",
  },
  {
    id: "write",
    icon: "✍️",
    title: "Writing",
    desc: "Draft, rewrite and polish emails and texts",
    persona: "writer",
  },
];

export const TIERS = [
  { id: "fast",     title: "Fast",     desc: "Quickest replies, smallest download, fine on phones. More likely to get facts wrong." },
  { id: "balanced", title: "Balanced", desc: "Noticeably better answers. Best for most laptops." },
  { id: "smart",    title: "Smart",    desc: "Best answers, large download. Needs a strong GPU (4–8 GB)." },
];

// Qwen3.5, the newest generation WebLLM 0.2.84 supports (also what Kovrune
// recommends for the browser). Coding and writing start at 2B: smaller
// models mix up even simple code and lose the thread of longer texts.
export const MODEL_PICKS = {
  chat: {
    fast:     { f16: "Qwen3.5-0.8B-q4f16_1-MLC", f32: "Qwen3.5-0.8B-q4f32_1-MLC" },
    balanced: { f16: "Qwen3.5-2B-q4f16_1-MLC",   f32: "Qwen3.5-2B-q4f32_1-MLC" },
    smart:    { f16: "Qwen3.5-4B-q4f16_1-MLC",   f32: "Qwen3.5-4B-q4f32_1-MLC" },
  },
  code: {
    fast:     { f16: "Qwen3.5-2B-q4f16_1-MLC",   f32: "Qwen3.5-2B-q4f32_1-MLC" },
    balanced: { f16: "Qwen3.5-4B-q4f16_1-MLC",   f32: "Qwen3.5-4B-q4f32_1-MLC" },
    smart:    { f16: "Qwen3.5-9B-q4f16_1-MLC",   f32: "Qwen3.5-9B-q4f32_1-MLC" },
  },
  write: {
    fast:     { f16: "Qwen3.5-2B-q4f16_1-MLC",   f32: "Qwen3.5-2B-q4f32_1-MLC" },
    balanced: { f16: "Qwen3.5-4B-q4f16_1-MLC",   f32: "Qwen3.5-4B-q4f32_1-MLC" },
    smart:    { f16: "Qwen3.5-9B-q4f16_1-MLC",   f32: "Qwen3.5-9B-q4f32_1-MLC" },
  },
};

// The model to use for a pick: the q4f16 version when 16-bit GPU math
// works here, otherwise the q4f32 version.
export function pickModelId(use, tier, f16ok) {
  const pick = MODEL_PICKS[use]?.[tier];
  if (!pick) return "";
  return f16ok ? pick.f16 : pick.f32;
}

// Fast for phones and devices reporting 4 GB of memory or less; Balanced
// otherwise. (navigator.deviceMemory is capped at 8 and missing in some
// browsers, so this is only a starting suggestion.)
export function recommendTier({ mobile, memoryGB }) {
  if (mobile) return "fast";
  if (typeof memoryGB === "number" && memoryGB <= 4) return "fast";
  return "balanced";
}

// "Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC" -> "Qwen2.5 Coder 1.5B"
// Release stamps and weight formats that mean nothing to people are left
// out: "Ministral-3-3B-Instruct-2512-BF16-…" -> "Ministral 3 3B",
// "OLMo-2-0425-1B-Instruct-…" -> "OLMo 2 1B", "stablelm-2-zephyr-1_6b" ->
// "StableLM 2 Zephyr 1.6B".
export function friendlyModelName(id) {
  return (id || "")
    .replace(/-q\d+f\d+(_\d+)?-MLC$/, "")
    .replace(/-(instruct|it|chat)(?=-|$)/gi, "")
    .replace(/-(BF16|bf16)(?=-|$)/g, "")
    .replace(/-\d{4}(?=-|$)/g, "")            // release dates: 2512, 0425
    .replace(/(\d+)_(\d+)b$/i, "$1.$2B")     // 1_6b -> 1.6B
    .replace(/(\d)b$/, "$1B")                 // 2b -> 2B
    .replace(/^stablelm\b/, "StableLM")
    .replace(/\bzephyr\b/, "Zephyr")
    .replace(/^gemma(\d)/, "Gemma $1")
    .replace(/^gemma\b/, "Gemma")
    .replace(/-/g, " ");
}

// "16-bit" for q4f16 / q0f16 models, "32-bit" for q4f32 / q0f32. Two
// versions of one model differ only in this, so the model menus show it.
export function modelPrecision(id) {
  const m = /q\d+f(16|32)/.exec(id || "");
  return m ? m[1] + "-bit" : "";
}

// "2.2 GB", "945 MB"
export function formatSize(mb) {
  if (!mb) return "";
  return mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : Math.round(mb) + " MB";
}

// ── Model loading progress ──────────────────────────────────────────────
// WebLLM reports loading as text, e.g.
//   "Fetching param cache[12/57]: 345MB fetched. 20% completed, 40 secs elapsed. …"
//   "Loading model from cache[3/57]: 250MB loaded. 5% completed, 2 secs elapsed."
//   "Loading GPU shader modules[10/60]: 16% completed, 3 secs elapsed."
// describeLoadProgress turns that (and the 0–100 percentage the worker
// adds) into a phase, a percentage and the megabytes done so far.
//   phase: "download" (over the network), "cache" (from this device),
//          "gpu" (preparing the GPU), or "other"
export function describeLoadProgress(text, pct) {
  const t = String(text || "");
  const lower = t.toLowerCase();
  let phase = "other";
  if (/fetch|download/.test(lower)) phase = "download";
  else if (/from cache|cache\[/.test(lower)) phase = "cache";
  else if (/shader|gpu|webgpu/.test(lower)) phase = "gpu";

  let percent = typeof pct === "number" && isFinite(pct) ? pct : null;
  const pm = /(\d+(?:\.\d+)?)%\s*completed/i.exec(t);
  if (pm) percent = Number(pm[1]);
  if (percent !== null) percent = Math.max(0, Math.min(100, Math.round(percent)));

  const mm = /(\d+(?:\.\d+)?)\s*MB\s*(fetched|loaded)/i.exec(t);
  const doneMb = mm ? Number(mm[1]) : null;
  return { phase, percent, doneMb };
}

// "about 3 min left", from how fast the percentage has moved since the
// phase started. Null until there is enough to go on (a few seconds and a
// few percent), so the first guess isn't wild.
export function estimateRemaining({ startPct, startTime, pct, now }) {
  const elapsed = (now - startTime) / 1000;
  const moved = pct - startPct;
  if (elapsed < 4 || moved < 2 || pct >= 100) return null;
  const secs = (100 - pct) * elapsed / moved;
  if (secs < 50) return "less than a minute left";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `about ${mins} min left`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return `about ${h} h${rest ? " " + rest + " min" : ""} left`;
}
