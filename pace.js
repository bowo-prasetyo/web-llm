// How fast the model writes, and when a reply has taken too long.
// Pure functions (no DOM, no worker state), shared by worker.js and app.js.

import { t } from "./i18n.js";
import { segmentWordCount } from "./quality.js";

// ── Time limits ───────────────────────────────────────────────────────────
// A reply is only cut off when it stops making progress, not because it is
// long: on a slow GPU a healthy reply can take many minutes.
export const TIME_LIMITS = {
  firstTextMs: 180000,  // waiting for the first words (reading a long prompt)
  stallMs:      60000,  // no new text for this long once the reply started
  maxMs:      1200000,  // safety cap for a whole reply: 20 minutes
};

// Why a reply should be cut off now, or null to keep going.
// "first": no text yet after firstTextMs; "stall": no new text for stallMs;
// "max": the whole reply took longer than maxMs.
export function timeLimitReason({ now, start, lastTextAt }, limits = TIME_LIMITS) {
  if (now - start > limits.maxMs) return "max";
  if (!lastTextAt) return now - start > limits.firstTextMs ? "first" : null;
  return now - lastTextAt > limits.stallMs ? "stall" : null;
}

// Limits with any valid overrides applied (used by the tests, which can't
// wait a minute for a stall).
export function withTimeLimits(overrides) {
  const limits = { ...TIME_LIMITS };
  for (const key of Object.keys(TIME_LIMITS)) {
    const v = overrides && overrides[key];
    if (typeof v === "number" && v > 0) limits[key] = v;
  }
  return limits;
}

// ── Writing speed ─────────────────────────────────────────────────────────
// Below this many words per second, replies feel slow (people read about
// 4 words per second) and a smaller model is suggested.
export const SLOW_WPS = 2;

export function wordCount(text) {
  return segmentWordCount((text || "").replace(/<\/?think>/g, " "));
}

// Words per second for `words` written in `ms`, or null when the sample is
// too small to say anything.
export function measureSpeed(words, ms, minWords = 5) {
  if (!(words >= minWords) || !(ms > 0)) return null;
  return words / (ms / 1000);
}

// Combine a new measurement with the one already known. Replies measure
// better than the short model check, so a reply's speed replaces a check's;
// later replies are averaged in so one odd reply doesn't swing it.
export function blendSpeed(prev, wps, source) {
  if (!(wps > 0)) return prev || null;
  if (!prev || !(prev.wps > 0) || (prev.source === "check" && source === "reply")) {
    return { wps, source };
  }
  if (source === "check") return prev; // keep the reply-based figure
  return { wps: prev.wps * 0.5 + wps * 0.5, source };
}

// "less than 1 word/sec", "about 1 word/sec", "about 6 words/sec"
export function formatSpeed(wps) {
  if (!(wps > 0)) return "";
  if (wps < 0.95) return t("speed.under-one");
  return t("speed.about", { count: Math.round(wps) });
}

export function isSlow(wps) {
  return wps > 0 && wps < SLOW_WPS;
}

// Smaller models to suggest when the current one is slow, smallest first.
const FASTER_CANDIDATES = ["Qwen3.5-0.8B", "Qwen3.5-2B", "Qwen3.5-4B"];

// Billions of parameters from a model ID ("Qwen3.5-2B-…" -> 2,
// "SmolLM2-135M-…" -> 0.135), or null. Writing speed follows the parameter
// count; download sizes don't show it well (small models carry a large
// vocabulary table).
export function modelParams(id) {
  const m = /[-_](\d+(?:\.\d+)?)([bBmM])(?=[-_])/.exec(id || "");
  if (!m) return null;
  return parseFloat(m[1]) / (/m/i.test(m[2]) ? 1000 : 1);
}

// Models of about 1B parameters or fewer. They write fluently but know few
// facts, so they often make things up in a confident tone.
export const SMALL_MODEL_MAX_B = 1;
export function isSmallModel(id) {
  if (/tinyllama/i.test(id || "")) return true; // 1.1B, but answers like a tiny one
  const b = modelParams(id);
  return b !== null && b <= SMALL_MODEL_MAX_B;
}

// A clearly smaller model (at most 60% of the parameters, same precision
// so it also works on this GPU) to suggest when the current one writes
// slowly, or "" when there is none. `available` lists the model IDs this
// version offers.
export function fasterModel(model, available) {
  const precision = (/-(q\d+f\d+_\d+)-MLC$/.exec(model || "") || [])[1];
  const current = modelParams(model);
  if (!precision || !current) return "";
  let best = "";
  for (const base of FASTER_CANDIDATES) {
    const id = `${base}-${precision}-MLC`;
    if (id === model || !available.includes(id)) continue;
    if (modelParams(id) <= current * 0.6) best = id; // the largest that qualifies
  }
  return best;
}
