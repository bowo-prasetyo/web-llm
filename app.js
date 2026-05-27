const {
  createApp,
  ref,
  onMounted,
  nextTick
} = Vue;
const {
  createRouter,
  createWebHashHistory
} = VueRouter;

let worker = null;

function getWorker() {
  if (!worker) {
    worker = new Worker("./worker.js", {
      type: "module",
    });
  }

  return worker;
}

function replaceWorker(onmessage) {
  if (worker) {
    try { worker.terminate(); } catch (_) {}
  }
  worker = new Worker("./worker.js", { type: "module" });
  worker.onmessage = onmessage;
  return worker;
}

// ── Shared reactive state (accessible to both Home and Settings) ──────────
const { ref: vRef, reactive } = Vue;
const sharedSettings  = vRef({ model: "", temperature: 0.7, max_tokens: 256, contextWindowSize: 4096 });
const sharedModels    = vRef([]);
const sharedLoading   = vRef(false);
const sharedModelLoading = vRef(false);
const sharedMessages  = vRef([]);
const sharedSessions  = vRef([]);   // [{id, title, model, ts, preview}]
const sharedSidebarOpen = vRef(false);
const sharedModelSizes  = vRef({});  // {modelId: sizeInMB}
const sharedIsDownloading = vRef(false);  // true while model weights are fetching
// These are populated once Home mounts; Settings reads them directly.
let sharedApplySettings   = () => {};
let sharedResetSettings   = () => {};
let sharedClearConversation = () => {};
let sharedNewChat         = () => {};
let sharedLoadSession     = (_id) => {};
let sharedDeleteSession   = (_id) => {};

const Home = {
  template: `
    <div class="container">

      <!-- Download confirmation modal -->
      <div class="modal-overlay" v-if="confirmModal.show" @click.self="confirmModal.show = false">
        <div class="modal">
          <div class="modal-icon">⬇</div>
          <h2 class="modal-title">Download Model?</h2>
          <p class="modal-body">
            <strong>{{ confirmModal.model }}</strong><br><br>
            This model will be downloaded and cached in your browser
            (<strong>~{{ confirmModal.sizeMb >= 1024
              ? (confirmModal.sizeMb / 1024).toFixed(1) + " GB"
              : confirmModal.sizeMb + " MB" }}</strong>).
            After the first download it loads instantly from cache.
          </p>
          <div class="modal-actions">
            <button class="action-btn secondary" @click="confirmModal.show = false; settings.model = confirmModal.previousModel">Cancel</button>
            <button class="action-btn primary" @click="confirmDownload">Download & Load</button>
          </div>
        </div>
      </div>

      <!-- Sidebar overlay -->
      <div class="sidebar-overlay" :class="{ open: sidebarOpen }" @click="sidebarOpen = false"></div>

      <!-- Sessions sidebar -->
      <div class="sidebar" :class="{ open: sidebarOpen }">
        <div class="sidebar-header">
          <span class="sidebar-title">Chats</span>
          <button class="new-chat-btn" @click="newChat" :disabled="loading || modelLoading">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Chat
          </button>
        </div>
        <div class="sidebar-list">
          <div v-if="sessions.length === 0" class="sidebar-empty">No saved chats yet</div>
          <div
            v-for="s in sessions"
            :key="s.id"
            class="session-item"
            :class="{ active: s.id === currentSessionId }"
            @click="loadSession(s.id)"
          >
            <div class="session-meta">
              <span class="session-title">{{ s.title }}</span>
              <span class="session-date">{{ formatDate(s.ts) }}</span>
            </div>
            <div class="session-preview">{{ s.preview }}</div>
            <div class="session-model">{{ s.model.split('-').slice(0,2).join('-') }}</div>
            <button class="session-delete" @click.stop="deleteSession(s.id)" title="Delete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="header">
        <div class="header-left">
          <button class="icon-btn" @click="sidebarOpen = !sidebarOpen" title="Chat history">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span class="header-title">WebLLM Chat</span>
        </div>
        <div class="header-actions">
          <button class="icon-btn" @click="newChat" :disabled="loading || modelLoading" title="New chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="icon-btn" @click="$router.push('/settings')" title="Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="status-bar">
        <span class="status-dot" :class="{ active: !modelLoading && !loading }"></span>
        {{ status }}
      </div>

      <div class="messages" ref="messagesContainer">
        <div
          v-for="(message, index) in messages"
          :key="index"
          :class="[
            'message',
            message.role === 'assistant-stream'
              ? 'assistant'
              : message.role
          ]"
        >
          {{ message.content }}
        </div>
      </div>

      <div class="footer-container">
        <div class="toolbar">
          <select
            v-model="settings.model"
            @change="applySettings"
            :disabled="modelLoading || loading"
            class="model-select"
          >
            <option disabled value="">Select Model</option>
            <option v-for="model in models" :key="model" :value="model">
              {{ model }}
            </option>
          </select>

          <button
            class="clear-btn"
            @click="clearConversation"
            :disabled="messages.length === 0"
            title="Clear chat"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
            Clear
          </button>

          <label class="upload-btn" title="Upload file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>{{ uploadedFileName || 'Upload' }}</span>
            <input type="file" accept=".pdf,.txt,.md" @change="uploadFile" style="display:none" />
          </label>

          <!-- Cancel download button — shown only while model is downloading -->
          <button
            v-if="isDownloading"
            class="stop-btn cancel-download-btn"
            @click="cancelDownload"
            title="Cancel download"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Cancel Download
          </button>
        </div>

        <div class="footer">
          <textarea
            v-model="prompt"
            placeholder="Ask something… (Enter to send, Shift+Enter for newline)"
            @keydown.enter.exact.prevent="send"
          ></textarea>
          <!-- Stop generation button — replaces Send while streaming -->
          <button
            v-if="loading"
            class="send-btn stop-gen-btn"
            @click="stopGeneration"
            title="Stop generation"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          </button>

          <!-- Send button — shown when not streaming -->
          <button
            v-else
            class="send-btn"
            @click="send"
            :disabled="modelLoading || !prompt.trim()"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `,

  setup() {
    const prompt = ref("");
    // Use module-level shared refs so Settings page can read/write the same state
    const loading = sharedLoading;
    const modelLoading = sharedModelLoading;
    const status = ref("Loading...");
    const messages = sharedMessages;
    const messagesContainer = ref(null);
    const streamingText = ref("");
    const models = sharedModels;
    const lastAppliedModel = ref("");
    const conversationRestored = ref(false); // guard: restore once per page load
    const uploadedFileName = ref("");
    const currentSessionId = ref("");
    const sessions = sharedSessions;
    const sidebarOpen = sharedSidebarOpen;
    const modelSizes = sharedModelSizes;
    const isDownloading = sharedIsDownloading;
    const CACHED_KEY = "webllm-cached-models";
    // Tracks the model that was cancelled so applySettings won't re-trigger it
    const postCancelModel = ref("");
    const confirmModal = ref({
      show: false,
      model: "",
      previousModel: "",
      sizeMb: 0,
    });

    function getCachedModels() {
      try {
        return JSON.parse(localStorage.getItem(CACHED_KEY) || "[]");
      } catch { return []; }
    }

    function markModelCached(modelId) {
      try {
        const cached = getCachedModels();
        if (!cached.includes(modelId)) {
          cached.push(modelId);
          localStorage.setItem(CACHED_KEY, JSON.stringify(cached));
        }
      } catch {}
    }

    function isModelCached(modelId) {
      return getCachedModels().includes(modelId);
    }
    const settings = sharedSettings;
    // Always use the module-level worker via getWorker() — never snapshot it
    // into a local variable, as fatal restarts replace the module-level ref.

    async function scrollBottom() {
      await nextTick();

      if (messagesContainer.value) {
        messagesContainer.value.scrollTop =
          messagesContainer.value.scrollHeight;
      }
    }

    function addMessage(role, content) {
      messages.value.push({
        role,
        content,
      });

      scrollBottom();
    }

    async function send() {
      const text = prompt.value.trim();

      if (!text || loading.value || modelLoading.value) {
        return;
      }

      // Deduplicate: if the user manually resends the exact same text that is
      // already the last message (e.g. after a tab-resume auto-resume), don't
      // add it again — just trigger generation on the existing message.
      const lastMsg = messages.value[messages.value.length - 1];
      const isDuplicate =
        lastMsg &&
        lastMsg.role === "user" &&
        lastMsg.content === text;

      if (!isDuplicate) {
        addMessage("user", text);
        saveConversation(); // persist user message immediately
      }

      prompt.value = "";
      loading.value = true;

      getWorker().postMessage({
        type: "generate",
        prompt: text,
      });
    }

    async function uploadFile(event) {
      const file = event.target.files[0];

      if (!file) {
        return;
      }

      uploadedFileName.value = file.name;
      status.value = `Reading ${file.name}...`;

      let text = "";

      if (file.type === "application/pdf") {

        const arrayBuffer =
          await file.arrayBuffer();

        const pdf =
          await pdfjsLib.getDocument({
            data: arrayBuffer,
          }).promise;

        for (
          let pageNum = 1; pageNum <= pdf.numPages; pageNum++
        ) {

          const page =
            await pdf.getPage(pageNum);

          const content =
            await page.getTextContent();

          const strings =
            content.items.map(
              item => item.str
            );

          text += strings.join(" ") + "\n";
        }

      } else {

        text = await file.text();
      }

      getWorker().postMessage({
        type: "ingest",
        filename: file.name,
        text,
      });

      // Reset so re-uploading the same file triggers onChange again
      event.target.value = "";
    }

    async function onWorkerMessage(event) {
      const data = event.data;

      if (data.type === "fatal") {

        status.value = data.text;

        loading.value = false;
        modelLoading.value = false;

        // Replace the module-level worker so getWorker() stays consistent
        worker = replaceWorker(onWorkerMessage);

        getWorker().postMessage({
          type: "init"
        });

        return;
      }

      switch (data.type) {
        case "downloading":
          status.value = data.text;
          isDownloading.value = true;
          break;

        case "download-cancelled":
          isDownloading.value = false;
          modelLoading.value = false;
          status.value = "Download cancelled";
          break;

        case "status":
          status.value = data.text;
          // Any non-download status means the download phase is over
          isDownloading.value = false;
          if (
            data.text.includes("Model loaded successfully") ||
            data.text.startsWith("Ready")
          ) {
            modelLoading.value = false;
            // Mark this model as cached so future selects skip the confirmation
            markModelCached(settings.value.model);
            // Restore persisted conversation once per page load only.
            // Subsequent "Ready" status messages (after each generation)
            // must not re-run loadConversation, or it would overwrite
            // messages.value and lose the current live conversation.
            if (!conversationRestored.value) {
              conversationRestored.value = true;
              loadConversation();
            }
          }
          break;
        
        case "thinking":
        
          status.value = "AI is thinking...";
        
          streamingText.value = "";
        
          break;
        
        case "stream":
        
          status.value = "Generating response...";
        
          streamingText.value = data.text;
        
          // live update last assistant message
        
          const last =
            messages.value[messages.value.length - 1];
        
          if (
            last &&
            last.role === "assistant-stream"
          ) {
        
            last.content = data.text;
        
          } else {
        
            messages.value.push({
              role: "assistant-stream",
              content: data.text,
            });
          }
        
          scrollBottom();
        
          break;
                  
        case "token":
          status.value =
            `Generating... ${data.count} tokens`;
          break;
                    
        case "response":
        
          // convert streaming message into final message
        
          const lastMessage =
            messages.value[messages.value.length - 1];
        
          if (
            lastMessage &&
            lastMessage.role === "assistant-stream"
          ) {
        
            lastMessage.role = "assistant";
        
          } else {
        
            addMessage("assistant", data.text);
          }
        
          status.value = "Ready";
        
          loading.value = false;

          saveConversation();
        
          break;

        case "models":
          models.value = data.models;
          if (data.sizes) {
            modelSizes.value = data.sizes;
          }

          if (
            !settings.value.model ||
            !data.models.includes(settings.value.model)
          ) {
            // After a cancel, lastAppliedModel is "" — don't auto-select
            // a new model; leave the dropdown empty so the user chooses.
            if (lastAppliedModel.value) {
              settings.value.model = lastAppliedModel.value;
            } else if (!postCancelModel.value) {
              // First ever launch — auto-select the first model
              settings.value.model = data.models[0];
            }
          }

          if (settings.value.model) {
            await applySettings();
          }
          break;
                    
        case "error":
          addMessage("assistant", "Error: " + data.text);
          loading.value = false;
          break;
      }
    }

    async function applySettings(skipConfirm = false) {

      if (!settings.value.model) {
        return;
      }

      // After a cancel, the reverted model is "" or the last good model.
      // If somehow the cancelled model is still selected, refuse to load it
      // (user must actively re-select it to confirm intent).
      if (
        postCancelModel.value &&
        settings.value.model === postCancelModel.value
      ) {
        postCancelModel.value = "";
        return;
      }
      postCancelModel.value = ""; // clear on any successful apply

      const isNewModel = settings.value.model !== lastAppliedModel.value;

      // Show download confirmation for first-time downloads
      if (isNewModel && !skipConfirm && !isModelCached(settings.value.model)) {
        const sizeMb = modelSizes.value[settings.value.model] || 0;
        // Only ask if we have size data and it's meaningful (>50 MB)
        if (sizeMb > 50) {
          confirmModal.value = {
            show: true,
            model: settings.value.model,
            previousModel: lastAppliedModel.value || settings.value.model,
            sizeMb,
          };
          return; // wait for user to confirm
        }
      }

      // Only apply defaults when model changes;
      // also clear persisted conversation so old history
      // from a different model isn't fed to the new one.
      if (isNewModel) {

        const defaults =
          getModelDefaults(
            settings.value.model
          );

        settings.value = {
          ...settings.value,
          ...defaults,
        };

        if (lastAppliedModel.value !== "") {
          // Only clear if this isn't the very first load
          clearConversation();
        }

        lastAppliedModel.value =
          settings.value.model;
      }
    
      modelLoading.value = true;
    
      saveSettings();
    
      status.value =
        `Loading ${settings.value.model}...`;
    
      getWorker().postMessage({
        type: "set-config",
        config: { ...settings.value },
      });
    }
            
    function confirmDownload() {
      confirmModal.value.show = false;
      markModelCached(settings.value.model);
      applySettings(true); // bypass confirmation this time
    }

    function stopGeneration() {
      if (!loading.value) return;
      getWorker().postMessage({ type: "stop-generation" });
      // UI will update when the worker sends "response" with partial text
    }

    function cancelDownload() {
      if (!isDownloading.value) return;
      isDownloading.value = false;
      modelLoading.value = false;

      // Remember the cancelled model so applySettings won't re-trigger it
      postCancelModel.value = settings.value.model;

      // Revert the select to the last successfully loaded model (or nothing)
      settings.value.model = lastAppliedModel.value;

      // Terminate and replace the worker — the new worker sends "models"
      // on its own startup, which will trigger applySettings; we suppress
      // it for the cancelled model via postCancelModel above.
      worker = replaceWorker(onWorkerMessage);
      status.value = "Download cancelled";

      // Send init so the worker reports its models list and stays ready
      getWorker().postMessage({ type: "init" });
    }

    function saveSettings() {
    
      localStorage.setItem(
        "webllm-settings",
        JSON.stringify(settings.value)
      );
    }
    
    function loadSettings() {
    
      const saved =
        localStorage.getItem("webllm-settings");
    
      if (!saved) {
        return;
      }
    
      try {
    
        const parsed = JSON.parse(saved);
    
        settings.value = {
          ...settings.value,
          ...parsed,
        };
    
      } catch (err) {
    
        console.error(
          "Failed loading settings",
          err
        );
      }
    }

    function resetSettings() {
    
      settings.value = {
        model: models.value[0] || "",
        temperature: 0.3,
        max_tokens: 128,
        contextWindowSize: 2048,
      };
    
      saveSettings();
    }

    // ── Multi-session storage ─────────────────────────────────────────────

    const SESSIONS_INDEX_KEY = "webllm-sessions-index";
    const MAX_PERSISTED_MESSAGES = 40;
    const MAX_SESSIONS = 50;

    function sessionKey(id) { return "webllm-session:" + id; }

    function genId() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function titleFromMessages(msgs) {
      const first = msgs.find(m => m.role === "user");
      if (!first) return "New Chat";
      return first.content.trim().slice(0, 42) + (first.content.length > 42 ? "…" : "");
    }

    function previewFromMessages(msgs) {
      const last = [...msgs].reverse().find(m => m.role === "assistant");
      if (!last) return "";
      return last.content.trim().slice(0, 60) + (last.content.length > 60 ? "…" : "");
    }

    function loadIndex() {
      try {
        const raw = localStorage.getItem(SESSIONS_INDEX_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch { return []; }
    }

    function saveIndex(index) {
      try {
        localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(index));
        sessions.value = index;
      } catch (err) { console.warn("Failed saving session index", err); }
    }

    function formatDate(ts) {
      const d = new Date(ts);
      const now = new Date();
      const diffDays = Math.floor((now - d) / 86400000);
      if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7)  return d.toLocaleDateString([], { weekday: "short" });
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    }

    // Persist current session messages to localStorage
    function saveConversation() {
      if (!currentSessionId.value) return;
      try {
        const toSave = messages.value
          .filter(m => m.role !== "assistant-stream")
          .slice(-MAX_PERSISTED_MESSAGES);
        localStorage.setItem(sessionKey(currentSessionId.value), JSON.stringify(toSave));

        // Update index entry
        const index = loadIndex();
        const idx = index.findIndex(s => s.id === currentSessionId.value);
        const entry = {
          id: currentSessionId.value,
          title: titleFromMessages(toSave),
          preview: previewFromMessages(toSave),
          model: settings.value.model || "",
          ts: Date.now(),
        };
        if (idx >= 0) index[idx] = entry;
        else index.unshift(entry);
        // Keep newest first, cap at MAX_SESSIONS
        index.sort((a, b) => b.ts - a.ts);
        if (index.length > MAX_SESSIONS) index.splice(MAX_SESSIONS);
        saveIndex(index);
      } catch (err) { console.warn("Failed saving session", err); }
    }

    // Load a session by id into the UI and worker
    function loadSession(id) {
      if (id === currentSessionId.value) { sidebarOpen.value = false; return; }
      if (loading.value || modelLoading.value) return;

      // Save current session before switching
      saveConversation();

      try {
        const raw = localStorage.getItem(sessionKey(id));
        const parsed = raw ? JSON.parse(raw) : [];

        currentSessionId.value = id;
        sidebarOpen.value = false;

        const last = parsed[parsed.length - 1];
        const unanswered = last && last.role === "user" ? last.content : null;
        const toRestore = unanswered ? parsed.slice(0, -1) : parsed;

        messages.value = toRestore;
        scrollBottom();
        getWorker().postMessage({
          type: "clear-history",
        });
        const history = toRestore.map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));
        getWorker().postMessage({ type: "restore-history", history });

        if (unanswered) {
          addMessage("user", unanswered);
          saveConversation();
          loading.value = true;
          getWorker().postMessage({ type: "generate", prompt: unanswered });
        }
      } catch (err) { console.warn("Failed loading session", err); }
    }

    // Create a brand-new chat session
    function newChat() {
      if (loading.value || modelLoading.value) return;
      saveConversation();
      currentSessionId.value = genId();
      messages.value = [];
      conversationRestored.value = true; // suppress auto-restore for new chats
      getWorker().postMessage({ type: "clear-history" });
      sidebarOpen.value = false;
    }

    // Delete a session from storage and index
    function deleteSession(id) {
      try {
        localStorage.removeItem(sessionKey(id));
        const index = loadIndex().filter(s => s.id !== id);
        saveIndex(index);
        // If deleting the current session, start a new one
        if (id === currentSessionId.value) newChat();
      } catch (err) { console.warn("Failed deleting session", err); }
    }

    // Legacy single-session key migration (one-time)
    function migrateLegacySession() {
      const legacy = localStorage.getItem("webllm-conversation");
      if (!legacy) return;
      try {
        const parsed = JSON.parse(legacy);
        if (!Array.isArray(parsed) || parsed.length === 0) return;
        const id = genId();
        localStorage.setItem(sessionKey(id), legacy);
        const index = loadIndex();
        index.unshift({
          id, ts: Date.now(),
          title: titleFromMessages(parsed),
          preview: previewFromMessages(parsed),
          model: settings.value.model || "",
        });
        saveIndex(index);
        localStorage.removeItem("webllm-conversation");
      } catch {}
    }

    function loadConversation() {
      migrateLegacySession();
      const index = loadIndex();
      sessions.value = index;

      if (index.length === 0) {
        // First ever launch — create initial session
        currentSessionId.value = genId();
        return;
      }

      // Load the most recent session
      const latest = index[0];
      currentSessionId.value = latest.id;

      try {
        const raw = localStorage.getItem(sessionKey(latest.id));
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed) || parsed.length === 0) return;

        const last = parsed[parsed.length - 1];
        const unanswered = last && last.role === "user" ? last.content : null;
        const toRestore = unanswered ? parsed.slice(0, -1) : parsed;

        messages.value = toRestore;
        scrollBottom();

        const history = toRestore.map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));
        getWorker().postMessage({ type: "restore-history", history });

        if (unanswered) {
          addMessage("user", unanswered);
          saveConversation();
          loading.value = true;
          getWorker().postMessage({ type: "generate", prompt: unanswered });
        }
      } catch (err) { console.warn("Failed loading latest session", err); }
    }

    function clearConversation() {
      if (!currentSessionId.value) return;
      messages.value = [];
      localStorage.removeItem(sessionKey(currentSessionId.value));
      const index = loadIndex().filter(s => s.id !== currentSessionId.value);
      saveIndex(index);
      currentSessionId.value = genId();
      getWorker().postMessage({ type: "clear-history" });
    }

    function getModelDefaults(model) {

      // Micro: SmolLM2-135M, 360M
      if (model.includes("135M") || model.includes("360M")) {
        return { temperature: 0.2, max_tokens: 64,  contextWindowSize: 2048 };
      }

      // ~0.5–0.6B
      if (model.includes("0.5B") || model.includes("0.6B")) {
        return { temperature: 0.2, max_tokens: 128, contextWindowSize: 2048 };
      }

      // ~1–1.1B (TinyLlama, Llama-3.2-1B, SmolLM2-1.7B)
      if (
        model.includes("1.1B") || model.includes("1.7B") ||
        (model.includes("1B") && !model.includes("1.5B"))
      ) {
        return { temperature: 0.4, max_tokens: 256, contextWindowSize: 4096 };
      }

      // ~1.5–1.6B
      if (model.includes("1.5B") || model.includes("1.6b") || model.includes("1_6b")) {
        return { temperature: 0.4, max_tokens: 512, contextWindowSize: 4096 };
      }

      // ~2B (Gemma-2-2B)
      if (model.includes("2b") || model.includes("2B")) {
        return { temperature: 0.6, max_tokens: 512, contextWindowSize: 4096 };
      }

      // ~3–4B
      if (model.includes("3B") || model.includes("4B") || model.includes("4b")) {
        return { temperature: 0.7, max_tokens: 768, contextWindowSize: 8192 };
      }

      // ~3.8B (Phi-3.5-mini)
      if (model.includes("mini")) {
        return { temperature: 0.7, max_tokens: 768, contextWindowSize: 8192 };
      }

      // ~7–9B large models
      if (model.includes("7B") || model.includes("8B") || model.includes("9b")) {
        return { temperature: 0.7, max_tokens: 1024, contextWindowSize: 8192 };
      }

      // Unknown / fallback
      return { temperature: 0.7, max_tokens: 768, contextWindowSize: 8192 };
    }
        
    // Expose functions to Settings page
    sharedApplySettings    = applySettings;
    sharedResetSettings    = resetSettings;
    sharedClearConversation = clearConversation;
    sharedNewChat          = newChat;
    sharedLoadSession      = loadSession;
    sharedDeleteSession    = deleteSession;

    getWorker().onmessage = onWorkerMessage;

    onMounted(() => {
    
      loadSettings();
      getWorker().postMessage({
        type: "init",
      });
      // Restore conversation after a short tick so the worker has
      // processed "init" and sent back "models" before we send history.
      // The actual restore-history is sent once the model finishes loading,
      // triggered from the "models" handler via loadConversation().
    });
        
    return {
      prompt,
      loading,
      modelLoading,
      status,
      messages,
      messagesContainer,
      send,
      uploadFile,
      uploadedFileName,
      models,
      settings,
      applySettings,
      saveSettings,
      loadSettings,
      resetSettings,
      clearConversation,
      sessions,
      currentSessionId,
      sidebarOpen,
      newChat,
      loadSession,
      deleteSession,
      formatDate,
      confirmModal,
      confirmDownload,
      modelSizes,
      isDownloading,
      stopGeneration,
      cancelDownload,
    };
  },
};

const Settings = {
  template: `
    <div class="settings-page">
      <div class="settings-header">
        <button class="back-btn" @click="$router.push('/')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
        <h1 class="settings-title">Settings</h1>
      </div>

      <div class="settings-body">

        <section class="settings-section">
          <h2 class="section-label">Model</h2>
          <select v-model="settings.model" @change="applySettings" :disabled="modelLoading || loading" class="settings-select">
            <option disabled value="">Select Model</option>
            <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
          </select>
          <p class="section-hint">Changing the model will clear the current conversation.</p>
        </section>

        <section class="settings-section">
          <h2 class="section-label">Generation</h2>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">Temperature</span>
              <span class="setting-desc">Creativity vs consistency. Lower = more focused.</span>
            </div>
            <div class="setting-control">
              <input type="range" min="0" max="2" step="0.05" v-model.number="settings.temperature" class="slider" />
              <span class="setting-value">{{ settings.temperature.toFixed(2) }}</span>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">Max Tokens</span>
              <span class="setting-desc">Maximum length of each response.</span>
            </div>
            <div class="setting-control">
              <input type="range" min="16" max="2048" step="16" v-model.number="settings.max_tokens" class="slider" />
              <span class="setting-value">{{ settings.max_tokens }}</span>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">Context Window</span>
              <span class="setting-desc">Tokens of conversation history the model sees.</span>
            </div>
            <div class="setting-control">
              <input type="range" min="512" max="8192" step="512" v-model.number="settings.contextWindowSize" class="slider" />
              <span class="setting-value">{{ settings.contextWindowSize }}</span>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h2 class="section-label">Actions</h2>
          <div class="settings-actions">
            <button class="action-btn primary" @click="applySettings" :disabled="modelLoading || loading">
              Apply Settings
            </button>
            <button class="action-btn secondary" @click="resetSettings">
              Reset Defaults
            </button>
            <button class="action-btn danger" @click="clearConversation" :disabled="messages.length === 0">
              Clear Conversation
            </button>
          </div>
        </section>

      </div>
    </div>
  `,

  setup() {
    return {
      settings: sharedSettings,
      models: sharedModels,
      loading: sharedLoading,
      modelLoading: sharedModelLoading,
      messages: sharedMessages,
      applySettings: sharedApplySettings,
      resetSettings: sharedResetSettings,
      clearConversation: sharedClearConversation,
      newChat: sharedNewChat,
    };
  },
};

const routes = [
  { path: "/",         component: Home     },
  { path: "/settings", component: Settings },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

createApp({
    template: `<router-view />`
  })
  .use(router)
  .mount("#app");
