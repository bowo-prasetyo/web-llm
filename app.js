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

const Home = {
  template: `
    <div class="container">
      <div class="header">
        WebLLM Browser Chat
      </div>

      <div class="status">
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
    >
      <option disabled value="">
        Select Model
      </option>
  
      <option
        v-for="model in models"
        :key="model"
        :value="model"
      >
        {{ model }}
      </option>
    </select>
    <div class="settings-panel">
    
      <label>
        Temperature
    
        <input
          type="number"
          step="0.1"
          min="0"
          max="2"
          v-model.number="settings.temperature"
        />
      </label>
    
      <label>
        Max Tokens
    
        <input
          type="number"
          min="16"
          max="2048"
          step="16"
          v-model.number="settings.max_tokens"
        />
      </label>
    
      <label>
        Context Window
    
        <input
          type="number"
          min="512"
          max="8192"
          step="512"
          v-model.number="settings.contextWindowSize"
        />
      </label>
    
    </div>
    <button
      @click="applySettings"
      :disabled="modelLoading || loading"
    >
      Apply Settings
    </button>
    <button
      @click="resetSettings"
    >
      Reset Defaults
    </button>
    <button
      @click="clearConversation"
      :disabled="messages.length === 0"
    >
      Clear Chat
    </button>
    <input
      type="file"
      accept=".pdf,.txt,.md"
      @change="uploadFile"
    />
  </div>

  <div class="footer">
        <textarea
          v-model="prompt"
          placeholder="Ask something..."
          @keydown.enter.exact.prevent="send"
        ></textarea>

        <button
          @click="send"
          :disabled="
            loading ||
            modelLoading ||
            !prompt.trim()
          "
        >
          Send
        </button>
      </div>
    </div>
          </div>

  `,

  setup() {
    const prompt = ref("");
    const loading = ref(false);
    const modelLoading = ref(false);
    const status = ref("Loading...");
    const messages = ref([]);
    const messagesContainer = ref(null);
    const streamingText = ref("");
    const models = ref([]);
    const lastAppliedModel = ref("");
    const settings = ref({
      model: "",
      temperature: 0.7,
      max_tokens: 256,
      contextWindowSize: 4096,
    });
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

      addMessage("user", text);

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
            // Restore persisted conversation into the UI and worker
            // now that the model is loaded and ready to receive history.
            loadConversation();
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
        messages.value = parsed;
        scrollBottom();
        // Restore SESSION_HISTORY in the worker so it has context
        const history = parsed.map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));
        getWorker().postMessage({
          type: "restore-history",
          history,
        });
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

const routes = [{
  path: "/",
  component: Home,
}, ];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

createApp({
    template: `<router-view />`
  })
  .use(router)
  .mount("#app");
