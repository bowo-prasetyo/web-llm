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
* Full-text search across all chat sessions (titles, questions, and answers)
* Conversation persistence across tab closures and mobile screen-off events
* Auto-resume of unanswered questions after tab suspension
* Duplicate send prevention on manual resend after tab resume
* 40+ selectable LLM models across 10+ model families, grouped by size tier
* Switch models mid-conversation without clearing chat history
* Download confirmation with size estimate on first model use
* Cancel download at any time during model fetch
* Stop generation at any time during streaming response
* Automatic model caching — confirmed models load instantly on subsequent visits
* Persistent local settings (model, temperature, top-p, penalties, context window, system prompt)
* Configurable maximum file upload size (1–200 MB, default 50 MB)
* Export settings to a JSON file and import on another browser
* Export all chat sessions to a JSON file and import (merge) on another browser — no duplicates
* Streaming AI responses with live token display
* GPU-accelerated inference using WebGPU
* Friendly WebGPU error screen with troubleshooting steps when GPU is unavailable
* Web Worker isolation for a fully responsive UI during inference
* Local document ingestion and semantic retrieval (RAG)
* PDF, TXT, and Markdown file support
* Sentence-aware chunking with overlap for coherent retrieval
* Relevance threshold — only semantically related chunks injected as context
* RAG context indicator showing which files informed each answer
* Document manager panel — list, remove, or clear indexed files
* Per-chunk embedding progress during document indexing
* Local vector database using Transformers.js embeddings
* Persistent vector storage using OPFS
* Automatic recovery from GPU crashes, engine errors, and WASM Tokenizer failures
* Automatic model unload after inactivity to free GPU memory
* Conversation history memory with configurable context window
* Dedicated Settings page with sliders for all generation parameters
* Editable system prompt with reset-to-default option
* Mobile-friendly responsive UI with slide-in session sidebar

## Supported Models

40+ models are available, ordered from lightest to heaviest. The model
dropdown in the app groups them by size tier using `<optgroup>` labels.

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

Accessible via the ⚙ Settings page (tap the gear icon in the header):

### Model

* **Model selection** — choose from 40+ models grouped by size tier; switching models preserves the current conversation

### Generation

* **Temperature** — randomness of output (0.0–2.0); low = focused, high = creative
* **Top P** — nucleus sampling threshold (0.01–1.0); filters token candidates by cumulative probability
* **Max Tokens** — maximum number of tokens to generate per response (16–2048)
* **Context Window** — conversation history visible to the model (512–8192 tokens); requires model reload
* **Max Upload Size** — maximum file size for document uploads (1–200 MB, default 50 MB)

### Repetition Control

* **Frequency Penalty** — reduces repetition of words that already appeared (−2 to 2)
* **Presence Penalty** — encourages the model to introduce new topics (−2 to 2)
* **Repetition Penalty** — MLC-native multiplicative penalty on repeated tokens (1.0–2.0)

### System Prompt

* Fully editable instructions given to the model before every conversation
* Changes take effect on the next message without reloading the model
* **Reset to Default** restores the built-in factual accuracy prompt

### Export / Import

* **Export Settings** — download all settings as a `webllm-settings-YYYY-MM-DD.json` file
* **Import Settings** — load settings from a previously exported file; model selection is preserved to avoid an unwanted download
* **Export Chats** — download all saved sessions as a `webllm-sessions-YYYY-MM-DD.json` file including full message content
* **Import Chats** — merge sessions from an exported file into the current browser; duplicate sessions are detected by ID and content fingerprint and skipped automatically

All settings are automatically persisted in `localStorage`.

## Multi-session Chat

* Tap the **☰ menu button** in the header to open the sessions sidebar
* Tap **+ New Chat** to start a fresh conversation — the current session auto-saves first
* Previously saved chats are listed with auto-generated title, preview, model, and timestamp
* Tap any session to restore it — messages and model context are both recovered
* Tap the **🗑 trash icon** on any session to delete it
* Up to 50 sessions are retained; oldest are pruned automatically
* Sessions survive page reloads, tab closures, and mobile screen-off events
* Unanswered questions (tab closed mid-generation) are automatically re-sent on next open

## Session Search

* Type in the **search box** at the top of the sidebar to search all chats
* Search covers titles, all user questions, and all assistant answers — full content, not just previews
* Results are ranked by match count with highlighted excerpts showing context around each match
* The active session is always searched first; past sessions follow sorted by relevance
* Search is debounced and yields to the event loop between sessions to remain responsive on large histories

## Stop and Cancel Controls

* **Stop generation** — while the model is streaming, the Send button becomes a pulsing red Stop button; tap it to halt and keep the partial response
* **Cancel download** — while a model is being fetched, a pulsing "Cancel Download" button appears in the toolbar; tap it to abort; the model selection reverts and the download confirmation will re-appear on next selection

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

### WebGPU Troubleshooting

If the app shows a "WebGPU Not Available" error screen:

1. Enable **Hardware Acceleration** in your browser settings
2. On Chrome Android: visit `chrome://flags` and enable **WebGPU** or **Unsafe WebGPU**
3. Use **Chrome 113+** or **Edge** on desktop for the most reliable WebGPU support
4. Check your GPU compatibility at [webgpureport.org](https://webgpureport.org)

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

Maximum file size is configurable in Settings (default **50 MB**, up to 200 MB). Files exceeding the limit are rejected before parsing.

Uploaded files are processed entirely locally:

1. Parsed in the browser (PDF.js for PDFs, plain text otherwise)
2. Chunked into sentence-aware segments (~800 chars target, 120-char overlap between chunks)
3. Embedded using Transformers.js (`all-MiniLM-L6-v2`, ~23 MB, downloaded on first use)
4. Stored in a local vector database persisted to OPFS
5. Semantically retrieved at query time — only chunks scoring above 0.25 cosine similarity are used
6. Injected as context for the current turn only — not stored in conversation history

No uploaded file ever leaves the browser.

### Document Manager

* Tap the **📄 Docs button** in the toolbar to open the document panel (badge shows count of indexed files)
* Each indexed file is listed with its filename and chunk count
* Individual files can be removed without affecting others
* **Clear All** removes all indexed documents at once
* A **RAG context banner** appears above the input when the last answer used document context, showing which file(s) contributed — dismissable with ×

## Storage

| Storage | Used For |
|---|---|
| `localStorage` | Settings, session index, cached-model list, conversation messages per session |
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
├── Home component      — chat view, sidebar, search, model select, toolbar
├── Settings component  — all generation sliders, system prompt, export/import
└── Shared state        — reactive refs shared between both pages

worker.js
├── initialize()        — device profile detection, model loading, vector DB restore
├── generate()          — streaming inference, RAG retrieval, continuation loop
├── ingestDocument()    — sentence-aware chunking, embedding, OPFS persistence
└── onmessage handler   — message routing (init, set-config, generate, ingest, …)
```

## AI Pipeline

```
User Prompt
    ↓
Semantic Retrieval (OPFS vector DB · relevance threshold 0.25 · top-4 chunks)
    ↓
Context Injection (current turn only — not stored in conversation history)
    ↓
System Prompt + History Assembly (system message always pinned)
    ↓
WebLLM Streaming Generation (temperature · top-p · frequency/presence/repetition penalty)
    ↓
Continuation Loop (if max_tokens hit)
    ↓
Streaming Response → UI
```

## Safety and Stability Features

| Feature | Description |
|---|---|
| GPU crash recovery | Detects lost-device errors, saves flag to OPFS, restarts in safe GPU mode |
| WebGPU unavailable | Catches incompatible GPU errors, shows friendly troubleshooting screen with retry |
| Tokenizer crash recovery | Detects WASM `Tokenizer*` errors, resets engine for clean next request |
| Generation timeout | Hard time limit per generation; delivers partial result rather than discarding |
| Streaming stall detection | Kills hung streams after configurable inactivity timeout |
| Stop generation | User can halt any stream mid-response; partial answer is preserved and saved |
| Cancel download | User can abort a model fetch; cached-model list cleaned up so confirmation re-appears |
| Continuation deduplication | Overlap removal at seam between multi-chunk continuations |
| Repetition detection | Stops generation if output becomes looping |
| Model swap guard | Waits for active generation to complete before unloading the engine |
| Auto-unload | Releases GPU memory after 30 minutes of inactivity |
| Conservative GPU defaults | Low-end device profile applies smaller token budgets |
| System prompt pinning | System message is always preserved when history is trimmed |
| RAG history isolation | Document context injected per-turn only; never stored in SESSION_HISTORY |
| File size guard | Files over the configured limit are rejected before parsing |
| Ingest guard | Document embedding is deferred until any active generation finishes |
| Worker error detection | `worker.onerror` surfaces parse/import failures in the status bar |

## Session and Persistence Features

| Feature | Description |
|---|---|
| Multi-session | Up to 50 saved conversations with auto-generated title, preview, model, and timestamp |
| Auto-save | Every user message and assistant response is persisted immediately |
| Tab-resume restore | On page reload or mobile resume, the last session is restored automatically |
| Unanswered question resume | If the tab closed mid-generation, the question is automatically re-sent on next open |
| Duplicate prevention | Manual resend of the same question is deduplicated |
| Full-content search | Search titles, questions, and answers across all sessions with highlighted excerpts |
| Mid-conversation model switch | Switching models continues the current conversation rather than clearing it |
| Legacy migration | Existing single-session data is migrated to the multi-session format on first run |
| Settings export / import | Transfer all settings to another browser via a JSON file |
| Session export / import | Transfer all chat sessions to another browser; merges without duplicating |
| Deduplication on import | Sessions matched by ID or content fingerprint (first+last user message) are skipped |
| Download confirmation | First-time model downloads show a size estimate and require explicit confirmation |
| Cancel re-confirmation | Cancelled models are removed from cache so confirmation correctly re-appears |
| Cache tracking | Successfully loaded models skip confirmation on all subsequent uses |

## Notes

* First launch may take several minutes depending on model size and internet speed
* Browser storage usage can become large — several GB for bigger models
* Large models may fail on low-memory or integrated-GPU devices
* 3B+ models work best on dedicated GPUs with 4+ GB VRAM
* 7B+ models require 6+ GB VRAM and may not run on most mobile devices
* WebGPU support is still evolving — Chrome and Edge are most reliable
* Switching models mid-conversation is supported; generation defaults update automatically
* Safari WebGPU support is available from macOS 14 / iOS 17 but may be less stable
* The embedding model for RAG (~23 MB) is downloaded separately on first document upload
* Imported sessions are merged non-destructively — existing sessions are never overwritten

## License

Open-source libraries and models remain subject to their respective licenses.

## Assisted By

* [Claude AI](https://claude.ai)
* [ChatGPT](https://chatgpt.com)
