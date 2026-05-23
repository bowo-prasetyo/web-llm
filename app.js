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
          :disabled="loading || !prompt.trim()"
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
    const status = ref("Loading...");
    const messages = ref([]);
    const messagesContainer = ref(null);
    const streamingText = ref("");
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

      if (!text || loading.value) {
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
                
        case "error":
          addMessage("assistant", "Error: " + data.text);
          loading.value = false;
          break;
      }
    }
    
    worker.onmessage = onWorkerMessage;

    onMounted(() => {
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
