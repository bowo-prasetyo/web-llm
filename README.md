# WebLLM Browser Chat

Pure client-side browser AI chat application built with:

* Vue 3 CDN
* Vue Router CDN
* WebLLM
* WebGPU
* Web Worker
* OPFS (Origin Private File System)
* Transformers.js
* PDF.js

The application runs entirely inside the browser without any backend server.

## Features

* Fully client-side AI chat
* Multiple selectable LLM models
* Persistent local settings
* Streaming AI responses
* Automatic model download and caching
* GPU-accelerated inference using WebGPU
* Web Worker isolation for responsive UI
* Local document ingestion and semantic retrieval
* PDF/TXT/Markdown file support
* Local vector database using embeddings
* Persistent storage using OPFS
* Automatic recovery from GPU crashes
* Dynamic model configuration
* Automatic model unload to save memory
* Conversation history memory
* RAG-style contextual prompting

## Supported Models

Currently supported models:

```text
Qwen2.5-0.5B-Instruct-q4f16_1-MLC
Llama-3.2-1B-Instruct-q4f32_1-MLC
Qwen2.5-1.5B-Instruct-q4f16_1-MLC
gemma-2-2b-it-q4f16_1-MLC
Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC
Qwen2.5-3B-Instruct-q4f16_1-MLC
Llama-3.1-3B-Instruct-q4f16_1-MLC
Phi-3.5-mini-instruct-q4f16_1-MLC
```

## User Settings

Users can configure:

* Model selection
* Temperature
* Max tokens
* Context window size

Settings are automatically persisted locally using:

```text
localStorage
```

## Requirements

Modern browser with WebGPU support.

Recommended browsers:

* [Google Chrome](https://www.google.com/chrome/?utm_source=chatgpt.com) 121+
* [Microsoft Edge](https://www.microsoft.com/edge?utm_source=chatgpt.com) latest
* [Safari](https://www.apple.com/safari/?utm_source=chatgpt.com) latest

Recommended hardware:

* Modern integrated GPU minimum
* Dedicated GPU recommended for 2B+ models
* At least 8 GB RAM recommended
* Stable internet connection for first model download

## Run Locally

Because WebGPU and module Workers require HTTP origin,
you should run the application using a local web server.

Example:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Deploy to GitHub Pages

1. Create a GitHub repository

2. Upload project files

3. Push repository

4. Open:

```text
Settings → Pages
```

5. Configure:

```text
Source: Deploy from branch
Branch: main
Folder: /root
```

6. Save

GitHub Pages URL:

```text
https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/
```

## File Support

Supported document formats:

* PDF
* TXT
* Markdown

Uploaded files are:

1. Parsed locally
2. Chunked into smaller segments
3. Embedded using Transformers.js
4. Stored locally in vector database
5. Used as semantic context during chat

No uploaded file leaves the browser.

## Storage

The application uses:

* OPFS
* IndexedDB
* Browser cache
* localStorage

for persistent storage.

Cached data may include:

* AI models
* Vector database
* User settings
* GPU stability flags

## Model Downloads

Models are automatically downloaded from:

* [MLC AI HuggingFace Repository](https://huggingface.co/mlc-ai?utm_source=chatgpt.com)

on first use.

Approximate download sizes:

| Model Class | Approx Size |
| ----------- | ----------- |
| 0.5B        | 300–500 MB  |
| 1B          | 600–900 MB  |
| 2B          | 1–1.5 GB    |
| 3B          | 1.5–3 GB    |

Models are cached locally after first download.

## Architecture

Main components:

| File         | Purpose             |
| ------------ | ------------------- |
| `app.js`     | Vue application UI  |
| `worker.js`  | AI inference worker |
| `index.html` | Main HTML entry     |
| `style.css`  | UI styling          |

The AI engine runs entirely inside a dedicated Web Worker.

## AI Pipeline

The application combines:

* WebLLM for LLM inference
* Transformers.js for embeddings
* Local vector search for retrieval augmentation

Inference pipeline:

```text
User Prompt
    ↓
Semantic Retrieval
    ↓
Context Injection
    ↓
WebLLM Generation
    ↓
Streaming Response
```

## Safety and Stability Features

Implemented protections include:

* GPU crash recovery
* Automatic safe mode fallback
* Generation timeout protection
* Streaming stall detection
* Corrupted output detection
* Automatic model unload
* Retry logic for unstable outputs
* Conservative defaults for low-end GPUs

## Notes

* First launch may take several minutes depending on model size
* Browser storage usage can become very large
* Large models may fail on low-memory devices
* 3B+ models work best on dedicated GPUs
* WebGPU support is still evolving across browsers
* Some models are more stable than others in browser inference

## Recommended Models

| Use Case              | Recommended Model  |
| --------------------- | ------------------ |
| Best Stability        | Llama-3.2-1B       |
| Best Coding           | Qwen2.5-Coder-1.5B |
| Best Reasoning        | Phi-3.5 Mini       |
| Best Multilingual     | Qwen2.5-3B         |
| Lowest Resource Usage | Qwen2.5-0.5B       |

## License

Open-source libraries and models remain subject to their respective licenses.
