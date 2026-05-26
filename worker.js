import {
  CreateMLCEngine
} from "https://esm.run/@mlc-ai/web-llm";

import {
  pipeline
} from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

const SYSTEM_PROMPT = `You are a concise, factually accurate AI assistant.

Rules you must never break:
- Never contradict established science, physics, or basic facts (e.g. humans have mass).
- NEVER guess or invent an answer. If you are not certain, respond only with "I'm not sure." Do not elaborate.
- Do not add philosophical or metaphysical tangents to simple factual questions.
- Do not contradict yourself within the same conversation.
- Keep answers short and direct unless the user asks for detail.
- Never redefine ordinary words in unusual ways to rescue a wrong answer.
- If the user states a correct fact, accept it. Do not contradict correct information the user provides.
- Only correct the user if you are certain they are factually wrong.`;

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
      max_tokens:
        USER_CONFIG.max_tokens,
    
      temperature:
        USER_CONFIG.temperature,
    
      contextWindowSize:
        USER_CONFIG.contextWindowSize,
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
            postMessage({
              type: "status",
              text: progress.text ||
                `Loading ${Math.round(progress.progress * 100)}%`,
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

    postMessage({
      type: "status",
      text: "Model loaded successfully",
    });
  })();

  return initializingPromise;
}

async function generate(prompt) {
  
  try {

    const generationStart = Date.now();
    continuationCount = 0;
    ACTIVE_GENERATION = true;
    
    await initialize();
  
    const maxTokens =
      computeMaxTokens();
    
    let history = [
      {
        role: "system",
        content: SYSTEM_PROMPT,
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
  
      const context =
        relevantChunks
        .map(item => item.text)
        .join("\n\n");
  
      const augmentedPrompt =
        context ?
        `Context:\n${context}\n\nQuestion:\n${prompt}` :
        prompt;
  
      history.push({
        role: "user",
        content: augmentedPrompt,
      });

      // Always pin the system message — slice only the non-system tail
      // so MAX_HISTORY evictions never strip the model's instructions.
      {
        const sys = history[0]?.role === "system" ? [history[0]] : [];
        const rest = history.slice(sys.length);
        history = [...sys, ...rest.slice(-Math.max(MAX_HISTORY - 1, 4))];
      }
      
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
      
      const completion =
        await engine.chat.completions.create({
      
          messages: history,
      
          temperature:
            MODEL_CONFIG.temperature,
      
          max_tokens:
            maxTokens,

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
          temperature: MODEL_CONFIG.temperature,
          max_tokens: maxTokens,
          stop: ["\nUser:", "\nHuman:", "\nAssistant:"],
          stream: true,
        });

      finishReason = null;

      for await (const chunk of continuationStream) {

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
        });
      
        break;
              
      case "set-config":

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
              
      case "generate":
        await generate(data.prompt);
        break;

      case "ingest":
        await ingestDocument(
          data.filename,
          data.text
        );
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
  chunkSize = 500
) {

  const chunks = [];

  for (
    let i = 0; i < text.length; i += chunkSize
  ) {

    chunks.push(
      text.slice(i, i + chunkSize)
    );
  }

  return chunks;
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

async function ingestDocument(
  filename,
  text
) {

  await initializeEmbedder();

  const chunks = chunkText(text);

  postMessage({
    type: "status",
    text: `Embedding ${chunks.length} chunks...`,
  });

  vectorDB = vectorDB.filter(
    item => item.filename !== filename
  );
    
  for (const chunk of chunks) {

    const embedding =
      await createEmbedding(chunk);

    vectorDB.push({
      filename,
      text: chunk,
      embedding,
    });
  }

  await saveVectorDB();

  postMessage({
    type: "status",
    text: `${filename} indexed successfully`,
  });
}

async function searchRelevantChunks(
  query,
  topK = 3
) {

  if (!vectorDB.length) {
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

  scored.sort(
    (a, b) => b.score - a.score
  );

  return scored.slice(0, topK);
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
