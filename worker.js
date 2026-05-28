import {
  CreateMLCEngine
} from "https://esm.run/@mlc-ai/web-llm";

import {
  pipeline
} from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

// System prompt is now user-configurable via Settings.
// Fallback used when USER_CONFIG.system_prompt is not set.
const DEFAULT_SYSTEM_PROMPT = `You are a concise, factually accurate AI assistant.

Rules you must never break:
- Never contradict established science, physics, or basic facts (e.g. humans have mass).
- NEVER guess or invent an answer. If you are not certain, respond only with "I'm not sure." Do not elaborate.
- Do not add philosophical or metaphysical tangents to simple factual questions.
- Do not contradict yourself within the same conversation.
- Keep answers short and direct unless the user asks for detail.
- Never redefine ordinary words in unusual ways to rescue a wrong answer.
- If the user states a correct fact, accept it. Do not contradict correct information the user provides.
- Only correct the user if you are certain they are factually wrong.`;

function getSystemPrompt() {
  return (USER_CONFIG && USER_CONFIG.system_prompt)
    ? USER_CONFIG.system_prompt
    : DEFAULT_SYSTEM_PROMPT;
}

const SMALLEST_MODEL = "SmolLM2-360M-Instruct-q4f32_1-MLC";

// Approximate download sizes (MB) for first-time download confirmation.
// Derived from VRAM footprints in the WebLLM model registry.
const MODEL_SIZES_MB = {
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

const AVAILABLE_MODELS = [
  // ── ~100–400M — ultra-micro ─────────────────────────────────────────
  "SmolLM2-135M-Instruct-q0f32-MLC",
  "SmolLM2-360M-Instruct-q4f32_1-MLC",
  "SmolLM2-360M-Instruct-q0f32-MLC",

  // ── ~0.5–0.6B — micro ───────────────────────────────────────────────
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-0.5B-Instruct-q4f32_1-MLC",
  "Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC",
  "Qwen3-0.6B-q4f16_1-MLC",

  // ── ~1–1.7B — lightweight ───────────────────────────────────────────
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

  // ── ~2–3B — mid ─────────────────────────────────────────────────────
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
  "Phi-3.5-mini-instruct-q4f16_1-MLC",
  "Phi-3.5-mini-instruct-q4f32_1-MLC",

  // ── ~7–9B — large (needs ≥6 GB VRAM) ───────────────────────────────
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

const HARD_TIMEOUT_MS = 180000;

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
let vectorDB = [];

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
let continuationCount = 0;
const MAX_CONTINUATIONS = 3;

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

      engine = await CreateMLCEngine(
        MODEL,
        {
          contextWindowSize:
            MODEL_CONFIG.contextWindowSize,
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
        }
      );

    } catch (err) {
    
      const message = err?.message || "";
    
      const gpuCrash =
        message.includes("DXGI_ERROR") ||
        message.includes("Device was lost") ||
        message.includes("device removed") ||
        message.includes("GPUBuffer");
    
      if (gpuCrash) {
    
        await saveToOPFS(
          "gpu-instability.flag",
          "1"
        );
    
        engine = null;
        initializingPromise = null;
    
        postMessage({
          type: "fatal",
          text:
            "GPU became unstable. Restarting in safe GPU mode.",
        });
    
        self.close();
        return;
      }
    
      // IMPORTANT
      initializingPromise = null;
      throw err;
    }
    
    await loadVectorDB();

    // If we have indexed documents, pre-load the embedder now so
    // searchRelevantChunks() doesn't stall on the first generate() call.
    if (vectorDB.length > 0) {
      initializeEmbedder().catch(() => {}); // non-blocking, best-effort
    }

    postMessage({
      type: "status",
      text: "Model loaded successfully",
    });

    // Tell the UI which documents are currently indexed
    if (vectorDB.length > 0) {
      postMessage({
        type: "documents-updated",
        documents: getIndexedDocuments(),
      });
    }
  })();

  return initializingPromise;
}

async function generate(prompt) {
  
  try {

    const generationStart = Date.now();
    continuationCount = 0;
    ACTIVE_GENERATION = true;
    STOP_REQUESTED = false;
    
    await initialize();
  
    const maxTokens =
      computeMaxTokens();
    
    let history = [
      {
        role: "system",
        content: getSystemPrompt(),
      },
      ...SESSION_HISTORY
    ];

    // Keep only recent history (use module-level constants)
    const MAX_HISTORY =
      DEVICE_PROFILE.lowEnd ?
      MAX_HISTORY_LOW :
      MAX_HISTORY_HIGH;
    
    let response;
    let finishReason = null;
    let tokenCount = 0;
  
    try {
  
      const relevantChunks =
        await searchRelevantChunks(prompt);

      // Build the augmented prompt for the API call only — do NOT store
      // the full context in SESSION_HISTORY (it would be replayed on every
      // subsequent turn, wasting context window and confusing the model).
      const context = relevantChunks
        .map(item => `[${item.filename}]\n${item.text}`)
        .join("\n\n---\n\n");

      const augmentedPrompt = context
        ? `Relevant context from uploaded documents:\n\n${context}\n\n---\nUser question: ${prompt}`
        : prompt;

      // Push only the bare user prompt into session history
      history.push({
        role: "user",
        content: prompt,
      });

      // Track which files contributed context so UI can show it
      const contextSources = [...new Set(relevantChunks.map(c => c.filename))];

      // Always pin the system message — slice only the non-system tail
      // so MAX_HISTORY evictions never strip the model's instructions.
      {
        const sys = history[0]?.role === "system" ? [history[0]] : [];
        const rest = history.slice(sys.length);
        history = [...sys, ...rest.slice(-Math.max(MAX_HISTORY - 1, 4))];
      }

      // Build a one-shot history for the API that replaces the last user turn
      // with the RAG-augmented version. We do this AFTER trimming so the
      // context doesn't bloat history and get replayed on future turns.
      const apiHistory = augmentedPrompt !== prompt
        ? [...history.slice(0, -1), { role: "user", content: augmentedPrompt }]
        : history;
      
      IS_GENERATING = true;
      LAST_STREAM_TIME = 0;
      
      let partial = "";
      
      postMessage({
        type: "thinking",
      });
      
      // Guard: if the engine was torn down between generate() start and here
      // (e.g. by a concurrent set-config), reinitialise before proceeding.
      if (!engine) {
        postMessage({ type: "status", text: "Engine not ready, reinitialising..." });
        initializingPromise = null;
        await initialize();
      }
      ensureEngine();
      
      // Post context sources to UI so user knows RAG was used
      if (contextSources.length > 0) {
        postMessage({
          type: "rag-context",
          sources: contextSources,
        });
      }

      const completion =
        await engine.chat.completions.create({

          messages: apiHistory,

          temperature:    MODEL_CONFIG.temperature,
          max_tokens:     maxTokens,
          top_p:          MODEL_CONFIG.top_p          ?? 1.0,
          frequency_penalty: MODEL_CONFIG.frequency_penalty ?? 0.0,
          presence_penalty:  MODEL_CONFIG.presence_penalty  ?? 0.0,
          repetition_penalty: MODEL_CONFIG.repetition_penalty ?? 1.0,

          stop: [
            "\nUser:",
            "\nHuman:",
            "\nAssistant:",
          ],

          stream: true,
        });
      
      resetStallTimer();
      const requestId = ++REQUEST_COUNTER;
      
      for await (const chunk of completion) {

        if (STOP_REQUESTED) {
          postMessage({
            type: "status",
            text: "Generation stopped",
          });
          finishReason = null; // prevent continuation loop
          break;
        }

        if (
          Date.now() - generationStart >
          HARD_TIMEOUT_MS
        ) {
          // Deliver what we have rather than discarding it with an error
          postMessage({
            type: "status",
            text: "Response truncated: generation time limit reached",
          });
          finishReason = null; // prevent continuation loop
          break;
        }
                
        if (requestId !== REQUEST_COUNTER) {
          return;
        }

        const choice = chunk.choices?.[0];

        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }
      
        const delta = choice?.delta?.content || "";
      
        if (!delta) {
          continue;
        }
      
        LAST_STREAM_TIME = Date.now();
        resetStallTimer();
      
        partial += delta;
        tokenCount += delta.split(/\s+/).length;
      
        postMessage({
          type: "stream",
          text: partial,
        });
        
        postMessage({
          type: "token",
          count: tokenCount,
        });
      }
      
      clearTimeout(STALL_TIMEOUT);
      
      IS_GENERATING = false; 
      
      response = {
        choices: [
          {
            message: {
              content: partial
            }
          }
        ]
      };
          
    } catch (err) {

      const message = err?.message || "";

      // "deleted object as a pointer of type Tokenizer*" means the WASM engine
      // was destroyed mid-generation (race with set-config). Reset so next
      // request reinitialises cleanly instead of crashing again.
      if (
        message.includes("deleted object") ||
        message.includes("Tokenizer")
      ) {
        engine = null;
        initializingPromise = null;
        throw err; // re-throw to surface as a normal error, not a fatal
      }
      
      const gpuCrash =
        message.includes("Instance reference") ||
        message.includes("GPUBuffer") ||
        message.includes("DXGI_ERROR") ||
        message.includes("Device was lost");
      
      if (gpuCrash) {
      
        await saveToOPFS(
          "gpu-instability.flag",
          "1"
        );
      
        postMessage({
          type: "fatal",
          text:
            "GPU inference crashed. Restarting in safe GPU mode.",
        });
      
        self.close();
        return;
      }
  
      throw err;
    }
  
    postMessage({
      type: "status",
      text: `Ready (${DEVICE_PROFILE.name})`,
    });
  
    let answer =
      response.choices[0].message.content;
    let totalGeneratedChars = answer.length;

    while (
      finishReason === "length" &&
      continuationCount < MAX_CONTINUATIONS
    ) {

      continuationCount++;

      postMessage({
        type: "status",
        text: `Continuing response (${continuationCount})...`,
      });

      // WebLLM requires the last message to be role "user" or "tool" —
      // it rejects conversations ending with "assistant". We therefore use
      // a two-message tail: the partial answer as an assistant turn, then a
      // minimal user directive. The directive is intentionally terse and
      // instruction-like so the model appends rather than restarts.
      const systemMsg =
        history[0]?.role === "system" ? [history[0]] : [];
      const nonSystem =
        history.slice(systemMsg.length);

      const trimmed =
        nonSystem.slice(-Math.max(MAX_HISTORY - 2, 4));

      // Trim the partial answer to its last ~400 chars so the seam context
      // fits within a small model's attention without eating max_tokens.
      const SEAM_CONTEXT = 400;
      const seam = answer.length > SEAM_CONTEXT
        ? "..." + answer.slice(-SEAM_CONTEXT)
        : answer;

      const continuationHistory = [
        ...systemMsg,
        ...trimmed,
        { role: "assistant", content: seam },
        {
          role: "user",
          content: "[continue]",
        },
      ];

      let continuation = "";

      IS_GENERATING = true;
      LAST_STREAM_TIME = 0;
      resetStallTimer();

      const continuationStream =
        await engine.chat.completions.create({
          messages: continuationHistory,
          temperature:    MODEL_CONFIG.temperature,
          max_tokens:     maxTokens,
          top_p:          MODEL_CONFIG.top_p          ?? 1.0,
          frequency_penalty: MODEL_CONFIG.frequency_penalty ?? 0.0,
          presence_penalty:  MODEL_CONFIG.presence_penalty  ?? 0.0,
          repetition_penalty: MODEL_CONFIG.repetition_penalty ?? 1.0,
          stop: ["\nUser:", "\nHuman:", "\nAssistant:"],
          stream: true,
        });

      finishReason = null;

      for await (const chunk of continuationStream) {

        if (STOP_REQUESTED) {
          postMessage({
            type: "status",
            text: "Generation stopped",
          });
          finishReason = null;
          break;
        }

        const choice = chunk.choices?.[0];

        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const delta = choice?.delta?.content || "";

        if (!delta) {
          continue;
        }

        LAST_STREAM_TIME = Date.now();
        resetStallTimer();

        continuation += delta;
        tokenCount += delta.split(/\s+/).length;

        postMessage({
          type: "stream",
          text: answer + continuation,
        });

        postMessage({
          type: "token",
          count: tokenCount,
        });
      }

      IS_GENERATING = false;

      // Strip overlap at the seam once, after the full continuation arrives.
      const cleanContinuation = removeOverlap(answer, continuation);

      if (!cleanContinuation.trim() || isRepeating(answer + cleanContinuation)) {
        postMessage({
          type: "status",
          text: "Stopping: continuation empty or repetitive",
        });
        break;
      }

      answer += cleanContinuation;
      totalGeneratedChars += cleanContinuation.length;

      // Carry forward clean history (without the continuation scaffold)
      // so the next loop iteration or SESSION_HISTORY save is consistent.
      history = [...systemMsg, ...trimmed];

      if (totalGeneratedChars > 4000) {
        postMessage({
          type: "status",
          text: "Response complete",
        });
        break;
      }

      if (Date.now() - generationStart > HARD_TIMEOUT_MS) {
        postMessage({
          type: "status",
          text: "Response truncated: generation time limit reached",
        });
        break;
      }

    }

    history.push({
      role: "assistant",
      content: answer,
    });

    SESSION_HISTORY = history
      .filter(msg => msg.role !== "system")
      .filter(msg =>
        !msg.content.includes("Continue exactly from where you stopped")
      )
      .slice(-MAX_HISTORY);
        
    postMessage({
      type: "response",
      text: answer,
    });

  }
  finally {
  
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
        postMessage({
          type: "models",
          models: AVAILABLE_MODELS,
          sizes: MODEL_SIZES_MB,
        });
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

        const prevModel = USER_CONFIG?.model;
        USER_CONFIG = data.config;

        // Clear SESSION_HISTORY only when the model actually changes —
        // not on same-model reloads caused by tab resume / engine restart.
        if (prevModel && prevModel !== data.config.model) {
          SESSION_HISTORY = [];
        }

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
              
      case "generate":
        await generate(data.prompt);
        break;

      case "ingest":
        // Don't start embedding while LLM is generating — they share the
        // worker thread and will compete for compute / memory.
        if (ACTIVE_GENERATION) {
          postMessage({
            type: "ingest-queued",
            filename: data.filename,
          });
          // Wait for generation to finish, then ingest
          await new Promise(resolve => {
            const poll = setInterval(() => {
              if (!ACTIVE_GENERATION) {
                clearInterval(poll);
                resolve();
              }
            }, 300);
          });
        }
        await ingestDocument(data.filename, data.text);
        break;

      case "delete-document":
        vectorDB = vectorDB.filter(
          item => item.filename !== data.filename
        );
        await saveVectorDB();
        postMessage({
          type: "documents-updated",
          documents: getIndexedDocuments(),
        });
        break;

      case "clear-documents":
        vectorDB = [];
        await saveVectorDB();
        postMessage({
          type: "documents-updated",
          documents: [],
        });
        break;

      case "models":
        postMessage({
          type: "models",
          models: AVAILABLE_MODELS,
          sizes: MODEL_SIZES_MB,
        });
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

async function loadVectorDB() {
  const stored =
    await readFromOPFS("vector-db.json");

  if (stored) {
    vectorDB = JSON.parse(stored);
  }
}

async function saveVectorDB() {
  await saveToOPFS(
    "vector-db.json",
    JSON.stringify(vectorDB)
  );
}

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

function chunkText(
  text,
  chunkSize = 800,  // ~130 words — enough for a full paragraph
  overlap  = 120   // overlap so boundary sentences aren't split in half
) {

  // Normalize whitespace: collapse multiple blank lines, trim
  const normalized = text
    .replace(/
/g, "
")
    .replace(/
{3,}/g, "

")
    .trim();

  if (normalized.length <= chunkSize) {
    return normalized ? [normalized] : [];
  }

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    const end = start + chunkSize;

    if (end >= normalized.length) {
      // Last chunk — take the rest
      chunks.push(normalized.slice(start).trim());
      break;
    }

    // Try to break at a sentence boundary (. ! ?) within the last 200 chars
    let breakAt = -1;
    const window = normalized.slice(end - 200, end + 100);
    const sentenceEnd = window.search(/[.!?][\s
]/);
    if (sentenceEnd !== -1) {
      breakAt = end - 200 + sentenceEnd + 1;
    }

    // Fall back to paragraph break
    if (breakAt === -1) {
      const paraBreak = normalized.lastIndexOf("

", end);
      if (paraBreak > start + chunkSize / 2) {
        breakAt = paraBreak;
      }
    }

    // Fall back to word boundary
    if (breakAt === -1) {
      const spaceBreak = normalized.lastIndexOf(" ", end);
      if (spaceBreak > start) {
        breakAt = spaceBreak;
      } else {
        breakAt = end; // hard cut only as last resort
      }
    }

    chunks.push(normalized.slice(start, breakAt).trim());
    // Overlap: next chunk starts overlap chars before the break
    start = Math.max(start + 1, breakAt - overlap);
  }

  return chunks.filter(c => c.length > 20); // discard tiny fragments
}

async function createEmbedding(text) {

  await initializeEmbedder();

  const output = await embedder(text, {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(output.data);
}

function cosineSimilarity(a, b) {

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {

    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  const denom = magA * magB;
  
  if (denom === 0) {
    return 0;
  }
  
  return dot / denom;
}

function getIndexedDocuments() {
  // Return unique filename list with chunk counts
  const map = new Map();
  for (const item of vectorDB) {
    map.set(item.filename, (map.get(item.filename) || 0) + 1);
  }
  return Array.from(map.entries()).map(([filename, chunks]) => ({
    filename,
    chunks,
  }));
}

async function ingestDocument(filename, text) {

  // FIX 12: Reject excessively large files before any processing
  const MAX_TEXT_CHARS = 500_000; // ~83,000 words, ~200 pages
  if (text.length > MAX_TEXT_CHARS) {
    postMessage({
      type: "ingest-error",
      filename,
      error: `File too large (${Math.round(text.length / 1000)}k chars). Maximum is ${MAX_TEXT_CHARS / 1000}k chars (~200 pages).`,
    });
    return;
  }

  try {

    await initializeEmbedder();

    const chunks = chunkText(text);

    // Remove previous version of this file
    vectorDB = vectorDB.filter(item => item.filename !== filename);

    for (let i = 0; i < chunks.length; i++) {

      // FIX 15: Per-chunk progress
      postMessage({
        type: "ingest-progress",
        filename,
        current: i + 1,
        total: chunks.length,
      });

      const embedding = await createEmbedding(chunks[i]);
      vectorDB.push({ filename, text: chunks[i], embedding });
    }

    await saveVectorDB();

    postMessage({
      type: "documents-updated",
      documents: getIndexedDocuments(),
    });

    postMessage({
      type: "ingest-done",
      filename,
      chunks: chunks.length,
    });

  } catch (err) {
    // FIX 14: Surface ingest errors to UI as a dedicated message type,
    // not as a chat message
    postMessage({
      type: "ingest-error",
      filename,
      error: err?.message || "Unknown error during indexing",
    });
  }
}

async function searchRelevantChunks(
  query,
  topK = 4,
  minScore = 0.25  // below this the chunk is probably unrelated
) {

  if (!vectorDB.length || !embedder) {
    return [];
  }

  const queryEmbedding =
    await createEmbedding(query);

  const scored = vectorDB.map(item => ({
    ...item,
    score: cosineSimilarity(
      queryEmbedding,
      item.embedding
    ),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Only return chunks above the relevance threshold
  const relevant = scored.filter(c => c.score >= minScore);

  if (relevant.length === 0) return [];

  // Deduplicate by filename+approximate position to avoid near-identical
  // overlapping chunks (artifact of the overlap in chunkText)
  const seen = new Set();
  const deduped = [];
  for (const item of relevant) {
    const key = item.filename + "|" + item.text.slice(0, 40);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
    if (deduped.length >= topK) break;
  }

  return deduped;
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

function isRepeating(text) {

  const sentences =
    text.split(/[.!?]\s+/);

  if (sentences.length < 6) {
    return false;
  }

  const last =
    sentences.slice(-3);

  const unique =
    new Set(last);

  return unique.size < 2;
}
