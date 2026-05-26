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
// These are populated once Home mounts; Settings reads them directly.
let sharedApplySettings   = () => {};
let sharedResetSettings   = () => {};
let sharedClearConversation = () => {};

const Home = {
  template: `
    <div class="container">

      <div class="header">
        <span class="header-title">WebLLM Chat</span>
        <div class="header-actions">
          <button class="icon-btn" @click="$router.push('/settings')" title="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
        </div>

        <div class="footer">
          <textarea
            v-model="prompt"
            placeholder="Ask something… (Enter to send, Shift+Enter for newline)"
            @keydown.enter.exact.prevent="send"
          ></textarea>
          <button
            class="send-btn"
            @click="send"
            :disabled="loading || modelLoading || !prompt.trim()"
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
        case "status":
          status.value = data.text;
          if (
            data.text.includes("Model loaded successfully") ||
            data.text.startsWith("Ready")
          ) {
            modelLoading.value = false;
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
        
          if (
            !settings.value.model ||
            !data.models.includes(
              settings.value.model
            )
          ) {        
            settings.value.model =
              data.models[0];
          }
            
          await applySettings();
          break;
                    
        case "error":
          addMessage("assistant", "Error: " + data.text);
          loading.value = false;
          break;
      }
    }

    async function applySettings() {
    
      if (!settings.value.model) {
        return;
      }
    
      // Only apply defaults when model changes;
      // also clear persisted conversation so old history
      // from a different model isn't fed to the new one.
      if (
        settings.value.model !==
        lastAppliedModel.value
      ) {
    
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

    // ── Conversation persistence ──────────────────────────────────────────

    const CONVERSATION_KEY = "webllm-conversation";
    const MAX_PERSISTED_MESSAGES = 40;

    function saveConversation() {
      try {
        // Only persist finalised messages (not mid-stream assistant-stream)
        const toSave = messages.value
          .filter(m => m.role !== "assistant-stream")
          .slice(-MAX_PERSISTED_MESSAGES);
        localStorage.setItem(
          CONVERSATION_KEY,
          JSON.stringify(toSave)
        );
      } catch (err) {
        console.warn("Failed saving conversation", err);
      }
    }

    function loadConversation() {
      try {
        const raw = localStorage.getItem(CONVERSATION_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return;

        // Detect an unanswered user message: last saved message is role "user",
        // meaning the tab suspended after the user sent but before the reply arrived.
        const last = parsed[parsed.length - 1];
        const unanswered = last && last.role === "user" ? last.content : null;

        // Restore history excluding the unanswered message (it will be re-sent below)
        const toRestore = unanswered ? parsed.slice(0, -1) : parsed;
        messages.value = toRestore;
        scrollBottom();

        const history = toRestore.map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));
        getWorker().postMessage({
          type: "restore-history",
          history,
        });

        // Auto-resume the unanswered question so the user doesn't have to resend it
        if (unanswered) {
          addMessage("user", unanswered);
          saveConversation();
          loading.value = true;
          getWorker().postMessage({
            type: "generate",
            prompt: unanswered,
          });
        }
      } catch (err) {
        console.warn("Failed loading conversation", err);
      }
    }

    function clearConversation() {
      messages.value = [];
      localStorage.removeItem(CONVERSATION_KEY);
      getWorker().postMessage({ type: "clear-history" });
    }

    function getModelDefaults(model) {

      // ~0.5B — ultra-lightweight
      if (model.includes("0.5B")) {
        return {
          temperature: 0.2,
          max_tokens: 128,
          contextWindowSize: 2048,
        };
      }

      // ~1B
      if (model.includes("1B")) {
        return {
          temperature: 0.4,
          max_tokens: 256,
          contextWindowSize: 4096,
        };
      }

      // ~1.5B (includes Coder-1.5B)
      if (model.includes("1.5B")) {
        return {
          temperature: 0.4,
          max_tokens: 512,
          contextWindowSize: 4096,
        };
      }

      // ~2B (Gemma-2-2B)
      if (model.includes("2b") || model.includes("2B")) {
        return {
          temperature: 0.6,
          max_tokens: 512,
          contextWindowSize: 4096,
        };
      }

      // ~3B (Qwen2.5-3B, Llama-3.1-3B)
      if (model.includes("3B")) {
        return {
          temperature: 0.7,
          max_tokens: 768,
          contextWindowSize: 8192,
        };
      }

      // ~3.8B (Phi-3.5-mini) and unknown — most capable defaults
      return {
        temperature: 0.7,
        max_tokens: 768,
        contextWindowSize: 8192,
      };
    }
        
    // Expose functions to Settings page
    sharedApplySettings    = applySettings;
    sharedResetSettings    = resetSettings;
    sharedClearConversation = clearConversation;

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
    template: \`<router-view />\`
  })
  .use(router)
  .mount("#app");
