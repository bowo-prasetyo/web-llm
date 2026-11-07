// How much the browser lets this site store, and what to say when a model
// doesn't fit. Models are large (0.6–7.5 GB) and browsers limit each site:
// private (incognito) windows allow very little, so a download there fails
// with "Quota exceeded".
//
// Pure functions plus thin wrappers around navigator.storage, shared by
// app.js and worker.js.

import { t } from "./i18n.js";

// What to say when a model doesn't fit (errors["storage-full"])
export function storageFullMessage() {
  return t("errors.storage-full");
}

// True for the errors browsers and WebLLM give when storage is full.
export function isQuotaError(message) {
  return /quota|QuotaExceeded|not enough (storage|space)|no space left|disk is full/i.test(message || "");
}

// The message to show for an error: storage problems in plain language,
// anything else unchanged.
export function friendlyError(message) {
  return isQuotaError(message) ? storageFullMessage() : (message || "");
}

// What the browser reports, in MB: { quotaMb, usageMb }, or null when it
// can't tell (old browsers, some privacy settings).
export async function storageEstimate(nav = globalThis.navigator) {
  try {
    if (!nav?.storage?.estimate) return null;
    const { quota, usage } = await nav.storage.estimate();
    if (typeof quota !== "number" || !(quota > 0)) return null;
    return { quotaMb: quota / 1048576, usageMb: (usage || 0) / 1048576 };
  } catch {
    return null;
  }
}

// null when a download of `needMb` fits, or { availableMb, needMb } when it
// probably doesn't. Browsers' estimates are rough, so this is for a warning,
// not for refusing the download.
export function spaceShortfall(estimate, needMb) {
  if (!estimate || !(needMb > 0)) return null;
  const availableMb = Math.max(0, estimate.quotaMb - estimate.usageMb);
  return availableMb < needMb ? { availableMb, needMb } : null;
}

// Ask the browser not to delete this site's storage (downloaded models)
// when space runs low. The browser decides; returns whether storage is kept.
export async function requestPersistence(nav = globalThis.navigator) {
  try {
    if (!nav?.storage?.persist) return false;
    if (nav.storage.persisted && await nav.storage.persisted()) return true;
    return !!(await nav.storage.persist());
  } catch {
    return false;
  }
}
