// English: the source language. Every other locales/<code>.js has the
// same keys and the same {placeholders}; tests/unit/i18n.spec.js checks.
// See docs/translating.md.
export default {
  // Status bar, from the model worker (status.js)
  status: {
    "manual-model":       "Using manually selected model: {model}",
    "safe-gpu-mode":      "Using persistent safe GPU mode",
    "gpu-detected":       "GPU detected: {gpu}",
    "gpu-unknown":        "Unknown GPU",
    "loading-model":      "Loading AI model for device profile...",
    "load-progress":      "Loading {percent}%",
    "needs-f16":          "This model needs 16-bit GPU support",
    "checking-model":     "Checking that the model works on this GPU...",
    "model-loaded":       "Model loaded successfully",
    "ready":              "Ready",
    "ready-profile":      "Ready ({profile})",
    "stopped":            "Generation stopped",
    "cut-off-time-limit": "Response cut off: reply time limit reached",
    "cut-off-stalled":    "Response cut off: the model stopped producing text",
    "slow-generation":    "Generation is taking longer than usual...",
    "engine-reset":       "The browser reset the model (this happens on phones after the app was in the background). Reloading it…",
    "reinitialising":     "Engine not ready, reinitialising...",
    "waiting-to-switch":  "Waiting for generation to finish before switching model...",
    "unloading-previous": "Unloading previous model...",
    "initializing-model": "Initializing {model}...",
    "unloaded-idle":      "Model unloaded to save memory",
    "loading-embedder":   "Loading embedding model...",
    "embedder-loaded":    "Embedding model loaded",
  },

  // When the model worker stops (status.js)
  fatal: {
    "gpu-crash-loading":   "The GPU stopped working while loading the model.",
    "gpu-crash-answering": "The GPU stopped working while answering.",
    "unknown":             "The model stopped unexpectedly.",
  },

  // How fast a model writes (pace.js)
  speed: {
    "under-one": "less than 1 word/sec",
    "about": { one: "about {count} word/sec", other: "about {count} words/sec" },
  },

  // Time left for a download (picker.js)
  eta: {
    "under-minute":  "less than a minute left",
    "minutes":       "about {minutes} min left",
    "hours":         "about {hours} h left",
    "hours-minutes": "about {hours} h {minutes} min left",
  },

  chats: {
    "count": { one: "{count} chat", other: "{count} chats" },
  },

  dates: {
    "yesterday": "Yesterday",
  },
};
