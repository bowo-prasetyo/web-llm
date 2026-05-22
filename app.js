const { createApp, ref, onMounted, nextTick } = Vue;
const { createRouter, createWebHashHistory } = VueRouter;

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
          :class="['message', message.role]"
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
    const worker = getWorker();

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
      let pageNum = 1;
      pageNum <= pdf.numPages;
      pageNum++
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
      uploadFile,
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

createApp({
  template: `<router-view />`
})
  .use(router)
  .mount("#app");
