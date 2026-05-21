import * as webllm from "https://esm.run/@mlc-ai/web-llm";

let engine = null;

const MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

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
  } catch (err) {
    return null;
  }
}

async function initialize() {
  if (engine) {
    return;
  }

  postMessage({
    type: "status",
    text: "Initializing WebLLM...",
  });

  engine = new webllm.MLCEngine({
    model: MODEL,
  });

  await engine.reload(MODEL);

  postMessage({
    type: "status",
    text: "Model loaded successfully",
  });
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

  const response = await engine.chat.completions.create({
    messages: history,
    temperature: 0.7,
    max_tokens: 512,
  });

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
}

self.onmessage = async (event) => {
  const data = event.data;

  try {
    switch (data.type) {
      case "generate":
        await generate(data.prompt);
        break;

      case "init":
        await initialize();
        break;
    }
  } catch (err) {
    postMessage({
      type: "error",
      text: err.message,
    });
  }
};
