// What the worker tells the page about its progress, as codes rather than
// sentences. The worker (worker.js) only says *what* happened; the page
// (app.js) decides *how to say it*, through statusText() and friends.
//
// Keeping the words out of the worker means:
// - the page never has to recognise a state by reading English text
//   ("Model loaded successfully", "Ready …"), so the wording can change,
//   or be translated, without breaking model loading;
// - every sentence the status bar can show lives here, in one place,
//   ready to become a translation catalog.
//
// Shared by app.js and worker.js. No DOM access.

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

const STATUS_TEXT = {
  [STATUS.MANUAL_MODEL]:       p => `Using manually selected model: ${p.model}`,
  [STATUS.SAFE_GPU_MODE]:      () => "Using persistent safe GPU mode",
  [STATUS.GPU_DETECTED]:       p => `GPU detected: ${p.gpu || "Unknown GPU"}`,
  [STATUS.LOADING_MODEL]:      () => "Loading AI model for device profile...",
  // WebLLM's own progress text, when it gives one
  [STATUS.LOAD_PROGRESS]:      p => p.detail || `Loading ${p.percent ?? 0}%`,
  [STATUS.NEEDS_F16]:          () => "This model needs 16-bit GPU support",
  [STATUS.CHECKING_MODEL]:     () => "Checking that the model works on this GPU...",
  [STATUS.MODEL_LOADED]:       () => "Model loaded successfully",
  [STATUS.READY]:              p => p.profile ? `Ready (${p.profile})` : "Ready",
  [STATUS.STOPPED]:            () => "Generation stopped",
  [STATUS.CUT_OFF_TIME_LIMIT]: () => "Response cut off: reply time limit reached",
  [STATUS.CUT_OFF_STALLED]:    () => "Response cut off: the model stopped producing text",
  [STATUS.SLOW_GENERATION]:    () => "Generation is taking longer than usual...",
  [STATUS.ENGINE_RESET]:       () => "The browser reset the model (this happens on phones after the app was in the background). Reloading it…",
  [STATUS.REINITIALISING]:     () => "Engine not ready, reinitialising...",
  [STATUS.WAITING_TO_SWITCH]:  () => "Waiting for generation to finish before switching model...",
  [STATUS.UNLOADING_PREVIOUS]: () => "Unloading previous model...",
  [STATUS.INITIALIZING_MODEL]: p => `Initializing ${p.model}...`,
  [STATUS.UNLOADED_IDLE]:      () => "Model unloaded to save memory",
  [STATUS.LOADING_EMBEDDER]:   () => "Loading embedding model...",
  [STATUS.EMBEDDER_LOADED]:    () => "Embedding model loaded",
};

// The status-bar text for a status code. Unknown codes give "" (a newer
// worker than page, briefly, during an update).
export function statusText(code, params = {}) {
  const text = STATUS_TEXT[code];
  return text ? text(params || {}) : "";
}

// { type: "fatal", reason, phase }: the worker stopped and will be replaced.
// phase is "loading" or "answering".
export function fatalText(reason, phase) {
  if (reason === "gpu-crash") {
    return phase === "answering"
      ? "The GPU stopped working while answering."
      : "The GPU stopped working while loading the model.";
  }
  return "The model stopped unexpectedly.";
}
