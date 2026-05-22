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

//const MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const MODEL = "Qwen2.5-0.5B-Instruct-q4f32_1-MLC";
//const MODEL = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

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

async function initialize() {
  if (initializingPromise) {
    return initializingPromise;
  }

  initializingPromise = (async () => {
    postMessage({
      type: "status",
      text: "Downloading model...",
    });

    engine = await CreateMLCEngine(
      MODEL,
      {
        initProgressCallback: (progress) => {
          postMessage({
            type: "status",
            text:
              progress.text ||
              `Loading ${Math.round(progress.progress * 100)}%`,
          });
        },
      }
    );

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

  history.push({
    role: "user",
    content: prompt,
  });

  let response;
  
try {
const relevantChunks =
  await searchRelevantChunks(prompt);

const context =
  relevantChunks
    .map(item => item.text)
    .join("\n\n");

const augmentedPrompt =
  context
    ? `Context:\n${context}\n\nQuestion:\n${prompt}`
    : prompt;

history.push({
  role: "user",
  content: augmentedPrompt,
});

response = await engine.chat.completions.create({
  messages: history,
  temperature: 0.7,
    max_tokens: 256,
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

    return;
  }

  throw err;
}
  
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
    let i = 0;
    i < text.length;
    i += chunkSize
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
    text:
      `Embedding ${chunks.length} chunks...`,
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
    text:
      `${filename} indexed successfully`,
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

