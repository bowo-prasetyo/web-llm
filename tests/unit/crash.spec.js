// crash.js: notes left before loading or answering reveal a page that died
// (out of memory) the next time it opens, and a lighter model is suggested.
import { test, expect } from "@playwright/test";
import {
  PENDING_KEY, CRASHES_KEY, markPending, clearPending, detectCrash,
  loadCrashes, forgetCrash, lighterModel,
} from "../../crash.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k),
    data,
  };
}

const Q08 = "Qwen3.5-0.8B-q4f32_1-MLC";

test("no note: no crash", () => {
  const s = memoryStorage();
  expect(detectCrash(s)).toBeNull();
  expect(loadCrashes(s)).toEqual({});
});

test("a note left behind is a crash, recorded once and removed", () => {
  const s = memoryStorage();
  markPending(s, Q08, "answering", 1);
  expect(JSON.parse(s.getItem(PENDING_KEY))).toEqual({ model: Q08, phase: "answering", ts: 1 });
  expect(detectCrash(s, 5)).toEqual({ model: Q08, phase: "answering" });
  expect(s.getItem(PENDING_KEY)).toBeNull();
  expect(loadCrashes(s)).toEqual({ [Q08]: { phase: "answering", ts: 5 } });
  expect(detectCrash(s)).toBeNull(); // the next start is clean
});

test("a cleared note is not a crash", () => {
  const s = memoryStorage();
  markPending(s, Q08, "loading");
  clearPending(s);
  expect(detectCrash(s)).toBeNull();
});

test("broken notes are ignored safely", () => {
  expect(detectCrash(memoryStorage({ [PENDING_KEY]: "{oops" }))).toBeNull();
  expect(detectCrash(memoryStorage({ [PENDING_KEY]: JSON.stringify({ phase: "loading" }) }))).toBeNull();
  expect(loadCrashes(memoryStorage({ [CRASHES_KEY]: "[[" }))).toEqual({});
  // unknown phases count as loading
  expect(detectCrash(memoryStorage({ [PENDING_KEY]: JSON.stringify({ model: Q08, phase: "?" }) })).phase).toBe("loading");
});

test("a model that works again is forgotten", () => {
  const s = memoryStorage();
  markPending(s, Q08, "loading");
  detectCrash(s);
  expect(forgetCrash(s, Q08)).toEqual({});
  expect(loadCrashes(s)).toEqual({});
});

const SIZES = {
  [Q08]: 1894, "Qwen3.5-0.8B-q4f16_1-MLC": 1629,
  "Llama-3.2-1B-Instruct-q4f32_1-MLC": 1129, "Llama-3.2-1B-Instruct-q4f16_1-MLC": 879,
  "Qwen2.5-0.5B-Instruct-q4f32_1-MLC": 1060, "Qwen2.5-0.5B-Instruct-q4f16_1-MLC": 945,
  "SmolLM2-360M-Instruct-q4f32_1-MLC": 580, "Qwen3.5-2B-q4f32_1-MLC": 2592,
};
const ALL = Object.keys(SIZES);

test("the lighter model needs at most 60% of the memory, in the same precision", () => {
  expect(lighterModel(Q08, SIZES, ALL)).toBe("Llama-3.2-1B-Instruct-q4f32_1-MLC");
  expect(lighterModel("Qwen3.5-0.8B-q4f16_1-MLC", SIZES, ALL)).toBe("Llama-3.2-1B-Instruct-q4f16_1-MLC");
  expect(lighterModel("Qwen3.5-2B-q4f32_1-MLC", SIZES, ALL)).toBe("Llama-3.2-1B-Instruct-q4f32_1-MLC");
});

test("models that crashed here are skipped; the smallest have no lighter one", () => {
  const crashes = { "Llama-3.2-1B-Instruct-q4f32_1-MLC": { phase: "loading" } };
  expect(lighterModel(Q08, SIZES, ALL, crashes)).toBe("Qwen2.5-0.5B-Instruct-q4f32_1-MLC");
  expect(lighterModel("Llama-3.2-1B-Instruct-q4f32_1-MLC", SIZES, ALL)).toBe("SmolLM2-360M-Instruct-q4f32_1-MLC");
  expect(lighterModel("SmolLM2-360M-Instruct-q4f32_1-MLC", SIZES, ALL)).toBe("");
  expect(lighterModel("Unknown-q4f32_1-MLC", SIZES, ALL)).toBe("");
});
