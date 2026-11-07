// storage.js: telling people when a model won't fit in the browser's storage.
import { test, expect } from "@playwright/test";
import {
  storageFullMessage, isQuotaError, friendlyError, storageEstimate,
  spaceShortfall, requestPersistence,
} from "../../storage.js";

test("storage-full errors are recognised", () => {
  for (const m of ["Quota exceeded.", "QuotaExceededError: The quota has been exceeded.",
    "Not enough storage available", "No space left on device"]) {
    expect(isQuotaError(m), m).toBe(true);
  }
  for (const m of ["Device was lost", "Network error", "", undefined]) expect(isQuotaError(m), String(m)).toBe(false);
});

test("the plain-language message replaces only storage errors", () => {
  expect(friendlyError("Quota exceeded.")).toBe(storageFullMessage());
  expect(storageFullMessage()).toContain("Private (incognito) windows have very little storage");
  expect(friendlyError("Something else")).toBe("Something else");
});

test("estimates are read in MB, and missing ones are null", async () => {
  const nav = { storage: { estimate: async () => ({ quota: 300 * 1048576, usage: 20 * 1048576 }) } };
  expect(await storageEstimate(nav)).toEqual({ quotaMb: 300, usageMb: 20 });
  expect(await storageEstimate({})).toBeNull();
  expect(await storageEstimate({ storage: { estimate: async () => { throw new Error("no"); } } })).toBeNull();
  expect(await storageEstimate({ storage: { estimate: async () => ({ quota: 0 }) } })).toBeNull();
});

test("a shortfall is reported only when the model doesn't fit", () => {
  const privateWindow = { quotaMb: 300, usageMb: 20 };
  expect(spaceShortfall(privateWindow, 1629)).toEqual({ availableMb: 280, needMb: 1629 });
  expect(spaceShortfall({ quotaMb: 50000, usageMb: 2000 }, 1629)).toBeNull();
  expect(spaceShortfall(null, 1629)).toBeNull(); // unknown: no warning
  expect(spaceShortfall(privateWindow, 0)).toBeNull();
});

test("persistence is asked for only when not already granted", async () => {
  let asked = 0;
  const nav = granted => ({ storage: { persisted: async () => granted, persist: async () => { asked++; return true; } } });
  expect(await requestPersistence(nav(true))).toBe(true);
  expect(asked).toBe(0);
  expect(await requestPersistence(nav(false))).toBe(true);
  expect(asked).toBe(1);
  expect(await requestPersistence({})).toBe(false);
});
