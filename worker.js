import {
  CreateMLCEngine
} from "https://esm.run/@mlc-ai/web-llm";

import {
  pipeline
} from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

//const SMALLEST_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const SMALLEST_MODEL = "Llama-3.2-1B-Instruct-q4f32_1-MLC";

let IS_GENERATING = false;
let LAST_STREAM_TIME = 0;
let STALL_TIMEOUT = null;
let REQUEST_COUNTER = 0;
let ACTIVE_GENERATION = false;
let SESSION_HISTORY = [];

let engine = null;
let initializingPromise = null;
let embedder = null;
let vectorDB = [];

let MODEL = null;

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

    catch (err) {
    
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

    continuationCount = 0;
    ACTIVE_GENERATION = true;
    
    await initialize();
  
    const maxTokens =
      computeMaxTokens();
    
    let history = [...SESSION_HISTORY];

    // Keep only recent history
    const MAX_HISTORY =
      DEVICE_PROFILE.lowEnd ?
      6 :
      20;
    
    let response;
    let finishReason = null;
  
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
  
      history = history.slice(-MAX_HISTORY);
      
      IS_GENERATING = true;
      LAST_STREAM_TIME = 0;
      
      let partial = "";
      
      postMessage({
        type: "thinking",
      });
      
      ensureEngine();
      
      const completion =
        await engine.chat.completions.create({
      
          messages: history,
      
          temperature:
            MODEL_CONFIG.temperature,
      
          max_tokens:
            maxTokens,
      
          stream: true,
        });
      
      resetStallTimer();
      const requestId = ++REQUEST_COUNTER;
      let tokenCount = 0;
      
      for await (const chunk of completion) {
        
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
  
      const gpuCrash =
        err.message.includes("Instance reference") ||
        err.message.includes("GPUBuffer") ||
        err.message.includes("DXGI_ERROR") ||
        err.message.includes("Device was lost");
      
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

    while (
      finishReason === "length" &&
      continuationCount < MAX_CONTINUATIONS
    ) {
    
      continuationCount++;
    
      postMessage({
        type: "status",
        text:
          `Continuing response (${continuationCount})...`,
      });
    
      // IMPORTANT:
      // assistant message first
      history.push({
        role: "assistant",
        content: answer,
      });
    
      // THEN user continuation request
      history.push({
        role: "user",
        content:
          "Continue exactly from where you stopped without repeating previous text.",
      });
    
      history =
        history.slice(-MAX_HISTORY);
    
      let cleanContinuation = "";
    
      IS_GENERATING = true;
      LAST_STREAM_TIME = 0;
      resetStallTimer();
    
      const continuationStream =
        await engine.chat.completions.create({
    
          messages: history,
    
          temperature:
            MODEL_CONFIG.temperature,
    
          max_tokens:
            maxTokens,
    
          stream: true,
      });
    
      finishReason = null;
      tokenCount = 0;
    
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
      
        cleanContinuation += delta;
        tokenCount += delta.split(/\s+/).length;
    
        if (
          cleanContinuation.length < 300
        ) {
          cleanContinuation =
            removeOverlap(
              answer,
              cleanContinuation
            );
        }
    
        postMessage({
          type: "stream",
          text:
            answer + cleanContinuation,
        });
        
        postMessage({
          type: "token",
          count: tokenCount,
        });
      }
    
      IS_GENERATING = false;
    
      answer += cleanContinuation;

    }

    history.push({
      role: "assistant",
      content: answer,
    });
        
    SESSION_HISTORY =
      history
        .filter(msg =>
          !msg.content.includes(
            "Continue exactly from where you stopped"
          )
        )
        .slice(-MAX_HISTORY);
    
    if (isCorrupted(answer)) {
    
      // Already retried once?
      if (RETRYING_AFTER_CRASH) {

        RETRYING_AFTER_CRASH = false;
      
        postMessage({
          type: "error",
          text:
            "Model produced corrupted output.",
        });
      
        return;
      }
            
      RETRYING_AFTER_CRASH = true;
    
      postMessage({
        type: "status",
        text:
          "Corrupted output detected. Retrying safely...",
      });
    
      // Keep same engine alive
      const originalTemperature =
        MODEL_CONFIG.temperature;
      const originalMaxTokens =
        MODEL_CONFIG.max_tokens;
      const originalHistory = SESSION_HISTORY;
      
      MODEL_CONFIG.temperature = 0.1;
      MODEL_CONFIG.max_tokens = 32;
      SESSION_HISTORY = [];
      
      try {
        
        return await generate(
          "Answer briefly and clearly: " + prompt
        );
        
      }
      finally {
        
        MODEL_CONFIG.temperature = originalTemperature;
        MODEL_CONFIG.max_tokens = originalMaxTokens;  
        SESSION_HISTORY = originalHistory;
        
      }
    }
    
    RETRYING_AFTER_CRASH = false;
    
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

  unloadTimer = setTimeout(() => {

    // NEVER unload during generation
    if (ACTIVE_GENERATION) {
      return;
    }

    engine = null;
    initializingPromise = null;

    postMessage({
      type: "status",
      text: "Model unloaded to save memory",
    });

  }, 300000);
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

  if (embedder) {
    return;
  }

  postMessage({
    type: "status",
    text: "Loading embedding model...",
  });

  embedder = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2"
  );

  postMessage({
    type: "status",
    text: "Embedding model loaded",
  });
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
    return Number.MAX_SAFE_INTEGER;
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

  // Longer timeout for first token
  const timeout =
    LAST_STREAM_TIME === 0
      ? 60000   // waiting first token
      : 25000;  // waiting next token

  STALL_TIMEOUT = setTimeout(() => {

    if (!IS_GENERATING) {
      return;
    }

    // Ignore if token recently arrived
    const elapsed =
      Date.now() - LAST_STREAM_TIME;

    if (
      LAST_STREAM_TIME !== 0 &&
      elapsed < 20000
    ) {
      resetStallTimer();
      return;
    }

    postMessage({
      type: "status",
      text: "Generation stalled",
    });

    postMessage({
      type: "error",
      text:
        "Model stopped responding during generation.",
    });

    IS_GENERATING = false;

  }, timeout);
}

function isCorrupted(text) {

  if (!text) {
    return true;
  }

  const strangeChars =
    text.match(
      /[以育无人民膛通用�]/g
    ) || [];

  const ratio =
    strangeChars.length / text.length;

  return (
    text.length > 40 &&
    ratio > 0.25
  );
}

function computeMaxTokens() {

  if (DEVICE_PROFILE.lowEnd) {
    return 96;
  }

  if (MODEL.includes("1.5B")) {
    return 512;
  }

  return 256;
}

function ensureEngine() {

  if (!engine) {
    throw new Error(
      "Inference engine unavailable"
    );
  }
}

function removeOverlap(original, continuation) {

  const maxOverlap = Math.min(
    200,
    original.length,
    continuation.length
  );

  for (
    let len = maxOverlap;
    len > 20;
    len--
  ) {

    const end =
      original.slice(-len);

    const start =
      continuation.slice(0, len);

    if (end === start) {

      return continuation.slice(len);
    }
  }

  return continuation;
}
