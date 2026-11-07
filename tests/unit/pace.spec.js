// pace.js: progress-based time limits, writing speed, and the smaller
// model suggested when a model writes slowly.
import { test, expect } from "@playwright/test";
import {
  TIME_LIMITS, timeLimitReason, withTimeLimits,
  wordCount, measureSpeed, blendSpeed, formatSpeed, isSlow, fasterModel, modelParams, isSmallModel,
} from "../../pace.js";

const L = { firstTextMs: 100, stallMs: 50, maxMs: 1000 };

test("a reply that keeps writing is never cut off before the safety cap", () => {
  // 900 ms in, last word 10 ms ago: far past the stall limit in total time
  expect(timeLimitReason({ now: 900, start: 0, lastTextAt: 890 }, L)).toBeNull();
  expect(timeLimitReason({ now: 1001, start: 0, lastTextAt: 1000 }, L)).toBe("max");
});

test("no new text for the stall limit cuts the reply off", () => {
  expect(timeLimitReason({ now: 340, start: 0, lastTextAt: 300 }, L)).toBeNull();
  expect(timeLimitReason({ now: 351, start: 0, lastTextAt: 300 }, L)).toBe("stall");
});

test("waiting for the first words has its own, longer limit", () => {
  expect(timeLimitReason({ now: 99, start: 0, lastTextAt: 0 }, L)).toBeNull();
  expect(timeLimitReason({ now: 101, start: 0, lastTextAt: 0 }, L)).toBe("first");
});

test("defaults: a minute without progress, 20 minutes at most", () => {
  expect(TIME_LIMITS.stallMs).toBe(60000);
  expect(TIME_LIMITS.maxMs).toBe(20 * 60000);
  expect(TIME_LIMITS.firstTextMs).toBeGreaterThanOrEqual(TIME_LIMITS.stallMs);
});

test("overrides apply only valid numbers", () => {
  expect(withTimeLimits(null)).toEqual(TIME_LIMITS);
  expect(withTimeLimits({ stallMs: 500, maxMs: -1, firstTextMs: "x" }))
    .toEqual({ ...TIME_LIMITS, stallMs: 500 });
});

test("speed is words per second, only from a big enough sample", () => {
  expect(wordCount("  one two\nthree <think>four</think> ")).toBe(4);
  expect(measureSpeed(20, 10000)).toBe(2);
  expect(measureSpeed(4, 1000)).toBeNull();
  expect(measureSpeed(20, 0)).toBeNull();
});

test("a reply's speed replaces the model check's, later replies average in", () => {
  let s = blendSpeed(null, 10, "check");
  expect(s).toEqual({ wps: 10, source: "check" });
  s = blendSpeed(s, 2, "reply");
  expect(s).toEqual({ wps: 2, source: "reply" });
  s = blendSpeed(s, 4, "reply");
  expect(s.wps).toBe(3);
  expect(blendSpeed(s, 50, "check")).toBe(s); // a check doesn't override replies
});

test("speeds read naturally", () => {
  expect(formatSpeed(0.4)).toBe("less than 1 word/sec");
  expect(formatSpeed(1.2)).toBe("about 1 word/sec");
  expect(formatSpeed(6.4)).toBe("about 6 words/sec");
  expect(isSlow(1.9)).toBe(true);
  expect(isSlow(2)).toBe(false);
});

const ALL = [
  "Qwen3.5-0.8B-q4f32_1-MLC", "Qwen3.5-2B-q4f32_1-MLC", "Qwen3.5-4B-q4f32_1-MLC",
  "Qwen3.5-9B-q4f32_1-MLC", "Qwen3.5-0.8B-q4f16_1-MLC", "Qwen3.5-2B-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f32_1-MLC", "Phi-4-mini-instruct-q4f32_1-MLC",
];

test("parameter counts come from the model ID", () => {
  expect(modelParams("Qwen3.5-0.8B-q4f32_1-MLC")).toBe(0.8);
  expect(modelParams("Llama-3.2-3B-Instruct-q4f32_1-MLC")).toBe(3);
  expect(modelParams("gemma-2-9b-it-q4f16_1-MLC")).toBe(9);
  expect(modelParams("Phi-4-mini-instruct-q4f32_1-MLC")).toBeNull();
});

test("a slow model is offered the largest clearly smaller one, same precision", () => {
  expect(fasterModel("Qwen3.5-2B-q4f32_1-MLC", ALL)).toBe("Qwen3.5-0.8B-q4f32_1-MLC");
  expect(fasterModel("Qwen3.5-9B-q4f32_1-MLC", ALL)).toBe("Qwen3.5-4B-q4f32_1-MLC");
  expect(fasterModel("Qwen3.5-4B-q4f32_1-MLC", ALL)).toBe("Qwen3.5-2B-q4f32_1-MLC");
  expect(fasterModel("Llama-3.2-3B-Instruct-q4f32_1-MLC", ALL)).toBe("Qwen3.5-0.8B-q4f32_1-MLC");
  expect(fasterModel("Qwen3.5-2B-q4f16_1-MLC", ALL)).toBe("Qwen3.5-0.8B-q4f16_1-MLC");
});

test("no suggestion for the smallest models or unknown sizes", () => {
  expect(fasterModel("Qwen3.5-0.8B-q4f32_1-MLC", ALL)).toBe("");
  expect(fasterModel("Phi-4-mini-instruct-q4f32_1-MLC", ALL)).toBe("");
  expect(fasterModel("Qwen3.5-2B-q4f32_1-MLC", ["Qwen3.5-2B-q4f32_1-MLC"])).toBe("");
});

test("models of about 1B parameters or fewer count as small", () => {
  expect(modelParams("SmolLM2-135M-Instruct-q0f32-MLC")).toBe(0.135);
  for (const id of ["SmolLM2-360M-Instruct-q4f32_1-MLC", "Qwen3.5-0.8B-q4f32_1-MLC",
    "Llama-3.2-1B-Instruct-q4f32_1-MLC", "gemma3-1b-it-q4f16_1-MLC", "TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC"]) {
    expect(isSmallModel(id), id).toBe(true);
  }
  for (const id of ["Qwen3.5-2B-q4f32_1-MLC", "Qwen2.5-1.5B-Instruct-q4f32_1-MLC",
    "Phi-4-mini-instruct-q4f32_1-MLC", "Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC"]) {
    expect(isSmallModel(id), id).toBe(false);
  }
});

test("writing speed counts Japanese words, not space-separated runs", () => {
  // One "word" by spaces; 12 words really. Enough for a measurement.
  const reply = "東京は日本の首都です。人口は約1400万人です。";
  expect(wordCount(reply)).toBe(12);
  expect(measureSpeed(wordCount(reply), 2000, 10)).toBe(6);
});
