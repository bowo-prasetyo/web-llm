import {
  PERSONAS,
  DEFAULT_PERSONA_ID,
  DEFAULT_PERSONA_PROMPT,
  getPersona,
} from "./personas.js";
import { renderMarkdown, splitThinking, stripThinking } from "./markdown.js";

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

// The strict prompt used as the default before personas existed. Kept only
// to recognise settings that still hold it unedited (see migrateSettings).
const LEGACY_DEFAULT_SYSTEM_PROMPT = "You are a concise, factually accurate AI assistant.\n\nRules you must never break:\n- Never contradict established science, physics, or basic facts (e.g. humans have mass).\n- NEVER guess or invent an answer. If you are not certain, respond only with \"I\'m not sure.\" Do not elaborate.\n- Do not add philosophical or metaphysical tangents to simple factual questions.\n- Do not contradict yourself within the same conversation.\n- Keep answers short and direct unless the user asks for detail.\n- Never redefine ordinary words in unusual ways to rescue a wrong answer.\n- If the user states a correct fact, accept it. Do not contradict correct information the user provides.\n- Only correct the user if you are certain they are factually wrong.";

// ── Per-model generation defaults ─────────────────────────────────────────
// Max Tokens is generous enough for a full answer or code block in one go
// (replies are no longer stitched together from several continuations), and
// the tiniest models get a little more temperature so similar questions don't
// get word-for-word identical replies.
function modelDefaults(model) {
  const penalties = {
    top_p: 1.0,
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
    repetition_penalty: 1.0,
  };
  const m = model || "";
  const d = (temperature, max_tokens, contextWindowSize) =>
    ({ ...penalties, temperature, max_tokens, contextWindowSize });

  if (m.includes("135M") || m.includes("360M")) return d(0.3, 256, 2048);
  if (m.includes("0.5B") || m.includes("0.6B")) return d(0.4, 512, 2048);
  if (m.includes("1.1B") || m.includes("1.7B") || (m.includes("1B") && !m.includes("1.5B"))) return d(0.4, 512, 4096);
  if (m.includes("1.5B") || m.includes("1.6b") || m.includes("1_6b")) return d(0.4, 768, 4096);
  if (m.includes("2b") || m.includes("2B")) return d(0.6, 768, 4096);
  if (m.includes("3B") || m.includes("4B") || m.includes("4b")) return d(0.7, 1024, 8192);
  if (m.includes("mini")) return d(0.7, 1024, 8192);
  if (m.includes("7B") || m.includes("8B") || m.includes("9b")) return d(0.7, 1024, 8192);
  return d(0.7, 1024, 8192);
}

// The defaults before settings version 2, only to recognise unchanged values.
function legacyModelDefaults(model) {
  const m = model || "";
  if (m.includes("135M") || m.includes("360M")) return { temperature: 0.2, max_tokens: 64 };
  if (m.includes("0.5B") || m.includes("0.6B")) return { temperature: 0.2, max_tokens: 128 };
  if (m.includes("1.1B") || m.includes("1.7B") || (m.includes("1B") && !m.includes("1.5B"))) return { temperature: 0.4, max_tokens: 256 };
  if (m.includes("1.5B") || m.includes("1.6b") || m.includes("1_6b")) return { temperature: 0.4, max_tokens: 512 };
  if (m.includes("2b") || m.includes("2B")) return { temperature: 0.6, max_tokens: 512 };
  if (m.includes("3B") || m.includes("4B") || m.includes("4b") || m.includes("mini")) return { temperature: 0.7, max_tokens: 768 };
  if (m.includes("7B") || m.includes("8B") || m.includes("9b")) return { temperature: 0.7, max_tokens: 1024 };
  return { temperature: 0.7, max_tokens: 768 };
}

const SETTINGS_VERSION = 2;

// Bring settings saved before personas existed up to date, in place.
// Someone who edited the old system prompt keeps it as their Custom persona
// (and as their default, so nothing changes for them). Everyone else moves
// to the Friendly persona.
function migrateSettings(saved) {
  if (!saved || typeof saved !== "object") return saved;
  if (!("defaultPersona" in saved)) {
    const prompt = (saved.system_prompt || "").trim();
    if (prompt && prompt !== LEGACY_DEFAULT_SYSTEM_PROMPT.trim()) {
      saved.defaultPersona = "custom";
    } else {
      saved.defaultPersona = DEFAULT_PERSONA_ID;
      saved.system_prompt = DEFAULT_PERSONA_PROMPT;
    }
  }
  if (!PERSONAS.some(p => p.id === saved.defaultPersona)) {
    saved.defaultPersona = DEFAULT_PERSONA_ID;
  }
  // Version 2 raised the default Max Tokens (and the tiniest models'
  // temperature). Upgrade values that are still the old defaults; values
  // the user changed are kept.
  if ((saved.settingsVersion || 1) < 2 && saved.model) {
    const old = legacyModelDefaults(saved.model);
    const now = modelDefaults(saved.model);
    if (saved.max_tokens === old.max_tokens) saved.max_tokens = now.max_tokens;
    if (saved.temperature === old.temperature) saved.temperature = now.temperature;
  }
  saved.settingsVersion = SETTINGS_VERSION;
  return saved;
}

// ── Shared reactive state (accessible to both Home and Settings) ──────────
const { ref: vRef, reactive } = Vue;
const sharedSettings  = vRef({
  model: "",
  temperature: 0.7,
  max_tokens: 256,
  contextWindowSize: 4096,
  top_p: 1.0,
  frequency_penalty: 0.0,
  presence_penalty: 0.0,
  repetition_penalty: 1.0,
  maxFileSizeMB: 50,
  settingsVersion: SETTINGS_VERSION,
  // Persona used for new chats; each chat remembers its own persona.
  defaultPersona: DEFAULT_PERSONA_ID,
  // Prompt for the "Custom" persona. Starts as a copy of the default.
  system_prompt: DEFAULT_PERSONA_PROMPT,
});
const sharedModels    = vRef([]);
const sharedModelGroups = vRef([]); // populated after Home setup() runs
const sharedLoading   = vRef(false);
const sharedModelLoading = vRef(false);
const sharedMessages  = vRef([]);
const sharedSessions  = vRef([]);   // [{id, title, model, ts, preview}]
const sharedSidebarOpen = vRef(false);
const sharedModelSizes  = vRef({});  // {modelId: sizeInMB}
const sharedIsDownloading = vRef(false);  // true while model weights are fetching
const sharedIndexedDocs = vRef([]);   // [{filename, chunks}]
const sharedIngestState = vRef(null); // {filename, current, total} | null
const sharedWebgpuError = vRef(false); // true when WebGPU is unavailable

// ── GPU / model health ────────────────────────────────────────────────────
// Some GPUs compute 16-bit math wrongly, so q4f16 models reply with junk
// ("outer outer outer…"). Each model gets a quick check after its first
// load on this device; results are remembered here.
const HEALTH_KEY = "webllm-model-health";
const sharedAltModels   = vRef([]);   // q4f32 versions shown when 16-bit fails
const sharedDiagnostics = vRef(null); // {webllmVersion, webgpu, gpu, shaderF16}
const sharedModelHealth = vRef(loadModelHealth()); // {modelId: {ok, reason, sample, ts}}

function loadModelHealth() {
  try { return JSON.parse(localStorage.getItem(HEALTH_KEY) || "{}") || {}; }
  catch { return {}; }
}
function saveModelHealth() {
  try { localStorage.setItem(HEALTH_KEY, JSON.stringify(sharedModelHealth.value)); } catch {}
}

function isF16Model(id) { return /q4f16|q0f16/.test(id || ""); }

// True when 16-bit models are known not to work here: no shader-f16
// support, or a q4f16 model failed its check on this device.
function f16Problem() {
  if (sharedDiagnostics.value && sharedDiagnostics.value.shaderF16 === false) return true;
  return Object.entries(sharedModelHealth.value)
    .some(([id, h]) => isF16Model(id) && h && h.ok === false);
}

// Text for a model in the pickers, with a warning where it won't work well.
function modelOptionLabel(id) {
  const h = sharedModelHealth.value[id];
  if (h && h.ok === false) {
    return `${id}  ⚠ ${h.reason === "no-f16" ? "needs 16-bit GPU support" : "garbled on this GPU"}`;
  }
  if (isF16Model(id) && f16Problem()) return `${id}  ⚠ 16-bit, may not work here`;
  return id;
}
// These are populated once Home mounts; Settings reads them directly.
let sharedApplySettings   = () => {};
let sharedResetSettings   = () => {};
let sharedClearConversation = () => {};
let sharedNewChat          = () => {};
let sharedLoadSession      = (_id) => {};
let sharedDeleteSession    = (_id) => {};
let sharedExportSettings   = () => {};
let sharedImportSettings   = () => {};
let sharedExportSessions   = () => {};
let sharedImportSessions   = () => {};
let sharedForgetModelHealth = () => {};

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

      <!-- Model doesn't work on this GPU (failed check or collapsed reply) -->
      <div class="modal-overlay" v-if="healthModal.show" @click.self="keepModelAnyway">
        <div class="modal" role="alertdialog" aria-labelledby="health-title">
          <div class="modal-icon">⚠</div>
          <h2 class="modal-title" id="health-title">
            {{ healthModal.reason === "degenerate" ? "This model may not work on your GPU" : "This model doesn't work on your GPU" }}
          </h2>
          <p class="modal-body">
            <strong>{{ healthModal.model }}</strong>
            <template v-if="healthModal.reason === 'no-f16'"> needs 16-bit GPU support, which this browser doesn't offer.</template>
            <template v-else-if="healthModal.reason === 'degenerate'"> just gave a reply that collapsed into repeated words.</template>
            <template v-else> gave garbled text in a quick check<span v-if="healthModal.sample">: <em>“{{ healthModal.sample }}…”</em></span>.</template>
            <br><br>
            This usually means the GPU does 16-bit math incorrectly. Models marked <strong>q4f32</strong> avoid it.
          </p>
          <p v-if="healthModal.suggestion" class="modal-body health-suggestion">
            Suggested: <strong>{{ healthModal.suggestion }}</strong>
            <span v-if="modelSizes[healthModal.suggestion]">
              (~{{ modelSizes[healthModal.suggestion] >= 1024
                ? (modelSizes[healthModal.suggestion] / 1024).toFixed(1) + " GB"
                : modelSizes[healthModal.suggestion] + " MB" }})
            </span>
          </p>
          <div class="modal-actions">
            <button class="action-btn secondary" @click="keepModelAnyway">Keep this model</button>
            <button v-if="healthModal.suggestion" class="action-btn primary" @click="switchToSuggestion">Switch model</button>
          </div>
        </div>
      </div>

      <!-- WebGPU error screen — full overlay, shown when GPU is incompatible -->
      <div v-if="webgpuError" class="webgpu-error-overlay">
        <div class="webgpu-error-card">
          <div class="webgpu-error-icon">⚠</div>
          <h2 class="webgpu-error-title">WebGPU Not Available</h2>
          <p class="webgpu-error-body">
            Your browser or device doesn't support WebGPU, which is required to run AI models locally.
          </p>
          <div class="webgpu-error-steps">
            <div class="webgpu-step">
              <span class="step-num">1</span>
              <span>Make sure <strong>Hardware Acceleration</strong> is enabled in your browser settings</span>
            </div>
            <div class="webgpu-step">
              <span class="step-num">2</span>
              <span>On Chrome Android, visit <code>chrome://flags</code> and enable <strong>WebGPU</strong></span>
            </div>
            <div class="webgpu-step">
              <span class="step-num">3</span>
              <span>Try <strong>Chrome 113+</strong> or <strong>Edge</strong> on desktop for best support</span>
            </div>
            <div class="webgpu-step">
              <span class="step-num">4</span>
              <span>Check your GPU compatibility at <a href="https://webgpureport.org" target="_blank" rel="noopener">webgpureport.org</a></span>
            </div>
          </div>
          <button class="action-btn primary" style="margin-top:20px;width:100%" @click="webgpuError = false; applySettings()">
            Try Again
          </button>
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

        <!-- Search box -->
        <div class="sidebar-search">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            class="search-input"
            type="text"
            placeholder="Search chats…"
            v-model="searchQuery"
            @input="onSearchInput"
          />
          <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''; searchResults = []" title="Clear">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Search results -->
        <div v-if="searchQuery" class="sidebar-list">
          <div v-if="searchResults.length === 0 && !searchPending" class="sidebar-empty">
            No results for "{{ searchQuery }}"
          </div>
          <div v-if="searchPending" class="sidebar-empty">Searching…</div>
          <template v-for="r in searchResults" :key="r.session.id">
            <div
              class="session-item search-result-item"
              :class="{ active: r.session.id === currentSessionId }"
              @click="loadSession(r.session.id)"
            >
              <div class="session-meta">
                <span class="session-title">{{ r.session.id === currentSessionId ? "Current chat" : r.session.title }}</span>
                <span class="session-date">{{ formatDate(r.session.ts) }}</span>
              </div>
              <!-- Show up to 3 matching excerpts per session -->
              <div
                v-for="(match, mi) in r.matches.slice(0, 3)"
                :key="mi"
                class="search-match"
              >
                <span class="match-role">{{ match.role === "user" ? "You" : "AI" }}</span>
                <span class="match-snippet" v-html="match.highlighted"></span>
              </div>
              <div v-if="r.matches.length > 3" class="search-more">+{{ r.matches.length - 3 }} more matches</div>
            </div>
          </template>
        </div>

        <!-- Normal sessions list -->
        <div v-else class="sidebar-list">
          <div v-if="sessions.length === 0" class="sidebar-empty">No saved chats yet</div>
          <div
            v-for="s in sessions"
            :key="s.id"
            class="session-item"
            :class="{ active: s.id === currentSessionId }"
            @click="loadSession(s.id)"
          >
            <div class="session-meta">
              <span class="session-title"><span v-if="s.persona" class="session-persona" :title="personaName(s.persona)">{{ personaIcon(s.persona) }}</span>{{ s.title }}</span>
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

      <div class="messages" ref="messagesContainer" @click="onMessagesClick">
        <!-- Welcome screen for an empty chat: pick a persona, try a starter -->
        <div v-if="messages.length === 0" class="welcome">
          <h2 class="welcome-title">What would you like to chat about?</h2>
          <p class="welcome-sub">Pick a persona for this chat. You can switch at any time.</p>
          <div class="persona-grid" role="radiogroup" aria-label="Persona">
            <button
              v-for="p in personas"
              :key="p.id"
              type="button"
              role="radio"
              :aria-checked="p.id === currentPersonaId"
              class="persona-card"
              :class="{ active: p.id === currentPersonaId }"
              @click="setPersona(p.id)"
            >
              <span class="persona-icon" aria-hidden="true">{{ p.icon }}</span>
              <span class="persona-name">{{ p.name }}</span>
              <span class="persona-tagline">{{ p.tagline }}</span>
            </button>
          </div>
          <div v-if="currentPersona.starters.length" class="starter-list">
            <button
              v-for="s in currentPersona.starters"
              :key="s"
              type="button"
              class="starter-chip"
              @click="useStarter(s)"
            >{{ s }}</button>
          </div>
          <p class="welcome-note">
            Runs privately in your browser. AI can make mistakes, so double-check important facts.
          </p>
        </div>
        <div
          v-for="item in viewMessages"
          :key="item.index"
          :class="[
            'message',
            item.message.role === 'user' ? 'user' : 'assistant',
            { streaming: item.streaming, error: item.message.isError }
          ]"
        >
          <template v-if="item.message.role === 'user'">{{ item.message.content }}</template>
          <template v-else>
            <!-- Reasoning of thinking models: live while streaming, then folded -->
            <details
              v-if="item.thinking !== null"
              class="thinking"
              :open="item.streaming && !item.thinkingDone"
            >
              <summary>
                <span v-if="item.thinkingDone">Thought process</span>
                <span v-else class="thinking-live">Thinking…</span>
              </summary>
              <div class="md thinking-body" v-html="item.thinkingHtml"></div>
            </details>
            <div v-if="item.answerHtml" class="md" v-html="item.answerHtml"></div>
            <p v-if="!item.streaming && item.message.notice === 'loop'" class="msg-note">
              The reply started repeating itself, so it was stopped there.
            </p>
            <p v-if="!item.streaming && item.message.notice === 'continue-failed'" class="msg-note">
              Couldn't continue: the model didn't add anything new.
            </p>
            <p v-if="!item.streaming && item.message.cutOff" class="msg-note">
              {{ item.message.cutOff === "time"
                ? "Cut off at the time limit."
                : "Cut off at the Max Tokens limit (" + settings.max_tokens + ")." }}
              <span v-if="item.isLast">Press Continue for the rest.</span>
            </p>
            <div v-if="!item.streaming" class="msg-actions">
              <button
                type="button"
                class="msg-action"
                @click="copyMessage(item)"
                :title="copiedIndex === item.index ? 'Copied' : 'Copy reply'"
              >
                <svg v-if="copiedIndex !== item.index" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {{ copiedIndex === item.index ? "Copied" : "Copy" }}
              </button>
              <button
                v-if="item.isLast && item.message.cutOff && !item.message.isError"
                type="button"
                class="msg-action msg-action-primary"
                @click="continueReply"
                :disabled="loading || modelLoading"
                title="Continue this reply"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
                Continue
              </button>
              <button
                v-if="item.isLast"
                type="button"
                class="msg-action"
                @click="regenerate"
                :disabled="loading || modelLoading"
                :title="item.message.isError ? 'Try again' : 'Regenerate reply'"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                {{ item.message.isError ? "Retry" : "Regenerate" }}
              </button>
            </div>
          </template>
        </div>
      </div>

      <!-- RAG context indicator — shown above footer when RAG was used -->
      <div v-if="ragSources.length > 0" class="rag-banner">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Answer informed by: <span class="rag-sources">{{ ragSources.join(", ") }}</span>
        <button class="rag-dismiss" @click="ragSources = []">×</button>
      </div>

      <!-- Ingest progress bar -->
      <div v-if="ingestState" class="ingest-progress-bar">
        <div class="ingest-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Indexing {{ ingestState.filename }} — chunk {{ ingestState.current }} / {{ ingestState.total }}
        </div>
        <div class="ingest-track">
          <div class="ingest-fill" :style="{ width: Math.round(ingestState.current / ingestState.total * 100) + '%' }"></div>
        </div>
      </div>

      <!-- Document manager panel -->
      <div v-if="docsOpen" class="docs-panel">
        <div class="docs-panel-header">
          <span class="docs-panel-title">Indexed Documents</span>
          <div class="docs-panel-actions">
            <button v-if="indexedDocuments.length > 0" class="action-btn danger" style="font-size:11px;padding:4px 9px" @click="clearDocuments">Clear All</button>
            <button class="icon-btn" @click="docsOpen = false" style="width:26px;height:26px">×</button>
          </div>
        </div>
        <div v-if="indexedDocuments.length === 0" class="docs-empty">
          No documents indexed yet. Upload a file to enable document-aware answers.
        </div>
        <div v-for="doc in indexedDocuments" :key="doc.filename" class="doc-item">
          <div class="doc-info">
            <span class="doc-name">{{ doc.filename }}</span>
            <span class="doc-chunks">{{ doc.chunks }} chunks</span>
          </div>
          <button class="doc-delete" @click="deleteDocument(doc.filename)" title="Remove">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div class="footer-container">
        <div class="toolbar">
          <select
            :value="currentPersonaId"
            @change="setPersona($event.target.value)"
            class="persona-select"
            title="Persona for this chat"
            aria-label="Persona for this chat"
          >
            <option v-for="p in personas" :key="p.id" :value="p.id">{{ p.icon }} {{ p.name }}</option>
          </select>
          <select
            v-model="settings.model"
            @change="applySettings"
            :disabled="modelLoading || loading"
            class="model-select"
          >
            <option disabled value="">Select Model</option>
            <template v-for="group in modelGroups" :key="group.label">
              <optgroup :label="group.label">
                <option v-for="model in group.models" :key="model" :value="model">
                  {{ modelOptionLabel(model) }}
                </option>
              </optgroup>
            </template>
          </select>

          <!-- Documents button — badge shows indexed doc count -->
          <button
            class="clear-btn docs-btn"
            :class="{ 'has-docs': indexedDocuments.length > 0 }"
            @click="docsOpen = !docsOpen"
            title="Indexed documents"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Docs<span v-if="indexedDocuments.length > 0" class="doc-badge">{{ indexedDocuments.length }}</span>
          </button>

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
            ref="promptInput"
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
    const promptInput = ref(null);
    // Persona of the chat on screen. Saved with the chat in the session index.
    const currentPersonaId = ref(DEFAULT_PERSONA_ID);
    const currentPersona = Vue.computed(() => getPersona(currentPersonaId.value));
    // Use module-level shared refs so Settings page can read/write the same state
    const loading = sharedLoading;
    const modelLoading = sharedModelLoading;
    const status = ref("Loading...");
    const messages = sharedMessages;
    const messagesContainer = ref(null);
    const streamingText = ref("");
    const models = sharedModels;
    const lastAppliedModel = ref("");
    // True when settings were restored from localStorage on this page load.
    // Used so per-model defaults don't overwrite saved settings on reload.
    let hasSavedSettings = false;
    // "model|contextWindowSize" the worker's engine was last loaded with.
    // Reset whenever the worker is replaced. Lets Apply skip a full reload
    // when only sampling parameters or the system prompt changed.
    let loadedEngineKey = "";
    // Set after a GPU crash forced the fallback model on this page load.
    // A second crash then stops instead of restarting forever.
    let safeModeActive = false;

    // Group the flat models list into labelled tiers for the <optgroup> select.
    // Order and labels match the AVAILABLE_MODELS tiers in worker.js.
    const MODEL_GROUPS_DEF = [
      { label: "Ultra-micro (100–400M)", test: m => m.includes("135M") || m.includes("360M") },
      { label: "Micro (0.5–0.6B)",       test: m => m.includes("0.5B") || m.includes("0.6B") },
      { label: "Lightweight (1–1.7B)",   test: m => m.includes("1.1B") || (m.includes("1B") && !m.includes("1.5B")) || m.includes("1.7B") || m.includes("1_6b") || m.includes("1.6b") },
      { label: "Small (1.5B)",           test: m => m.includes("1.5B") },
      { label: "Mid (2–4B)",             test: m => m.includes("2b") || m.includes("2B") || m.includes("3B") || m.includes("4B") || m.includes("4b") },
      { label: "Upper-mid (3.8B)",       test: m => m.includes("mini") },
      { label: "Large (7–9B)",           test: m => m.includes("7B") || m.includes("8B") || m.includes("9b") },
    ];

    const { computed } = Vue;
    // Main list, plus the q4f32 alternatives when 16-bit models don't work
    // here (and whichever alternative is currently selected).
    const visibleModels = computed(() => {
      const list = [...models.value];
      for (const m of sharedAltModels.value) {
        if (f16Problem() || m === settings.value.model) list.push(m);
      }
      return list;
    });
    const allModels = () => [...models.value, ...sharedAltModels.value];

    const modelGroups = computed(() => {
      const assigned = new Set();
      const groups = MODEL_GROUPS_DEF.map(g => {
        const matched = visibleModels.value.filter(m => g.test(m) && !assigned.has(m));
        matched.forEach(m => assigned.add(m));
        return { label: g.label, models: matched };
      });
      // Catch any unmatched models in an "Other" group
      const other = visibleModels.value.filter(m => !assigned.has(m));
      if (other.length) groups.push({ label: "Other", models: other });
      return groups.filter(g => g.models.length > 0);
    });
    const conversationRestored = ref(false); // guard: restore once per page load
    const uploadedFileName = ref("");
    const currentSessionId = ref("");
    const sessions = sharedSessions;
    const sidebarOpen = sharedSidebarOpen;
    const docsOpen = ref(false);
    const modelSizes = sharedModelSizes;
    const isDownloading = sharedIsDownloading;
    const indexedDocuments = sharedIndexedDocs;
    const ingestState = sharedIngestState;
    const webgpuError = sharedWebgpuError;
    const ragSources = ref([]);       // filenames used in last response
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

    function engineKey() {
      return `${settings.value.model}|${settings.value.contextWindowSize}`;
    }

    // Settings the worker can apply without reloading the model.
    function liveConfig() {
      return { ...settings.value, system_prompt: effectiveSystemPrompt() };
    }

    // System prompt for the current chat's persona. Custom uses the prompt
    // edited in Settings (or the default one if that was left empty).
    function effectiveSystemPrompt() {
      const persona = currentPersona.value;
      if (persona.id === "custom") {
        return (settings.value.system_prompt || "").trim() || DEFAULT_PERSONA_PROMPT;
      }
      return persona.prompt;
    }

    function personaIcon(id) { return getPersona(id).icon; }
    function personaName(id) { return getPersona(id).name; }

    // Change the current chat's persona. Applies from the next message;
    // the chat so far is kept.
    function setPersona(id) {
      const persona = getPersona(id);
      if (persona.id === currentPersonaId.value) return;
      currentPersonaId.value = persona.id;
      if (messages.value.length > 0) {
        saveConversation();
        status.value = `${persona.icon} ${persona.name} persona: applies from your next message`;
      }
    }

    async function useStarter(text) {
      prompt.value = text;
      await nextTick();
      const el = promptInput.value;
      if (el) {
        el.focus();
        el.setSelectionRange(text.length, text.length);
      }
    }

    // Conversation turns to hand to the worker as model memory.
    // Error messages shown in the chat are not real assistant turns.
    function historyForWorker(msgs) {
      return msgs
        .filter(m => m.role === "user" || m.role === "assistant")
        .filter(m => !(m.role === "assistant" && m.isError))
        .map(m => ({
          role: m.role,
          content: m.role === "assistant" ? stripThinking(m.content) : m.content,
        }))
        .filter(m => m.content.trim());
    }

    // Messages prepared for display. Assistant replies are rendered as
    // sanitized markdown (memoized, so only the streaming reply re-renders),
    // with any <think> reasoning split out.
    const copiedIndex = ref(-1);
    const viewMessages = Vue.computed(() => {
      const list = messages.value;
      return list.map((message, index) => {
        const isLast = index === list.length - 1;
        if (message.role === "user") {
          return { message, index, isLast, streaming: false };
        }
        const streaming = message.role === "assistant-stream";
        const parts = splitThinking(message.content);
        const highlight = !streaming;
        return {
          message,
          index,
          isLast,
          streaming,
          thinking: parts.thinking,
          thinkingDone: parts.thinkingDone,
          thinkingHtml: parts.thinking ? renderMarkdown(parts.thinking, { highlight }) : "",
          answerHtml: parts.answer ? renderMarkdown(parts.answer, { highlight }) : "",
        };
      });
    });

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Clipboard API unavailable (e.g. plain-HTTP origin): old fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch {}
        ta.remove();
        return ok;
      }
    }

    let copiedTimer = null;
    async function copyMessage(item) {
      // Copy the markdown source of the answer, without the reasoning.
      if (await copyText(stripThinking(item.message.content))) {
        copiedIndex.value = item.index;
        clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => { copiedIndex.value = -1; }, 1500);
      }
    }

    // Copy buttons inside rendered code blocks (plain HTML from v-html,
    // so they are handled by delegation).
    async function onMessagesClick(event) {
      const button = event.target.closest && event.target.closest(".code-copy");
      if (!button) return;
      const code = button.closest(".code-block")?.querySelector("code");
      if (!code) return;
      if (await copyText(code.textContent)) {
        button.textContent = "Copied";
        button.classList.add("copied");
        setTimeout(() => {
          button.textContent = "Copy";
          button.classList.remove("copied");
        }, 1500);
      }
    }

    // Ask the model to finish a reply that was cut off; the new text is
    // appended to the same reply.
    function continueReply() {
      if (loading.value || modelLoading.value) return;
      const last = messages.value[messages.value.length - 1];
      if (!last || last.role !== "assistant" || !last.cutOff || last.isError) return;
      const previous = last.content;
      last.role = "assistant-stream";
      last.cutOff = null;
      last.notice = null;
      loading.value = true;
      getWorker().postMessage({
        type: "continue",
        previous,
        config: liveConfig(),
      });
    }

    // Replace the last reply with a fresh one for the same question.
    function regenerate() {
      if (loading.value || modelLoading.value) return;
      const list = messages.value;
      const last = list[list.length - 1];
      const question = list[list.length - 2];
      if (!last || last.role !== "assistant" || !question || question.role !== "user") return;

      list.splice(list.length - 1, 1);
      saveConversation();

      // Rewind the model's memory to just before the question; generate
      // then adds the question again.
      getWorker().postMessage({
        type: "restore-history",
        history: historyForWorker(list.slice(0, -1)),
      });

      loading.value = true;
      ragSources.value = [];
      getWorker().postMessage({
        type: "generate",
        prompt: question.content,
        config: liveConfig(),
      });
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
      ragSources.value = []; // clear previous indicator

      getWorker().postMessage({
        type: "generate",
        prompt: text,
        config: liveConfig(),
      });
    }

    async function uploadFile(event) {
      const file = event.target.files[0];

      if (!file) {
        return;
      }

      const maxMB = settings.value.maxFileSizeMB || 50;
      const MAX_FILE_BYTES = maxMB * 1024 * 1024;
      if (file.size > MAX_FILE_BYTES) {
        status.value = `⚠ ${file.name} is too large (${(file.size / 1048576).toFixed(1)} MB). Maximum is ${maxMB} MB.`;
        event.target.value = "";
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

        loading.value = false;
        modelLoading.value = false;
        isDownloading.value = false;

        const gpuCrash = data.reason === "gpu-crash";

        // A crash while already on the fallback model (or a second crash on
        // this page load) means restarting would only crash again. Stop and
        // show the GPU troubleshooting screen instead of looping.
        if (gpuCrash && (safeModeActive || settings.value.model === data.fallbackModel)) {
          // Fresh, idle worker: "Try Again" on the error screen loads a
          // model only when the user asks for it.
          worker = replaceWorker(onWorkerMessage);
          getWorker().onerror = onWorkerError;
          loadedEngineKey = "";
          status.value = "GPU crashed again in safe mode. Stopped to avoid a crash loop.";
          webgpuError.value = true;
          return;
        }

        status.value = data.text;

        if (gpuCrash && data.fallbackModel) {
          // Switch to the lightest model. The new worker's "models" message
          // calls applySettings, which asks before downloading it.
          safeModeActive = true;
          settings.value.model = data.fallbackModel;
        }

        // Replace the module-level worker so getWorker() stays consistent
        worker = replaceWorker(onWorkerMessage);
        getWorker().onerror = onWorkerError;
        loadedEngineKey = "";

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
            } else if (data.text.includes("Model loaded successfully")) {
              // The engine was (re)loaded mid-session: after a model switch
              // or a worker restart. Give it the current conversation so it
              // continues the chat instead of starting with no memory.
              const msgs = messages.value.filter(m => m.role !== "assistant-stream");
              getWorker().postMessage({
                type: "restore-history",
                history: historyForWorker(msgs),
              });
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
          // The worker counts whitespace-separated words, not model tokens.
          status.value =
            `Generating... ~${data.count} words`;
          break;
                    
        case "response":

          if (data.outcome) {
            handleFailedReply(data);
            break;
          }
        
          // convert streaming message into final message
        
          const lastMessage =
            messages.value[messages.value.length - 1];
        
          if (
            lastMessage &&
            lastMessage.role === "assistant-stream"
          ) {
        
            lastMessage.role = "assistant";
            // The final text can differ from the last streamed update
            // (e.g. a repeating tail cut off)
            lastMessage.content = data.text;
        
          } else {
        
            addMessage("assistant", data.text);
          }
          {
            const reply = messages.value[messages.value.length - 1];
            reply.cutOff = data.cutOff || null;   // "length" | "time" | null
            reply.notice = data.notice || null;   // "loop" | "continue-failed" | null
          }
        
          status.value = "Ready";
        
          loading.value = false;

          saveConversation();
        
          break;

        case "models": {
          models.value = data.models;
          sharedAltModels.value = data.altModels || [];
          if (data.sizes) {
            modelSizes.value = data.sizes;
          }
          const known = allModels();

          if (
            !settings.value.model ||
            !known.includes(settings.value.model)
          ) {
            if (lastAppliedModel.value && known.includes(lastAppliedModel.value)) {
              // Restore last known good model after worker restart
              settings.value.model = lastAppliedModel.value;
            } else if (!postCancelModel.value) {
              // First launch or stale saved model — auto-select lightest cached model,
              // or fall back to first in list
              const cachedInList = getCachedModels().find(m => data.models.includes(m));
              settings.value.model = cachedInList || data.models[0];
              // Saved settings belonged to a different model: use this
              // model's defaults instead.
              hasSavedSettings = false;
            }
          }

          if (settings.value.model) {
            await applySettings();
          }
          break;
        }

        case "diagnostics":
          sharedDiagnostics.value = {
            webllmVersion: data.webllmVersion,
            webgpu: data.webgpu,
            gpu: data.gpu,
            shaderF16: data.shaderF16,
          };
          break;

        case "model-check":
          handleModelCheck(data);
          break;
                    
        case "webgpu-error":
          loadedEngineKey = "";
          webgpuError.value = true;
          modelLoading.value = false;
          loading.value = false;
          status.value = "WebGPU unavailable";
          break;

        case "error": {
          // Keep any text already streamed as a normal reply (or drop an
          // empty bubble) before adding the error.
          const tail = messages.value[messages.value.length - 1];
          if (tail && tail.role === "assistant-stream") {
            if (tail.content && tail.content.trim()) tail.role = "assistant";
            else messages.value.pop();
          }
          messages.value.push({ role: "assistant", content: "Error: " + data.text, isError: true });
          scrollBottom();
          loading.value = false;
          // A failed model load also reports here; don't leave the UI locked.
          modelLoading.value = false;
          isDownloading.value = false;
          loadedEngineKey = "";
          saveConversation();
          break;
        }

        case "rag-context":
          ragSources.value = data.sources || [];
          break;

        case "documents-updated":
          indexedDocuments.value = data.documents || [];
          break;

        case "ingest-progress":
          ingestState.value = {
            filename: data.filename,
            current: data.current,
            total: data.total,
          };
          break;

        case "ingest-done":
          ingestState.value = null;
          status.value = `✓ ${data.filename} indexed (${data.chunks} chunks)`;
          break;

        case "ingest-error":
          ingestState.value = null;
          status.value = `⚠ Failed to index ${data.filename}: ${data.error}`;
          break;

        case "ingest-queued":
          status.value = `⏳ ${data.filename} queued — waiting for generation to finish...`;
          break;
      }
    }

    // ── Model health ─────────────────────────────────────────────────────
    const healthModal = ref({ show: false, model: "", reason: "", sample: "", suggestion: "" });

    // The q4f32 version of a q4f16 model, or else the q4f32 model closest in
    // size, as a replacement that avoids 16-bit GPU math.
    function f32Suggestion(id) {
      const all = allModels();
      const twin = id.replace(/q4f16_1|q0f16/, "q4f32_1");
      if (twin !== id && all.includes(twin)) return twin;
      const size = modelSizes.value[id] || 1000;
      const candidates = all.filter(m => !isF16Model(m) && sharedModelHealth.value[m]?.ok !== false);
      candidates.sort((a, b) =>
        Math.abs((modelSizes.value[a] || 0) - size) - Math.abs((modelSizes.value[b] || 0) - size));
      return candidates[0] || "";
    }

    // Models the user chose to keep despite a problem: don't ask again
    // this session.
    const keptAnyway = new Set();

    function offerReplacement(model, reason, sample) {
      if (healthModal.value.show || keptAnyway.has(model)) return;
      healthModal.value = {
        show: true,
        model,
        reason,
        sample: (sample || "").trim().slice(0, 80),
        suggestion: f32Suggestion(model),
      };
    }

    function handleModelCheck(data) {
      sharedModelHealth.value = {
        ...sharedModelHealth.value,
        [data.model]: { ok: data.ok, reason: data.reason || "", sample: data.sample || "", ts: Date.now() },
      };
      saveModelHealth();
      if (!data.ok) {
        if (data.reason === "no-f16") {
          // The engine didn't load at all
          modelLoading.value = false;
          isDownloading.value = false;
          loadedEngineKey = "";
          status.value = "This model needs 16-bit GPU support, which this browser doesn't offer";
        }
        offerReplacement(data.model, data.reason, data.sample);
      }
    }

    function keepModelAnyway() {
      keptAnyway.add(healthModal.value.model);
      healthModal.value.show = false;
    }

    function switchToSuggestion() {
      const target = healthModal.value.suggestion;
      healthModal.value.show = false;
      if (!target) return;
      settings.value.model = target;
      applySettings();
    }

    // A reply that ended with nothing usable (collapsed into junk, timed out
    // before the first word, stopped before any text, or empty). Show why,
    // instead of junk or an empty bubble. Marked as an error, so it is left
    // out of the model's memory and offers Retry.
    const FAILED_REPLY_TEXT = {
      degenerate: "⚠ The reply collapsed into repeated words, so it was stopped.",
      timeout: "⚠ No reply: the model didn't start answering within the time limit. A smaller model may be faster on this device.",
      empty: "⚠ The model returned an empty reply.",
    };

    function handleFailedReply(data) {
      const list = messages.value;
      const last = list[list.length - 1];
      const hasBubble = last && last.role === "assistant-stream";
      loading.value = false;
      status.value = "Ready";

      if (data.outcome === "stopped") {
        // Stopped before any text: just drop the empty bubble
        if (hasBubble) list.splice(list.length - 1, 1);
        status.value = "Stopped";
        saveConversation();
        return;
      }

      let text = FAILED_REPLY_TEXT[data.outcome] || FAILED_REPLY_TEXT.empty;
      if (data.outcome === "degenerate") {
        text += isF16Model(data.model)
          ? " This 16-bit (q4f16) model may not run correctly on your GPU; a q4f32 model usually fixes it."
          : " Try Regenerate, or a larger model.";
      }
      const msg = { role: "assistant", content: text, isError: true };
      if (hasBubble) list.splice(list.length - 1, 1, msg);
      else list.push(msg);
      scrollBottom();
      saveConversation();

      if (data.outcome === "degenerate" && isF16Model(data.model)) {
        offerReplacement(data.model, "degenerate", "");
      }
    }

    function forgetModelHealth() {
      sharedModelHealth.value = {};
      saveModelHealth();
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

      // Show download confirmation for first-time downloads,
      // but only if the user is actively changing models (lastAppliedModel is set).
      // On initial page load (lastAppliedModel is ""), skip confirmation so the
      // app always loads a model automatically and doesn't start with an empty UI.
      const isUserChange = lastAppliedModel.value !== "";
      if (isNewModel && isUserChange && !skipConfirm && !isModelCached(settings.value.model)) {
        const sizeMb = modelSizes.value[settings.value.model] || 0;
        if (sizeMb > 50) {
          confirmModal.value = {
            show: true,
            model: settings.value.model,
            previousModel: lastAppliedModel.value,
            sizeMb,
          };
          return; // wait for user to confirm
        }
      }

      // Apply per-model defaults when the user picks a different model, or
      // on a first launch with nothing saved. On a normal page load the
      // saved settings win, so customised values survive a reload.
      // The conversation is preserved either way.
      if (isNewModel) {
        if (isUserChange || !hasSavedSettings) {
          const defaults = getModelDefaults(settings.value.model);
          // Merge defaults key-by-key to preserve Vue reactivity on the shared ref
          Object.assign(settings.value, defaults);
        }
        lastAppliedModel.value = settings.value.model;
      }

      saveSettings();

      // Same model and context window already loaded: only sampling
      // parameters or the system prompt changed, which apply live.
      if (loadedEngineKey && loadedEngineKey === engineKey()) {
        getWorker().postMessage({
          type: "update-config",
          config: liveConfig(),
        });
        status.value = "Settings applied";
        return;
      }

      modelLoading.value = true;
      loadedEngineKey = engineKey();
    
      status.value =
        `Loading ${settings.value.model}...`;
    
      getWorker().postMessage({
        type: "set-config",
        // Check the model once per device (see handleModelCheck)
        config: { ...liveConfig(), selfTest: !sharedModelHealth.value[settings.value.model] },
      });
    }
            
    function confirmDownload() {
      confirmModal.value.show = false;
      // Do NOT mark as cached here — only mark it after the model
      // actually finishes loading (in the "Model loaded successfully" handler).
      // Marking here caused cancelled downloads to appear cached forever.
      applySettings(true); // bypass confirmation this time
    }

    function stopGeneration() {
      if (!loading.value) return;
      getWorker().postMessage({ type: "stop-generation" });
      // UI will update when the worker sends "response" with partial text
    }

    function deleteDocument(filename) {
      getWorker().postMessage({ type: "delete-document", filename });
    }

    function clearDocuments() {
      getWorker().postMessage({ type: "clear-documents" });
      indexedDocuments.value = [];
    }

    function cancelDownload() {
      if (!isDownloading.value) return;
      isDownloading.value = false;
      modelLoading.value = false;

      const cancelledModel = settings.value.model;

      // Remove from cache list so confirmation shows again next time
      try {
        const cached = getCachedModels().filter(m => m !== cancelledModel);
        localStorage.setItem(CACHED_KEY, JSON.stringify(cached));
      } catch {}

      // Remember the cancelled model so applySettings won't re-trigger it
      postCancelModel.value = cancelledModel;

      // Revert the select to the last successfully loaded model (or nothing)
      settings.value.model = lastAppliedModel.value;

      // Terminate and replace the worker — the new worker sends "models"
      // on its own startup, which will trigger applySettings; we suppress
      // it for the cancelled model via postCancelModel above.
      worker = replaceWorker(onWorkerMessage);
      getWorker().onerror = onWorkerError;
      loadedEngineKey = "";
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

    // ── Import / Export helpers ──────────────────────────────────────────

    function downloadJSON(obj, filename) {
      const blob = new Blob(
        [JSON.stringify(obj, null, 2)],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    function readJSONFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          try { resolve(JSON.parse(e.target.result)); }
          catch { reject(new Error("Invalid JSON file")); }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
      });
    }

    // ── Settings export / import ─────────────────────────────────────────

    function exportSettings() {
      const ts = new Date().toISOString().slice(0, 10);
      downloadJSON(
        { version: 1, type: "webllm-settings", exportedAt: new Date().toISOString(), settings: settings.value },
        `webllm-settings-${ts}.json`
      );
    }

    async function importSettings(event) {
      const file = event.target.files[0];
      if (!file) return;
      event.target.value = "";
      try {
        const data = await readJSONFile(file);
        if (data.type !== "webllm-settings" || !data.settings) {
          throw new Error("Not a valid WebLLM settings file");
        }
        // Merge imported settings into current, skip model to avoid auto-load
        const { model: _skip, ...rest } = migrateSettings({ ...data.settings });
        Object.keys(rest).forEach(key => {
          if (key in settings.value || key === "system_prompt") {
            settings.value[key] = rest[key];
          }
        });
        saveSettings();
        status.value = "✓ Settings imported successfully";
      } catch (err) {
        status.value = `⚠ Import failed: ${err.message}`;
      }
    }

    // ── Session history export / import ──────────────────────────────────

    function exportSessions() {
      const index = loadIndex();
      const allSessions = index.map(entry => {
        try {
          const raw = localStorage.getItem(sessionKey(entry.id));
          const messages = raw ? JSON.parse(raw) : [];
          return { ...entry, messages };
        } catch {
          return { ...entry, messages: [] };
        }
      });
      // Also include current unsaved session if it has messages
      if (messages.value.length > 0) {
        const existsInIndex = index.some(s => s.id === currentSessionId.value);
        if (!existsInIndex) {
          allSessions.unshift({
            id: currentSessionId.value,
            title: titleFromMessages(messages.value) || "Current chat",
            preview: previewFromMessages(messages.value) || "",
            model: settings.value.model || "",
            persona: currentPersonaId.value,
            ts: Date.now(),
            messages: messages.value.filter(m => m.role !== "assistant-stream"),
          });
        }
      }
      const ts = new Date().toISOString().slice(0, 10);
      downloadJSON(
        { version: 1, type: "webllm-sessions", exportedAt: new Date().toISOString(), sessions: allSessions },
        `webllm-sessions-${ts}.json`
      );
      status.value = `✓ Exported ${allSessions.length} session(s)`;
    }

    async function importSessions(event) {
      const file = event.target.files[0];
      if (!file) return;
      event.target.value = "";
      try {
        const data = await readJSONFile(file);
        if (data.type !== "webllm-sessions" || !Array.isArray(data.sessions)) {
          throw new Error("Not a valid WebLLM sessions file");
        }

        const index = loadIndex();

        // Primary dedup: session ID. The export always preserves original IDs,
        // so re-importing the same file will always be caught here.
        const existingIds = new Set(index.map(s => s.id));

        // Also include the current in-memory session (may not be in index yet)
        existingIds.add(currentSessionId.value);

        // Secondary dedup: normalised message content hash for sessions that
        // may have been imported previously with a different ID.
        // We hash the first+last user message text for a lightweight fingerprint.
        function msgFingerprint(msgs) {
          const userMsgs = (msgs || []).filter(m => m.role === "user");
          if (!userMsgs.length) return null;
          const first = userMsgs[0].content.trim().slice(0, 80);
          const last  = userMsgs[userMsgs.length - 1].content.trim().slice(0, 80);
          return `${first}|||${last}`;
        }

        // Build fingerprints for all existing sessions
        const existingFingerprints = new Set();
        for (const entry of index) {
          try {
            const raw = localStorage.getItem(sessionKey(entry.id));
            const fp = raw ? msgFingerprint(JSON.parse(raw)) : null;
            if (fp) existingFingerprints.add(fp);
          } catch {}
        }
        // Also fingerprint the current in-memory session
        const currentFp = msgFingerprint(messages.value);
        if (currentFp) existingFingerprints.add(currentFp);

        let added = 0;
        let skipped = 0;

        for (const session of data.sessions) {
          if (!session.id || !Array.isArray(session.messages)) continue;

          const fp = msgFingerprint(session.messages);

          if (existingIds.has(session.id) || (fp && existingFingerprints.has(fp))) {
            skipped++;
            continue;
          }

          // Genuinely new — preserve original ID for future dedup
          localStorage.setItem(
            sessionKey(session.id),
            JSON.stringify(session.messages.slice(-MAX_PERSISTED_MESSAGES))
          );
          index.unshift({
            id:      session.id,
            title:   session.title   || "Imported chat",
            preview: session.preview || "",
            model:   session.model   || "",
            persona: session.persona || DEFAULT_PERSONA_ID,
            ts:      session.ts      || Date.now(),
          });
          existingIds.add(session.id);
          if (fp) existingFingerprints.add(fp);
          added++;
        }

        index.sort((a, b) => b.ts - a.ts);
        if (index.length > MAX_SESSIONS) index.splice(MAX_SESSIONS);
        saveIndex(index);

        if (added === 0 && skipped > 0) {
          status.value = `✓ All ${skipped} session(s) already exist — nothing to import`;
        } else if (skipped > 0) {
          status.value = `✓ Imported ${added} new session(s), skipped ${skipped} duplicate(s)`;
        } else {
          status.value = `✓ Imported ${added} session(s) — open the sidebar to view them`;
        }
      } catch (err) {
        status.value = `⚠ Import failed: ${err.message}`;
      }
    }
    
    function loadSettings() {

      const saved = localStorage.getItem("webllm-settings");
      if (!saved) return;

      try {
        const parsed = migrateSettings(JSON.parse(saved));
        hasSavedSettings = true;
        // Merge individual keys rather than replacing the whole object.
        // Replacing settings.value would swap out the reactive object and break
        // Vue's dependency tracking — especially for the shared ref used by
        // the Settings component.
        Object.keys(parsed).forEach(key => {
          if (key in settings.value || key === "system_prompt") {
            settings.value[key] = parsed[key];
          }
        });
      } catch (err) {
        console.error("Failed loading settings", err);
      }
    }

    function resetSettings() {

      const defaults = getModelDefaults(settings.value.model || "");
      // Merge key-by-key to preserve Vue reactivity on the shared ref
      Object.assign(settings.value, defaults);
      if (!settings.value.model) {
        settings.value.model = models.value[0] || "";
      }
      // system_prompt is intentionally NOT reset here — user may have customised it
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
      const text = stripThinking(last.content).trim();
      return text.slice(0, 60) + (text.length > 60 ? "…" : "");
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
          persona: currentPersonaId.value,
          ts: Date.now(),
        };
        if (idx >= 0) index[idx] = entry;
        else index.unshift(entry);
        // Keep newest first, cap at MAX_SESSIONS
        index.sort((a, b) => b.ts - a.ts);
        if (index.length > MAX_SESSIONS) {
          // Delete the pruned sessions' messages too, or they stay in
          // localStorage forever and eat into its ~5 MB quota.
          const pruned = index.splice(MAX_SESSIONS);
          for (const old of pruned) localStorage.removeItem(sessionKey(old.id));
        }
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
        currentPersonaId.value = personaForSession(id);
        sidebarOpen.value = false;

        const last = parsed[parsed.length - 1];
        const unanswered = last && last.role === "user" ? last.content : null;
        const toRestore = unanswered ? parsed.slice(0, -1) : parsed;

        messages.value = toRestore;
        scrollBottom();
        getWorker().postMessage({
          type: "clear-history",
        });
        const history = historyForWorker(toRestore);
        getWorker().postMessage({ type: "restore-history", history });

        if (unanswered) {
          addMessage("user", unanswered);
          saveConversation();
          loading.value = true;
          getWorker().postMessage({ type: "generate", prompt: unanswered, config: liveConfig() });
        }
      } catch (err) { console.warn("Failed loading session", err); }
    }

    // Persona saved with a chat. Chats from before personas existed use
    // the default persona.
    function personaForSession(id) {
      const entry = loadIndex().find(s => s.id === id);
      return getPersona(entry?.persona || settings.value.defaultPersona).id;
    }

    // Create a brand-new chat session
    function newChat() {
      if (loading.value || modelLoading.value) return;
      saveConversation();
      currentSessionId.value = genId();
      currentPersonaId.value = settings.value.defaultPersona || DEFAULT_PERSONA_ID;
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
        currentPersonaId.value = settings.value.defaultPersona || DEFAULT_PERSONA_ID;
        return;
      }

      // Load the most recent session
      const latest = index[0];
      currentSessionId.value = latest.id;
      currentPersonaId.value = personaForSession(latest.id);

      try {
        const raw = localStorage.getItem(sessionKey(latest.id));
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed) || parsed.length === 0) return;

        const last = parsed[parsed.length - 1];
        const unanswered = last && last.role === "user" ? last.content : null;
        const toRestore = unanswered ? parsed.slice(0, -1) : parsed;

        messages.value = toRestore;
        scrollBottom();

        const history = historyForWorker(toRestore);
        getWorker().postMessage({ type: "restore-history", history });

        if (unanswered) {
          addMessage("user", unanswered);
          saveConversation();
          loading.value = true;
          getWorker().postMessage({ type: "generate", prompt: unanswered, config: liveConfig() });
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
      currentPersonaId.value = settings.value.defaultPersona || DEFAULT_PERSONA_ID;
      getWorker().postMessage({ type: "clear-history" });
    }

    function getModelDefaults(model) {
      return modelDefaults(model);
    }
        
    // Expose functions to Settings page
    sharedApplySettings    = applySettings;
    sharedResetSettings    = resetSettings;
    sharedClearConversation = clearConversation;
    // Expose modelGroups computed to Settings page via shared ref
    // We use a watchEffect to keep it in sync since it's a computed
    const { watchEffect } = Vue;
    watchEffect(() => { sharedModelGroups.value = modelGroups.value; });

    // Save settings as they are edited (sliders, system prompt), so changes
    // survive a reload even without pressing Apply. Debounced for sliders.
    let saveTimer = null;
    Vue.watch(settings, () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        if (settings.value.model) saveSettings();
      }, 400);
    }, { deep: true });
    // Flush a pending save if the tab is closed or hidden mid-debounce.
    window.addEventListener("pagehide", () => {
      if (saveTimer && settings.value.model) saveSettings();
    });

    sharedNewChat          = newChat;
    sharedLoadSession      = loadSession;
    sharedDeleteSession    = deleteSession;
    sharedExportSettings   = exportSettings;
    sharedImportSettings   = importSettings;
    sharedExportSessions   = exportSessions;
    sharedImportSessions   = importSessions;
    sharedForgetModelHealth = forgetModelHealth;

    getWorker().onmessage = onWorkerMessage;
    function onWorkerError(err) {
      const msg = err.message || err.filename
        ? `${err.message || "Unknown"} (${err.filename || "?"}:${err.lineno || "?"})`
        : "Worker failed to load — check browser console for import errors";
      console.error("Worker error:", msg, err);
      status.value = "⚠ Worker error: " + msg;
      loading.value = false;
      modelLoading.value = false;
    }
    getWorker().onerror = onWorkerError;

    onMounted(() => {
    
      loadSettings();
      currentPersonaId.value = settings.value.defaultPersona || DEFAULT_PERSONA_ID;
      getWorker().postMessage({
        type: "init",
      });
      // Restore conversation after a short tick so the worker has
      // processed "init" and sent back "models" before we send history.
      // The actual restore-history is sent once the model finishes loading,
      // triggered from the "models" handler via loadConversation().
    });
        
    // ── Search ──────────────────────────────────────────────────────────────
    const searchQuery = ref("");
    const searchResults = ref([]);
    const searchPending = ref(false);
    let searchDebounceTimer = null;

    const SNIPPET_RADIUS = 80; // chars around match to show as context

    function escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function escapeHtml(str) {
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    // Build highlighted snippet around first match in text
    function makeSnippet(text, query) {
      const lc = text.toLowerCase();
      const qlc = query.toLowerCase();
      const idx = lc.indexOf(qlc);
      if (idx === -1) return null;

      const start = Math.max(0, idx - SNIPPET_RADIUS);
      const end   = Math.min(text.length, idx + qlc.length + SNIPPET_RADIUS);
      const raw   = (start > 0 ? "…" : "") +
                    text.slice(start, end) +
                    (end < text.length ? "…" : "");

      // Highlight all occurrences of query in the snippet (case-insensitive)
      const highlighted = escapeHtml(raw).replace(
        new RegExp(escapeRegex(escapeHtml(query)), "gi"),
        m => `<mark class="search-highlight">${m}</mark>`
      );
      return highlighted;
    }

    // Count total matches of query in text
    function countMatches(text, query) {
      const matches = text.toLowerCase().match(
        new RegExp(escapeRegex(query.toLowerCase()), "g")
      );
      return matches ? matches.length : 0;
    }

    // Search a list of messages for query; return match objects
    function searchMessages(msgs, query) {
      const results = [];
      for (const msg of msgs) {
        if (msg.role !== "user" && msg.role !== "assistant") continue;
        if (!msg.content.toLowerCase().includes(query.toLowerCase())) continue;
        const highlighted = makeSnippet(msg.content, query);
        if (highlighted) {
          results.push({
            role: msg.role,
            highlighted,
            matchCount: countMatches(msg.content, query),
          });
        }
      }
      return results;
    }

    async function runSearch(query) {
      if (!query.trim()) {
        searchResults.value = [];
        searchPending.value = false;
        return;
      }

      searchPending.value = true;
      const results = [];

      // Search active session (live messages, not yet persisted to index)
      const activeMatches = searchMessages(messages.value, query);
      if (activeMatches.length > 0) {
        results.push({
          session: {
            id: currentSessionId.value,
            title: titleFromMessages(messages.value) || "Current chat",
            ts: Date.now(),
            model: settings.value.model || "",
          },
          matches: activeMatches,
          totalMatches: activeMatches.reduce((a, m) => a + m.matchCount, 0),
        });
      }

      // Search all saved sessions (load from localStorage on demand)
      const index = loadIndex();
      for (const entry of index) {
        if (entry.id === currentSessionId.value) continue; // already searched above
        try {
          const raw = localStorage.getItem(sessionKey(entry.id));
          if (!raw) continue;
          const msgs = JSON.parse(raw);
          if (!Array.isArray(msgs)) continue;

          // Quick title/preview check first (avoids JSON.parse for non-matches)
          const inTitleOrPreview =
            (entry.title || "").toLowerCase().includes(query.toLowerCase()) ||
            (entry.preview || "").toLowerCase().includes(query.toLowerCase());

          const msgMatches = searchMessages(msgs, query);

          if (msgMatches.length > 0 || inTitleOrPreview) {
            // If only title/preview matched but no message matched, make a
            // snippet from the title so something meaningful shows
            const matches = msgMatches.length > 0
              ? msgMatches
              : [{
                  role: "user",
                  highlighted: makeSnippet(entry.title || "", query) ||
                               escapeHtml(entry.title || ""),
                  matchCount: 1,
                }];

            results.push({
              session: entry,
              matches,
              totalMatches: matches.reduce((a, m) => a + m.matchCount, 0),
            });
          }
        } catch {}

        // Yield to the event loop every 5 sessions to stay responsive
        if (index.indexOf(entry) % 5 === 4) {
          await new Promise(r => setTimeout(r, 0));
        }
      }

      // Sort: active session first, then by total match count desc
      results.sort((a, b) => {
        if (a.session.id === currentSessionId.value) return -1;
        if (b.session.id === currentSessionId.value) return 1;
        return b.totalMatches - a.totalMatches;
      });

      searchResults.value = results;
      searchPending.value = false;
    }

    function onSearchInput() {
      clearTimeout(searchDebounceTimer);
      if (!searchQuery.value.trim()) {
        searchResults.value = [];
        searchPending.value = false;
        return;
      }
      searchPending.value = true;
      searchDebounceTimer = setTimeout(() => {
        runSearch(searchQuery.value);
      }, 280);
    }

    return {
      prompt,
      promptInput,
      modelOptionLabel,
      healthModal,
      switchToSuggestion,
      keepModelAnyway,
      viewMessages,
      copiedIndex,
      copyMessage,
      onMessagesClick,
      regenerate,
      continueReply,
      personas: PERSONAS,
      currentPersonaId,
      currentPersona,
      setPersona,
      useStarter,
      personaIcon,
      personaName,
      loading,
      modelLoading,
      status,
      messages,
      messagesContainer,
      send,
      uploadFile,
      uploadedFileName,
      models,
      modelGroups,
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
      searchQuery,
      searchResults,
      searchPending,
      onSearchInput,
      indexedDocuments,
      ingestState,
      ragSources,
      docsOpen,
      deleteDocument,
      clearDocuments,
      webgpuError,
      exportSettings,
      importSettings,
      exportSessions,
      importSessions,
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
            <template v-for="group in modelGroups" :key="group.label">
              <optgroup :label="group.label">
                <option v-for="model in group.models" :key="model" :value="model">{{ modelOptionLabel(model) }}</option>
              </optgroup>
            </template>
          </select>
          <p class="section-hint">You can switch models mid-conversation. Generation defaults will update automatically.</p>
        </section>

        <section class="settings-section">
          <h2 class="section-label">Generation</h2>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">Temperature</span>
              <span class="setting-desc">Randomness of output. Low = focused, High = creative.</span>
            </div>
            <div class="setting-control">
              <input type="range" min="0" max="2" step="0.05" v-model.number="settings.temperature" class="slider" />
              <span class="setting-value">{{ settings.temperature.toFixed(2) }}</span>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">Top P</span>
              <span class="setting-desc">Nucleus sampling. Only consider tokens in the top P probability mass. 1.0 = off.</span>
            </div>
            <div class="setting-control">
              <input type="range" min="0.01" max="1" step="0.01" v-model.number="settings.top_p" class="slider" />
              <span class="setting-value">{{ settings.top_p.toFixed(2) }}</span>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">Max Tokens</span>
              <span class="setting-desc">Maximum number of tokens to generate per response.</span>
            </div>
            <div class="setting-control">
              <input type="range" min="16" max="2048" step="16" v-model.number="settings.max_tokens" class="slider" />
              <span class="setting-value">{{ settings.max_tokens }}</span>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">Context Window</span>
              <span class="setting-desc">Tokens of conversation history visible to the model. Requires model reload.</span>
            </div>
            <div class="setting-control">
              <input type="range" min="512" max="8192" step="512" v-model.number="settings.contextWindowSize" class="slider" />
              <span class="setting-value">{{ settings.contextWindowSize }}</span>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">Max Upload Size</span>
              <span class="setting-desc">Maximum file size for document uploads.</span>
            </div>
            <div class="setting-control">
              <input type="range" min="1" max="200" step="1" v-model.number="settings.maxFileSizeMB" class="slider" />
              <span class="setting-value">{{ settings.maxFileSizeMB }} MB</span>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h2 class="section-label">Repetition Control</h2>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">Frequency Penalty</span>
              <span class="setting-desc">Penalises tokens by how often they have appeared. Reduces word repetition. Range −2 to 2.</span>
            </div>
            <div class="setting-control">
              <input type="range" min="-2" max="2" step="0.1" v-model.number="settings.frequency_penalty" class="slider" />
              <span class="setting-value">{{ settings.frequency_penalty.toFixed(1) }}</span>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">Presence Penalty</span>
              <span class="setting-desc">Penalises tokens that have already appeared at all. Encourages new topics. Range −2 to 2.</span>
            </div>
            <div class="setting-control">
              <input type="range" min="-2" max="2" step="0.1" v-model.number="settings.presence_penalty" class="slider" />
              <span class="setting-value">{{ settings.presence_penalty.toFixed(1) }}</span>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">Repetition Penalty</span>
              <span class="setting-desc">MLC-specific multiplicative penalty applied to repeated tokens. 1.0 = off, &gt;1 reduces repetition.</span>
            </div>
            <div class="setting-control">
              <input type="range" min="1" max="2" step="0.05" v-model.number="settings.repetition_penalty" class="slider" />
              <span class="setting-value">{{ settings.repetition_penalty.toFixed(2) }}</span>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h2 class="section-label">Personas</h2>
          <p class="section-hint" style="margin-bottom:12px">A persona sets how the assistant talks. Each chat keeps its own persona; you can switch it from the chat toolbar at any time.</p>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">Default for new chats</span>
              <span class="setting-desc">{{ defaultPersona.tagline }}</span>
            </div>
            <div class="setting-control">
              <select v-model="settings.defaultPersona" class="settings-select persona-default-select">
                <option v-for="p in personas" :key="p.id" :value="p.id">{{ p.icon }} {{ p.name }}</option>
              </select>
            </div>
          </div>

          <details v-if="defaultPersona.prompt" class="persona-prompt-preview">
            <summary>Show the {{ defaultPersona.name }} instructions</summary>
            <pre>{{ defaultPersona.prompt }}</pre>
          </details>

          <h3 class="subsection-label">🛠 Custom persona</h3>
          <p class="section-hint" style="margin-bottom:10px">Write your own instructions, then pick the Custom persona in a chat. Changes take effect on the next message.</p>
          <textarea
            class="system-prompt-editor"
            v-model="settings.system_prompt"
            placeholder="Enter instructions for the Custom persona..."
            rows="7"
            spellcheck="false"
          ></textarea>
          <button class="action-btn secondary" style="margin-top:8px" @click="resetSystemPrompt">
            Reset to Friendly instructions
          </button>
        </section>

        <section class="settings-section">
          <h2 class="section-label">This device</h2>
          <p class="section-hint" style="margin-bottom:12px">What the app found about this browser and GPU. Useful when a model gives garbled replies.</p>
          <div class="device-info">
            <div class="device-row">
              <span class="device-key">WebLLM version</span>
              <span class="device-val">{{ diagnostics?.webllmVersion || "…" }}</span>
            </div>
            <div class="device-row">
              <span class="device-key">GPU</span>
              <span class="device-val">{{ diagnostics ? (diagnostics.webgpu ? (diagnostics.gpu || "No GPU adapter found") : "WebGPU not available") : "…" }}</span>
            </div>
            <div class="device-row">
              <span class="device-key">16-bit GPU support</span>
              <span class="device-val">{{ diagnostics == null || diagnostics.shaderF16 == null ? "Unknown" : (diagnostics.shaderF16 ? "Yes" : "No") }}</span>
            </div>
            <div class="device-row">
              <span class="device-key">16-bit (q4f16) models</span>
              <span class="device-val" :class="{ warn: f16Problem() }">{{ f16Status() }}</span>
            </div>
          </div>
          <div v-if="failedModels.length" class="device-failed">
            <span class="device-key">Failed the model check here:</span>
            <ul>
              <li v-for="f in failedModels" :key="f.id">
                <code>{{ f.id }}</code>
                <span class="device-sample" v-if="f.sample">“{{ f.sample.slice(0, 40) }}…”</span>
              </li>
            </ul>
          </div>
          <button v-if="checkedCount" class="action-btn secondary" style="margin-top:10px" @click="forgetModelHealth">
            Forget check results ({{ checkedCount }})
          </button>
          <p class="section-hint" style="margin-top:8px">Each model is checked once after its first load on this device. Forgetting the results checks them again, for example after a browser or driver update.</p>
        </section>

        <section class="settings-section">
          <h2 class="section-label">Export / Import</h2>
          <p class="section-hint" style="margin-bottom:12px">Transfer your settings and chat history to another browser or device.</p>

          <div class="transfer-grid">
            <div class="transfer-card">
              <div class="transfer-card-title">⚙ Settings</div>
              <div class="transfer-card-desc">Export all settings to a JSON file, or import settings from a previously exported file.</div>
              <div class="transfer-card-actions">
                <button class="action-btn secondary" @click="exportSettings">
                  Export Settings
                </button>
                <label class="action-btn secondary" style="cursor:pointer;text-align:center">
                  Import Settings
                  <input type="file" accept=".json" @change="importSettings" style="display:none" />
                </label>
              </div>
            </div>

            <div class="transfer-card">
              <div class="transfer-card-title">💬 Chat History</div>
              <div class="transfer-card-desc">Export all saved sessions to a JSON file, or import sessions from another browser (added alongside existing chats).</div>
              <div class="transfer-card-actions">
                <button class="action-btn secondary" @click="exportSessions">
                  Export Chats
                </button>
                <label class="action-btn secondary" style="cursor:pointer;text-align:center">
                  Import Chats
                  <input type="file" accept=".json" @change="importSessions" style="display:none" />
                </label>
              </div>
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
              Reset All Defaults
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
    function resetSystemPrompt() {
      sharedSettings.value.system_prompt = DEFAULT_PERSONA_PROMPT;
    }

    const defaultPersona = Vue.computed(() =>
      getPersona(sharedSettings.value.defaultPersona));

    const failedModels = Vue.computed(() =>
      Object.entries(sharedModelHealth.value)
        .filter(([, h]) => h && h.ok === false)
        .map(([id, h]) => ({ id, sample: h.sample || "" })));
    const checkedCount = Vue.computed(() => Object.keys(sharedModelHealth.value).length);

    function f16Status() {
      const d = sharedDiagnostics.value;
      if (d && d.shaderF16 === false) return "Not supported: use q4f32 models";
      const f16 = Object.entries(sharedModelHealth.value).filter(([id]) => isF16Model(id));
      if (f16.some(([, h]) => h && h.ok === false)) return "Garbled output detected: use q4f32 models";
      if (f16.some(([, h]) => h && h.ok)) return "Working";
      return "Not checked yet";
    }

    return {
      settings: sharedSettings,
      models: sharedModels,
      modelGroups: sharedModelGroups,
      loading: sharedLoading,
      modelLoading: sharedModelLoading,
      messages: sharedMessages,
      applySettings: sharedApplySettings,
      resetSettings: sharedResetSettings,
      clearConversation: sharedClearConversation,
      newChat: sharedNewChat,
      resetSystemPrompt,
      personas: PERSONAS,
      defaultPersona,
      modelOptionLabel,
      diagnostics: sharedDiagnostics,
      failedModels,
      checkedCount,
      f16Problem,
      f16Status,
      forgetModelHealth: () => sharedForgetModelHealth(),
      exportSettings:  sharedExportSettings,
      importSettings:  sharedImportSettings,
      exportSessions:  sharedExportSessions,
      importSessions:  sharedImportSessions,
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
    // keep-alive: Home must not remount when returning from Settings, or it
    // re-sends "init" (reloading the model) and loses its local state.
    template: `
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </router-view>
    `
  })
  .use(router)
  .mount("#app");
