import {
  CreateMLCEngine
} from "https://esm.run/@mlc-ai/web-llm";

import {
  pipeline
} from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

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

  if (!navigator.gpu) {

    DEVICE_PROFILE = {
      name: "No WebGPU",
      lowEnd: true,
      unstable: true,
    };

    MODEL =
      "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

    MODEL_CONFIG = {
      max_tokens: 128,
      temperature: 0.7,
    };

    return;
  }

  const adapter =
    await navigator.gpu.requestAdapter();

  if (!adapter) {

    DEVICE_PROFILE = {
      name: "No GPU Adapter",
      lowEnd: true,
      unstable: true,
    };

    MODEL =
      "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

    return;
  }

  let info = {};

  try {
    info = await adapter.requestAdapterInfo();
  } catch {
    info = {};
  }

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
    text: `GPU detected: ${gpuText}`,
  });


  // ------------------------------------------------
  // Intel modern iGPU detection
  // ------------------------------------------------

  const modernIntel =
    gpuText.includes("xe");

  // ------------------------------------------------
  // Intel old iGPU detection
  // ------------------------------------------------

  const unstableIntel =
    gpuText.includes("intel") &&
    !modernIntel;

  // ------------------------------------------------
  // Mid-range GPU
  // ------------------------------------------------

  const midRange =
    modernIntel ||
    gpuText.includes("adreno") ||
    gpuText.includes("mali");

  // ------------------------------------------------
  // High-end GPU
  // ------------------------------------------------

  const highEnd =
    gpuText.includes("rtx") ||
    gpuText.includes("radeon") ||
    gpuText.includes("apple") ||
    gpuText.includes("adreno 7") ||
    gpuText.includes("mali-g7");

  // ------------------------------------------------
  // Decide model
  // ------------------------------------------------

  if (unstableIntel) {

    DEVICE_PROFILE = {
      name: gpuText,
      lowEnd: true,
      unstable: true,
    };

    MODEL =
      "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

    MODEL_CONFIG = {
      max_tokens: 64,
      temperature: 0.3,
    };

  } else if (highEnd) {

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
    };

  } else if (midRange) {

    DEVICE_PROFILE = {
      name: gpuText,
      lowEnd: false,
      unstable: false,
    };

    MODEL =
      "Qwen2.5-0.5B-Instruct-q4f32_1-MLC";

    MODEL_CONFIG = {
      max_tokens: 256,
      temperature: 0.7,
    };

  } else {

    DEVICE_PROFILE = {
      name: gpuText,
      lowEnd: true,
      unstable: false,
    };

    MODEL =
      "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

    MODEL_CONFIG = {
      max_tokens: 128,
      temperature: 0.7,
    };
  }

  postMessage({
    type: "status",
    text: `Using model: ${MODEL}`,
  });
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
            DEVICE_PROFILE.unstable
              ? 512
              : 2048,
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

      postMessage({
        type: "status",
        text: "High-performance mode failed. Falling back...",
      });

      MODEL =
        "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

      MODEL_CONFIG = {
        max_tokens: 128,
        temperature: 0.7,
      };

      engine = await CreateMLCEngine(
        MODEL, {
          initProgressCallback: (progress) => {
            postMessage({
              type: "status",
              text: progress.text ||
                `Fallback loading ${Math.round(progress.progress * 100)}%`,
            });
          },
        }
      );
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

    if (
      err.message.includes("Instance reference") ||
      err.message.includes("GPUBuffer")
    ) {

      postMessage({
        type: "status",
        text: "Recovering GPU context...",
      });

      engine = null;
      initializingPromise = null;

      await initialize();

      postMessage({
        type: "status",
        text: "GPU context restored",
      });

      MODEL =
        "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

      MODEL_CONFIG = {
        max_tokens: 64,
        temperature: 0.7,
      };

      postMessage({
        type: "status",
        text: "Switching to compatibility mode...",
      });

      await initialize();

      postMessage({
        type: "status",
        text: "Compatibility mode enabled",
      });

      return;
    }

    throw err;
  }

  postMessage({
    type: "status",
    text: `Ready (${DEVICE_PROFILE.name})`,
  });

  const answer = response.choices[0].message.content;

  await saveToOPFS(
    "chat-history.json",
    JSON.stringify(history, null, 2)
  );

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
