import {
  CreateMLCEngine
} from "https://esm.run/@mlc-ai/web-llm";

import {
  pipeline
} from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

//const SMALLEST_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const SMALLEST_MODEL = "Llama-3.2-1B-Instruct-q4f32_1-MLC";

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

let RUNTIME_FLAGS = {
  gpuCrashed: false,
  safeMode: false,
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
      max_tokens: 32,
      temperature: 0.2,
      contextWindowSize: 128,
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
      max_tokens: 64,
      temperature: 0.3,
      contextWindowSize: 256,
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
      max_tokens: 64,
      temperature: 0.3,
      contextWindowSize: 256,
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
      contextWindowSize: 2048,
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
      contextWindowSize: 1024,
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
      max_tokens: 96,
      temperature: 0.3,
      contextWindowSize: 512,
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
    contextWindowSize: 512,
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

      const gpuCrash =
        err.message.includes("DXGI_ERROR") ||
        err.message.includes("Device was lost") ||
        err.message.includes("device removed") ||
        err.message.includes("GPUBuffer");

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
  await initialize();

  const historyText = await readFromOPFS("chat-history.json");

  let history = [];

  if (historyText) {
    history = JSON.parse(historyText);
  }

  let response;

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

    // Keep only recent history
    const MAX_HISTORY =
      DEVICE_PROFILE.lowEnd ?
      6 :
      20;

    history = history.slice(-MAX_HISTORY);

    response =
      await engine.chat.completions.create({

        messages: history,

        temperature: MODEL_CONFIG.temperature,

        max_tokens: MODEL_CONFIG.max_tokens,
      });

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

  const answer = response.choices[0].message.content;
  RETRYING_AFTER_CRASH = false;
  
  const suspiciousOutput =
  answer.length > 80 &&
  (
    /(以.{0,2}){12,}/u.test(answer) ||
    /(�){5,}/.test(answer)
  );
  
  if (suspiciousOutput) {
  
    // Already retried once?
    if (RETRYING_AFTER_CRASH) {
  
      postMessage({
        type: "error",
        text:
          "Model produced corrupted output.",
      });
  
      RETRYING_AFTER_CRASH = false;
  
      return;
    }
  
    RETRYING_AFTER_CRASH = true;
  
    postMessage({
      type: "status",
      text:
        "Corrupted output detected. Retrying safely...",
    });
  
    // Keep same engine alive
    MODEL_CONFIG.temperature = 0.1;
    MODEL_CONFIG.max_tokens = 32;
  
    return await generate(
      "Answer briefly and clearly: " + prompt
    );
  }
    
  await saveToOPFS(
    "chat-history.json",
    JSON.stringify(history, null, 2)
  );

  RETRYING_AFTER_CRASH = false;
  
  postMessage({
    type: "response",
    text: answer,
  });

  resetUnloadTimer();
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
    engine = null;
    initializingPromise = null;

    postMessage({
      type: "status",
      text: "Model unloaded to save memory",
    });
  }, 60000);
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

  return dot / (magA * magB);
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
