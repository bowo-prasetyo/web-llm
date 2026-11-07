// status.js: the worker reports codes, the page chooses the words.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { STATUS, statusText, fatalText, isEngineReady } from "../../status.js";

test("every status code has text", () => {
  for (const code of Object.values(STATUS)) {
    expect(statusText(code, { model: "M", gpu: "G", profile: "P", percent: 5 }), code).not.toBe("");
  }
});

test("codes are unique", () => {
  const codes = Object.values(STATUS);
  expect(new Set(codes).size).toBe(codes.length);
});

test("parameters are filled in", () => {
  expect(statusText(STATUS.READY, { profile: "Safe GPU Mode" })).toBe("Ready (Safe GPU Mode)");
  expect(statusText(STATUS.READY)).toBe("Ready");
  expect(statusText(STATUS.INITIALIZING_MODEL, { model: "Qwen3.5-2B-q4f16_1-MLC" }))
    .toBe("Initializing Qwen3.5-2B-q4f16_1-MLC...");
  expect(statusText(STATUS.GPU_DETECTED, {})).toBe("GPU detected: Unknown GPU");
  expect(statusText(STATUS.LOAD_PROGRESS, { detail: "Finish loading on WebGPU - nvidia" }))
    .toBe("Finish loading on WebGPU - nvidia");
  expect(statusText(STATUS.LOAD_PROGRESS, { percent: 42 })).toBe("Loading 42%");
});

test("unknown codes and missing params don't throw", () => {
  expect(statusText("no-such-code")).toBe("");
  expect(statusText(undefined)).toBe("");
  expect(statusText(STATUS.MANUAL_MODEL, null)).toContain("Using manually selected model");
});

test("the engine is ready only after a load or a reply", () => {
  expect(isEngineReady(STATUS.MODEL_LOADED)).toBe(true);
  expect(isEngineReady(STATUS.READY)).toBe(true);
  for (const code of [STATUS.LOADING_MODEL, STATUS.UNLOADED_IDLE, STATUS.EMBEDDER_LOADED, STATUS.STOPPED]) {
    expect(isEngineReady(code), code).toBe(false);
  }
});

test("fatal errors are described by reason and phase", () => {
  expect(fatalText("gpu-crash", "loading")).toBe("The GPU stopped working while loading the model.");
  expect(fatalText("gpu-crash", "answering")).toBe("The GPU stopped working while answering.");
  expect(fatalText("gpu-crash")).toBe("The GPU stopped working while loading the model.");
  expect(fatalText("other")).not.toBe("");
});

test("the worker sends codes, not status sentences", () => {
  const src = fs.readFileSync(new URL("../../worker.js", import.meta.url), "utf8");
  const statusPosts = src.match(/type:\s*"status"[^}]*}/g) || [];
  expect(statusPosts.length).toBeGreaterThan(0);
  for (const post of statusPosts) {
    expect(post, post).toMatch(/code:[^,}]*STATUS\./);
    expect(post, post).not.toMatch(/\btext:/);
  }
});

test("status.js is saved for offline use", () => {
  const sw = fs.readFileSync(new URL("../../sw.js", import.meta.url), "utf8");
  expect(sw).toContain('"./status.js"');
});
