// picker.js: model picker catalog and recommendations.
import { test, expect } from "@playwright/test";
import { MODEL_PICKS, pickModelId, recommendTier, friendlyModelName } from "../../picker.js";
import { workerModels } from "../support/models.js";

test("every pick exists in the worker's model lists", () => {
  const { models, altModels } = workerModels();
  const known = new Set([...models, ...altModels]);
  const picks = Object.values(MODEL_PICKS).flatMap(u => Object.values(u)).flatMap(p => [p.f16, p.f32]);
  expect(picks.filter(id => !known.has(id))).toEqual([]);
});

test("uses q4f16 only where 16-bit GPU math works", () => {
  expect(pickModelId("code", "fast", true)).toBe("Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC");
  expect(pickModelId("code", "fast", false)).toBe("Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC");
});

test("no coding pick below 1.5B", () => {
  for (const pick of Object.values(MODEL_PICKS.code)) {
    expect(pick.f16).not.toMatch(/0\.5B|0\.6B/);
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
});
