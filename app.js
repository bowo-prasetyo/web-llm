const { createApp, ref, onMounted, nextTick } = Vue;
const { createRouter, createWebHashHistory } = VueRouter;

const worker = new Worker("./worker.js", {
  type: "module",
});

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
          :class="['message', message.role]"
        >
          {{ message.content }}
        </div>
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
  `,

  setup() {
    const prompt = ref("");
    const loading = ref(false);
    const status = ref("Loading...");
    const messages = ref([]);
    const messagesContainer = ref(null);

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

    worker.onmessage = (event) => {
      const data = event.data;

      switch (data.type) {
        case "status":
          status.value = data.text;
          break;

        case "response":
          addMessage("assistant", data.text);
          loading.value = false;
          break;

        case "error":
          addMessage("assistant", "Error: " + data.text);
          loading.value = false;
          break;
      }
    };

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
    };
  },
};

const routes = [
  {
    path: "/",
    component: Home,
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

createApp({})
  .use(router)
  .mount("#app");
