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

## Live Demo

https://bowo-prasetyo.github.io/web-llm/

## Features

* Fully client-side AI chat — no backend, no data leaves the browser
* Multiple chat sessions with automatic save, restore, and delete
* Conversation persistence across tab closures and mobile screen-off events
* Auto-resume of unanswered questions after tab suspension
* Multiple selectable LLM models (40+ models across 10+ model families)
* Download confirmation with size estimate on first model use
* Automatic model caching — confirmed models load instantly on subsequent visits
* Persistent local settings (model, temperature, max tokens, context window)
* Streaming AI responses with live token display
* GPU-accelerated inference using WebGPU
* Web Worker isolation for a fully responsive UI during inference
* Local document ingestion and semantic retrieval (RAG)
* PDF, TXT, and Markdown file support
* Local vector database using Transformers.js embeddings
* Persistent vector storage using OPFS
* Automatic recovery from GPU crashes and engine errors
* Automatic model unload after inactivity to free GPU memory
* Conversation history memory with configurable context window
* RAG-style contextual prompting from uploaded documents
* Dedicated Settings page (temperature, max tokens, context window sliders)
* Mobile-friendly responsive UI with slide-in session sidebar

## Live Demo

https://bowo-prasetyo.github.io/web-llm/

## Supported Models

40+ models are available, ordered from lightest to heaviest. The model
dropdown in the app groups them by size tier.

### Ultra-micro (100–400M)

| Model | Approx Size |
|---|---|
| SmolLM2-135M-Instruct-q0f32-MLC | ~720 MB |
| SmolLM2-360M-Instruct-q4f32_1-MLC | ~580 MB |
| SmolLM2-360M-Instruct-q0f32-MLC | ~1.7 GB |

### Micro (0.5–0.6B)

| Model | Approx Size |
|---|---|
| Qwen2.5-0.5B-Instruct-q4f16_1-MLC | ~945 MB |
| Qwen2.5-0.5B-Instruct-q4f32_1-MLC | ~1.1 GB |
| Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC | ~945 MB |
| Qwen3-0.6B-q4f16_1-MLC | ~1.1 GB |

### Lightweight (1–1.7B)

| Model | Approx Size |
|---|---|
| TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC | ~840 MB |
| Llama-3.2-1B-Instruct-q4f16_1-MLC | ~879 MB |
| Llama-3.2-1B-Instruct-q4f32_1-MLC | ~1.1 GB |
| SmolLM2-1.7B-Instruct-q4f16_1-MLC | ~1.7 GB |
| SmolLM2-1.7B-Instruct-q4f32_1-MLC | ~2.6 GB |
| Qwen3-1.7B-q4f16_1-MLC | ~1.7 GB |
| stablelm-2-zephyr-1_6b-q4f16_1-MLC | ~2.1 GB |

### Small (1.5B)

| Model | Approx Size |
|---|---|
| Qwen2.5-1.5B-Instruct-q4f16_1-MLC | ~1.6 GB |
| Qwen2.5-1.5B-Instruct-q4f32_1-MLC | ~1.9 GB |
| Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC | ~1.6 GB |
| Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC | ~1.6 GB |

### Mid (2–4B)

| Model | Approx Size |
|---|---|
| gemma-2-2b-it-q4f16_1-MLC | ~1.9 GB |
| gemma-2-2b-it-q4f32_1-MLC | ~2.5 GB |
| Llama-3.2-3B-Instruct-q4f16_1-MLC | ~2.3 GB |
| Llama-3.2-3B-Instruct-q4f32_1-MLC | ~3.0 GB |
| Hermes-3-Llama-3.2-3B-q4f16_1-MLC | ~2.3 GB |
| Qwen2.5-3B-Instruct-q4f16_1-MLC | ~2.5 GB |
| Qwen2.5-3B-Instruct-q4f32_1-MLC | ~2.9 GB |
| Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC | ~2.5 GB |
| Qwen3-4B-q4f16_1-MLC | ~3.2 GB |

### Upper-mid (3.8B)

| Model | Approx Size |
|---|---|
| Phi-3.5-mini-instruct-q4f16_1-MLC | ~3.7 GB |
| Phi-3.5-mini-instruct-q4f32_1-MLC | ~5.5 GB |

### Large (7–9B) — requires ≥6 GB VRAM

| Model | Approx Size |
|---|---|
| Qwen2.5-7B-Instruct-q4f16_1-MLC | ~5.1 GB |
| Qwen2.5-7B-Instruct-q4f32_1-MLC | ~5.9 GB |
| Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC | ~5.1 GB |
| Qwen3-8B-q4f16_1-MLC | ~5.5 GB |
| Llama-3.1-8B-Instruct-q4f16_1-MLC | ~5.0 GB |
| Llama-3.1-8B-Instruct-q4f32_1-MLC | ~6.1 GB |
| Hermes-3-Llama-3.1-8B-q4f16_1-MLC | ~4.9 GB |
| Mistral-7B-Instruct-v0.3-q4f32_1-MLC | ~5.6 GB |
| DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC | ~5.1 GB |
| DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC | ~5.0 GB |
| gemma-2-9b-it-q4f16_1-MLC | ~6.4 GB |

Sizes are approximate VRAM footprints. Actual download size may vary.
Models are cached locally in the browser after the first download.

## Recommended Models

| Use Case | Recommended Model |
|---|---|
| Lowest resource usage | SmolLM2-360M or Qwen2.5-0.5B |
| Best stability (mobile) | Llama-3.2-1B |
| Best general chat | Qwen2.5-1.5B or Qwen3-1.7B |
| Best coding | Qwen2.5-Coder-3B or Qwen2.5-Coder-7B |
| Best reasoning | DeepSeek-R1-Distill-Qwen-7B |
| Best multilingual | Qwen2.5-3B or Qwen3-4B |
| Best instruction following | Phi-3.5-mini or Hermes-3-Llama-3.1-8B |
| Best math | Qwen2.5-Math-1.5B |
| Most capable (high VRAM) | Qwen3-8B or gemma-2-9b |

## User Settings

Accessible via the ⚙ Settings page:

* **Model selection** — choose from 40+ models; switching models clears the current conversation
* **Temperature** — creativity vs. consistency (0.0–2.0), shown as a live slider
* **Max tokens** — maximum response length (16–2048)
* **Context window** — conversation history visible to the model (512–8192 tokens)

Settings are automatically persisted in `localStorage`.

## Multi-session Chat

* Tap the **☰ sidebar button** in the header to open the sessions panel
* Tap **+ New Chat** to start a fresh conversation (current session auto-saves)
* Previously saved chats are listed with title, preview, model, and timestamp
* Tap any session to restore it — the conversation and model context are both recovered
* Tap the **🗑 trash icon** on any session to delete it
* Up to 50 sessions are retained; oldest are pruned automatically

## Requirements

Modern browser with WebGPU support.

Recommended browsers:

* [Google Chrome](https://www.google.com/chrome/) 121+
* [Microsoft Edge](https://www.microsoft.com/edge) latest
* [Safari](https://www.apple.com/safari/) latest (macOS 14+ / iOS 17+)

Recommended hardware:

* Modern integrated GPU minimum (for models up to ~1.5B)
* Dedicated GPU recommended for 2B+ models
* At least 4 GB RAM for small models; 8 GB+ for 3B+ models
* Stable internet connection for first model download

## Run Locally

Because WebGPU and module Workers require an HTTP origin,
run the application using a local web server:

```bash
python -m http.server 8080
```

Then open:

```
http://localhost:8080
```

## Deploy to GitHub Pages

1. Create a GitHub repository
2. Upload all project files (`index.html`, `app.js`, `worker.js`, `style.css`)
3. Push to the `main` branch
4. Go to **Settings → Pages**
5. Set **Source** to `Deploy from branch`, branch `main`, folder `/root`
6. Save

Your live URL will be:

```
https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/
```

## File Support

Supported document formats for RAG ingestion:

* PDF
* TXT
* Markdown

Uploaded files are processed locally:

1. Parsed in the browser (PDF.js for PDFs, plain text otherwise)
2. Chunked into smaller segments
3. Embedded using Transformers.js (local embedding model)
4. Stored in a local vector database (OPFS)
5. Semantically retrieved and injected as context during chat

No uploaded file ever leaves the browser.

## Storage

The application uses multiple browser storage mechanisms:

| Storage | Used For |
|---|---|
| `localStorage` | Settings, session index, cached-model list, conversation messages |
| OPFS | Vector database (document embeddings), GPU stability flags |
| Browser cache / IndexedDB | WebLLM model weights |

Cached data may include AI model weights (potentially several GB), vector databases, user settings, and session history.

## Architecture

| File | Purpose |
|---|---|
| `app.js` | Vue 3 UI — routing, session management, settings, worker bridge |
| `worker.js` | AI inference worker — WebLLM engine, RAG pipeline, streaming |
| `index.html` | HTML entry point, CDN imports |
| `style.css` | UI styling (dark amber design system) |

### Component overview

```
app.js
├── Home component      — chat view, sidebar, model select, toolbar
├── Settings component  — temperature / max tokens / context sliders
└── Shared state        — reactive refs shared between both pages

worker.js
├── initialize()        — model loading, device profile detection
├── generate()          — streaming inference, continuation, RAG retrieval
├── ingest()            — document chunking and embedding
└── onmessage handler   — message routing (init, generate, set-config, …)
```

## AI Pipeline

```
User Prompt
    ↓
Semantic Retrieval (OPFS vector DB)
    ↓
Context Injection (RAG)
    ↓
System Prompt + History Assembly
    ↓
WebLLM Streaming Generation
    ↓
Continuation Loop (if max_tokens hit)
    ↓
Streaming Response → UI
```

## Safety and Stability Features

| Feature | Description |
|---|---|
| GPU crash recovery | Detects lost-device errors, restarts worker in safe mode |
| Tokenizer crash recovery | Detects WASM Tokenizer\* errors, resets engine cleanly |
| Generation timeout | Hard limit per generation; delivers partial result rather than discarding |
| Streaming stall detection | Kills hung streams after configurable timeout |
| Continuation deduplication | Overlap removal at token-boundary seams between continuations |
| Repetition detection | Stops generation if output becomes looping |
| Model swap guard | Waits for active generation to finish before unloading engine |
| Auto-unload | Releases GPU memory after 30 minutes of inactivity |
| Conservative GPU defaults | Low-end device profile uses smaller token budgets |
| System prompt pinning | System message is always preserved when history is trimmed |

## Session and Persistence Features

| Feature | Description |
|---|---|
| Multi-session | Up to 50 saved conversations, each with auto-generated title and preview |
| Auto-save | Every user message and assistant response is persisted immediately |
| Tab-resume restore | On page reload or mobile resume, the last session is restored automatically |
| Unanswered question resume | If the tab closed mid-generation, the question is automatically re-sent on next open |
| Duplicate prevention | Manual resend of the same question is deduplicated |
| Legacy migration | Existing single-session data is migrated to the multi-session format on first run |
| Download confirmation | First-time model downloads show size estimate and require explicit confirmation |
| Cache tracking | Confirmed/loaded models are remembered; no re-confirmation on subsequent uses |

## Notes

* First launch may take several minutes depending on model size and internet speed
* Browser storage usage can become large (several GB for bigger models)
* Large models may fail on low-memory or integrated-GPU devices
* 3B+ models work best on dedicated GPUs with 4+ GB VRAM
* 7B+ models require 6+ GB VRAM and may not run on most mobile devices
* WebGPU support is still evolving — Chrome and Edge are most reliable
* Switching models clears the current conversation (models use incompatible tokenizer formats)
* Safari WebGPU support is available from macOS 14 / iOS 17 but may be less stable

## License

Open-source libraries and models remain subject to their respective licenses.

## Assisted By

* [ChatGPT](https://chatgpt.com)
* [Claude AI](https://claude.ai)
