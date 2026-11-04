// Pinned to 0.2.84. WebLLM 0.2.86 produces garbage text ("outer outer
// outer…") with the same models and settings that work on 0.2.84, so check
// a real chat before moving this pin to a newer version.
// Loaded straight from jsDelivr (esm.run only redirects there), so the
// service worker (sw.js) can keep a copy for offline use; keep the URL in
// sync with the LIBS list in sw.js.
import {
  CreateMLCEngine
} from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.84/+esm";

import {
  pipeline
} from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

import { DEFAULT_PERSONA_PROMPT } from "./personas.js";
import { stripThinking } from "./markdown.js";
import { looksDegenerate, checkSample, findRepeatLoop } from "./quality.js";
import { fitToContext, estimateTokens } from "./context.js";
import { timeLimitReason, withTimeLimits, wordCount, measureSpeed } from "./pace.js";
import {
  INDEX_MIN_CHARS,
  chunkText,
  buildAttachmentContext,
  withAttachments,
} from "./attachments.js";

// Keep in sync with the import URL above; shown in Settings → This device.
const WEBLLM_VERSION = "0.2.84";

// The UI sends the current chat persona's prompt as USER_CONFIG.system_prompt.
// Fallback used when it is not set.
const DEFAULT_SYSTEM_PROMPT = DEFAULT_PERSONA_PROMPT;

function getSystemPrompt() {
  return (USER_CONFIG && USER_CONFIG.system_prompt)
    ? USER_CONFIG.system_prompt
    : DEFAULT_SYSTEM_PROMPT;
}

const SMALLEST_MODEL = "SmolLM2-360M-Instruct-q4f32_1-MLC";

// Approximate download sizes (MB) for first-time download confirmation.
// Derived from VRAM footprints in the WebLLM model registry.
const MODEL_SIZES_MB = {
  // Newer models (all supported by WebLLM 0.2.84)
  "Qwen3.5-0.8B-q4f16_1-MLC":                     1629,
  "Qwen3.5-0.8B-q4f32_1-MLC":                     1894,
  "Qwen3.5-2B-q4f16_1-MLC":                       2245,
  "Qwen3.5-2B-q4f32_1-MLC":                       2592,
  "Qwen3.5-4B-q4f16_1-MLC":                       3868,
  "Qwen3.5-4B-q4f32_1-MLC":                       4680,
  "Qwen3.5-9B-q4f16_1-MLC":                       6433,
  "Qwen3.5-9B-q4f32_1-MLC":                       7545,
  "Phi-4-mini-instruct-q4f16_1-MLC":              3438,
  "Phi-4-mini-instruct-q4f32_1-MLC":              4221,
  "gemma3-1b-it-q4f16_1-MLC":                      711,
  "Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC": 2864,
  "Ministral-3-3B-Instruct-2512-BF16-q4f32_1-MLC": 3532,
  "OLMo-2-0425-1B-Instruct-q4f16_1-MLC":          1777,
  "OLMo-2-0425-1B-Instruct-q4f32_1-MLC":          2454,
  // SmolLM2
  "SmolLM2-135M-Instruct-q0f32-MLC":               720,
  "SmolLM2-360M-Instruct-q4f32_1-MLC":             580,
  "SmolLM2-360M-Instruct-q0f32-MLC":              1744,
  "SmolLM2-1.7B-Instruct-q4f16_1-MLC":            1774,
  "SmolLM2-1.7B-Instruct-q4f32_1-MLC":            2692,
  // TinyLlama
  "TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC":          840,
  // Qwen2.5
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC":             945,
  "Qwen2.5-0.5B-Instruct-q4f32_1-MLC":            1060,
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC":            1630,
  "Qwen2.5-1.5B-Instruct-q4f32_1-MLC":            1889,
  "Qwen2.5-3B-Instruct-q4f16_1-MLC":              2505,
  "Qwen2.5-3B-Instruct-q4f32_1-MLC":              2894,
  "Qwen2.5-7B-Instruct-q4f16_1-MLC":              5107,
  "Qwen2.5-7B-Instruct-q4f32_1-MLC":              5900,
  // Qwen2.5 Coder
  "Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC":       945,
  "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC":      1630,
  "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC":        2505,
  "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC":        5107,
  // Qwen2.5 Math
  "Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC":       1630,
  // Qwen3
  "Qwen3-0.6B-q4f16_1-MLC":                       1050,
  "Qwen3-1.7B-q4f16_1-MLC":                       1774,
  "Qwen3-4B-q4f16_1-MLC":                         3200,
  "Qwen3-8B-q4f16_1-MLC":                         5500,
  // Llama 3.2
  "Llama-3.2-1B-Instruct-q4f16_1-MLC":             879,
  "Llama-3.2-1B-Instruct-q4f32_1-MLC":            1129,
  "Llama-3.2-3B-Instruct-q4f16_1-MLC":            2264,
  "Llama-3.2-3B-Instruct-q4f32_1-MLC":            2952,
  // Llama 3.1
  "Llama-3.1-8B-Instruct-q4f16_1-MLC":            5001,
  "Llama-3.1-8B-Instruct-q4f32_1-MLC":            6101,
  // Gemma 2
  "gemma-2-2b-it-q4f16_1-MLC":                    1895,
  "gemma-2-2b-it-q4f32_1-MLC":                    2509,
  "gemma-2-9b-it-q4f16_1-MLC":                    6422,
  // Phi 3.5
  "Phi-3.5-mini-instruct-q4f16_1-MLC":            3672,
  "Phi-3.5-mini-instruct-q4f32_1-MLC":            5483,
  // Mistral 7B
  "Mistral-7B-Instruct-v0.3-q4f32_1-MLC":         5619,
  // Hermes (fine-tuned)
  "Hermes-3-Llama-3.2-3B-q4f16_1-MLC":            2264,
  "Hermes-3-Llama-3.1-8B-q4f16_1-MLC":            4876,
  // DeepSeek-R1 Distill
  "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC":      5107,
  "DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC":     5001,
  // StableLM
  "stablelm-2-zephyr-1_6b-q4f16_1-MLC":           2088,
};

// q4f32 versions of models the main list only has as q4f16. They are shown
// only on devices where 16-bit models fail or aren't supported (some GPUs
// compute 16-bit math wrongly and q4f16 models then reply with garbage).
const F32_ALTERNATIVES_MB = {
  "Qwen2.5-Coder-0.5B-Instruct-q4f32_1-MLC":   1060,
  "Qwen3-0.6B-q4f32_1-MLC":                    1925,
  "Qwen3-1.7B-q4f32_1-MLC":                    2635,
  "stablelm-2-zephyr-1_6b-q4f32_1-MLC":        2999,
  "Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC":   1889,
  "Qwen2.5-Math-1.5B-Instruct-q4f32_1-MLC":    1889,
  "Hermes-3-Llama-3.2-3B-q4f32_1-MLC":         2952,
  "Qwen2.5-Coder-3B-Instruct-q4f32_1-MLC":     2894,
  "Qwen3-4B-q4f32_1-MLC":                      4328,
  "Qwen2.5-Coder-7B-Instruct-q4f32_1-MLC":     5900,
  "Qwen3-8B-q4f32_1-MLC":                      6853,
  "Hermes-3-Llama-3.1-8B-q4f32_1-MLC":         5779,
  "DeepSeek-R1-Distill-Qwen-7B-q4f32_1-MLC":   5900,
  "DeepSeek-R1-Distill-Llama-8B-q4f32_1-MLC":  6101,
  "gemma-2-9b-it-q4f32_1-MLC":                 8383,
};
const ALT_MODELS = Object.keys(F32_ALTERNATIVES_MB);
Object.assign(MODEL_SIZES_MB, F32_ALTERNATIVES_MB);

function modelsMessage() {
  return {
    type: "models",
    models: AVAILABLE_MODELS,
    altModels: ALT_MODELS,
    sizes: MODEL_SIZES_MB,
  };
}

// WebLLM version, GPU name and 16-bit shader support, for Settings.
async function postDiagnostics() {
  let gpu = null;
  let shaderF16 = null;
  try {
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    if (adapter) {
      const info = adapter.info || {};
      gpu = [info.vendor, info.architecture, info.description]
        .filter(Boolean).join(" ") || "Unknown GPU";
      shaderF16 = adapter.features.has("shader-f16");
    }
  } catch {}
  postMessage({
    type: "diagnostics",
    webllmVersion: WEBLLM_VERSION,
    webgpu: !!navigator.gpu,
    gpu,
    shaderF16,
  });
}

const AVAILABLE_MODELS = [
  // ── ~100–400M — ultra-micro ─────────────────────────────────────────
  "SmolLM2-135M-Instruct-q0f32-MLC",
  "SmolLM2-360M-Instruct-q4f32_1-MLC",
  "SmolLM2-360M-Instruct-q0f32-MLC",

  // ── ~0.5–0.8B — micro ───────────────────────────────────────────────
  "Qwen3.5-0.8B-q4f16_1-MLC",
  "Qwen3.5-0.8B-q4f32_1-MLC",
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-0.5B-Instruct-q4f32_1-MLC",
  "Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC",
  "Qwen3-0.6B-q4f16_1-MLC",

  // ── ~1–1.7B — lightweight ───────────────────────────────────────────
  "gemma3-1b-it-q4f16_1-MLC",
  "OLMo-2-0425-1B-Instruct-q4f16_1-MLC",
  "OLMo-2-0425-1B-Instruct-q4f32_1-MLC",
  "TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC",
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f32_1-MLC",
  "SmolLM2-1.7B-Instruct-q4f16_1-MLC",
  "SmolLM2-1.7B-Instruct-q4f32_1-MLC",
  "Qwen3-1.7B-q4f16_1-MLC",
  "stablelm-2-zephyr-1_6b-q4f16_1-MLC",

  // ── ~1.5B — small ───────────────────────────────────────────────────
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-1.5B-Instruct-q4f32_1-MLC",
  "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC",

  // ── ~2–4B — mid ─────────────────────────────────────────────────────
  "Qwen3.5-2B-q4f16_1-MLC",
  "Qwen3.5-2B-q4f32_1-MLC",
  "Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC",
  "Ministral-3-3B-Instruct-2512-BF16-q4f32_1-MLC",
  "Qwen3.5-4B-q4f16_1-MLC",
  "Qwen3.5-4B-q4f32_1-MLC",
  "gemma-2-2b-it-q4f16_1-MLC",
  "gemma-2-2b-it-q4f32_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f32_1-MLC",
  "Hermes-3-Llama-3.2-3B-q4f16_1-MLC",
  "Qwen2.5-3B-Instruct-q4f16_1-MLC",
  "Qwen2.5-3B-Instruct-q4f32_1-MLC",
  "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
  "Qwen3-4B-q4f16_1-MLC",

  // ── ~3.8B — upper-mid ───────────────────────────────────────────────
  "Phi-4-mini-instruct-q4f16_1-MLC",
  "Phi-4-mini-instruct-q4f32_1-MLC",
  "Phi-3.5-mini-instruct-q4f16_1-MLC",
  "Phi-3.5-mini-instruct-q4f32_1-MLC",

  // ── ~7–9B — large (needs ≥6 GB VRAM) ───────────────────────────────
  "Qwen3.5-9B-q4f16_1-MLC",
  "Qwen3.5-9B-q4f32_1-MLC",
  "Qwen2.5-7B-Instruct-q4f16_1-MLC",
  "Qwen2.5-7B-Instruct-q4f32_1-MLC",
  "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC",
  "Qwen3-8B-q4f16_1-MLC",
  "Llama-3.1-8B-Instruct-q4f16_1-MLC",
  "Llama-3.1-8B-Instruct-q4f32_1-MLC",
  "Hermes-3-Llama-3.1-8B-q4f16_1-MLC",
  "Mistral-7B-Instruct-v0.3-q4f32_1-MLC",
  "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC",
  "DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC",
  "gemma-2-9b-it-q4f16_1-MLC",
];

// Replies are cut off only when they stop making progress (see pace.js).
// Settings can override the limits (the tests use short ones).
function timeLimits() {
  return withTimeLimits(USER_CONFIG && USER_CONFIG.timeLimits);
}

// Maximum conversation turns kept in history.
// Recomputed per-generation based on device profile (see generate()),
// but also needed at module scope for the restore-history handler.
const MAX_HISTORY_HIGH = 20;
const MAX_HISTORY_LOW  = 6;

let IS_GENERATING = false;
let LAST_STREAM_TIME = 0;
let STALL_TIMEOUT = null;
let REQUEST_COUNTER = 0;
let ACTIVE_GENERATION = false;
let STOP_REQUESTED = false;   // set by "stop-generation" message
let SESSION_HISTORY = [];


let engine = null;
let initializingPromise = null;
let embedder = null;
let embedderPromise = null;
// Documents attached to the chat on screen (sent by the app with
// "set-attachments"): { chatId, docs: [{ id, name, text, chunks }] }
let chatDocs = { chatId: null, docs: [] };
let indexingQueue = Promise.resolve();

let MODEL = null;
let USER_CONFIG = null;

let MODEL_CONFIG = {
  max_tokens: 256,
  temperature: 0.7,
};

let DEVICE_PROFILE = {
  name: "Unknown",
  lowEnd: false,
  unstable: false,
};

let RETRYING_AFTER_CRASH = false;

async function saveToOPFS(filename, content) {
  const root = await navigator.storage.getDirectory();

  const fileHandle = await root.getFileHandle(filename, {
    create: true,
  });

  const writable = await fileHandle.createWritable();

  await writable.write(content);
  await writable.close();
}

async function readFromOPFS(filename) {
  try {
    const root = await navigator.storage.getDirectory();

    const fileHandle = await root.getFileHandle(filename);

    const file = await fileHandle.getFile();

    return await file.text();
  } catch {
    return null;
  }
}

async function detectBestModel() {

  // ------------------------------------------------
  // User Selected Model Override
  // ------------------------------------------------

  if (USER_CONFIG) {
  
    MODEL = USER_CONFIG.model;
  
    DEVICE_PROFILE = {
      name: "Manual Selection",
      lowEnd: false,
      unstable: false,
    };

    MODEL_CONFIG = {
      max_tokens:         USER_CONFIG.max_tokens,
      temperature:        USER_CONFIG.temperature,
      contextWindowSize:  USER_CONFIG.contextWindowSize,
      top_p:              USER_CONFIG.top_p          ?? 1.0,
      frequency_penalty:  USER_CONFIG.frequency_penalty ?? 0.0,
      presence_penalty:   USER_CONFIG.presence_penalty  ?? 0.0,
      repetition_penalty: USER_CONFIG.repetition_penalty ?? 1.0,
    };
      
    postMessage({
      type: "status",
      text: `Using manually selected model: ${MODEL}`,
    });
  
    return;
  }
    
  // ------------------------------------------------
  // Tier 4 — Previously unstable
  // ------------------------------------------------

  const unstableFlag =
    await readFromOPFS("gpu-instability.flag");

  if (unstableFlag === "1") {
  
    DEVICE_PROFILE = {
      name: "Safe GPU Mode",
      lowEnd: true,
      unstable: true,
    };
  
    MODEL =
      SMALLEST_MODEL;
  
    MODEL_CONFIG = {
      max_tokens: 128,
      temperature: 0.3,
      contextWindowSize: 2048,
    };
  
    postMessage({
      type: "status",
      text: "Using persistent safe GPU mode",
    });
  
    return;
  }
    
  // ------------------------------------------------
  // No WebGPU
  // ------------------------------------------------

  if (!navigator.gpu) {

    DEVICE_PROFILE = {
      name: "No WebGPU",
      lowEnd: true,
      unstable: true,
    };

    MODEL =
      SMALLEST_MODEL;

    MODEL_CONFIG = {
      max_tokens: 128,
      temperature: 0.3,
      contextWindowSize: 2048,
    };
    
    return;
  }

  // ------------------------------------------------
  // Request Adapter
  // ------------------------------------------------

  const adapter =
    await navigator.gpu.requestAdapter({
      powerPreference: "low-power",
    });

  if (!adapter) {

    DEVICE_PROFILE = {
      name: "No GPU Adapter",
      lowEnd: true,
      unstable: true,
    };

    MODEL =
      SMALLEST_MODEL;

    MODEL_CONFIG = {
      max_tokens: 128,
      temperature: 0.3,
      contextWindowSize: 2048,
    };
    
    return;
  }

  // ------------------------------------------------
  // Adapter Info
  // ------------------------------------------------

  let info = {};

  try {
    info = await adapter.requestAdapterInfo();
  } catch {
    info = {};
  }

  console.log("GPU INFO:", info);

  const vendor =
    (info.vendor || "").toLowerCase();

  const architecture =
    (info.architecture || "").toLowerCase();

  const description =
    (
      info.description ||
      info.device ||
      ""
    ).toLowerCase();

  const gpuText =
    `${vendor} ${architecture} ${description}`;

  postMessage({
    type: "status",
    text: `GPU detected: ${gpuText || "Unknown GPU"}`,
  });

  // ------------------------------------------------
  // Tier 1 — Known Modern GPU
  // ------------------------------------------------

  const modernGPU =
    gpuText.includes("rtx") ||
    gpuText.includes("radeon") ||
    gpuText.includes("apple") ||
    gpuText.includes("arc") ||
    gpuText.includes("adreno 7") ||
    gpuText.includes("mali-g7");

  // ------------------------------------------------
  // Tier 2 — Known Midrange
  // ------------------------------------------------

  const midrangeGPU =
    gpuText.includes("iris") ||
    gpuText.includes("xe") ||
    gpuText.includes("adreno") ||
    gpuText.includes("mali");

  // ------------------------------------------------
  // Tier 3 — Unknown GPU
  // ------------------------------------------------

  const unknownGPU =
    gpuText.trim() === "";

  // ------------------------------------------------
  // Tier Selection
  // ------------------------------------------------

  // Tier 1
  if (modernGPU) {

    DEVICE_PROFILE = {
      name: gpuText,
      lowEnd: false,
      unstable: false,
    };

    MODEL =
      "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

    MODEL_CONFIG = {
      max_tokens: 512,
      temperature: 0.7,
      contextWindowSize: 4096,
    };

    return;
  }

  // Tier 2
  if (midrangeGPU) {

    DEVICE_PROFILE = {
      name: gpuText,
      lowEnd: false,
      unstable: false,
    };

    MODEL =
      SMALLEST_MODEL;

    MODEL_CONFIG = {
      max_tokens: 256,
      temperature: 0.5,
      contextWindowSize: 4096,
    };

    return;
  }

  // Tier 3
  if (unknownGPU) {

    DEVICE_PROFILE = {
      name: "Unknown GPU",
      lowEnd: true,
      unstable: false,
    };

    MODEL =
      SMALLEST_MODEL;

    MODEL_CONFIG = {
      max_tokens: 128,
      temperature: 0.3,
      contextWindowSize: 2048,
    };

    return;
  }

  // Conservative fallback

  DEVICE_PROFILE = {
    name: gpuText,
    lowEnd: true,
    unstable: false,
  };

  MODEL =
    SMALLEST_MODEL;

  MODEL_CONFIG = {
    max_tokens: 128,
    temperature: 0.3,
    contextWindowSize: 2048,
  };
}

// Copy the sampling parameters (everything that can change without
// reloading the model) from a UI config object into MODEL_CONFIG.
function applySamplingConfig(config) {
  if (!config) return;
  USER_CONFIG = { ...(USER_CONFIG || {}), ...config };
  const keys = [
    "max_tokens",
    "temperature",
    "top_p",
    "frequency_penalty",
    "presence_penalty",
    "repetition_penalty",
  ];
  for (const key of keys) {
    if (typeof config[key] === "number" && !Number.isNaN(config[key])) {
      MODEL_CONFIG[key] = config[key];
    }
  }
}

async function initialize() {

  if (initializingPromise) {
    return initializingPromise;
  }

  initializingPromise = (async () => {

    await detectBestModel();

    postMessage({
      type: "status",
      text: `Loading AI model for device profile...`,
    });

    try {

      // The context window is a chat option (third argument); WebLLM
      // ignores it in the engine config. sliding_window_size must be off
      // when a context window size is given.
      const chatOpts = MODEL_CONFIG.contextWindowSize
        ? { context_window_size: MODEL_CONFIG.contextWindowSize, sliding_window_size: -1 }
        : undefined;

      engine = await CreateMLCEngine(
        MODEL,
        {
          initProgressCallback: (progress) => {
            const pct = Math.round((progress.progress || 0) * 100);
            const isDownloading =
              progress.text?.toLowerCase().includes("fetch") ||
              progress.text?.toLowerCase().includes("download") ||
              (pct < 100 && !progress.text?.toLowerCase().includes("finish"));
            postMessage({
              type: isDownloading ? "downloading" : "status",
              text: progress.text || `Loading ${pct}%`,
              progress: pct,
            });
          },
        },
        chatOpts
      );

    } catch (err) {

      const message = err?.message || "";

      const gpuCrash =
        message.includes("DXGI_ERROR") ||
        message.includes("Device was lost") ||
        message.includes("device removed") ||
        message.includes("GPUBuffer");

      const webgpuUnsupported =
        message.includes("Unable to find a compatible GPU") ||
        message.includes("WebGPU is not supported") ||
        message.includes("No compatible GPUs") ||
        message.includes("Failed to create WebGPU") ||
        message.includes("GPU device lost") ||
        message.includes("requestAdapter");

      // q4f16 model on a GPU without 16-bit shader support: report it like
      // a failed model check so the UI can offer the q4f32 version.
      if (message.includes("shader-f16")) {
        engine = null;
        initializingPromise = null;
        postMessage({
          type: "model-check",
          model: MODEL,
          ok: false,
          reason: "no-f16",
          sample: "",
        });
        postMessage({ type: "status", text: "This model needs 16-bit GPU support" });
        return;
      }

      if (gpuCrash) {

        await saveToOPFS("gpu-instability.flag", "1");

        engine = null;
        initializingPromise = null;

        postMessage({
          type: "fatal",
          reason: "gpu-crash",
          fallbackModel: SMALLEST_MODEL,
          text: "GPU became unstable. Restarting in safe GPU mode.",
        });

        self.close();
        return;
      }

      if (webgpuUnsupported) {
        engine = null;
        initializingPromise = null;

        postMessage({
          type: "webgpu-error",
          text: message,
        });
        return; // Don't throw — let the UI handle it gracefully
      }

      // IMPORTANT
      initializingPromise = null;
      throw err;
    }
    
    // A successful load means the GPU is healthy again: clear the flag
    // so a past crash doesn't pin the device to safe mode forever.
    saveToOPFS("gpu-instability.flag", "0").catch(() => {});

    if (USER_CONFIG && USER_CONFIG.selfTest) {
      // Only once per load request; re-inits (auto-unload) skip it.
      USER_CONFIG.selfTest = false;
      await runModelCheck();
    }

    postMessage({
      type: "status",
      text: "Model loaded successfully",
    });
  })();

  return initializingPromise;
}

// Ask for a few words and make sure they aren't junk. Catches GPUs whose
// 16-bit math is broken, where q4f16 models reply "outer outer outer…".
async function runModelCheck() {
  postMessage({ type: "status", text: "Checking that the model works on this GPU..." });
  try {
    const checkStart = Date.now();
    const reply = await engine.chat.completions.create({
      messages: [{ role: "user", content: "Say hello in one short sentence." }],
      max_tokens: 12,
      temperature: 0,
      ...thinkingOptions(true), // 12 tokens: no room for reasoning
    });
    const sample = reply.choices?.[0]?.message?.content || "";
    const verdict = checkSample(sample);
    postMessage({
      type: "model-check",
      model: MODEL,
      ok: verdict.ok,
      reason: verdict.reason,
      sample: sample.slice(0, 120),
    });
    // A first, rough speed (it includes reading the prompt); replies
    // measure it properly later.
    if (verdict.ok) {
      const wps = measureSpeed(wordCount(sample), Date.now() - checkStart, 3);
      if (wps) postMessage({ type: "speed", model: MODEL, wps, source: "check" });
    }
  } catch (err) {
    // A check that can't run says nothing about the model; skip it.
    console.warn("Model check skipped", err);
  }
  try { if (engine && engine.resetChat) await engine.resetChat(); } catch {}
}

const STOP_SEQUENCES = ["\nUser:", "\nHuman:", "\nAssistant:"];

// Qwen3 and Qwen3.5 reason step by step ("<think>…") before answering
// unless told not to. That is slower and uses up the reply length, so it is
// off unless the user turns on "Let reasoning models think first" in
// Settings. (DeepSeek-R1 always reasons; WebLLM can't switch it off.)
function thinkingOptions(forceOff = false) {
  if (!/^Qwen3/i.test(MODEL || "")) return {};
  if (!forceOff && USER_CONFIG && USER_CONFIG.thinking) return {};
  return { extra_body: { enable_thinking: false } };
}

// Context window the engine was loaded with (WebLLM's default is 4096),
// and the reply length: Max Tokens, but never more than half the window.
function replyBudget() {
  const contextWindow = MODEL_CONFIG.contextWindowSize || 4096;
  const maxTokens = Math.min(computeMaxTokens(), Math.floor(contextWindow / 2));
  return { contextWindow, maxTokens };
}

// Space to put between a reply that was cut off and its continuation:
// none if either side already has whitespace, otherwise one (so "used to"
// + "The" doesn't become "used toThe").
function joinSeparator(prefix, next) {
  if (!prefix || /\s$/.test(prefix) || /^[\s.,;:!?)\]]/.test(next)) return "";
  return " ";
}

// Stream one completion and post it to the UI as it arrives. `prefix` is
// reply text already on screen (Continue appends to it). Stops on the Stop
// button, the time limit, a reply collapsing into junk words, or a reply
// that keeps repeating the same sentence (cut back to before the repeats).
// Returns { full, finishReason, stopped, timedOut, degenerate, loopCut,
// superseded }; `full` is prefix + new text.
async function streamReply(messages, maxTokens, { prefix = "", generationStart }) {
  const result = {
    full: prefix, finishReason: null, stopped: false, timedOut: false,
    timeReason: null, degenerate: false, loopCut: false, superseded: false,
  };

  IS_GENERATING = true;
  LAST_STREAM_TIME = 0;

  const completion = await engine.chat.completions.create({
    messages,
    temperature:        MODEL_CONFIG.temperature,
    max_tokens:         maxTokens,
    top_p:              MODEL_CONFIG.top_p ?? 1.0,
    frequency_penalty:  MODEL_CONFIG.frequency_penalty ?? 0.0,
    presence_penalty:   MODEL_CONFIG.presence_penalty ?? 0.0,
    repetition_penalty: MODEL_CONFIG.repetition_penalty ?? 1.0,
    stop: STOP_SEQUENCES,
    stream: true,
    ...thinkingOptions(),
  });

  resetStallTimer();
  const requestId = ++REQUEST_COUNTER;
  let head = prefix;   // prefix plus separator, fixed at the first text
  let text = "";
  let words = 0;
  let chunks = 0;
  let firstTextAt = 0;
  let lastTextAt = 0;
  const limits = timeLimits();

  // Cut the reply off when it stops making progress. Checked on a timer as
  // well as per chunk, because a stuck GPU sends no chunks at all; WebLLM's
  // interruptGenerate() then ends the stream.
  const timeUp = () => {
    if (result.timedOut) return true;
    const reason = timeLimitReason({ now: Date.now(), start: generationStart, lastTextAt }, limits);
    if (!reason) return false;
    result.timedOut = true;
    result.timeReason = reason;
    postMessage({
      type: "status",
      text: reason === "max"
        ? "Response cut off: reply time limit reached"
        : "Response cut off: the model stopped producing text",
    });
    return true;
  };
  const watchdog = setInterval(() => {
    if (timeUp()) {
      clearInterval(watchdog);
      try { engine && engine.interruptGenerate && engine.interruptGenerate(); } catch {}
    }
  }, Math.min(1000, limits.stallMs / 4));

  // Check the reply so far; true when streaming must stop.
  const guard = () => {
    const full = head + text;
    if (looksDegenerate(full)) {
      result.degenerate = true;
      return true;
    }
    const cut = findRepeatLoop(full);
    if (cut !== -1) {
      result.loopCut = true;
      result.full = full.slice(0, cut).trimEnd();
      return true;
    }
    return false;
  };

  try {
    for await (const chunk of completion) {
      if (STOP_REQUESTED) {
        result.stopped = true;
        postMessage({ type: "status", text: "Generation stopped" });
        break;
      }
      if (timeUp()) break;
      if (requestId !== REQUEST_COUNTER) {
        result.superseded = true;
        break;
      }

      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) result.finishReason = choice.finish_reason;
      const delta = choice?.delta?.content || "";
      if (!delta) continue;

      LAST_STREAM_TIME = Date.now();
      lastTextAt = LAST_STREAM_TIME;
      if (!firstTextAt) firstTextAt = lastTextAt;
      resetStallTimer();

      if (!text) head = prefix + joinSeparator(prefix, delta);
      text += delta;
      words += delta.split(/\s+/).length;

      if (++chunks % 8 === 0 && guard()) break;

      postMessage({ type: "stream", text: head + text });
      postMessage({ type: "token", count: words });
    }

    // Final check on the complete reply (the loop only checks every 8 chunks)
    if (!result.stopped && !result.timedOut && !result.superseded &&
        !result.degenerate && !result.loopCut) {
      guard();
    }
  } finally {
    clearInterval(watchdog);
    clearTimeout(STALL_TIMEOUT);
    IS_GENERATING = false;
  }

  if (!result.loopCut) result.full = text ? head + text : prefix;

  // Writing speed, from the first word to the last (so the time spent
  // reading the prompt doesn't count). A stall would skew it, so skip those.
  if (!result.superseded && result.timeReason !== "stall") {
    const wps = measureSpeed(Math.max(0, wordCount(text) - 1), lastTextAt - firstTextAt, 10);
    if (wps) postMessage({ type: "speed", model: MODEL, wps, source: "reply" });
  }
  return result;
}

// Errors from WebLLM while generating. Throws a clearer error for the UI,
// or returns true after a GPU crash (the worker is restarting).
async function handleGenerationError(err) {
  const message = err?.message || "";

  if (message.includes("exceed context window")) {
    throw new Error(
      "This conversation no longer fits in the model's context window. " +
      "Start a new chat, or raise Context Window in Settings."
    );
  }

  // "deleted object as a pointer of type Tokenizer*" means the WASM engine
  // was destroyed mid-generation (race with set-config). Reset so the next
  // request reinitialises cleanly instead of crashing again.
  if (message.includes("deleted object") || message.includes("Tokenizer")) {
    engine = null;
    initializingPromise = null;
    throw err;
  }

  const gpuCrash =
    message.includes("Instance reference") ||
    message.includes("GPUBuffer") ||
    message.includes("DXGI_ERROR") ||
    message.includes("Device was lost");

  if (gpuCrash) {
    await saveToOPFS("gpu-instability.flag", "1");
    postMessage({
      type: "fatal",
      reason: "gpu-crash",
      fallbackModel: SMALLEST_MODEL,
      text: "GPU inference crashed. Restarting in safe GPU mode.",
    });
    self.close();
    return true;
  }

  throw err;
}

function maxHistory() {
  return DEVICE_PROFILE.lowEnd ? MAX_HISTORY_LOW : MAX_HISTORY_HIGH;
}

// Keep the conversation (without the system prompt) as the model's memory.
// Reasoning models' <think> blocks are dropped: replaying them wastes
// context and the model doesn't need its old reasoning.
function rememberConversation(history) {
  SESSION_HISTORY = history
    .filter(msg => msg.role !== "system")
    .map(msg => msg.role === "assistant"
      ? { ...msg, content: stripThinking(msg.content) }
      : msg)
    .slice(-maxHistory());
}

// Why a reply was cut short, for the "Continue" note in the UI.
function cutOffReason(result) {
  if (result.finishReason === "length") return "length";
  if (result.timedOut) return result.timeReason === "max" ? "time" : "stall";
  return null;
}

async function generate(prompt) {
  try {
    const generationStart = Date.now();
    ACTIVE_GENERATION = true;
    STOP_REQUESTED = false;

    await initialize();

    const { contextWindow, maxTokens } = replyBudget();
    const MAX_HISTORY = maxHistory();

    let history = [
      { role: "system", content: getSystemPrompt() },
      ...SESSION_HISTORY,
    ];

    let result;

    try {
      // Documents attached to this chat go into this request only, never
      // into SESSION_HISTORY (they would be replayed on every later turn).
      const docContext = await attachmentContext(prompt, contextWindow, maxTokens);
      let augmentedPrompt = withAttachments(prompt, docContext);

      history.push({ role: "user", content: prompt });

      // Keep the system message; trim only the turns after it
      {
        const sys = history[0]?.role === "system" ? [history[0]] : [];
        const rest = history.slice(sys.length);
        history = [...sys, ...rest.slice(-Math.max(MAX_HISTORY - 1, 4))];
      }

      // Fit everything into the context window: drop the oldest turns,
      // then the document context, so WebLLM doesn't reject the prompt.
      {
        const fitted = fitToContext({ history, prompt, augmentedPrompt, contextWindow, maxTokens });
        history = fitted.history;
        augmentedPrompt = fitted.augmentedPrompt;
      }

      // The request uses the document-augmented question in place of the
      // bare one; the stored history keeps the bare question.
      const apiHistory = augmentedPrompt !== prompt
        ? [...history.slice(0, -1), { role: "user", content: augmentedPrompt }]
        : history;

      postMessage({ type: "thinking" });

      // The engine may have been torn down since generate() started
      // (e.g. by a concurrent set-config): reinitialise if so.
      if (!engine) {
        postMessage({ type: "status", text: "Engine not ready, reinitialising..." });
        initializingPromise = null;
        await initialize();
      }
      ensureEngine();

      result = await streamReply(apiHistory, maxTokens, { generationStart });
    } catch (err) {
      if (await handleGenerationError(err)) return;
    }

    if (result.superseded) return;

    postMessage({ type: "status", text: `Ready (${DEVICE_PROFILE.name})` });

    const answer = result.full;

    // No usable reply: tell the UI why, and leave the model's memory as it
    // was before this question so a retry starts clean.
    if (result.degenerate || !answer.trim()) {
      const outcome = result.degenerate ? "degenerate"
        : result.timedOut ? "timeout"
        : result.stopped ? "stopped"
        : "empty";
      postMessage({ type: "response", text: "", outcome, model: MODEL });
      return;
    }

    history.push({ role: "assistant", content: answer });
    rememberConversation(history);

    postMessage({
      type: "response",
      text: answer,
      cutOff: cutOffReason(result),
      notice: result.loopCut ? "loop" : null,
    });
  } finally {
    ACTIVE_GENERATION = false;
    clearTimeout(STALL_TIMEOUT);
    resetUnloadTimer();
  }
}

// The user pressed Continue on a reply that was cut off. Ask the model for
// the rest and append it to the same reply. `previous` is the reply as
// shown in the chat.
const CONTINUE_PROMPT =
  "Your previous reply was cut off. Continue it from exactly where it stopped. " +
  "Do not repeat anything you already wrote and do not start over.";

async function continueReply(previous) {
  try {
    const generationStart = Date.now();
    ACTIVE_GENERATION = true;
    STOP_REQUESTED = false;

    await initialize();

    const last = SESSION_HISTORY[SESSION_HISTORY.length - 1];
    if (!last || last.role !== "assistant" || !previous) {
      throw new Error("There is no reply to continue.");
    }

    const { contextWindow, maxTokens } = replyBudget();
    const fitted = fitToContext({
      history: [
        { role: "system", content: getSystemPrompt() },
        ...SESSION_HISTORY,
        { role: "user", content: CONTINUE_PROMPT },
      ],
      prompt: CONTINUE_PROMPT,
      augmentedPrompt: CONTINUE_PROMPT,
      contextWindow,
      maxTokens,
    });

    postMessage({ type: "thinking" });
    ensureEngine();

    let result;
    try {
      result = await streamReply(fitted.history, maxTokens, { prefix: previous, generationStart });
    } catch (err) {
      if (await handleGenerationError(err)) return;
    }

    if (result.superseded) return;

    postMessage({ type: "status", text: `Ready (${DEVICE_PROFILE.name})` });

    // Drop text the model repeated from the end of the reply so far
    let full = result.full;
    if (!result.loopCut && full.length > previous.length) {
      const added = full.slice(previous.length);
      const clean = removeOverlap(previous, added.trimStart());
      full = previous + (clean === added.trimStart() ? added : joinSeparator(previous, clean) + clean);
    }

    // Nothing usable was added: keep the reply as it was, still cut off.
    if (result.degenerate || full.trim().length <= previous.trim().length) {
      postMessage({
        type: "response",
        text: previous,
        cutOff: "length",
        notice: result.stopped ? null : "continue-failed",
      });
      return;
    }

    SESSION_HISTORY = [
      ...SESSION_HISTORY.slice(0, -1),
      { role: "assistant", content: stripThinking(full) },
    ];

    postMessage({
      type: "response",
      text: full,
      cutOff: cutOffReason(result),
      notice: result.loopCut ? "loop" : null,
    });
  } finally {
    ACTIVE_GENERATION = false;
    clearTimeout(STALL_TIMEOUT);
    resetUnloadTimer();
  }
}

self.onmessage = async (event) => {
  const data = event.data;

  try {
    switch (data.type) {
      case "init":
        postMessage(modelsMessage());
        postDiagnostics();
        postLegacyDocuments();
        break;
              
      case "set-config": {

        // If generation is active, wait for it to complete before
        // swapping the model — prevents the Tokenizer* deleted-object crash.
        if (ACTIVE_GENERATION) {
          postMessage({
            type: "status",
            text: "Waiting for generation to finish before switching model...",
          });
          // Poll until generation completes, then re-dispatch
          await new Promise(resolve => {
            const poll = setInterval(() => {
              if (!ACTIVE_GENERATION) {
                clearInterval(poll);
                resolve();
              }
            }, 200);
          });
        }

        // SESSION_HISTORY is intentionally kept across model switches so
        // the new model continues the same conversation.
        USER_CONFIG = data.config;

        // If an initialize() is already in flight, wait for it to settle
        // before tearing down, to avoid racing with an ongoing load.
        if (initializingPromise) {
          try { await initializingPromise; } catch (_) {}
        }

        if (engine) {
      
          postMessage({
            type: "status",
            text: "Unloading previous model...",
          });
      
          try {
      
            await engine.unload();
      
          } catch (err) {
      
            console.warn(
              "Unload failed",
              err
            );
          }
        }
      
        engine = null;
        initializingPromise = null;
      
        postMessage({
          type: "status",
          text:
            `Initializing ${data.config.model}...`,
        });
      
        await initialize();

        break;
      }
              
      case "update-config":
        // Sampling parameters and system prompt: no model reload needed.
        applySamplingConfig(data.config);
        break;

      case "generate":
        // The UI sends its current settings with every message so edits
        // (system prompt, temperature, …) apply without pressing Apply.
        applySamplingConfig(data.config);
        await generate(data.prompt);
        break;

      case "continue":
        applySamplingConfig(data.config);
        await continueReply(data.previous);
        break;

      case "set-attachments":
        // The documents attached to the chat on screen
        setAttachments(data.chatId, data.docs || []);
        break;

      case "delete-legacy-documents":
        await deleteLegacyDocuments();
        postMessage({ type: "legacy-documents", files: [] });
        break;

      case "models":
        postMessage(modelsMessage());
        break;

      case "restore-history":
        // Repopulate SESSION_HISTORY from persisted UI messages.
        // Only accepted when not currently generating.
        if (!ACTIVE_GENERATION && Array.isArray(data.history)) {
          SESSION_HISTORY = data.history
            .filter(m => m.role === "user" || m.role === "assistant")
            .filter(m => typeof m.content === "string" && m.content.trim())
            .slice(-MAX_HISTORY_HIGH);
        }
        break;

      case "clear-history":
        SESSION_HISTORY = [];
        break;

      case "stop-generation":
        // Signal both stream loops to break cleanly on their next iteration
        STOP_REQUESTED = true;
        break;

      case "cancel-download":
        // CreateMLCEngine has no cancel API — terminate the worker so the
        // download fetch is aborted by the browser, then let app.js restart it.
        postMessage({ type: "download-cancelled" });
        self.close();
        break;
    }
  } catch (err) {
    postMessage({
      type: "error",
      text: err.message,
    });
  }
};

let unloadTimer = null;

function resetUnloadTimer() {

  clearTimeout(unloadTimer);

  unloadTimer = setTimeout(async () => {
  
    if (IS_GENERATING || ACTIVE_GENERATION) {
      resetUnloadTimer();
      return;
    }
  
    if (engine) {
  
      try {
  
        await engine.unload();
  
      } catch (err) {
  
        console.warn(
          "Unload failed",
          err
        );
      }
    }
  
    engine = null;
    initializingPromise = null;
  
    postMessage({
      type: "status",
      text:
        "Model unloaded to save memory",
    });
  
  }, 1800000);
  
};

async function initializeEmbedder() {

  // Already loaded
  if (embedder) {
    return embedder;
  }

  // Already loading
  if (embedderPromise) {
    return embedderPromise;
  }

  postMessage({
    type: "status",
    text: "Loading embedding model...",
  });

  embedderPromise = (async () => {

    try {

      const model = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2"
      );

      embedder = model;

      postMessage({
        type: "status",
        text: "Embedding model loaded",
      });

      return embedder;

    } catch (err) {

      // IMPORTANT:
      // allow retry after failure
      embedderPromise = null;

      throw err;
    }

  })();

  return embedderPromise;
}

async function createEmbedding(text) {

  await initializeEmbedder();

  const output = await embedder(text, {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(output.data);
}

// ── Attached documents ────────────────────────────────────────────────────

// Use the documents attached to the chat on screen. Large ones without
// chunks are split and embedded in the background (one at a time).
function setAttachments(chatId, docs) {
  const previous = chatDocs.chatId === chatId
    ? new Map(chatDocs.docs.map(d => [d.id, d]))
    : new Map();
  chatDocs = {
    chatId,
    docs: docs.map(d => {
      const old = previous.get(d.id);
      return {
        id: d.id,
        name: d.name,
        text: d.text || "",
        chunks: d.chunks || old?.chunks || null,
        indexing: old?.indexing || false,
      };
    }),
  };
  for (const doc of chatDocs.docs) {
    if (!doc.chunks && !doc.indexing && doc.text.length > INDEX_MIN_CHARS) {
      doc.indexing = true;
      indexingQueue = indexingQueue.then(() => indexDocument(chatId, doc));
    }
  }
}

async function indexDocument(chatId, doc) {
  try {
    await initializeEmbedder();
    const pieces = chunkText(doc.text);
    const chunks = [];
    for (let i = 0; i < pieces.length; i++) {
      // Stop if the document was removed or another chat is on screen
      if (chatDocs.chatId !== chatId || !chatDocs.docs.includes(doc)) return;
      postMessage({ type: "attachment-progress", chatId, id: doc.id, current: i + 1, total: pieces.length });
      chunks.push({ text: pieces[i], embedding: await createEmbedding(pieces[i]) });
    }
    doc.chunks = chunks;
    postMessage({ type: "attachment-indexed", chatId, id: doc.id, chunks });
  } catch (err) {
    postMessage({ type: "attachment-error", chatId, id: doc.id, error: err?.message || "Could not index the document" });
  } finally {
    doc.indexing = false;
  }
}

// What to put in front of the model from the attached documents: all of
// them if they fit, otherwise the parts that best match the question.
async function attachmentContext(prompt, contextWindow, maxTokens) {
  if (!chatDocs.docs.length) return null;
  await indexingQueue; // a document attached a moment ago is ready first

  const available = contextWindow - maxTokens - 64 -
    estimateTokens([{ content: getSystemPrompt() }, { content: prompt }]);
  const budgetTokens = Math.floor(available * 0.75); // the rest for recent turns

  let queryEmbedding = null;
  const tooBig = estimateTokens(chatDocs.docs.map(d => ({ content: d.text }))) > budgetTokens;
  if (tooBig && chatDocs.docs.some(d => d.chunks)) {
    try { queryEmbedding = await createEmbedding(prompt); } catch {}
  }
  return buildAttachmentContext({ docs: chatDocs.docs, queryEmbedding, budgetTokens });
}

// Earlier versions kept one document index shared by all chats in OPFS
// (vector-db.json). It is no longer used; tell the app so it can offer to
// remove it.
async function postLegacyDocuments() {
  const stored = await readFromOPFS("vector-db.json");
  let files = [];
  if (stored) {
    try { files = [...new Set(JSON.parse(stored).map(item => item.filename))].filter(Boolean); } catch {}
  }
  postMessage({ type: "legacy-documents", files });
}

async function deleteLegacyDocuments() {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry("vector-db.json");
  } catch {}
}

function resetStallTimer() {

  clearTimeout(STALL_TIMEOUT);

  const timeout =
    LAST_STREAM_TIME === 0
      ? 90000
      : 45000;

  STALL_TIMEOUT = setTimeout(() => {

    if (!IS_GENERATING) {
      return;
    }

    const elapsed =
      Date.now() - LAST_STREAM_TIME;

    // token arrived recently
    if (
      LAST_STREAM_TIME !== 0 &&
      elapsed < 40000
    ) {
      resetStallTimer();
      return;
    }

    // only warning
    postMessage({
      type: "status",
      text:
        "Generation is taking longer than usual...",
    });

    // DO NOT terminate here

  }, timeout);
}

function isCorrupted(text) {

  if (!text) {
    return true;
  }

  const strangeChars =
    text.match(
      /�|�{2,}|[\x00-\x08\x0E-\x1F]/g
    ) || [];

  const ratio =
    strangeChars.length / text.length;

  return (
    text.length > 40 &&
    ratio > 0.25
  );
}

function computeMaxTokens() {

  // Honour user-configured value first
  if (MODEL_CONFIG.max_tokens) {
    return MODEL_CONFIG.max_tokens;
  }

  if (DEVICE_PROFILE.lowEnd) {
    return 96;
  }

  // micro: SmolLM2-135M/360M, Qwen3-0.6B
  if (
    MODEL.includes("135M") || MODEL.includes("360M") ||
    MODEL.includes("0.5B") || MODEL.includes("0.6B")
  ) {
    return 128;
  }

  // ~1–1.7B
  if (
    MODEL.includes("1.1B") || MODEL.includes("1B") ||
    MODEL.includes("1.5B") || MODEL.includes("1.6b") ||
    MODEL.includes("1.7B")
  ) {
    return 512;
  }

  // ~7–9B — more capacity
  if (
    MODEL.includes("7B") || MODEL.includes("8B") || MODEL.includes("9b")
  ) {
    return 1024;
  }

  // ~2–4B default
  return 768;
}

function ensureEngine() {

  if (!engine) {
    throw new Error(
      "Inference engine unavailable"
    );
  }
}

function removeOverlap(original, continuation) {

  // Only remove overlaps that are clearly genuine token-boundary duplicates:
  // - Minimum 60 chars to avoid false positives on common phrases/list items.
  // - The match must start at a word boundary (space, newline, or start).
  // - After stripping, the result must not start mid-word.
  const maxOverlap = Math.min(
    300,
    original.length,
    continuation.length
  );

  const MIN_OVERLAP = 60;

  for (let len = maxOverlap; len >= MIN_OVERLAP; len--) {

    const tail = original.slice(-len);
    const head = continuation.slice(0, len);

    if (tail !== head) {
      continue;
    }

    // Confirm the match starts at a word boundary in the original
    const charBefore = original[original.length - len - 1];
    const startsAtBoundary =
      charBefore === undefined || // start of string
      charBefore === " " ||
      charBefore === "\n" ||
      charBefore === "." ||
      charBefore === "," ;

    if (!startsAtBoundary) {
      continue;
    }

    const stripped = continuation.slice(len);

    // Reject if stripping leaves us starting mid-word
    // (i.e. the char before the strip point wasn't a boundary)
    const lastCharOfMatch = continuation[len - 1];
    const firstCharAfter = stripped[0];
    if (
      firstCharAfter &&
      firstCharAfter !== " " &&
      firstCharAfter !== "\n" &&
      lastCharOfMatch !== " " &&
      lastCharOfMatch !== "\n"
    ) {
      continue;
    }

    return stripped;
  }

  return continuation;
}

