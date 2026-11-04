// picker.js: model picker catalog and recommendations.
import { test, expect } from "@playwright/test";
import {
  MODEL_PICKS, pickModelId, recommendTier, friendlyModelName,
  modelPrecision, formatSize, describeLoadProgress, estimateRemaining,
} from "../../picker.js";
import { workerModels } from "../support/models.js";

test("every pick exists in the worker's model lists", () => {
  const { models, altModels } = workerModels();
  const known = new Set([...models, ...altModels]);
  const picks = Object.values(MODEL_PICKS).flatMap(u => Object.values(u)).flatMap(p => [p.f16, p.f32]);
  expect(picks.filter(id => !known.has(id))).toEqual([]);
});

test("uses q4f16 only where 16-bit GPU math works", () => {
  expect(pickModelId("code", "fast", true)).toBe("Qwen3.5-2B-q4f16_1-MLC");
  expect(pickModelId("code", "fast", false)).toBe("Qwen3.5-2B-q4f32_1-MLC");
});

test("no coding or writing pick below 2B", () => {
  for (const use of ["code", "write"]) {
    for (const pick of Object.values(MODEL_PICKS[use])) expect(pick.f16, use).not.toMatch(/0\.\dB|1(\.\d)?B/);
  }
});

test("picks use the newest generation (Qwen3.5)", () => {
  for (const tiers of Object.values(MODEL_PICKS)) {
    for (const pick of Object.values(tiers)) {
      expect(pick.f16).toMatch(/^Qwen3\.5-/);
      expect(pick.f32).toBe(pick.f16.replace("q4f16_1", "q4f32_1"));
    }
  }
});

test("recommends Fast on phones and small devices, Balanced otherwise", () => {
  expect(recommendTier({ mobile: true, memoryGB: 8 })).toBe("fast");
  expect(recommendTier({ mobile: false, memoryGB: 4 })).toBe("fast");
  expect(recommendTier({ mobile: false, memoryGB: 8 })).toBe("balanced");
  expect(recommendTier({ mobile: false })).toBe("balanced");
});

test("friendly model names", () => {
  expect(friendlyModelName("Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC")).toBe("Qwen2.5 Coder 1.5B");
  expect(friendlyModelName("Llama-3.2-1B-Instruct-q4f16_1-MLC")).toBe("Llama 3.2 1B");
  expect(friendlyModelName("Qwen3.5-0.8B-q4f32_1-MLC")).toBe("Qwen3.5 0.8B");
  // release stamps, weight formats and lowercase suffixes are left out
  expect(friendlyModelName("Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC")).toBe("Ministral 3 3B");
  expect(friendlyModelName("OLMo-2-0425-1B-Instruct-q4f16_1-MLC")).toBe("OLMo 2 1B");
  expect(friendlyModelName("Phi-4-mini-instruct-q4f16_1-MLC")).toBe("Phi 4 mini");
  expect(friendlyModelName("stablelm-2-zephyr-1_6b-q4f16_1-MLC")).toBe("StableLM 2 Zephyr 1.6B");
  expect(friendlyModelName("gemma3-1b-it-q4f16_1-MLC")).toBe("Gemma 3 1B");
  expect(friendlyModelName("gemma-2-9b-it-q4f16_1-MLC")).toBe("Gemma 2 9B");
  expect(friendlyModelName("SmolLM2-135M-Instruct-q0f32-MLC")).toBe("SmolLM2 135M");
});

test("every model has a readable, distinct label", () => {
  const { models, altModels, sizes } = workerModels();
  const labels = [...new Set([...models, ...altModels])]
    .map(id => [friendlyModelName(id), modelPrecision(id), formatSize(sizes[id])].join(" · "));
  for (const label of labels) {
    expect(label).not.toMatch(/MLC|q\d+f\d+|Instruct|BF16/);
  }
  expect(new Set(labels).size).toBe(labels.length);
});

test("precision and sizes", () => {
  expect(modelPrecision("Qwen3.5-2B-q4f16_1-MLC")).toBe("16-bit");
  expect(modelPrecision("Qwen3.5-2B-q4f32_1-MLC")).toBe("32-bit");
  expect(modelPrecision("SmolLM2-135M-Instruct-q0f32-MLC")).toBe("32-bit");
  expect(formatSize(945)).toBe("945 MB");
  expect(formatSize(2250)).toBe("2.2 GB");
  expect(formatSize(0)).toBe("");
});

test("load progress from WebLLM's messages", () => {
  expect(describeLoadProgress("Fetching param cache[12/57]: 345MB fetched. 20% completed, 40 secs elapsed. It can take a while when we first visit this page to populate the cache.", 20))
    .toEqual({ phase: "download", percent: 20, doneMb: 345 });
  expect(describeLoadProgress("Loading model from cache[3/57]: 250MB loaded. 5% completed, 2 secs elapsed.", 5))
    .toEqual({ phase: "cache", percent: 5, doneMb: 250 });
  expect(describeLoadProgress("Loading GPU shader modules[10/60]: 16% completed, 3 secs elapsed.", 16))
    .toEqual({ phase: "gpu", percent: 16, doneMb: null });
  expect(describeLoadProgress("Start to fetch params", undefined))
    .toEqual({ phase: "download", percent: null, doneMb: null });
  expect(describeLoadProgress("Something else", 150).percent).toBe(100);
});

test("time left is estimated only once there is enough to go on", () => {
  const start = { startPct: 0, startTime: 0 };
  expect(estimateRemaining({ ...start, pct: 1, now: 10_000 })).toBe(null);   // barely moved
  expect(estimateRemaining({ ...start, pct: 10, now: 2_000 })).toBe(null);   // too early
  expect(estimateRemaining({ ...start, pct: 50, now: 20_000 })).toBe("less than a minute left");
  expect(estimateRemaining({ ...start, pct: 10, now: 30_000 })).toBe("about 5 min left");
  expect(estimateRemaining({ ...start, pct: 2, now: 120_000 })).toBe("about 1 h 38 min left");
  expect(estimateRemaining({ ...start, pct: 100, now: 60_000 })).toBe(null);
});
