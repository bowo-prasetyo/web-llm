// English: the source language. Every other locales/<code>.js has the
// same keys and the same {placeholders}; tests/unit/i18n.spec.js checks.
// See docs/translating.md.
//
// Grouped by where the words appear. In a message, {name} is filled in by
// the app; in a few, {name} is a link, button or bold text placed by the
// page (the <i18n-t> component), so keep it in the sentence.
export default {
  // Used in many places
  common: {
    "ok":      "OK",
    "cancel":  "Cancel",
    "close":   "Close",
    "back":    "Back",
    "dismiss": "Dismiss",
    "on":      "On",
    "off":     "Off",
    "yes":     "Yes",
    "no":      "No",
    "unknown": "Unknown",
  },

  // Sizes
  units: {
    "mb": "{size} MB",
    "gb": "{size} GB",
  },

  // Header of the chat page
  header: {
    "chat-history": "Chat history",
    "tagline":      "Private AI chat on this device",
    "new-chat":     "New chat",
    "settings":     "Settings",
  },

  // Status bar, from the model worker (status.js)
  status: {
    "manual-model":       "Using manually selected model: {model}",
    "safe-gpu-mode":      "Using persistent safe GPU mode",
    "gpu-detected":       "GPU detected: {gpu}",
    "gpu-unknown":        "Unknown GPU",
    "loading-model":      "Loading AI model for device profile...",
    "load-progress":      "Loading {percent}%",
    "needs-f16":          "This model needs 16-bit GPU support",
    "checking-model":     "Checking that the model works on this GPU...",
    "model-loaded":       "Model loaded successfully",
    "ready":              "Ready",
    "ready-profile":      "Ready ({profile})",
    "stopped":            "Generation stopped",
    "cut-off-time-limit": "Response cut off: reply time limit reached",
    "cut-off-stalled":    "Response cut off: the model stopped producing text",
    "slow-generation":    "Generation is taking longer than usual...",
    "engine-reset":       "The browser reset the model (this happens on phones after the app was in the background). Reloading it…",
    "reinitialising":     "Engine not ready, reinitialising...",
    "waiting-to-switch":  "Waiting for generation to finish before switching model...",
    "unloading-previous": "Unloading previous model...",
    "initializing-model": "Initializing {model}...",
    "unloaded-idle":      "Model unloaded to save memory",
    "loading-embedder":   "Loading embedding model...",
    "embedder-loaded":    "Embedding model loaded",
  },

  // Status bar, from the page
  statusbar: {
    "loading":                "Loading...",
    "downloading":            "Downloading the model…",
    "loading-model":          "Loading {model}…",
    "thinking":               "AI is thinking...",
    "generating":             "Generating response...",
    "generating-words":       { one: "Generating... ~{count} word", other: "Generating... ~{count} words" },
    "stopped":                "Stopped",
    "download-cancelled":     "Download cancelled",
    "settings-applied":       "Settings applied",
    "something-wrong":        "Something went wrong",
    "webgpu-unavailable":     "WebGPU unavailable",
    "needs-f16-browser":      "This model needs 16-bit GPU support, which this browser doesn't offer",
    "gpu-crashed-twice":      "The GPU crashed twice on this visit. Stopped to avoid a crash loop.",
    "offline-not-downloaded": "You're offline, and this model isn't downloaded yet. Pick a downloaded model, or connect to download it.",
    "worker-error":           "⚠ Worker error: {error}",
    "worker-load-failed":     "Worker failed to load — check browser console for import errors",
    "offline":                "Offline",
    "offline-hint":           "No internet connection. Downloaded models still work.",
  },

  // When the model worker stops (status.js)
  fatal: {
    "gpu-crash-loading":   "The GPU stopped working while loading the model.",
    "gpu-crash-answering": "The GPU stopped working while answering.",
    "unknown":             "The model stopped unexpectedly.",
  },

  // Errors shown in the chat ("Error: …")
  errors: {
    "storage-full":     "Not enough storage space to download this model. Private (incognito) windows have very little storage, so use a normal window. Otherwise free some disk space, or choose a smaller model.",
    "context-too-long": "Your message is too long for this model's context window ({tokens} tokens). Shorten it, or raise Context Window in Settings.",
  },

  // "A new version is available" banner
  update: {
    "available":    "A new version of the app is available.",
    "reload":       "Reload",
    "reload-after": "Reload after this reply",
    "later":        "Later",
  },

  // Download / loading progress panel
  load: {
    "downloading": "Downloading {model}",
    "from-device": "Loading {model} from this device",
    "preparing":   "Preparing {model} for your GPU",
    "loading":     "Loading {model}",
    "note":        "Downloads once, then loads from this device. Keep this tab open until it finishes.",
  },

  // Asking before a download
  download: {
    "confirm-title":        "Download Model?",
    "confirm-body":         "About {size} will be downloaded and kept in your browser. After that it loads from this device, also offline. You can cancel while it downloads.",
    "confirm-body-warning": "About {size} will be downloaded and kept in your browser. After that it loads from this device, also offline. You can cancel while it downloads. ⚠ {warning}",
    "confirm-ok":           "Download & Load",
    "space-warning":        "This browser lets this site store only about {available} more, and this model needs {need}. {hint}",
    "space-hint-private":   "Private (incognito) windows have very little storage; use a normal window.",
    "space-hint-disk":      "Free some disk space, or choose a smaller model.",
  },

  // How fast a model writes (pace.js, the note under the chat)
  speed: {
    "under-one":  "less than 1 word/sec",
    "about":      { one: "about {count} word/sec", other: "about {count} words/sec" },
    "note":       "{model} writes {speed} on this device.",
    // {model} is a button that switches to the faster model
    "try-faster": "For quicker replies, try {model} (faster, but makes more mistakes).",
  },

  // Time left for a download (picker.js)
  eta: {
    "under-minute":  "less than a minute left",
    "minutes":       "about {minutes} min left",
    "hours":         "about {hours} h left",
    "hours-minutes": "about {hours} h {minutes} min left",
  },

  // Model menus
  models: {
    "group-micro":       "Micro (0.5–0.8B)",
    "group-lightweight": "Lightweight (1–1.7B)",
    "group-small":       "Small (1.5B)",
    "group-mid":         "Mid (2–4B)",
    "group-upper-mid":   "Upper-mid (3.8B)",
    "group-large":       "Large (7–9B)",
    "group-tiny":        "Tiny (for testing; very limited answers)",
    "group-other":       "Other",
    // {label} is the model's name, precision and size
    "label-crashed":     "{label}  ⚠ crashed on this device",
    "label-needs-f16":   "{label}  ⚠ needs 16-bit GPU support",
    "label-garbled":     "{label}  ⚠ garbled on this GPU",
    "label-f16-risk":    "{label}  ⚠ 16-bit, may not work here",
  },

  // First-run model picker (and "Help me choose a model")
  picker: {
    "title-first-run":  "Welcome! Let's pick a model",
    "title":            "Choose a model",
    "intro":            "Everything runs privately in your browser. The model downloads once and is kept for next time.",
    "question-use":     "What will you mostly use it for?",
    "skip":             "Skip, I'll choose myself",
    "use-chat":         "Everyday chat",
    "use-chat-desc":    "Questions, explanations, ideas and conversation",
    "use-code":         "Coding",
    "use-code-desc":    "Write, explain and fix code",
    "use-write":        "Writing",
    "use-write-desc":   "Draft, rewrite and polish emails and texts",
    "title-size":       "Pick a size",
    "tier-fast":        "Fast",
    "tier-fast-desc":   "Quickest replies, smallest download. More likely to get facts wrong.",
    "tier-balanced":    "Balanced",
    "tier-balanced-desc": "Noticeably better answers. Best for most laptops.",
    "tier-smart":       "Smart",
    "tier-smart-desc":  "Best answers, large download. Needs a strong GPU (4–8 GB).",
    "phone-note":       "On phones, larger models often close the page because the phone runs out of memory. If that happens, the app offers a smaller one. Many phones can only run the Tiny models, whose answers are very limited.",
    "recommended":      "Recommended",
    "in-use":           "In use",
    "downloaded":       "Already downloaded",
    "download-size":    "~{size} download",
    "needs-internet":   "Needs internet to download (~{size})",
    "crashed":          "⚠ Crashed on this device (not enough memory?)",
    "start":            "Start",
    "download-start":   "Download & start",
    // "Your device: Computer · about 8 GB memory · 16-bit GPU math supported"
    "device":           "Your device: {details}",
    "device-phone":     "Phone or tablet",
    "device-computer":  "Computer",
    "device-memory":    "about {gb} GB memory",
    "device-f16-unreliable": "16-bit GPU math not reliable, so these are q4f32 models",
    "device-f16-ok":    "16-bit GPU math supported",
  },

  // "This model doesn't work on your GPU"
  health: {
    "title-may-not-work":   "This model may not work on your GPU",
    "title-doesnt-work":    "This model doesn't work on your GPU",
    // {model} is the model's name and ID; {sample} is the garbled text
    "body-no-f16":          "{model} needs 16-bit GPU support, which this browser doesn't offer.",
    "body-degenerate":      "{model} just gave a reply that collapsed into repeated words or unreadable output.",
    "body-garbled":         "{model} gave garbled text in a quick check.",
    "body-garbled-sample":  "{model} gave garbled text in a quick check: {sample}.",
    "f16-explain":          "This usually means the GPU does 16-bit math incorrectly. Models marked {q4f32} avoid it.",
    "suggested":            "Suggested: {model}",
    "suggested-size":       "(~{size} download)",
    "keep":                 "Keep this model",
    "switch":               "Switch model",
  },

  // The page or GPU stopped while using a model
  crash: {
    "title-gpu":           "The GPU stopped working",
    "title-page":          "The page closed unexpectedly",
    "body-gpu-loading":    "The GPU stopped working while loading {model}. This usually means this device ran out of memory for that model, so it wasn't loaded again.",
    "body-gpu-answering":  "The GPU stopped working while answering with {model}. This usually means this device ran out of memory for that model, so it wasn't loaded again.",
    "body-page-loading":   "Last time, the page closed while loading {model}. This usually means this device ran out of memory for that model, so it wasn't loaded again.",
    "body-page-answering": "Last time, the page closed while answering with {model}. This usually means this device ran out of memory for that model, so it wasn't loaded again.",
    "no-lighter":          "There is no clearly lighter model worth suggesting. Try again, or choose another model.",
    "suggested":           "Suggested: {model}, which needs about {lighterSize} of GPU memory instead of {currentSize}.",
    "try-again":           "Try again",
    "choose-another":      "Choose another model",
    "use":                 "Use {model}",
    "status-gpu":          "Stopped: the GPU stopped working with {model}",
    "status-page":         "Not loaded: {model} closed the page last time",
  },

  // WebGPU isn't available
  webgpu: {
    "title":                "WebGPU Not Available",
    "body":                 "Your browser or device doesn't support WebGPU, which is required to run AI models locally.",
    "step-acceleration":    "Make sure {setting} is enabled in your browser settings",
    "acceleration-setting": "Hardware Acceleration",
    "step-flags":           "On Chrome Android, visit {flags} and enable {webgpu}",
    "step-browsers":        "Try {chrome} or {edge} on desktop for best support",
    "step-report":          "Check your GPU compatibility at {link}",
    "try-again":            "Try Again",
  },

  // Chat list
  sidebar: {
    "title":              "Chats",
    "new-chat":           "New Chat",
    "hide-list":          "Hide chat list",
    "close-list":         "Close chat list",
    "hide":               "Hide",
    "search":             "Search chats",
    "search-placeholder": "Search chats…",
    "clear-search":       "Clear search",
    "no-results":         "No results for \"{query}\"",
    "searching":          "Searching…",
    "match-you":          "You",
    "match-ai":           "AI",
    "more-matches":       { one: "+{count} more match", other: "+{count} more matches" },
    "empty":              "No saved chats yet",
    "delete-chat":        "Delete chat",
    "delete-chat-named":  "Delete chat: {title}",
  },

  chats: {
    "count":        { one: "{count} chat", other: "{count} chats" },
    "current":      "Current chat",
    "new":          "New Chat",
    "imported":     "Imported chat",
    "legacy":       "Chat",
    "couldnt-save": "⚠ Couldn't save this chat: {error}",
    "delete-title": "Delete this chat?",
    "delete-body":  "Its messages and any attached documents will be removed from this browser. This can't be undone. (Settings → Export Chats keeps a copy.)",
    "delete-ok":    "Delete chat",
  },

  // Empty chat
  welcome: {
    "title":        "What would you like to chat about?",
    "sub":          "Pick a persona for this chat. You can switch at any time.",
    "persona":      "Persona",
    "choose-model": "Choose a model to start",
    "note":         "No server. No account. Works offline. AI can make mistakes, so double-check important facts.",
    "help-choose":  "Help me choose a model",
  },

  persona: {
    "applies-next": "{icon} {name} persona: applies from your next message",
  },

  // Built-in personas (personas.js). Starters are example messages.
  personas: {
    friendly: {
      "name":      "Friendly",
      "tagline":   "Everyday help and easygoing chat",
      "starter-1": "Explain how a rainbow forms, in simple terms",
      "starter-2": "Give me three easy tips to sleep better",
    },
    precise: {
      "name":      "Precise",
      "tagline":   "Short, factual, no tangents",
      "starter-1": "What is the boiling point of water at sea level?",
      "starter-2": "Summarize the main causes of World War I in three points",
    },
    writer: {
      "name":      "Writer",
      "tagline":   "Draft, rewrite and polish text",
      "starter-1": "Help me write a polite email declining a meeting",
      // Ends with a space: the person types their text after it
      "starter-2": "Make this sound more professional: ",
    },
    coder: {
      "name":      "Coder",
      "tagline":   "Write, explain and debug code",
      "starter-1": "Write a JavaScript function that debounces another function",
      "starter-2": "Explain what this regex matches: ^\\d{3}-\\d{4}$",
    },
    brainstorm: {
      "name":      "Brainstorm",
      "tagline":   "Explore ideas and options",
      "starter-1": "Ideas for a fun weekend side project",
      "starter-2": "Name ideas for a cozy neighborhood coffee shop",
    },
    custom: {
      "name":    "Custom",
      "tagline": "Your own instructions, set in Settings",
    },
  },

  // The conversation
  messages: {
    "label": "Conversation",
  },

  message: {
    "thought-process":      "Thought process",
    "thinking":             "Thinking…",
    "note-loop":            "The reply started repeating itself, so it was stopped there.",
    "note-continue-failed": "Couldn't continue: the model didn't add anything new.",
    "note-gpu-lost":        "Cut off: the GPU stopped working.",
    "press-continue":       "Press Continue for the rest.",
    "copy":                 "Copy",
    "copied":               "Copied",
    "copy-reply":           "Copy reply",
    "copy-code":            "Copy code",
    // Above a code block whose language is not given
    "code-label":           "code",
    "continue":             "Continue",
    "continue-title":       "Continue this reply",
    "regenerate":           "Regenerate",
    "regenerate-title":     "Regenerate reply",
    "retry":                "Retry",
    "try-again":            "Try again",
  },

  // Replies that went wrong
  reply: {
    "error":                  "Error: {error}",
    "failed-degenerate":      "⚠ The reply collapsed into repeated words or unreadable output, so it was stopped. Try Regenerate, or a larger model.",
    "failed-degenerate-f16":  "⚠ The reply collapsed into repeated words or unreadable output, so it was stopped. This 16-bit (q4f16) model may not run correctly on your GPU; a q4f32 model usually fixes it.",
    "failed-timeout":         "⚠ No reply: the model didn't start answering within the time limit. A smaller model may be faster on this device.",
    "failed-empty":           "⚠ The model returned an empty reply.",
    "cut-off-stall":          "Stopped: the model stopped writing for a minute.",
    "cut-off-time":           "Cut off at the 20-minute limit for one reply.",
    "cut-off-max-tokens":     "Cut off at the Max Tokens limit ({max}).",
  },

  // "Small models often get facts wrong"
  accuracy: {
    "hint":       "⚠ Small models like {model} often get facts wrong, even when they sound sure. Check anything important.",
    "hide-label": "Hide this hint for this model",
    "hide-title": "Hide for this model",
  },

  "legacy-docs": {
    "note":   "Documents added in an earlier version ({files}) were shared by all chats and are no longer used. Attach the files you need to a chat instead.",
    "remove": "Remove them",
  },

  // Message box and toolbar
  composer: {
    "placeholder":       "Ask something… (Enter to send, Shift+Enter for a new line)",
    "placeholder-touch": "Ask something…",
    "message":           "Message",
    "send":              "Send message",
    "send-title":        "Send",
    "stop":              "Stop generation",
    "persona":           "Persona for this chat",
    "model":             "Model",
    "select-model":      "Select Model",
    "clear":             "Clear",
    "delete-chat":       "Delete this chat",
    "attach":            "Attach",
    "attach-title":      "Attach a document to this chat (PDF, TXT, Markdown)",
    "attachments":       "Documents attached to this chat",
    "remove-named":      "Remove {name}",
    "remove-title":      "Remove from this chat",
    "follow-reply":      "Follow the reply",
    "jump-latest":       "Jump to latest",
  },

  // Documents attached to a chat
  attachments: {
    "reading":             "Reading…",
    "indexing":            "Indexing…",
    "indexing-progress":   "Indexing {current}/{total}",
    "cant-search":         "Can't search it",
    "chars":               { one: "{count} char", other: "{count} chars" },
    "chars-thousands":     "{count}k chars",
    "attached":            "📎 {name} attached to this chat",
    "too-large":           "⚠ {name} is too large ({size} MB). Maximum is {max} MB.",
    "too-long":            "⚠ {name} is too long ({size}k characters). The maximum is {max}k (~200 pages).",
    "no-text":             "⚠ No text found in {name} (scanned PDFs without a text layer can't be read)",
    "couldnt-read":        "⚠ Couldn't read {name}: {error}",
    "couldnt-save":        "⚠ Couldn't save {name}: {error}",
    "index-failed":        "Couldn't prepare this document for search. The beginning of it is still used.",
    "index-failed-detail": "Couldn't prepare this document for search ({error}). The beginning of it is still used.",
  },

  // Export and import (Settings, and the status bar)
  backup: {
    "title":             "Export / Import",
    "hint":              "Transfer your settings and chat history to another browser or device.",
    "settings-title":    "⚙ Settings",
    "settings-desc":     "Export all settings to a JSON file, or import settings from a previously exported file.",
    "export-settings":   "Export Settings",
    "import-settings":   "Import Settings",
    "chats-title":       "💬 Chat History",
    "chats-desc":        "Export all saved sessions to a JSON file, or import sessions from another browser (added alongside existing chats).",
    "export-chats":      "Export Chats",
    "import-chats":      "Import Chats",
    "settings-imported": "✓ Settings imported successfully",
    "import-failed":     "⚠ Import failed: {error}",
    "exported":          { one: "✓ Exported {count} session", other: "✓ Exported {count} sessions" },
    "imported":          { one: "✓ Imported {count} session — open the sidebar to view it", other: "✓ Imported {count} sessions — open the sidebar to view them" },
    "all-exist":         { one: "✓ {count} session already exists — nothing to import", other: "✓ All {count} sessions already exist — nothing to import" },
    // {added} and {skipped} are backup.new-sessions and backup.duplicates
    "imported-skipped":  "✓ Imported {added}, skipped {skipped}",
    "new-sessions":      { one: "{count} new session", other: "{count} new sessions" },
    "duplicates":        { one: "{count} duplicate", other: "{count} duplicates" },
  },

  // Settings page
  settings: {
    "title":                   "Settings",
    "saved":                   "Changes are saved automatically",
    "model":                   "Model",
    "model-hint":              "✓ = already downloaded. Switching keeps the conversation and uses the new model's recommended reply settings.",
    "appearance":              "Appearance",
    "theme-system":            "System",
    "theme-light":             "Light",
    "theme-dark":              "Dark",
    // {mode} is settings.theme-mode-light or -dark
    "theme-hint-system":       "Follows this device's setting ({mode} right now).",
    "theme-hint-fixed":        "Always {mode}, whatever this device is set to.",
    "theme-mode-light":        "light",
    "theme-mode-dark":         "dark",
    "replies":                 "Replies",
    "temperature":             "Temperature",
    "temperature-desc":        "How adventurous replies are. Low = focused and predictable, high = more creative (and more mistakes).",
    "max-tokens":              "Max Tokens",
    "max-tokens-desc":         "Longest reply, in tokens (a token is about ¾ of a word). A longer reply stops with a Continue button.",
    "max-tokens-value":        "{tokens} tokens, about {words} words",
    "approx-words":            { one: "≈ {count} word", other: "≈ {count} words" },
    "context-window":          "Context Window",
    "context-window-desc":     "How much of the conversation (and attached documents) the model can see at once. Bigger uses more GPU memory.",
    "context-pending":         "Saved. The model needs to reload to use it (a few seconds), otherwise it applies the next time the app starts.",
    "reload-model":            "Reload model now",
    "thinking":                "Let reasoning models think first",
    "thinking-desc":           "Qwen3 and Qwen3.5 can reason step by step before answering. It can help with hard questions, but it is slower and uses up the reply length. (DeepSeek-R1 always does it.)",
    "advanced":                "Advanced sampling",
    "advanced-sub":            "Top P and repetition penalties; most people never need these",
    "top-p":                   "Top P",
    "top-p-desc":              "Nucleus sampling: only consider the most likely words that together make up P of the probability. 1.0 = off.",
    "frequency-penalty":       "Frequency Penalty",
    "frequency-penalty-desc":  "Penalises words by how often they have appeared. Reduces word repetition. Range −2 to 2.",
    "presence-penalty":        "Presence Penalty",
    "presence-penalty-desc":   "Penalises words that have already appeared at all. Encourages new topics. Range −2 to 2.",
    "repetition-penalty":      "Repetition Penalty",
    "repetition-penalty-desc": "MLC's multiplicative penalty on repeated words. 1.0 = off, above 1 reduces repetition.",
    "reset-replies":           "Reset to this model's recommended settings",
    "reset-title":             "Reset reply settings?",
    "reset-body":              "Temperature, Max Tokens, Context Window and the advanced sampling settings go back to what's recommended for this model. Personas and your custom instructions are kept.",
    "reset-ok":                "Reset",
    "personas":                "Personas",
    "personas-hint":           "A persona sets how the assistant talks. Each chat keeps its own persona; you can switch it from the chat toolbar at any time.",
    "default-persona":         "Default for new chats",
    "default-persona-label":   "Default persona for new chats",
    "show-instructions":       "Show the {name} instructions",
    "custom-persona":          "🛠 Custom persona",
    "custom-persona-hint":     "Write your own instructions, then pick the Custom persona in a chat. Changes take effect on the next message.",
    "custom-placeholder":      "Enter instructions for the Custom persona...",
    "reset-custom":            "Reset to Friendly instructions",
    "documents":               "Documents",
    "max-upload":              "Max Upload Size",
    "max-upload-desc":         "Largest file you can attach to a chat (PDF, TXT, Markdown). Text is limited to about 200 pages either way.",
    "current-chat-hint":       "Deletes the chat that is open, with its messages and attached documents. You'll be asked first.",
    "clear-conversation":      "Clear Conversation",
  },

  // Settings → This device
  device: {
    "title":               "This device",
    "hint":                "What the app found about this browser and GPU. Useful when a model gives garbled replies.",
    "app-version":         "App version",
    "webllm-version":      "WebLLM version",
    "gpu":                 "GPU",
    "no-adapter":          "No GPU adapter found",
    "no-webgpu":           "WebGPU not available",
    "f16-support":         "16-bit GPU support",
    "chats-saved-in":      "Chats saved in",
    // {count} is chats.count
    "chats-indexeddb":     "This browser's database (IndexedDB) · {count}",
    "chats-localstorage":  "Local storage, limited to {chats} chats of {messages} messages · {count}",
    "storage":             "Storage",
    "storage-usage":       "{used} used of about {allowed} allowed",
    "storage-kept":        "{usage} · kept by the browser",
    "storage-may-clear":   "{usage} · may be cleared if space runs low",
    "works-offline":       "Works offline",
    "offline-unsupported": "Not supported in this browser",
    "offline-ready":       "Yes, the app is saved on this device",
    "offline-not-yet":     "Not yet: open the app once while online",
    "checking":            "Checking…",
    "app":                 "App",
    "install":             "Install app",
    "installed":           "Installed",
    "install-hint":        "Use your browser's “Install” or “Add to Home Screen”",
    "f16-models":          "16-bit (q4f16) models",
    "f16-not-supported":   "Not supported: use q4f32 models",
    "f16-garbled":         "Garbled output detected: use q4f32 models",
    "f16-working":         "Working",
    "f16-not-checked":     "Not checked yet",
    "failed-check":        "Failed the model check here:",
    "report":              "Report a problem",
    "report-hint":         "Opens a form on GitHub with the details above filled in. Nothing is sent until you submit it there; please don't include private chats.",
    "forget-checks":       "Forget check results ({count})",
    "offline-note":        "Offline, chats work with models you have already downloaded; downloading a model, and the first large document you attach (which fetches a small search model), need a connection.",
    "checks-note":         "Each model is checked once after its first load on this device. Forgetting the results checks them again, for example after a browser or driver update.",
  },

  // Bottom of Settings
  about: {
    "tagline":     "Private AI chat that lives in your browser.",
    "open-source": "Open source",
    // {webllm} is a link
    "powered-by":  "Powered by {webllm}",
  },

  dates: {
    "yesterday": "Yesterday",
  },
};
