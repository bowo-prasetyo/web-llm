// What the worker tells the page about its progress, as codes rather than
// sentences. The worker (worker.js) only says *what* happened; the page
// (app.js) decides *how to say it*, through statusText() and friends.
//
// Keeping the words out of the worker means:
// - the page never has to recognise a state by reading English text
//   ("Model loaded successfully", "Ready …"), so the wording can change,
//   or be translated, without breaking model loading;
// - every sentence the status bar can show is translatable.
//
// The words themselves are in locales/<code>.js under "status" and
// "fatal" (see i18n.js).
//
// Shared by app.js and worker.js. No DOM access.

import { t } from "./i18n.js";

// Status codes: { type: "status", code, params } from the worker.
export const STATUS = Object.freeze({
  MANUAL_MODEL:       "manual-model",       // params: { model }
  SAFE_GPU_MODE:      "safe-gpu-mode",
  GPU_DETECTED:       "gpu-detected",       // params: { gpu }
  LOADING_MODEL:      "loading-model",
  LOAD_PROGRESS:      "load-progress",      // params: { detail, percent }
  NEEDS_F16:          "needs-f16",
  CHECKING_MODEL:     "checking-model",
  MODEL_LOADED:       "model-loaded",
  READY:              "ready",              // params: { profile }
  STOPPED:            "stopped",
  CUT_OFF_TIME_LIMIT: "cut-off-time-limit",
  CUT_OFF_STALLED:    "cut-off-stalled",
  SLOW_GENERATION:    "slow-generation",
  ENGINE_RESET:       "engine-reset",
  REINITIALISING:     "reinitialising",
  WAITING_TO_SWITCH:  "waiting-to-switch",
  UNLOADING_PREVIOUS: "unloading-previous",
  INITIALIZING_MODEL: "initializing-model", // params: { model }
  UNLOADED_IDLE:      "unloaded-idle",
  LOADING_EMBEDDER:   "loading-embedder",
  EMBEDDER_LOADED:    "embedder-loaded",
});

// Codes after which the model is loaded and can answer.
const ENGINE_READY = new Set([STATUS.MODEL_LOADED, STATUS.READY]);

export function isEngineReady(code) {
  return ENGINE_READY.has(code);
}

// Every code the worker can send
const KNOWN = new Set(Object.values(STATUS));

// The status-bar text for a status code. Unknown codes give "" (a newer
// worker than page, briefly, during an update).
export function statusText(code, params = {}) {
  if (!KNOWN.has(code)) return "";
  const p = params || {};
  switch (code) {
    case STATUS.GPU_DETECTED:
      return t("status.gpu-detected", { gpu: p.gpu || t("status.gpu-unknown") });
    case STATUS.LOAD_PROGRESS:
      // WebLLM's own progress text, when it gives one
      return p.detail || t("status.load-progress", { percent: p.percent ?? 0 });
    case STATUS.READY:
      return p.profile ? t("status.ready-profile", { profile: p.profile }) : t("status.ready");
    default:
      return t(`status.${code}`, p);
  }
}

// { type: "fatal", reason, phase }: the worker stopped and will be replaced.
// phase is "loading" or "answering".
export function fatalText(reason, phase) {
  if (reason === "gpu-crash") {
    return t(phase === "answering" ? "fatal.gpu-crash-answering" : "fatal.gpu-crash-loading");
  }
  return t("fatal.unknown");
}
