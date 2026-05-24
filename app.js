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
          @keydown.enter.prevent="send"
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
    let worker = getWorker();

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

      worker.postMessage({
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

      worker.postMessage({
        type: "ingest",
        filename: file.name,
        text,
      });
    }

    async function onWorkerMessage(event) {
      const data = event.data;

      if (data.type === "fatal") {

        status.value = data.text;

        loading.value = false;

        worker.terminate();

        worker = new Worker("./worker.js", {
          type: "module"
        });

        worker.onmessage = onWorkerMessage;

        worker.postMessage({
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
        
          break;

        case "models":
          models.value = data.models;
        
          if (!selectedModel.value &&
              data.models.length) {
        
              if (!settings.value.model) {
              
                settings.value.model =
                  data.models[0];
              }
          }          
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
    
      // Only apply defaults
      // when model changes
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
    
        lastAppliedModel.value =
          settings.value.model;
      }
    
      modelLoading.value = true;
    
      saveSettings();
    
      status.value =
        `Loading ${settings.value.model}...`;
    
      worker.postMessage({
        type: "set-config",
        config: settings.value,
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

    function getModelDefaults(model) {
    
      if (model.includes("0.5B")) {
    
        return {
          temperature: 0.2,
          max_tokens: 64,
          contextWindowSize: 2048,
        };
      }
    
      if (model.includes("1.5B")) {
    
        return {
          temperature: 0.3,
          max_tokens: 128,
          contextWindowSize: 4096,
        };
      }
    
      return {
        temperature: 0.7,
        max_tokens: 256,
        contextWindowSize: 4096,
      };
    }
        
    worker.onmessage = onWorkerMessage;

    onMounted(() => {
      loadSettings();
      
      worker.postMessage({
        type: "init",
      });
    });
  
    return {
      prompt,
      loading,
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
