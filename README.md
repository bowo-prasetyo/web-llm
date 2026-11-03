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
* marked, DOMPurify and highlight.js (reply rendering)

The application runs entirely inside the browser without any backend server.

## Live Demo

https://bowo-prasetyo.github.io/web-llm/

## Features

* Fully client-side AI chat — no backend, no data leaves the browser
* Works offline after the first visit, and installable as an app (PWA) on desktop and phone
* Multiple chat sessions with automatic save, restore, and delete
* Full-text search across all chat sessions (titles, questions, and answers)
* Conversation persistence across tab closures and mobile screen-off events
* Auto-resume of unanswered questions after tab suspension
* Duplicate send prevention on manual resend after tab resume
* 40 selectable LLM models across 10+ model families, grouped by size tier
* Switch models mid-conversation without clearing chat history
* First-run model picker: choose what it's for (chat, coding, writing) and a size (Fast / Balanced / Smart); picks suit the device and avoid 16-bit models where they don't work
* Download confirmation with size estimate on first model use
* Cancel download at any time during model fetch
* Stop generation at any time during streaming response
* Automatic model caching — confirmed models load instantly on subsequent visits
* Persistent local settings (model, temperature, top-p, penalties, context window, personas), saved as you edit them
* Configurable maximum file upload size (1–200 MB, default 50 MB)
* Export settings to a JSON file and import on another browser
* Export all chat sessions to a JSON file and import (merge) on another browser — no duplicates
* Streaming AI responses with a live word count
* Replies rendered as Markdown: headings, lists, tables, links and code blocks with syntax highlighting and a Copy button
* Copy any reply, and regenerate (or retry) the last one
* Reasoning from thinking models (Qwen3, DeepSeek-R1) shown live, then folded into a collapsible "Thought process"
* GPU-accelerated inference using WebGPU
* Friendly WebGPU error screen with troubleshooting steps when GPU is unavailable
* Quick model check after a model's first load on each device: catches GPUs whose 16-bit math is broken (q4f16 models reply with junk like "outer outer outer…") and offers the q4f32 version
* Replies that collapse into repeated words are stopped, explained, and kept out of the conversation history
* "This device" panel in Settings: WebLLM version, GPU, 16-bit support and model check results
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
* Six chat personas (Friendly, Precise, Writer, Coder, Brainstorm, Custom), chosen per chat and switchable mid-conversation
* Welcome screen for new chats with persona cards and starter prompts
* Mobile-friendly responsive UI with slide-in session sidebar

## Supported Models

40 models are available, ordered from lightest to heaviest. The model
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

**q4f16 vs q4f32.** q4f16 models are smaller and faster but need the GPU's
16-bit math. Some GPUs and browsers get that math wrong, and those models then
reply with garbage. The app checks each model once per device; if 16-bit
models fail (or the GPU doesn't support them), the model list also shows q4f32
versions of the q4f16-only models (Qwen2.5-Coder, Qwen3, Hermes-3, DeepSeek-R1,
gemma-2-9b and others) and marks q4f16 models with ⚠.
Models are cached locally in the browser after the first download.

## Choosing a Model

On first launch the app asks two questions instead of downloading anything:

1. **What will you mostly use it for?** Everyday chat, Coding, or Writing (this also sets the default persona)
2. **Which size?**

| Use | Fast | Balanced | Smart |
|---|---|---|---|
| Everyday chat | Llama 3.2 1B | Qwen2.5 1.5B | Qwen2.5 3B |
| Coding | Qwen2.5 Coder 1.5B | Qwen2.5 Coder 3B | Qwen2.5 Coder 7B |
| Writing | Llama 3.2 1B | Llama 3.2 3B | Llama 3.1 8B |

* Fast is recommended on phones and devices reporting 4 GB of memory or less, Balanced otherwise; Smart needs a strong GPU
* Devices where 16-bit GPU math is unsupported or broken get the q4f32 version of each pick automatically
* Downloaded models are marked, and the model in use is labelled
* **Skip** leaves the choice to you (the model menu); nothing downloads until a model is chosen, and sending a message first opens the picker
* Open it again any time from **Settings → Help me choose a model** or the welcome screen
* If a model is already downloaded (for example after clearing settings), it is used without asking

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

* **Model selection** — choose from 40 models grouped by size tier; switching models keeps the current conversation, and the new model continues it with the same history. Picking a different model applies that model's recommended generation defaults.

### Generation

* **Temperature** — randomness of output (0.0–2.0); low = focused, high = creative
* **Top P** — nucleus sampling threshold (0.01–1.0); filters token candidates by cumulative probability
* **Max Tokens** — maximum length of one reply (16–2048, capped at half the context window). Defaults are 256 for the tiniest models, 512 for 0.5–1B, 768 for 1.5–2B and 1024 for 3B and up. A reply that reaches it is marked "Cut off" with a **Continue** button
* **Context Window** — how many tokens of conversation the model can see (512–8192); the only generation setting that reloads the model. When a chat grows past it, the oldest turns (then document context) are left out of what the model sees
* **Max Upload Size** — maximum file size for document uploads (1–200 MB, default 50 MB); the extracted text is also limited to 500,000 characters (~200 pages)

### Repetition Control

* **Frequency Penalty** — reduces repetition of words that already appeared (−2 to 2)
* **Presence Penalty** — encourages the model to introduce new topics (−2 to 2)
* **Repetition Penalty** — MLC-native multiplicative penalty on repeated tokens (1.0–2.0)

### Personas

A persona sets how the assistant talks. Each chat keeps its own persona:
pick one on the welcome screen of a new chat, or switch at any time from the
persona menu in the chat toolbar (it applies from your next message, and the
conversation so far is kept).

| Persona | Best for |
|---|---|
| 💬 **Friendly** (default) | Everyday help and easygoing chat |
| 🎯 **Precise** | Short, factual answers with no tangents; says "I'm not sure" rather than guessing |
| ✍️ **Writer** | Drafting, rewriting and polishing emails, messages, essays and stories |
| 💻 **Coder** | Writing, explaining and debugging code |
| 💡 **Brainstorm** | Exploring ideas and options |
| 🛠 **Custom** | Your own instructions, written in Settings |

* **Default for new chats** — choose which persona new chats start with
* **Custom persona** — fully editable instructions; changes take effect on the next message without reloading the model; **Reset to Friendly instructions** restores a starting point
* Personas only change the system prompt; temperature and the other generation settings stay as you set them
* Persona prompts are kept short on purpose: small in-browser models follow short, plain instructions much better than long rule lists. They live in `personas.js`.
* Settings from earlier versions are migrated automatically: if you had edited the old system prompt, it becomes your Custom persona and stays your default; otherwise you move to Friendly

### This device

* Shows the WebLLM version, the GPU, and whether it supports 16-bit math
* Shows whether q4f16 models work here, and lists models that failed the model check (with a sample of their output)
* **Forget check results** re-runs the checks, for example after a browser or GPU driver update

### Export / Import

* **Export Settings** — download all settings as a `webllm-settings-YYYY-MM-DD.json` file
* **Import Settings** — load settings from a previously exported file; model selection is preserved to avoid an unwanted download
* **Export Chats** — download all saved sessions as a `webllm-sessions-YYYY-MM-DD.json` file including full message content
* **Import Chats** — merge sessions from an exported file into the current browser; duplicate sessions are detected by ID and content fingerprint and skipped automatically

All settings are automatically persisted in `localStorage` and survive page reloads. Generation settings (temperature, top-p, max tokens, penalties) and personas apply to the next message; **Apply Settings** reloads the model only when the model or context window changed.

## Multi-session Chat

* Tap the **☰ menu button** in the header to open the sessions sidebar
* Tap **+ New Chat** to start a fresh conversation — the current session auto-saves first
* Previously saved chats are listed with auto-generated title, preview, model, and timestamp
* Tap any session to restore it — messages and model context are both recovered
* Tap the **🗑 trash icon** on any session to delete it
* Chats are saved in the browser's database (IndexedDB), with no limit on the number of chats or messages beyond the browser's storage quota; nothing is deleted automatically
* Chats saved by earlier versions in `localStorage` are moved to IndexedDB on first start (the old copies are removed only after the move succeeds)
* If IndexedDB can't be used (for example in some private-browsing modes), chats fall back to `localStorage`, limited to 50 chats of 40 messages; **Settings → This device** shows where chats are saved
* Sessions survive page reloads, tab closures, and mobile screen-off events
* Unanswered questions (tab closed mid-generation) are automatically re-sent on next open

## Replies

* Assistant replies are rendered as Markdown with GitHub-style tables, lists and links
* **Code blocks** show their language and a **Copy** button; syntax colors are applied once the reply finishes streaming
* **Copy** under a reply copies its Markdown source; **Regenerate** asks again for the last reply (**Retry** after an error)
* **Thinking models** (Qwen3, DeepSeek-R1): the `<think>` reasoning is shown live while the model works, then folded into a collapsible **Thought process** section. Reasoning is left out of copies, chat previews and the history sent back to the model, which saves context
* Safety: raw HTML written by the model is shown as text, output is sanitized with DOMPurify, and links open in a new tab
* Your own messages are shown exactly as typed
* The Markdown libraries (marked, DOMPurify, highlight.js) load at pinned versions with integrity hashes; if they can't load, replies fall back to plain text

## Session Search

* Type in the **search box** at the top of the sidebar to search all chats
* Search covers titles, all user questions, and all assistant answers — full content, not just previews
* Results are ranked by match count with highlighted excerpts showing context around each match
* The active session is always searched first; past sessions follow sorted by relevance
* Search is debounced and yields to the event loop between sessions to remain responsive on large histories

## Stop and Cancel Controls

* **Stop generation** — while the model is streaming, the Send button becomes a pulsing red Stop button; tap it to halt and keep the partial response
* **Cancel download** — while a model is being fetched, a pulsing "Cancel Download" button appears in the toolbar; tap it to abort; the model selection reverts and the download confirmation will re-appear on next selection

## Offline and Installing

After one visit while online, the app works without an internet connection:

* A service worker (`sw.js`) saves the app's own files and the pinned libraries (Vue, Vue Router, marked, DOMPurify, highlight.js, PDF.js, WebLLM, Transformers.js) in the browser
* Model weights are kept by WebLLM itself, so **any model you have downloaded keeps working offline**
* Offline, the status bar shows an **Offline** badge; picking a model that isn't downloaded yet explains that it needs a connection instead of failing
* Downloading a new model, and the first document upload (which fetches a small search model), need a connection
* App updates still arrive: when online, the app's own files are always fetched fresh first (falling back to the saved copy after 4 seconds or when offline)
* **Settings → This device** shows whether the app is saved for offline use, and has an **Install app** button where the browser supports it (Chrome, Edge, Android). On iPhone/iPad use Safari's **Share → Add to Home Screen**

Service workers need `https` or `localhost`, so offline mode works on GitHub Pages and with the local server below.

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

## Testing

The app has no build step; `package.json` only holds the test tooling ([Playwright](https://playwright.dev)).

```bash
npm ci
npx playwright install chromium
npm test              # everything (about a minute)
npm run test:unit     # pure modules only, no browser
npm run test:e2e      # the app in Chromium
```

* **Unit tests** (`tests/unit/`) cover `quality.js`, `context.js`, `markdown.js` and `picker.js`
* **Browser tests** (`tests/e2e/`) run the real app in Chromium: settings, chat storage (IndexedDB, migration, export/import, fallback), personas, reply rendering and safety, model health on broken 16-bit GPUs, Continue and the repeat guard (with the real `worker.js`), the model picker, and offline mode
* The tests need no network, GPU or model downloads: the pinned CDN libraries are served from `node_modules`, and WebLLM is replaced by a scripted mock (`tests/support/mock-webllm.js`); some UI tests use a fake worker (`tests/support/fake-worker.js`) that reads its model lists from `worker.js`
* GitHub Actions runs everything on every pull request and on pushes to `main` (`.github/workflows/tests.yml`)
* When you change a pinned library version, update `index.html`, `sw.js`, `package.json` and `tests/support/fixtures.js` together

## Deploy to GitHub Pages

1. Create a GitHub repository
2. Upload all project files (`index.html`, `app.js`, `worker.js`, `sw.js`, `manifest.webmanifest`, `personas.js`, `markdown.js`, `quality.js`, `context.js`, `picker.js`, `chatstore.js`, `style.css`) and the `icons/` folder
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

Maximum file size is configurable in Settings (default **50 MB**, up to 200 MB). Files exceeding the limit are rejected before parsing. Extracted text over 500,000 characters (~200 pages) is rejected before indexing.

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
| IndexedDB (`webllm-chats`) | Chats: the chat list and each chat's messages |
| `localStorage` | Settings, cached-model list, model check results (and chats, only if IndexedDB is unavailable) |
| OPFS | Vector database (document embeddings), GPU stability flags |
| Browser cache / IndexedDB | WebLLM model weights |
| Cache Storage (`webllm-shell-v1`, `webllm-libs-v1`) | The app's files and pinned libraries, for offline use |

Cached data may include AI model weights (potentially several GB), vector databases, user settings, and session history.

## Architecture

| File | Purpose |
|---|---|
| `app.js` | Vue 3 UI — routing, session management, settings, worker bridge |
| `worker.js` | AI inference worker — WebLLM engine, RAG pipeline, streaming |
| `index.html` | HTML entry point, CDN imports |
| `chatstore.js` | Chat storage in IndexedDB, migration from localStorage, and the localStorage fallback |
| `picker.js` | Model picker catalog and device-based recommendation |
| `quality.js` | Junk-output detection for the model check and the collapsed-reply guard |
| `context.js` | Fits the conversation into the model's context window |
| `markdown.js` | Reply rendering (Markdown, code blocks, `<think>` handling), shared by the UI and the worker |
| `personas.js` | Built-in chat personas (prompt, icon, starter prompts), shared by the UI and the worker |
| `sw.js` | Service worker: offline copies of the app and its libraries |
| `manifest.webmanifest`, `icons/` | Installable app (PWA) metadata and icons |
| `style.css` | UI styling (dark amber design system) |

### Component overview

```
app.js
├── Home component      — chat view, sidebar, search, model select, toolbar
├── Settings component  — all generation sliders, personas, export/import
└── Shared state        — reactive refs shared between both pages

worker.js
├── initialize()        — device profile detection, model loading, vector DB restore
├── generate()          — RAG retrieval, context fitting, streamed reply
├── continueReply()     — finishes a cut-off reply when the user presses Continue
├── streamReply()       — streaming with Stop, time limit, junk and repeat guards
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
Persona System Prompt + History Assembly (system message always pinned)
    ↓
WebLLM Streaming Generation (temperature · top-p · frequency/presence/repetition penalty)
    ↓
Guards: stop on junk words, cut repeated sentences
    ↓
Streaming Response → UI
```

## Safety and Stability Features

| Feature | Description |
|---|---|
| GPU crash recovery | Detects lost-device errors and restarts on the lightest model (asking before downloading it); a second crash stops and shows the troubleshooting screen instead of looping |
| WebGPU unavailable | Catches incompatible GPU errors, shows friendly troubleshooting screen with retry |
| Tokenizer crash recovery | Detects WASM `Tokenizer*` errors, resets engine for clean next request |
| Generation timeout | Hard time limit per generation; delivers partial result rather than discarding, or explains why there is no reply |
| Model check | After a model's first load on a device, a short reply is checked for junk; q4f16 models that fail (or need 16-bit support the GPU lacks) get a q4f32 replacement offer |
| Collapsed-reply guard | A reply that turns into a few repeated words is stopped, replaced by an explanation with Retry, and left out of the model's memory |
| Context fitting | Before each reply, the oldest turns and then document context are dropped so the prompt fits the context window |
| Streaming stall detection | Warns in the status bar when no output arrives for 45–90 seconds; the generation time limit ends the stream |
| Stop generation | User can halt any stream mid-response; partial answer is preserved and saved |
| Cancel download | User can abort a model fetch; cached-model list cleaned up so confirmation re-appears |
| Cut-off replies | A reply that hits Max Tokens or the time limit ends cleanly with a note and a **Continue** button; nothing is stitched together automatically |
| Repeated-sentence guard | A reply that starts repeating the same sentence is cut back to just before the repeats, with a note |
| Continue seam cleanup | Text the model repeats from the end of the reply is removed, and a space is added where the two parts meet |
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
| Multi-session | Saved conversations (IndexedDB, no fixed limit) with auto-generated title, preview, model, persona, and timestamp |
| Auto-save | Every user message and assistant response is persisted immediately |
| Tab-resume restore | On page reload or mobile resume, the last session is restored automatically |
| Unanswered question resume | If the tab closed mid-generation, the question is automatically re-sent on next open |
| Duplicate prevention | Manual resend of the same question is deduplicated |
| Full-content search | Search titles, questions, and answers across all saved messages with highlighted excerpts |
| Mid-conversation model switch | Switching models continues the current conversation: the chat history is handed to the new model |
| Pinned dependencies | WebLLM (0.2.84; 0.2.86 produced garbage output), Vue, Vue Router, marked, DOMPurify and highlight.js load at fixed versions (the Markdown libraries with integrity hashes), so an upstream release can't change the app unexpectedly |
| Safe reply rendering | Model output is rendered as Markdown with raw HTML escaped and the result sanitized by DOMPurify |
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
* Switching models mid-conversation is supported; the new model keeps the conversation and its recommended generation defaults are applied
* Safari WebGPU support is available from macOS 14 / iOS 17 but may be less stable
* The embedding model for RAG (~23 MB) is downloaded separately on first document upload
* Imported sessions are merged non-destructively — existing sessions are never overwritten

## License

Open-source libraries and models remain subject to their respective licenses.

## Assisted By

* [Claude AI](https://claude.ai)
* [ChatGPT](https://chatgpt.com)
