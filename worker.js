import {
  CreateMLCEngine
} from "https://esm.run/@mlc-ai/web-llm";

let engine = null;
let initializingPromise = null;

//const MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
//const MODEL = "Qwen2.5-0.5B-Instruct-q4f32_1-MLC";
const MODEL = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

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

try {
  const response = await engine.chat.completions.create({
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

  history.push({
    role: "assistant",
    content: answer,
  });

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

