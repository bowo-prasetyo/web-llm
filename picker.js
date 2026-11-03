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
  { id: "fast",     title: "Fast",     desc: "Quick replies, smallest download. Fine on phones." },
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
export function friendlyModelName(id) {
  return (id || "")
    .replace(/-q\d+f\d+(_\d+)?-MLC$/, "")
    .replace(/-(Instruct|it|Chat)(?=-|$)/g, "")
    .replace(/-/g, " ");
}
