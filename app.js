import {
  PERSONAS,
  DEFAULT_PERSONA_ID,
  DEFAULT_PERSONA_PROMPT,
  getPersona,
} from "./personas.js";
import { renderMarkdown, splitThinking, stripThinking } from "./markdown.js";
import { openChatStore, FALLBACK_MAX_MESSAGES, FALLBACK_MAX_CHATS } from "./chatstore.js";
import { INDEX_MIN_CHARS, MAX_ATTACHMENT_CHARS } from "./attachments.js";
import {
  USES,
  TIERS,
  pickModelId,
  recommendTier,
  friendlyModelName,
  modelPrecision,
  formatSize,
  describeLoadProgress,
  estimateRemaining,
} from "./picker.js";
import { blendSpeed, formatSpeed, isSlow, fasterModel, isSmallModel } from "./pace.js";
import { APP_VERSION, problemReportUrl } from "./version.js";

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

// ── Focus management for dialogs and the sidebar ──────────────────────────
// While a dialog (or the open sidebar) is on screen, keyboard focus moves
// into it, Tab and Shift+Tab stay inside it, and Escape closes it. When it
// closes, focus goes back to where it was. Scopes stack: only the topmost
// one (e.g. a confirmation opened from the sidebar) handles the keys.
const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])", "textarea:not([disabled])", "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
const focusScopes = [];

function focusablesIn(el) {
  return [...el.querySelectorAll(FOCUSABLE)]
    .filter(n => !n.closest("[inert]") && n.getClientRects().length > 0);
}

function focusFirstIn(el) {
  const target = el.querySelector("[data-autofocus]:not([disabled])") || focusablesIn(el)[0];
  if (target) { target.focus(); return; }
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus();
}

// Trap focus in `el` until the returned release function is called.
// `onEscape` (optional) is called when Escape is pressed. `returnTo`
// overrides where focus goes on release (default: what had focus before).
function openFocusScope(el, { onEscape = null, returnTo = null } = {}) {
  const scope = { el, onEscape, returnTo: returnTo || document.activeElement };
  focusScopes.push(scope);
  focusFirstIn(el);
  return function release() {
    const i = focusScopes.indexOf(scope);
    if (i === -1) return;
    focusScopes.splice(i, 1);
    if (i !== focusScopes.length) return; // not the topmost: leave focus alone
    const back = typeof scope.returnTo === "function" ? scope.returnTo() : scope.returnTo;
    const top = focusScopes[focusScopes.length - 1];
    if (back && back.isConnected && !back.closest("[inert]") && back.getClientRects().length > 0) {
      back.focus();
    } else if (top) {
      focusFirstIn(top.el);
    }
  };
}

document.addEventListener("keydown", e => {
  const scope = focusScopes[focusScopes.length - 1];
  if (!scope) return;
  if (e.key === "Escape") {
    if (scope.onEscape) {
      e.preventDefault();
      e.stopPropagation();
      scope.onEscape();
    }
    return;
  }
  if (e.key !== "Tab") return;
  const items = focusablesIn(scope.el);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!scope.el.contains(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}, true);

// v-dialog="onEscape" on a dialog element shown with v-if. Pass null for a
// dialog that Escape must not close (e.g. the WebGPU error screen).
const dialogDirective = {
  mounted(el, binding) {
    el._releaseFocus = openFocusScope(el, { onEscape: () => binding.value && binding.value() });
    el._dialogBinding = binding;
  },
  updated(el, binding) {
    el._dialogBinding = binding;
    const scope = focusScopes.find(s => s.el === el);
    if (scope) scope.onEscape = binding.value ? () => binding.value() : null;
    // Content changed (e.g. the picker's next step) and took focus with it
    if (scope === focusScopes[focusScopes.length - 1] && !el.contains(document.activeElement)) {
      focusFirstIn(el);
    }
  },
  unmounted(el) {
    if (el._releaseFocus) el._releaseFocus();
  },
};

// ── Confirmation dialog (shared by the chat page and Settings) ────────────
// askConfirm({...}) shows it and resolves to true (confirmed) or false.
const sharedConfirm = Vue.reactive({
  show: false,
  icon: "",
  title: "",
  subject: "",   // shown in bold above the message (e.g. a model or chat name)
  message: "",
  confirmText: "OK",
  cancelText: "Cancel",
  danger: false,
  resolve: null,
});

function askConfirm(opts) {
  // A new question replaces one still open; the old one counts as cancelled.
  if (sharedConfirm.resolve) sharedConfirm.resolve(false);
  return new Promise(resolve => {
    Object.assign(sharedConfirm, {
      icon: "", subject: "", message: "", confirmText: "OK", cancelText: "Cancel", danger: false,
      ...opts,
      show: true,
      resolve,
    });
  });
}

function answerConfirm(ok) {
  const resolve = sharedConfirm.resolve;
  sharedConfirm.show = false;
  sharedConfirm.resolve = null;
  if (resolve) resolve(ok);
}


const ConfirmDialog = {
  template: `
    <div v-if="c.show" class="modal-overlay" @click.self="answer(false)">
      <div
        class="modal confirm-dialog"
        :class="{ danger: c.danger }"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        v-dialog="() => answer(false)"
      >
        <div v-if="c.icon" class="modal-icon" aria-hidden="true">{{ c.icon }}</div>
        <h2 class="modal-title" id="confirm-title">{{ c.title }}</h2>
        <p class="modal-body" id="confirm-body">
          <template v-if="c.subject"><strong class="confirm-subject">{{ c.subject }}</strong><br><br></template>{{ c.message }}
        </p>
        <div class="modal-actions">
          <button type="button" class="action-btn secondary" data-autofocus @click="answer(false)">{{ c.cancelText }}</button>
          <button type="button" class="action-btn" :class="c.danger ? 'danger' : 'primary'" @click="answer(true)">{{ c.confirmText }}</button>
        </div>
      </div>
    </div>
  `,
  setup() {
    return { c: sharedConfirm, answer: answerConfirm };
  },
};

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
  const m = (model || "").toLowerCase(); // "9B" and "9b", "gemma3-1b", …
  const d = (temperature, max_tokens, contextWindowSize) =>
    ({ ...penalties, temperature, max_tokens, contextWindowSize });

  if (m.includes("135m") || m.includes("360m")) return d(0.3, 256, 2048);
  if (m.includes("0.5b") || m.includes("0.6b") || m.includes("0.8b")) return d(0.4, 512, 2048);
  if (m.includes("1.1b") || m.includes("1.7b") || (m.includes("1b") && !m.includes("1.5b"))) return d(0.4, 512, 4096);
  if (m.includes("1.5b") || m.includes("1.6b") || m.includes("1_6b")) return d(0.4, 768, 4096);
  if (m.includes("2b")) return d(0.6, 768, 4096);
  if (m.includes("3b") || m.includes("4b")) return d(0.7, 1024, 8192);
  if (m.includes("mini")) return d(0.7, 1024, 8192);
  if (m.includes("7b") || m.includes("8b") || m.includes("9b")) return d(0.7, 1024, 8192);
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
  // Let Qwen3 / Qwen3.5 reason step by step before answering (slower)
  thinking: false,
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

// ── Writing speed ─────────────────────────────────────────────────────────
// How fast each model writes on this device (words per second), measured
// by the worker after the model check and after each reply.
const SPEED_KEY = "webllm-model-speed";
const sharedModelSpeed = vRef(loadModelSpeed()); // {modelId: {wps, source}}

function loadModelSpeed() {
  try { return JSON.parse(localStorage.getItem(SPEED_KEY) || "{}") || {}; }
  catch { return {}; }
}
function recordModelSpeed({ model, wps, source }) {
  if (!model) return;
  const next = blendSpeed(sharedModelSpeed.value[model], wps, source);
  if (!next) return;
  sharedModelSpeed.value = { ...sharedModelSpeed.value, [model]: next };
  try { localStorage.setItem(SPEED_KEY, JSON.stringify(sharedModelSpeed.value)); } catch {}
}

// Shorter time limits for the tests (see pace.js); unset in normal use.
function timeLimitOverrides() {
  try { return JSON.parse(localStorage.getItem("webllm-time-limits") || "null"); }
  catch { return null; }
}

function isF16Model(id) { return /q4f16|q0f16/.test(id || ""); }

// True when 16-bit models are known not to work here: no shader-f16
// support, or a q4f16 model failed its check on this device.
function f16Problem() {
  if (sharedDiagnostics.value && sharedDiagnostics.value.shaderF16 === false) return true;
  return Object.entries(sharedModelHealth.value)
    .some(([id, h]) => isF16Model(id) && h && h.ok === false);
}

// ── Downloaded models ─────────────────────────────────────────────────────
// localStorage holds the list (the source of truth, also edited by the
// download cancel); sharedCachedTick changes whenever the app edits it, so
// labels that show "✓ downloaded" update.
const CACHED_KEY = "webllm-cached-models";

// Screens at least this wide show the chat list beside the chat (docked)
// instead of as a drawer. Keep in sync with the same width in style.css.
const WIDE_QUERY = "(min-width: 1100px)";
// "docked" (default) or "hidden": whether the docked list is shown
const SIDEBAR_KEY = "webllm-sidebar";
function loadSidebarPinned() {
  try { return localStorage.getItem(SIDEBAR_KEY) !== "hidden"; } catch { return true; }
}
const sharedCachedTick = vRef(0);
function getCachedModels() {
  try { return JSON.parse(localStorage.getItem(CACHED_KEY) || "[]"); }
  catch { return []; }
}
function setCachedModels(list) {
  try { localStorage.setItem(CACHED_KEY, JSON.stringify(list)); } catch {}
  sharedCachedTick.value++;
}
function isModelCached(id) {
  return getCachedModels().includes(id);
}

// A model as people read it: "Qwen3.5 2B · 16-bit". The full ID is still
// the option's value and is shown in Settings for reference.
function modelShortName(id) {
  const precision = modelPrecision(id);
  return friendlyModelName(id) + (precision ? " · " + precision : "");
}

// Text for a model in the menus: name, precision, download size, ✓ when
// it's already on this device, and a warning where it won't work well.
function modelOptionLabel(id) {
  void sharedCachedTick.value; // re-render when the downloaded list changes
  const size = formatSize(sharedModelSizes.value[id]);
  let label = modelShortName(id) + (size ? " · " + size : "");
  if (isModelCached(id)) label += " ✓";
  const h = sharedModelHealth.value[id];
  if (h && h.ok === false) {
    return `${label}  ⚠ ${h.reason === "no-f16" ? "needs 16-bit GPU support" : "garbled on this GPU"}`;
  }
  if (isF16Model(id) && f16Problem()) return `${label}  ⚠ 16-bit, may not work here`;
  return label;
}

// "model|contextWindow" of the engine loaded (or loading) in the worker,
// "" when none. Settings uses it to tell when a change needs a reload.
const sharedLoadedKey = vRef("");
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
let sharedOpenPicker = () => {};

// ── Offline / installable app ─────────────────────────────────────────────
const sharedOnline = vRef(navigator.onLine);
const sharedOfflineReady = vRef(null);   // null = unknown, true / false
const sharedInstallPrompt = vRef(null);  // deferred "Install app" prompt
const sharedSwSupported = "serviceWorker" in navigator;

// Where chats are saved: "indexeddb", or "localstorage" when IndexedDB
// can't be used (see chatstore.js).
const sharedChatStorage = vRef({ kind: null });

window.addEventListener("online",  () => { sharedOnline.value = true; });
window.addEventListener("offline", () => { sharedOnline.value = false; });

// Chrome/Edge/Android offer installing the app; keep the prompt for the
// "Install app" button instead of showing the browser's own banner.
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  sharedInstallPrompt.value = e;
});
window.addEventListener("appinstalled", () => { sharedInstallPrompt.value = null; });

function isInstalledApp() {
  return window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
}

async function installApp() {
  const prompt = sharedInstallPrompt.value;
  if (!prompt) return;
  prompt.prompt();
  try { await prompt.userChoice; } catch {}
  sharedInstallPrompt.value = null;
}

// Register sw.js and ask it whether everything needed to start offline
// is saved. Only over https or on localhost (service worker rules).
function setupOffline() {
  if (!sharedSwSupported) { sharedOfflineReady.value = false; return; }
  navigator.serviceWorker.addEventListener("message", e => {
    if (e.data?.type === "offline-status") sharedOfflineReady.value = !!e.data.ready;
  });
  const ask = () => navigator.serviceWorker.ready
    .then(reg => reg.active && reg.active.postMessage({ type: "offline-status" }))
    .catch(() => {});
  navigator.serviceWorker.register("./sw.js")
    .then(() => { ask(); setTimeout(ask, 5000); })
    .catch(err => {
      console.warn("Service worker registration failed", err);
      sharedOfflineReady.value = false;
    });
  navigator.serviceWorker.addEventListener("controllerchange", ask);
}
setupOffline();

// ── "New version available" ───────────────────────────────────────────────
// A tab can stay open across a deploy (and the service worker only notices
// changes to sw.js itself). So the app fingerprints its own files when it
// starts and checks again every 30 minutes and when the tab comes back into
// view; if anything changed it offers to reload. The check also refreshes
// the offline copies, so the reload gets the new version even when slow.
const sharedUpdateAvailable = vRef(false);
const APP_FILES = [
  "./index.html", "./app.js", "./worker.js", "./sw.js", "./style.css",
  "./personas.js", "./markdown.js", "./quality.js", "./context.js",
  "./picker.js", "./chatstore.js", "./attachments.js", "./pace.js",
  "./version.js",
];
const UPDATE_CHECK_EVERY_MS = 30 * 60 * 1000;
const UPDATE_CHECK_MIN_GAP_MS = 5 * 60 * 1000;
let appFingerprint = null;
let lastUpdateCheck = 0;

// FNV-1a over the files' text: enough to notice a change
async function fingerprintAppFiles() {
  const texts = await Promise.all(APP_FILES.map(async file => {
    const res = await fetch(file, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${file}: ${res.status}`);
    return res.text();
  }));
  let h = 2166136261;
  const all = texts.join("\u0000");
  for (let i = 0; i < all.length; i++) h = Math.imul(h ^ all.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16) + ":" + all.length;
}

// Returns true when a newer version was found. Offline or failed checks
// change nothing.
async function checkForUpdate() {
  if (!navigator.onLine) return false;
  try {
    const fingerprint = await fingerprintAppFiles();
    lastUpdateCheck = Date.now();
    if (appFingerprint === null) {
      appFingerprint = fingerprint;
      return false;
    }
    if (fingerprint !== appFingerprint) {
      sharedUpdateAvailable.value = true;
      return true;
    }
  } catch (err) {
    console.warn("Update check failed", err);
  }
  return false;
}

setTimeout(checkForUpdate, 3000);
setInterval(checkForUpdate, UPDATE_CHECK_EVERY_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastUpdateCheck > UPDATE_CHECK_MIN_GAP_MS) {
    checkForUpdate();
  }
});
// For tests and debugging: check right away
window.webllmCheckForUpdate = checkForUpdate;

const Home = {
  template: `
    <div class="container" :class="{ 'sidebar-docked': sidebarDocked }">

      <!-- Model doesn't work on this GPU (failed check or collapsed reply) -->
      <div class="modal-overlay" v-if="healthModal.show" @click.self="keepModelAnyway">
        <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="health-title" v-dialog="keepModelAnyway">
          <div class="modal-icon" aria-hidden="true">⚠</div>
          <h2 class="modal-title" id="health-title">
            {{ healthModal.reason === "degenerate" ? "This model may not work on your GPU" : "This model doesn't work on your GPU" }}
          </h2>
          <p class="modal-body">
            <strong>{{ modelShortName(healthModal.model) }}</strong> <span class="model-id">({{ healthModal.model }})</span>
            <template v-if="healthModal.reason === 'no-f16'"> needs 16-bit GPU support, which this browser doesn't offer.</template>
            <template v-else-if="healthModal.reason === 'degenerate'"> just gave a reply that collapsed into repeated words.</template>
            <template v-else> gave garbled text in a quick check<span v-if="healthModal.sample">: <em>“{{ healthModal.sample }}…”</em></span>.</template>
            <br><br>
            This usually means the GPU does 16-bit math incorrectly. Models marked <strong>q4f32</strong> avoid it.
          </p>
          <p v-if="healthModal.suggestion" class="modal-body health-suggestion">
            Suggested: <strong>{{ modelShortName(healthModal.suggestion) }}</strong>
            <span v-if="modelSizes[healthModal.suggestion]">(~{{ formatSize(modelSizes[healthModal.suggestion]) }})</span>
            <br><span class="model-id">{{ healthModal.suggestion }}</span>
          </p>
          <div class="modal-actions">
            <button class="action-btn secondary" @click="keepModelAnyway">Keep this model</button>
            <button v-if="healthModal.suggestion" class="action-btn primary" @click="switchToSuggestion">Switch model</button>
          </div>
        </div>
      </div>

      <!-- Model picker: first launch, or "Help me choose a model" -->
      <div v-if="picker.show" class="modal-overlay" @click.self="closePicker">
        <div class="modal picker" role="dialog" aria-modal="true" aria-labelledby="picker-title" v-dialog="closePicker">
          <template v-if="picker.step === 1">
            <h2 class="modal-title" id="picker-title">
              {{ picker.firstRun ? "Welcome! Let's pick a model" : "Choose a model" }}
            </h2>
            <p class="modal-body picker-intro">
              Everything runs privately in your browser. The model downloads once and is kept for next time.
            </p>
            <p class="picker-question">What will you mostly use it for?</p>
            <div class="picker-options">
              <button
                v-for="u in uses"
                :key="u.id"
                type="button"
                class="picker-option"
                :class="{ active: picker.use === u.id }"
                :aria-pressed="picker.use === u.id ? 'true' : 'false'"
                :data-autofocus="picker.use === u.id ? '' : null"
                @click="chooseUse(u.id)"
              >
                <span class="picker-icon" aria-hidden="true">{{ u.icon }}</span>
                <span class="picker-text">
                  <strong>{{ u.title }}</strong>
                  <span class="picker-desc">{{ u.desc }}</span>
                </span>
              </button>
            </div>
            <div class="modal-actions picker-actions">
              <button type="button" class="link-btn" @click="closePicker">
                {{ picker.firstRun ? "Skip, I'll choose myself" : "Cancel" }}
              </button>
            </div>
          </template>

          <template v-else>
            <h2 class="modal-title" id="picker-title">Pick a size</h2>
            <p class="picker-device">{{ deviceSummary }}</p>
            <div class="picker-options">
              <button
                v-for="o in pickerOptions"
                :key="o.id"
                type="button"
                class="picker-option tier"
                :class="{ active: picker.tier === o.id }"
                :aria-pressed="picker.tier === o.id ? 'true' : 'false'"
                :data-autofocus="picker.tier === o.id ? '' : null"
                @click="picker.tier = o.id"
              >
                <span class="picker-text">
                  <span class="picker-head">
                    <strong>{{ o.title }}</strong>
                    <span v-if="o.recommended" class="picker-badge">Recommended</span>
                    <span v-if="o.current" class="picker-badge muted">In use</span>
                  </span>
                  <span class="picker-model">{{ o.name }}</span>
                  <span class="picker-meta">{{ o.cached ? "Already downloaded" : (online ? "~" + (formatSize(o.sizeMb) || "?") + " download" : "Needs internet to download (~" + (formatSize(o.sizeMb) || "?") + ")") }}</span>
                  <span class="picker-desc">{{ o.desc }}</span>
                </span>
              </button>
            </div>
            <div class="modal-actions">
              <button type="button" class="action-btn secondary" @click="picker.step = 1">Back</button>
              <button type="button" class="action-btn primary" @click="confirmPick" :disabled="!selectedPick">
                {{ selectedPick && selectedPick.cached ? "Start" : "Download & start" }}
              </button>
            </div>
          </template>
        </div>
      </div>

      <!-- WebGPU error screen — full overlay, shown when GPU is incompatible -->
      <div v-if="webgpuError" class="webgpu-error-overlay">
        <div class="webgpu-error-card" role="alertdialog" aria-modal="true" aria-labelledby="webgpu-error-title" v-dialog="null">
          <div class="webgpu-error-icon" aria-hidden="true">⚠</div>
          <h2 class="webgpu-error-title" id="webgpu-error-title">WebGPU Not Available</h2>
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
          <button class="action-btn primary" style="margin-top:20px;width:100%" data-autofocus @click="webgpuError = false; applySettings()">
            Try Again
          </button>
        </div>
      </div>

      <!-- Sidebar overlay -->
      <div class="sidebar-overlay" :class="{ open: sidebarOpen && !sidebarDocked }" @click="sidebarOpen = false" aria-hidden="true"></div>

      <!-- Sessions sidebar -->
      <div
        ref="sidebarEl"
        id="chat-sidebar"
        class="sidebar"
        :class="{ open: sidebarOpen && !sidebarDocked, docked: sidebarDocked }"
        :role="sidebarDocked ? 'navigation' : 'dialog'"
        :aria-modal="sidebarDocked ? null : 'true'"
        aria-labelledby="sidebar-title"
        :inert="!sidebarOpen && !sidebarDocked"
      >
        <div class="sidebar-header">
          <h2 class="sidebar-title" id="sidebar-title">Chats</h2>
          <div class="sidebar-header-actions">
            <button class="new-chat-btn" @click="newChat" :disabled="loading || modelLoading">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Chat
            </button>
            <button type="button" class="sidebar-close" @click="closeSidebar" :aria-label="sidebarDocked ? 'Hide chat list' : 'Close chat list'" :title="sidebarDocked ? 'Hide' : 'Close'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Search box -->
        <div class="sidebar-search">
          <svg class="search-icon" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            class="search-input"
            type="search"
            placeholder="Search chats…"
            aria-label="Search chats"
            v-model="searchQuery"
            @input="onSearchInput"
          />
          <button v-if="searchQuery" type="button" class="search-clear" @click="searchQuery = ''; searchResults = []" title="Clear search" aria-label="Clear search">
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Search results -->
        <div v-if="searchQuery" class="sidebar-list">
          <div v-if="searchResults.length === 0 && !searchPending" class="sidebar-empty" role="status">
            No results for "{{ searchQuery }}"
          </div>
          <div v-if="searchPending" class="sidebar-empty" role="status">Searching…</div>
          <template v-for="r in searchResults" :key="r.session.id">
            <div
              class="session-item search-result-item"
              :class="{ active: r.session.id === currentSessionId }"
            >
              <button
                type="button"
                class="session-open"
                @click="loadSession(r.session.id)"
                :aria-current="r.session.id === currentSessionId ? 'true' : null"
              >
                <span class="session-meta">
                  <span class="session-title">{{ r.session.id === currentSessionId ? "Current chat" : r.session.title }}</span>
                  <span class="session-date">{{ formatDate(r.session.ts) }}</span>
                </span>
                <!-- Show up to 3 matching excerpts per session -->
                <span
                  v-for="(match, mi) in r.matches.slice(0, 3)"
                  :key="mi"
                  class="search-match"
                >
                  <span class="match-role">{{ match.role === "user" ? "You" : "AI" }}</span>
                  <span class="match-snippet" v-html="match.highlighted"></span>
                </span>
                <span v-if="r.matches.length > 3" class="search-more">+{{ r.matches.length - 3 }} more matches</span>
              </button>
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
          >
            <button
              type="button"
              class="session-open"
              @click="loadSession(s.id)"
              :aria-current="s.id === currentSessionId ? 'true' : null"
            >
              <span class="session-meta">
                <span class="session-title"><span v-if="s.persona" class="session-persona" :title="personaName(s.persona)">{{ personaIcon(s.persona) }}</span>{{ s.title }}</span>
                <span class="session-date">{{ formatDate(s.ts) }}</span>
              </span>
              <span class="session-preview">{{ s.preview }}</span>
              <span class="session-model">{{ friendlyModelName(s.model) }}</span>
            </button>
            <button type="button" class="session-delete" @click="deleteSession(s.id)" title="Delete chat" :aria-label="'Delete chat: ' + s.title">
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="header">
        <div class="header-left">
          <button
            ref="menuBtn"
            class="icon-btn"
            @click="toggleSidebar"
            title="Chat history"
            aria-label="Chat history"
            aria-controls="chat-sidebar"
            :aria-expanded="sidebarOpen || sidebarDocked ? 'true' : 'false'"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div class="header-brand">
            <h1 class="header-title">Private AI Chat</h1>
            <span class="header-tagline">Runs on this device</span>
          </div>
        </div>
        <div class="header-actions">
          <button class="icon-btn" @click="newChat" :disabled="loading || modelLoading" title="New chat" aria-label="New chat">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="icon-btn" @click="$router.push('/settings')" title="Settings" aria-label="Settings">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="status-bar">
        <span class="status-dot" :class="{ active: !modelLoading && !loading }" aria-hidden="true"></span>
        <span class="status-text" :title="status">{{ status }}</span>
        <!-- Announced to screen readers. Download progress updates many times
             a second, so only its start is announced, not every step. -->
        <span class="sr-only" role="status" aria-live="polite">{{ announcedStatus }}</span>
        <span v-if="!online" class="offline-badge" title="No internet connection. Downloaded models still work.">Offline</span>
      </div>

      <!-- A newer version of the app was deployed while this tab was open -->
      <div v-if="updateAvailable && !updateDismissed" class="update-banner" role="status">
        <span class="update-text">A new version of the app is available.</span>
        <button type="button" class="action-btn primary update-reload" @click="reloadApp" :disabled="loading">
          {{ loading ? "Reload after this reply" : "Reload" }}
        </button>
        <button type="button" class="update-dismiss" @click="updateDismissed = true" title="Later" aria-label="Dismiss">×</button>
      </div>

      <!-- Model download / loading progress -->
      <div v-if="modelLoading && loadInfo" class="load-panel" :class="'phase-' + loadInfo.phase">
        <div class="load-head">
          <span class="load-title">{{ loadTitle }}</span>
          <button
            v-if="isDownloading && loadInfo.phase === 'download'"
            type="button"
            class="load-cancel"
            @click="cancelDownload"
          >Cancel</button>
        </div>
        <div
          class="load-track"
          role="progressbar"
          :aria-label="loadTitle"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="loadInfo.percent !== null ? loadInfo.percent : null"
          :aria-valuetext="loadDetail || null"
          :class="{ indeterminate: loadInfo.percent === null }"
        >
          <div class="load-fill" :style="loadInfo.percent !== null ? { width: loadInfo.percent + '%' } : null"></div>
        </div>
        <div class="load-detail">{{ loadDetail }}</div>
        <p v-if="loadInfo.phase === 'download'" class="load-note">
          Downloads once, then loads from this device. Keep this tab open until it finishes.
        </p>
      </div>

      <div class="messages" ref="messagesContainer" @click="onMessagesClick" @scroll.passive="onMessagesScroll" role="log" aria-label="Conversation" :aria-busy="loading ? 'true' : 'false'">
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
          <button
            v-if="!lastAppliedModel && !modelLoading"
            type="button"
            class="action-btn primary choose-model-btn"
            @click="openPicker()"
          >Choose a model to start</button>
          <p class="welcome-note">
            Runs privately in your browser. AI can make mistakes, so double-check important facts.
            <button v-if="lastAppliedModel" type="button" class="link-btn inline" @click="openPicker()">Help me choose a model</button>
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
              {{ cutOffNote(item.message.cutOff) }}
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

      <!-- Documents from earlier versions were shared by all chats -->
      <div v-if="legacyDocs.length" class="legacy-docs-note">
        <span>
          Documents added in an earlier version ({{ legacyDocs.join(", ") }}) were shared by all chats and are no longer used.
          Attach the files you need to a chat instead.
        </span>
        <button type="button" class="link-btn inline" @click="removeLegacyDocs">Remove them</button>
      </div>

      <div class="footer-container">
        <button
          v-if="showJumpToLatest && messages.length"
          type="button"
          class="jump-latest"
          @click="jumpToLatest"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
          {{ loading ? "Follow the reply" : "Jump to latest" }}
        </button>
        <!-- Documents attached to this chat -->
        <div v-if="attachments.length" class="attachments" aria-label="Documents attached to this chat">
          <div
            v-for="a in attachments"
            :key="a.id"
            class="attachment-chip"
            :class="a.status"
            :title="a.status === 'error' ? a.error : a.name"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            <span class="attachment-name">{{ a.name }}</span>
            <span class="attachment-meta">{{ attachmentMeta(a) }}</span>
            <button type="button" class="attachment-remove" @click="removeAttachment(a.id)" :aria-label="'Remove ' + a.name" title="Remove from this chat">×</button>
          </div>
        </div>
        <p v-if="speedNote" class="speed-note" :class="{ slow: speedNote.slow }">
          <span>{{ speedNote.text }}</span>
          <template v-if="speedNote.faster">
            For quicker replies, try
            <button type="button" class="link-btn speed-switch" @click="switchToFaster" :disabled="modelLoading || loading">{{ speedNote.fasterName }}</button>
            (faster, but makes more mistakes).
          </template>
        </p>
        <p v-if="accuracyHint" class="accuracy-note" role="note">
          <span>⚠ Small models like {{ accuracyHint }} often get facts wrong, even when they sound sure. Check anything important.</span>
          <button type="button" class="accuracy-dismiss" @click="dismissAccuracyHint" aria-label="Hide this hint for this model" title="Hide for this model">×</button>
        </p>
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
            @change="applySettings()"
            :disabled="modelLoading || loading"
            class="model-select"
            title="Model"
            aria-label="Model"
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

          <button
            class="clear-btn"
            @click="clearConversation"
            :disabled="messages.length === 0"
            title="Delete this chat"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
            Clear
          </button>

          <!-- A real button opening a hidden file input: a visible-but-tiny
               input would add the browser's "No file chosen" text to copied
               text and screen readers. -->
          <button type="button" class="upload-btn" title="Attach a document to this chat (PDF, TXT, Markdown)" @click="$refs.attachInput.click()">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            <span>Attach</span>
          </button>
          <input ref="attachInput" type="file" class="attach-input" hidden accept=".pdf,.txt,.md,.markdown,text/plain,text/markdown,application/pdf" @change="attachFile" />

        </div>

        <div class="footer">
          <textarea
            ref="promptInput"
            v-model="prompt"
            aria-label="Message"
            rows="1"
            :placeholder="promptPlaceholder"
            :enterkeyhint="isTouch ? 'enter' : 'send'"
            @keydown.enter.exact="onPromptEnter"
            @keydown.ctrl.enter="onPromptShortcut"
            @keydown.meta.enter="onPromptShortcut"
          ></textarea>
          <!-- Stop generation button — replaces Send while streaming -->
          <button
            v-if="loading"
            class="send-btn stop-gen-btn"
            @click="stopGeneration"
            title="Stop generation"
            aria-label="Stop generation"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          </button>

          <!-- Send button — shown when not streaming -->
          <button
            v-else
            class="send-btn"
            @click="send"
            :disabled="modelLoading || !prompt.trim()"
            title="Send"
            aria-label="Send message"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
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
    // The engine loaded in the worker: sharedLoadedKey ("model|context").
    // Set after a GPU crash forced the fallback model on this page load.
    // A second crash then stops instead of restarting forever.
    let safeModeActive = false;

    // Group the flat models list into labelled tiers for the <optgroup> select.
    // Order and labels match the AVAILABLE_MODELS tiers in worker.js.
    // Tests run on the lower-cased ID, in order; the first match wins.
    const MODEL_GROUPS_DEF = [
      { label: "Ultra-micro (100–400M)", test: m => m.includes("135m") || m.includes("360m") },
      { label: "Micro (0.5–0.8B)",       test: m => m.includes("0.5b") || m.includes("0.6b") || m.includes("0.8b") },
      { label: "Lightweight (1–1.7B)",   test: m => m.includes("1.1b") || (m.includes("1b") && !m.includes("1.5b")) || m.includes("1.7b") || m.includes("1_6b") || m.includes("1.6b") },
      { label: "Small (1.5B)",           test: m => m.includes("1.5b") },
      { label: "Mid (2–4B)",             test: m => m.includes("2b") || m.includes("3b") || m.includes("4b") },
      { label: "Upper-mid (3.8B)",       test: m => m.includes("mini") },
      { label: "Large (7–9B)",           test: m => m.includes("7b") || m.includes("8b") || m.includes("9b") },
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
        const matched = visibleModels.value.filter(m => g.test(m.toLowerCase()) && !assigned.has(m));
        matched.forEach(m => assigned.add(m));
        return { label: g.label, models: matched };
      });
      // Catch any unmatched models in an "Other" group
      const other = visibleModels.value.filter(m => !assigned.has(m));
      if (other.length) groups.push({ label: "Other", models: other });
      return groups.filter(g => g.models.length > 0);
    });
    const conversationRestored = ref(false); // guard: restore once per page load
    const currentSessionId = ref("");
    const sessions = sharedSessions;
    const sidebarOpen = sharedSidebarOpen;
    const modelSizes = sharedModelSizes;
    const isDownloading = sharedIsDownloading;
    const webgpuError = sharedWebgpuError;

    // The chat list.
    // On wide screens (WIDE_QUERY) it is docked: a column beside the chat,
    // part of the page like any navigation. The menu button and × hide and
    // show it, and that choice is remembered.
    // Otherwise it is a drawer over the chat: while it's open, focus moves
    // into it and stays there, and Escape (or ×) closes it and returns
    // focus to the menu button. While closed it is inert, so Tab doesn't
    // wander into a panel that's off screen.
    const sidebarEl = ref(null);
    const menuBtn = ref(null);
    const wideQuery = window.matchMedia ? window.matchMedia(WIDE_QUERY) : null;
    const isWide = ref(!!wideQuery?.matches);
    wideQuery?.addEventListener?.("change", e => { isWide.value = e.matches; });
    const sidebarPinned = ref(loadSidebarPinned());
    const sidebarDocked = Vue.computed(() => isWide.value && sidebarPinned.value);

    function setSidebarPinned(pinned) {
      sidebarPinned.value = pinned;
      try { localStorage.setItem(SIDEBAR_KEY, pinned ? "docked" : "hidden"); } catch {}
    }

    // Menu button: hide / show the docked list on wide screens, open /
    // close the drawer otherwise.
    function toggleSidebar() {
      if (isWide.value) setSidebarPinned(!sidebarPinned.value);
      else sidebarOpen.value = !sidebarOpen.value;
    }

    // × in the list's header
    function closeSidebar() {
      if (sidebarDocked.value) {
        setSidebarPinned(false);
        nextTick(() => menuBtn.value?.focus());
      } else {
        sidebarOpen.value = false;
      }
    }

    // Becoming docked (window made wider) closes the drawer, so its focus
    // trap ends; the list simply stays on screen.
    Vue.watch(sidebarDocked, docked => { if (docked) sidebarOpen.value = false; });

    let releaseSidebarFocus = null;
    Vue.watch(sidebarOpen, open => {
      if (open && !sidebarDocked.value && sidebarEl.value && !releaseSidebarFocus) {
        releaseSidebarFocus = openFocusScope(sidebarEl.value, {
          onEscape: () => { sidebarOpen.value = false; },
          returnTo: () => menuBtn.value,
        });
      } else if (!open && releaseSidebarFocus) {
        const release = releaseSidebarFocus;
        releaseSidebarFocus = null;
        release();
      }
    }, { flush: "post" });

    // What screen readers hear from the status bar. Download progress
    // changes many times a second, so it is announced once when it starts.
    const announcedStatus = Vue.computed(() =>
      isDownloading.value ? "Downloading the model…" : status.value);

    // Documents attached to the chat on screen: attachments for the chips,
    // attachmentRecords with the full text (and chunks) for the worker.
    const attachments = ref([]);  // [{ id, name, chars, status, current, total, error }]
    let attachmentRecords = [];
    const legacyDocs = ref([]);   // file names in the old shared index
    // Tracks the model that was cancelled so applySettings won't re-trigger it
    const postCancelModel = ref("");
    // Model and settings from before the user switched models, so a
    // cancelled download can go back to them.
    let settingsBeforeSwitch = null;

    // ── Model loading progress ───────────────────────────────────────────
    // loadInfo describes the load in progress for the progress panel:
    // { phase: "download" | "cache" | "gpu" | "other", percent, doneMb, eta }
    const loadInfo = ref(null);
    let loadPhaseStart = null; // { phase, pct, time } for the time estimate

    function updateLoadProgress(text, pct) {
      const info = describeLoadProgress(text, pct);
      const now = Date.now();
      if (!loadPhaseStart || loadPhaseStart.phase !== info.phase) {
        loadPhaseStart = { phase: info.phase, pct: info.percent || 0, time: now };
      }
      const eta = info.phase === "download" && info.percent !== null
        ? estimateRemaining({ startPct: loadPhaseStart.pct, startTime: loadPhaseStart.time, pct: info.percent, now })
        : null;
      loadInfo.value = { ...info, eta };
      status.value = loadTitle.value + (info.percent !== null ? ` · ${info.percent}%` : "");
    }

    Vue.watch(modelLoading, loadingNow => {
      if (!loadingNow) { loadInfo.value = null; loadPhaseStart = null; }
    });

    const loadTitle = Vue.computed(() => {
      const name = modelShortName(settings.value.model);
      switch (loadInfo.value?.phase) {
        case "download": return `Downloading ${name}`;
        case "cache":    return `Loading ${name} from this device`;
        case "gpu":      return `Preparing ${name} for your GPU`;
        default:         return `Loading ${name}`;
      }
    });

    // "34% · 760 MB of ~2.2 GB · about 2 min left"
    const loadDetail = Vue.computed(() => {
      const info = loadInfo.value;
      if (!info) return "";
      const parts = [];
      if (info.percent !== null) parts.push(info.percent + "%");
      if (info.phase === "download" && info.doneMb !== null) {
        const total = modelSizes.value[settings.value.model] || 0;
        parts.push(total && info.doneMb <= total
          ? `${formatSize(info.doneMb)} of ~${formatSize(total)}`
          : `${formatSize(info.doneMb)} downloaded`);
      }
      if (info.eta) parts.push(info.eta);
      return parts.join(" · ");
    });

    function markModelCached(modelId) {
      const cached = getCachedModels();
      if (!cached.includes(modelId)) setCachedModels([...cached, modelId]);
    }

    const settings = sharedSettings;
    // Always use the module-level worker via getWorker() — never snapshot it
    // into a local variable, as fatal restarts replace the module-level ref.

    // ── Scrolling ────────────────────────────────────────────────────────
    // New text keeps the chat scrolled to the bottom only while the reader
    // is there. Scrolling up (to reread something while a reply streams)
    // stops that, and a "Jump to latest" button appears instead. Sending a
    // message, opening a chat, Regenerate and Continue always go to the
    // bottom.
    const NEAR_BOTTOM_PX = 80;
    const followLatest = ref(true);
    const showJumpToLatest = ref(false);

    function distanceFromBottom(el) {
      return el.scrollHeight - el.scrollTop - el.clientHeight;
    }

    // Only scrolling up stops following. lastScrollTop is recorded both
    // here and whenever the app scrolls itself, so a scroll event that
    // arrives late (the browser delivers them on the next frame, later
    // under load) is never compared with a stale position, and content
    // growing or our own scrolling never counts as the reader scrolling up.
    let lastScrollTop = 0;
    function onMessagesScroll() {
      const el = messagesContainer.value;
      if (!el) return;
      const atBottom = distanceFromBottom(el) <= NEAR_BOTTOM_PX;
      const scrolledUp = el.scrollTop < lastScrollTop - 2;
      lastScrollTop = el.scrollTop;
      if (atBottom) followLatest.value = true;
      else if (scrolledUp) followLatest.value = false;
      showJumpToLatest.value = !followLatest.value && !atBottom;
    }

    function setScrollToBottom(el) {
      el.scrollTop = el.scrollHeight;
      lastScrollTop = el.scrollTop;
      showJumpToLatest.value = false;
    }

    // Follow (or offer the button) after any change to the chat's content:
    // streamed text, a finished reply growing as code is highlighted and
    // its buttons appear, a chat being opened. Coalesced to once a frame.
    let stickFrame = 0;
    function stickToBottom() {
      if (stickFrame) return;
      stickFrame = requestAnimationFrame(() => {
        stickFrame = 0;
        const el = messagesContainer.value;
        if (!el) return;
        if (followLatest.value) setScrollToBottom(el);
        else showJumpToLatest.value = distanceFromBottom(el) > NEAR_BOTTOM_PX;
      });
    }
    onMounted(() => {
      const el = messagesContainer.value;
      if (!el || typeof MutationObserver === "undefined") return;
      new MutationObserver(stickToBottom).observe(el, { childList: true, subtree: true, characterData: true });
    });

    // force: go to the bottom and follow again (sending, opening a chat,
    // Regenerate, Continue, Jump to latest). Otherwise only while following.
    async function scrollBottom({ force = false } = {}) {
      if (force) followLatest.value = true;
      await nextTick();
      const el = messagesContainer.value;
      if (!el) return;
      if (followLatest.value) setScrollToBottom(el);
      else showJumpToLatest.value = distanceFromBottom(el) > NEAR_BOTTOM_PX;
    }

    function jumpToLatest() {
      scrollBottom({ force: true });
      const input = promptInput.value;
      if (input && !isTouch.value) input.focus({ preventScroll: true });
    }

    function engineKey() {
      return `${settings.value.model}|${settings.value.contextWindowSize}`;
    }

    // Settings the worker can apply without reloading the model.
    function liveConfig() {
      return { ...settings.value, system_prompt: effectiveSystemPrompt(), timeLimits: timeLimitOverrides() };
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

    // ── Message box ──────────────────────────────────────────────────────
    // With a keyboard, Enter sends and Shift+Enter starts a new line. On
    // touch screens Enter starts a new line (as in most phone chat apps)
    // and the Send button sends; the placeholder doesn't mention keys
    // there. Ctrl/Cmd+Enter sends everywhere. Enter that confirms an
    // input-method composition (Chinese, Japanese, Korean…) never sends.
    const touchQuery = window.matchMedia
      ? window.matchMedia("(hover: none) and (pointer: coarse)")
      : null;
    const isTouch = ref(!!touchQuery?.matches);
    touchQuery?.addEventListener?.("change", e => { isTouch.value = e.matches; });
    const promptPlaceholder = Vue.computed(() => isTouch.value
      ? "Ask something…"
      : "Ask something… (Enter to send, Shift+Enter for a new line)");

    function isComposing(e) {
      return e.isComposing || e.keyCode === 229;
    }
    function onPromptEnter(e) {
      if (isComposing(e) || isTouch.value) return; // new line
      e.preventDefault();
      send();
    }
    function onPromptShortcut(e) {
      if (isComposing(e)) return;
      e.preventDefault();
      send();
    }

    // The message box grows with its text, up to its max-height in CSS.
    function autoGrow() {
      const el = promptInput.value;
      if (!el) return;
      el.style.height = "auto";
      const max = parseFloat(getComputedStyle(el).maxHeight) || 160;
      el.style.height = Math.min(el.scrollHeight + 2, max) + "px";
    }
    Vue.watch(prompt, () => nextTick(autoGrow));

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
      scrollBottom({ force: true });
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
      scrollBottom({ force: true });

      // Rewind the model's memory to just before the question; generate
      // then adds the question again.
      getWorker().postMessage({
        type: "restore-history",
        history: historyForWorker(list.slice(0, -1)),
      });

      loading.value = true;
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

      scrollBottom({ force: role === "user" });
    }

    async function send() {
      const text = prompt.value.trim();

      // No model chosen yet (first launch, picker skipped): choose one first
      if (text && !lastAppliedModel.value && !modelLoading.value) {
        openPicker();
        return;
      }

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
        config: liveConfig(),
      });
    }

    // ── Attached documents ───────────────────────────────────────────────

    function attachmentView(record, extra = {}) {
      const needsIndex = !record.chunks && record.chars > INDEX_MIN_CHARS;
      return {
        id: record.id,
        name: record.name,
        chars: record.chars,
        status: needsIndex ? "indexing" : "ready",
        current: 0,
        total: 0,
        error: "",
        ...extra,
      };
    }

    function attachmentMeta(a) {
      if (a.status === "reading") return "Reading…";
      if (a.status === "indexing") return a.total ? `Indexing ${a.current}/${a.total}` : "Indexing…";
      if (a.status === "error") return "Can't search it";
      return a.chars >= 1000 ? `${Math.round(a.chars / 1000)}k chars` : `${a.chars} chars`;
    }

    // Tell the worker which documents belong to the chat on screen
    function sendAttachments() {
      getWorker().postMessage({
        type: "set-attachments",
        chatId: currentSessionId.value,
        docs: attachmentRecords.map(r => ({ id: r.id, name: r.name, text: r.text, chunks: r.chunks || null })),
      });
    }

    async function loadAttachments(chatId) {
      let list = [];
      try { list = await (await chatStoreReady).listAttachments(chatId); } catch {}
      if (chatId !== currentSessionId.value) return; // another chat opened meanwhile
      attachmentRecords = list;
      attachments.value = list.map(r => attachmentView(r));
      sendAttachments();
    }

    async function readDocumentText(file) {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (!isPdf) return await file.text();
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      let text = "";
      for (let n = 1; n <= pdf.numPages; n++) {
        const content = await (await pdf.getPage(n)).getTextContent();
        text += content.items.map(item => item.str).join(" ") + "\n";
      }
      return text;
    }

    // Attach a file to the chat on screen
    async function attachFile(event) {
      const file = event.target.files[0];
      event.target.value = ""; // so the same file can be attached again
      if (!file) return;

      const maxMB = settings.value.maxFileSizeMB || 50;
      if (file.size > maxMB * 1024 * 1024) {
        status.value = `⚠ ${file.name} is too large (${(file.size / 1048576).toFixed(1)} MB). Maximum is ${maxMB} MB.`;
        return;
      }

      const id = genId();
      const chatId = currentSessionId.value;
      attachments.value = [...attachments.value, { id, name: file.name, chars: 0, status: "reading" }];
      const drop = message => {
        attachments.value = attachments.value.filter(a => a.id !== id);
        status.value = message;
      };

      let text;
      try {
        text = (await readDocumentText(file)).trim();
      } catch (err) {
        drop(`⚠ Couldn't read ${file.name}: ${err.message}`);
        return;
      }
      if (!text) {
        drop(`⚠ No text found in ${file.name} (scanned PDFs without a text layer can't be read)`);
        return;
      }
      if (text.length > MAX_ATTACHMENT_CHARS) {
        drop(`⚠ ${file.name} is too long (${Math.round(text.length / 1000)}k characters). The maximum is ${MAX_ATTACHMENT_CHARS / 1000}k (~200 pages).`);
        return;
      }

      const record = { id, chatId, name: file.name, text, chars: text.length, ts: Date.now(), chunks: null };
      writeQueue = writeQueue
        .then(async () => (await chatStoreReady).saveAttachment(record))
        .catch(err => { status.value = `⚠ Couldn't save ${file.name}: ${err.message}`; });
      if (chatId !== currentSessionId.value) return; // chat changed while reading

      attachmentRecords = [...attachmentRecords, record];
      attachments.value = attachments.value.map(a => a.id === id ? attachmentView(record) : a);
      saveConversation(); // keeps a chat that so far only has a document
      sendAttachments();
      status.value = `📎 ${file.name} attached to this chat`;
    }

    function removeAttachment(id) {
      attachmentRecords = attachmentRecords.filter(r => r.id !== id);
      attachments.value = attachments.value.filter(a => a.id !== id);
      writeQueue = writeQueue
        .then(async () => (await chatStoreReady).deleteAttachment(id))
        .catch(err => console.warn("Failed removing attachment", err));
      sendAttachments();
      // A chat that was only an attachment goes away with it
      if (!messages.value.length && !attachmentRecords.length) removeChat(currentSessionId.value);
    }

    function removeLegacyDocs() {
      getWorker().postMessage({ type: "delete-legacy-documents" });
      legacyDocs.value = [];
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
          sharedLoadedKey.value = "";
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
        sharedLoadedKey.value = "";

        getWorker().postMessage({
          type: "init"
        });

        return;
      }

      switch (data.type) {
        case "downloading":
          isDownloading.value = true;
          updateLoadProgress(data.text, data.progress);
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
              sendAttachments();
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
            reply.cutOff = data.cutOff || null;   // "length" | "stall" | "time" | null
            reply.notice = data.notice || null;   // "loop" | "continue-failed" | null
          }
        
          status.value = "Ready";
        
          loading.value = false;

          saveConversation();
          // The finished reply grows (highlighted code, Copy / Regenerate)
          scrollBottom();
        
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
              // First launch, or a saved model that no longer exists. Use a
              // model that is already downloaded if there is one; otherwise
              // let the user choose instead of downloading one unasked.
              const cachedInList = getCachedModels().find(m => known.includes(m));
              // Saved settings belonged to a different model: use the new
              // model's defaults instead.
              hasSavedSettings = false;
              if (cachedInList) {
                settings.value.model = cachedInList;
              } else {
                settings.value.model = "";
                refreshSessions();
                if (!currentSessionId.value) currentSessionId.value = genId();
                status.value = "Choose a model to start";
                openPicker({ firstRun: true });
              }
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

        case "speed":
          recordModelSpeed(data);
          break;
                    
        case "webgpu-error":
          sharedLoadedKey.value = "";
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
          sharedLoadedKey.value = "";
          saveConversation();
          break;
        }

        case "legacy-documents":
          legacyDocs.value = data.files || [];
          break;

        case "attachment-progress":
          if (data.chatId !== currentSessionId.value) break;
          attachments.value = attachments.value.map(a => a.id === data.id
            ? { ...a, status: "indexing", current: data.current, total: data.total }
            : a);
          break;

        case "attachment-indexed": {
          const record = attachmentRecords.find(r => r.id === data.id);
          if (record) {
            record.chunks = data.chunks;
            writeQueue = writeQueue
              .then(async () => (await chatStoreReady).saveAttachment(record))
              .catch(err => console.warn("Failed saving document index", err));
          }
          if (data.chatId === currentSessionId.value) {
            attachments.value = attachments.value.map(a => a.id === data.id ? { ...a, status: "ready" } : a);
          }
          break;
        }

        case "attachment-error":
          if (data.chatId !== currentSessionId.value) break;
          attachments.value = attachments.value.map(a => a.id === data.id
            ? { ...a, status: "error", error: `Couldn't prepare this document for search (${data.error}). The beginning of it is still used.` }
            : a);
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
          sharedLoadedKey.value = "";
          status.value = "This model needs 16-bit GPU support, which this browser doesn't offer";
        }
        offerReplacement(data.model, data.reason, data.sample);
      }
    }

    // Why a reply was cut short, under the reply (Continue gets the rest)
    function cutOffNote(reason) {
      if (reason === "stall") return "Stopped: the model stopped writing for a minute.";
      if (reason === "time") return "Cut off at the 20-minute limit for one reply.";
      return "Cut off at the Max Tokens limit (" + settings.value.max_tokens + ").";
    }

    // How fast the current model writes here, once known, with a smaller
    // model to try when it is slow.
    const speedNote = Vue.computed(() => {
      const model = settings.value.model;
      const speed = model && sharedModelSpeed.value[model];
      if (!speed || modelLoading.value) return null;
      const slow = isSlow(speed.wps);
      const faster = slow ? fasterModel(model, [...models.value, ...sharedAltModels.value]) : "";
      return {
        slow,
        text: `${friendlyModelName(model)} writes ${formatSpeed(speed.wps)} on this device.`,
        faster,
        fasterName: faster ? modelShortName(faster) : "",
      };
    });

    // Friendly and Precise chats are where people ask factual questions, and
    // the smallest models answer those confidently but often wrongly. Shown
    // until hidden for that model.
    const ACCURACY_HINT_KEY = "webllm-accuracy-hint-hidden";
    const accuracyHintHidden = ref(loadAccuracyHintHidden());
    function loadAccuracyHintHidden() {
      try { return JSON.parse(localStorage.getItem(ACCURACY_HINT_KEY) || "[]") || []; }
      catch { return []; }
    }
    const accuracyHint = Vue.computed(() => {
      const model = settings.value.model;
      if (!model || !isSmallModel(model) || accuracyHintHidden.value.includes(model)) return "";
      if (!["friendly", "precise"].includes(currentPersonaId.value)) return "";
      return friendlyModelName(model);
    });
    function dismissAccuracyHint() {
      const model = settings.value.model;
      if (!model) return;
      accuracyHintHidden.value = [...new Set([...accuracyHintHidden.value, model])];
      try { localStorage.setItem(ACCURACY_HINT_KEY, JSON.stringify(accuracyHintHidden.value)); } catch {}
    }

    function switchToFaster() {
      const target = speedNote.value && speedNote.value.faster;
      if (!target || modelLoading.value || loading.value) return;
      settings.value.model = target;
      applySettings();
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

    // ── Model picker ─────────────────────────────────────────────────────
    const picker = ref({ show: false, step: 1, use: "chat", tier: "balanced", firstRun: false });

    function deviceInfo() {
      const uaMobile = navigator.userAgentData?.mobile;
      const mobile = typeof uaMobile === "boolean"
        ? uaMobile
        : /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
      const memoryGB = typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : undefined;
      return { mobile, memoryGB };
    }

    // q4f16 models only where 16-bit GPU math is known not to be a problem
    function f16Usable() {
      return !f16Problem();
    }

    const deviceSummary = computed(() => {
      const { mobile, memoryGB } = deviceInfo();
      const parts = [mobile ? "Phone or tablet" : "Computer"];
      if (memoryGB) parts.push(`about ${memoryGB} GB memory`);
      const d = sharedDiagnostics.value;
      if (!f16Usable()) parts.push("16-bit GPU math not reliable, so these are q4f32 models");
      else if (d && d.shaderF16 === true) parts.push("16-bit GPU math supported");
      return "Your device: " + parts.join(" · ");
    });

    const pickerOptions = computed(() => {
      const recommended = recommendTier(deviceInfo());
      const known = allModels();
      return TIERS.map(t => {
        const id = pickModelId(picker.value.use, t.id, f16Usable());
        return {
          ...t,
          model: id,
          name: friendlyModelName(id),
          sizeMb: modelSizes.value[id] || 0,
          cached: isModelCached(id),
          recommended: t.id === recommended,
          current: id === lastAppliedModel.value,
          available: known.length === 0 || known.includes(id),
        };
      }).filter(o => o.available);
    });

    const selectedPick = computed(() =>
      pickerOptions.value.find(o => o.id === picker.value.tier) || null);

    function openPicker({ firstRun = false } = {}) {
      const persona = settings.value.defaultPersona;
      const use = (USES.find(u => u.persona === persona) || USES[0]).id;
      picker.value = {
        show: true,
        step: 1,
        use,
        tier: recommendTier(deviceInfo()),
        firstRun,
      };
      sidebarOpen.value = false;
    }

    function chooseUse(id) {
      picker.value.use = id;
      picker.value.step = 2;
    }

    function closePicker() {
      picker.value.show = false;
      if (!lastAppliedModel.value && !modelLoading.value) {
        status.value = "Choose a model to start";
      }
    }

    // Load the chosen model. The picker already showed the download size,
    // so the separate download confirmation is skipped. The use also sets
    // the default persona (and this chat's, if it hasn't started yet).
    function confirmPick() {
      const pick = selectedPick.value;
      if (!pick) return;
      const use = USES.find(u => u.id === picker.value.use) || USES[0];
      picker.value.show = false;
      settings.value.defaultPersona = use.persona;
      if (messages.value.length === 0) currentPersonaId.value = use.persona;
      if (pick.model === lastAppliedModel.value) {
        saveSettings();
        return;
      }
      settings.value.model = pick.model;
      applySettings(true);
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

      // Offline: only models that are already downloaded can load.
      if (!sharedOnline.value && !isModelCached(settings.value.model)) {
        status.value = "You're offline, and this model isn't downloaded yet. Pick a downloaded model, or connect to download it.";
        settings.value.model = lastAppliedModel.value;
        return;
      }

      const isNewModel = settings.value.model !== lastAppliedModel.value;

      // Show download confirmation for first-time downloads,
      // but only if the user is actively changing models (lastAppliedModel is set).
      // On initial page load (lastAppliedModel is ""), skip confirmation so the
      // app always loads a model automatically and doesn't start with an empty UI.
      const isUserChange = lastAppliedModel.value !== "";
      // skipConfirm must be exactly true: an event handler written as
      // @change="applySettings" would pass the event here and skip the
      // question for every model.
      if (isNewModel && isUserChange && skipConfirm !== true && !isModelCached(settings.value.model)) {
        const sizeMb = modelSizes.value[settings.value.model] || 0;
        if (sizeMb > 50) {
          const model = settings.value.model;
          const previousModel = lastAppliedModel.value;
          const ok = await askConfirm({
            icon: "⬇",
            title: "Download Model?",
            subject: modelShortName(model),
            message: `About ${formatSize(sizeMb)} will be downloaded and kept in your browser. After that it loads from this device, also offline. You can cancel while it downloads.`,
            confirmText: "Download & Load",
          });
          // The choice changed meanwhile (another model was picked): leave it.
          if (settings.value.model !== model) return;
          if (!ok) {
            settings.value.model = previousModel;
            return;
          }
          // Do NOT mark as cached here — only once the model has actually
          // loaded ("Model loaded successfully"), or a cancelled download
          // would look cached forever.
          return applySettings(true);
        }
      }

      // Apply per-model defaults when the user picks a different model, or
      // on a first launch with nothing saved. On a normal page load the
      // saved settings win, so customised values survive a reload.
      // The conversation is preserved either way.
      if (isNewModel) {
        // Kept so that cancelling the download goes back to this model
        settingsBeforeSwitch = isUserChange && isModelCached(lastAppliedModel.value)
          ? { ...settings.value, model: lastAppliedModel.value }
          : null;
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
      if (sharedLoadedKey.value && sharedLoadedKey.value === engineKey()) {
        getWorker().postMessage({
          type: "update-config",
          config: liveConfig(),
        });
        status.value = "Settings applied";
        return;
      }

      modelLoading.value = true;
      sharedLoadedKey.value = engineKey();
      // Until the first progress report: an indeterminate bar
      loadInfo.value = { phase: "other", percent: null, doneMb: null, eta: null };
      loadPhaseStart = null;

      status.value = `Loading ${modelShortName(settings.value.model)}…`;
    
      getWorker().postMessage({
        type: "set-config",
        // Check the model once per device (see handleModelCheck)
        config: { ...liveConfig(), selfTest: !sharedModelHealth.value[settings.value.model] },
      });
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

      const cancelledModel = settings.value.model;

      // Remove from cache list so confirmation shows again next time
      setCachedModels(getCachedModels().filter(m => m !== cancelledModel));

      // Remember the cancelled model so applySettings won't re-trigger it
      postCancelModel.value = cancelledModel;

      // Go back to the model (and settings) from before the switch; the new
      // worker loads it again. With nothing before it (first launch), the
      // welcome screen offers the picker.
      const back = settingsBeforeSwitch;
      settingsBeforeSwitch = null;
      if (back && back.model) {
        Object.assign(settings.value, back);
        lastAppliedModel.value = back.model;
      } else {
        settings.value.model = "";
        lastAppliedModel.value = "";
      }
      saveSettings();
      loadInfo.value = null;

      // Terminate and replace the worker — the new worker sends "models"
      // on its own startup, which will trigger applySettings; we suppress
      // it for the cancelled model via postCancelModel above.
      worker = replaceWorker(onWorkerMessage);
      getWorker().onerror = onWorkerError;
      sharedLoadedKey.value = "";
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

    async function exportSessions() {
      const store = await chatStoreReady;
      await writeQueue; // include the latest saves
      const allSessions = [];
      for (const entry of sessions.value) {
        let msgs = [];
        let docs = [];
        try { msgs = await store.getMessages(entry.id); } catch {}
        try { docs = await store.listAttachments(entry.id); } catch {}
        // Documents travel as text; large ones are prepared for search again on import
        const attachedDocs = docs.map(d => ({ id: d.id, name: d.name, text: d.text, chars: d.chars, ts: d.ts }));
        allSessions.push({ ...entry, messages: msgs, ...(attachedDocs.length ? { attachments: attachedDocs } : {}) });
      }
      // Also include the chat on screen if it hasn't been saved yet
      if (messages.value.length > 0 && !sessions.value.some(s => s.id === currentSessionId.value)) {
        allSessions.unshift({
          id: currentSessionId.value,
          title: titleFromMessages(messages.value) || "Current chat",
          preview: previewFromMessages(messages.value) || "",
          model: settings.value.model || "",
          persona: currentPersonaId.value,
          ts: Date.now(),
          messages: plainMessages(messages.value),
        });
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
        const store = await chatStoreReady;
        await writeQueue;

        // Primary dedup: chat ID. Exports keep the original IDs, so
        // re-importing the same file is always caught here.
        const existingIds = new Set(sessions.value.map(s => s.id));
        existingIds.add(currentSessionId.value);

        // Secondary dedup: first + last question, for chats imported
        // before under a different ID.
        function msgFingerprint(msgs) {
          const userMsgs = (msgs || []).filter(m => m.role === "user");
          if (!userMsgs.length) return null;
          const first = String(userMsgs[0].content).trim().slice(0, 80);
          const last  = String(userMsgs[userMsgs.length - 1].content).trim().slice(0, 80);
          return `${first}|||${last}`;
        }

        const existingFingerprints = new Set();
        for (const entry of sessions.value) {
          try {
            const fp = msgFingerprint(await store.getMessages(entry.id));
            if (fp) existingFingerprints.add(fp);
          } catch {}
        }
        const currentFp = msgFingerprint(messages.value);
        if (currentFp) existingFingerprints.add(currentFp);

        const toAdd = [];
        let skipped = 0;
        for (const session of data.sessions) {
          if (!session.id || !Array.isArray(session.messages)) continue;
          const fp = msgFingerprint(session.messages);
          if (existingIds.has(session.id) || (fp && existingFingerprints.has(fp))) {
            skipped++;
            continue;
          }
          toAdd.push({
            id:       session.id,
            title:    session.title   || "Imported chat",
            preview:  session.preview || "",
            model:    session.model   || "",
            persona:  session.persona || DEFAULT_PERSONA_ID,
            ts:       session.ts      || Date.now(),
            messages: session.messages,
            attachments: (Array.isArray(session.attachments) ? session.attachments : [])
              .filter(d => d && typeof d.text === "string" && d.text && d.name),
          });
          existingIds.add(session.id);
          if (fp) existingFingerprints.add(fp);
        }

        writeQueue = writeQueue.then(async () => {
          await store.putMany(toAdd);
          for (const chat of toAdd) {
            for (const d of chat.attachments) {
              await store.saveAttachment({ id: d.id || genId(), chatId: chat.id, name: d.name, text: d.text, chars: d.text.length, ts: d.ts || Date.now(), chunks: null });
            }
          }
        });
        await writeQueue;
        await refreshSessions();
        const added = toAdd.length;

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

    // ── Chat storage (IndexedDB; see chatstore.js) ───────────────────────
    // `sessions` holds the sidebar list in memory; chat messages are read
    // from the store when a chat is opened, searched or exported. Writes are
    // queued so they reach the store in order.

    const chatStoreReady = openChatStore().then(store => {
      sharedChatStorage.value = { kind: store.kind };
      return store;
    });
    let writeQueue = Promise.resolve();

    async function refreshSessions() {
      const store = await chatStoreReady;
      try {
        sessions.value = await store.list();
      } catch (err) {
        console.warn("Failed reading chats", err);
      }
    }

    // Plain copies of the finished messages (no streaming bubble, no Vue
    // proxies), as stored.
    function plainMessages(msgs) {
      return JSON.parse(JSON.stringify(msgs.filter(m => m.role !== "assistant-stream")));
    }

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

    function formatDate(ts) {
      const d = new Date(ts);
      const now = new Date();
      const diffDays = Math.floor((now - d) / 86400000);
      if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7)  return d.toLocaleDateString([], { weekday: "short" });
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    }

    // Save the chat on screen. The sidebar updates at once; the returned
    // promise settles when the chat is stored. Empty chats aren't saved.
    function saveConversation() {
      if (!currentSessionId.value) return writeQueue;
      const toSave = plainMessages(messages.value);
      if (!toSave.length && !attachmentRecords.length) return writeQueue;

      const meta = {
        id: currentSessionId.value,
        title: toSave.length ? titleFromMessages(toSave) : `📎 ${attachmentRecords[0].name}`,
        preview: previewFromMessages(toSave),
        model: settings.value.model || "",
        persona: currentPersonaId.value,
        ts: Date.now(),
      };
      sessions.value = [meta, ...sessions.value.filter(s => s.id !== meta.id)];

      writeQueue = writeQueue
        .then(async () => (await chatStoreReady).save(meta, toSave))
        .catch(err => {
          console.warn("Failed saving chat", err);
          status.value = `⚠ Couldn't save this chat: ${err.message}`;
        });
      return writeQueue;
    }

    // Show a chat's messages and give the model its history. A question
    // left without an answer (tab closed mid-reply) is asked again.
    function showChat(parsed) {
      const last = parsed[parsed.length - 1];
      const unanswered = last && last.role === "user" ? last.content : null;
      const toRestore = unanswered ? parsed.slice(0, -1) : parsed;

      messages.value = toRestore;
      scrollBottom({ force: true });
      getWorker().postMessage({ type: "restore-history", history: historyForWorker(toRestore) });

      if (unanswered) {
        addMessage("user", unanswered);
        saveConversation();
        loading.value = true;
        getWorker().postMessage({ type: "generate", prompt: unanswered, config: liveConfig() });
      }
    }

    // Whenever another chat is on screen, load its attachments
    Vue.watch(currentSessionId, id => {
      attachmentRecords = [];
      attachments.value = [];
      if (id) loadAttachments(id);
    });

    // Open a chat from the sidebar
    async function loadSession(id) {
      if (id === currentSessionId.value) { sidebarOpen.value = false; return; }
      if (loading.value || modelLoading.value) return;

      saveConversation(); // the chat being left
      try {
        const parsed = await (await chatStoreReady).getMessages(id);
        currentSessionId.value = id;
        currentPersonaId.value = personaForSession(id);
        sidebarOpen.value = false;
        getWorker().postMessage({ type: "clear-history" });
        showChat(parsed);
      } catch (err) { console.warn("Failed loading chat", err); }
    }

    // Persona saved with a chat. Chats from before personas existed use
    // the default persona.
    function personaForSession(id) {
      const entry = sessions.value.find(s => s.id === id);
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

    function removeChat(id) {
      sessions.value = sessions.value.filter(s => s.id !== id);
      writeQueue = writeQueue
        .then(async () => (await chatStoreReady).delete(id))
        .catch(err => console.warn("Failed deleting chat", err));
      return writeQueue;
    }

    // Ask before deleting a chat: it can't be undone.
    function confirmDeleteChat(title) {
      return askConfirm({
        icon: "🗑",
        title: "Delete this chat?",
        subject: title || "",
        message: "Its messages and any attached documents will be removed from this browser. This can't be undone. (Settings → Export Chats keeps a copy.)",
        confirmText: "Delete chat",
        danger: true,
      });
    }

    function chatTitle(id) {
      const entry = sessions.value.find(s => s.id === id);
      return entry ? entry.title : "";
    }

    // Delete a chat from the sidebar
    async function deleteSession(id) {
      if (id === currentSessionId.value && (loading.value || modelLoading.value)) return;
      if (!(await confirmDeleteChat(chatTitle(id)))) return;
      if (id === currentSessionId.value) {
        if (loading.value || modelLoading.value) return;
        // Empty the screen first, or starting a new chat would save the
        // deleted one again
        messages.value = [];
        attachmentRecords = [];
        attachments.value = [];
        removeChat(id);
        newChat();
        return;
      }
      removeChat(id);
    }

    // Open the most recent chat (once per page load, after the model loads)
    async function loadConversation() {
      await refreshSessions();
      const index = sessions.value;

      if (index.length === 0) {
        currentSessionId.value = genId();
        currentPersonaId.value = settings.value.defaultPersona || DEFAULT_PERSONA_ID;
        return;
      }

      const latest = index[0];
      currentSessionId.value = latest.id;
      currentPersonaId.value = personaForSession(latest.id);
      try {
        const parsed = await (await chatStoreReady).getMessages(latest.id);
        if (parsed.length) showChat(parsed);
      } catch (err) { console.warn("Failed loading latest chat", err); }
    }

    // "Clear" (toolbar, Settings) deletes the chat on screen, after asking.
    async function clearConversation() {
      if (!currentSessionId.value || messages.value.length === 0) return;
      const id = currentSessionId.value;
      const title = chatTitle(id) || (messages.value.find(m => m.role === "user")?.content || "").slice(0, 60);
      if (!(await confirmDeleteChat(title))) return;
      if (currentSessionId.value !== id) return; // another chat was opened meanwhile
      messages.value = [];
      removeChat(currentSessionId.value);
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
    sharedOpenPicker = () => openPicker();

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
      // Fill the chat list right away (the latest chat opens once a model loads)
      refreshSessions();
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

      // Search all saved chats (messages read from the store on demand)
      const store = await chatStoreReady;
      const index = [...sessions.value];
      for (const entry of index) {
        if (entry.id === currentSessionId.value) continue; // already searched above
        try {
          const msgs = await store.getMessages(entry.id);
          if (!msgs.length) continue;

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
        // A newer search started meanwhile: let it finish instead
        if (query !== searchQuery.value) return;
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

    // Reload into the new version once the chat on screen is saved
    const updateDismissed = ref(false);
    async function reloadApp() {
      if (loading.value) return;
      saveConversation();
      try { await writeQueue; } catch {}
      location.reload();
    }

    return {
      prompt,
      promptInput,
      updateAvailable: sharedUpdateAvailable,
      updateDismissed,
      reloadApp,
      online: sharedOnline,
      picker,
      uses: USES,
      pickerOptions,
      selectedPick,
      deviceSummary,
      formatSize,
      openPicker,
      chooseUse,
      closePicker,
      confirmPick,
      lastAppliedModel,
      modelOptionLabel,
      healthModal,
      switchToSuggestion,
      cutOffNote,
      speedNote,
      switchToFaster,
      accuracyHint,
      dismissAccuracyHint,
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
      attachFile,
      attachments,
      attachmentMeta,
      removeAttachment,
      legacyDocs,
      removeLegacyDocs,
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
      sidebarEl,
      menuBtn,
      sidebarDocked,
      toggleSidebar,
      closeSidebar,
      announcedStatus,
      loadInfo,
      loadTitle,
      loadDetail,
      onMessagesScroll,
      showJumpToLatest,
      jumpToLatest,
      isTouch,
      promptPlaceholder,
      onPromptEnter,
      onPromptShortcut,
      modelShortName,
      friendlyModelName,
      newChat,
      loadSession,
      deleteSession,
      formatDate,
      modelSizes,
      isDownloading,
      stopGeneration,
      cancelDownload,
      searchQuery,
      searchResults,
      searchPending,
      onSearchInput,
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
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
        <h1 class="settings-title">Settings</h1>
        <span class="settings-saved">Changes are saved automatically</span>
      </div>

      <div class="settings-body">

        <section class="settings-section">
          <h2 class="section-label">Model</h2>
          <select v-model="settings.model" @change="applySettings()" :disabled="modelLoading || loading" class="settings-select" aria-label="Model" aria-describedby="model-hint">
            <option disabled value="">Select Model</option>
            <template v-for="group in modelGroups" :key="group.label">
              <optgroup :label="group.label">
                <option v-for="model in group.models" :key="model" :value="model">{{ modelOptionLabel(model) }}</option>
              </optgroup>
            </template>
          </select>
          <p class="section-hint" id="model-hint">
            ✓ = already downloaded. Switching keeps the conversation and uses the new model's recommended reply settings.
            <span v-if="settings.model" class="model-id">{{ settings.model }}</span>
          </p>
          <button class="action-btn secondary" style="margin-top:10px" @click="$router.push('/'); openPicker()">
            Help me choose a model
          </button>
        </section>

        <section class="settings-section">
          <h2 class="section-label" id="appearance-label">Appearance</h2>
          <div class="theme-choice" role="radiogroup" aria-labelledby="appearance-label">
            <label v-for="t in themeOptions" :key="t.id" class="theme-option" :class="{ active: themePref === t.id }">
              <input type="radio" name="theme" class="sr-only" :value="t.id" :checked="themePref === t.id" @change="setTheme(t.id)" />
              <span class="theme-icon" aria-hidden="true">{{ t.icon }}</span>
              <span class="theme-name">{{ t.name }}</span>
            </label>
          </div>
          <p class="section-hint">{{ themeHint }}</p>
        </section>

        <section class="settings-section">
          <h2 class="section-label">Replies</h2>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name" id="label-temperature">Temperature</span>
              <span class="setting-desc">How adventurous replies are. Low = focused and predictable, high = more creative (and more mistakes).</span>
            </div>
            <div class="setting-control">
              <input type="range" min="0" max="2" step="0.05" v-model.number="settings.temperature" class="slider" aria-label="Temperature" />
              <span class="setting-value">{{ settings.temperature.toFixed(2) }}</span>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">Max Tokens</span>
              <span class="setting-desc">Longest reply, in tokens (a token is about ¾ of a word). A longer reply stops with a Continue button.</span>
            </div>
            <div class="setting-control">
              <input type="range" min="16" max="2048" step="16" v-model.number="settings.max_tokens" class="slider" aria-label="Max Tokens" :aria-valuetext="settings.max_tokens + ' tokens, about ' + approxWords(settings.max_tokens) + ' words'" />
              <span class="setting-value">{{ settings.max_tokens }}<small class="setting-sub">≈ {{ approxWords(settings.max_tokens) }} words</small></span>
            </div>
          </div>

          <div class="setting-row" :class="{ pending: contextPending }">
            <div class="setting-info">
              <span class="setting-name">Context Window</span>
              <span class="setting-desc">How much of the conversation (and attached documents) the model can see at once. Bigger uses more GPU memory.</span>
            </div>
            <div class="setting-control">
              <input type="range" min="512" max="8192" step="512" v-model.number="settings.contextWindowSize" class="slider" aria-label="Context Window" />
              <span class="setting-value">{{ settings.contextWindowSize }}</span>
            </div>
            <div v-if="contextPending" class="setting-pending" role="status">
              <span>Saved. The model needs to reload to use it (a few seconds), otherwise it applies the next time the app starts.</span>
              <button type="button" class="action-btn primary reload-model-btn" @click="applySettings()" :disabled="modelLoading || loading">Reload model now</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name" id="label-thinking">Let reasoning models think first</span>
              <span class="setting-desc">Qwen3 and Qwen3.5 can reason step by step before answering. It can help with hard questions, but it is slower and uses up the reply length. (DeepSeek-R1 always does it.)</span>
            </div>
            <div class="setting-control">
              <label class="toggle">
                <input type="checkbox" v-model="settings.thinking" class="thinking-toggle" aria-labelledby="label-thinking" />
                <span aria-hidden="true">{{ settings.thinking ? "On" : "Off" }}</span>
              </label>
            </div>
          </div>

          <details class="advanced">
            <summary>Advanced sampling <span class="advanced-sub">Top P and repetition penalties; most people never need these</span></summary>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Top P</span>
                <span class="setting-desc">Nucleus sampling: only consider the most likely words that together make up P of the probability. 1.0 = off.</span>
              </div>
              <div class="setting-control">
                <input type="range" min="0.01" max="1" step="0.01" v-model.number="settings.top_p" class="slider" aria-label="Top P" />
                <span class="setting-value">{{ settings.top_p.toFixed(2) }}</span>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Frequency Penalty</span>
                <span class="setting-desc">Penalises words by how often they have appeared. Reduces word repetition. Range −2 to 2.</span>
              </div>
              <div class="setting-control">
                <input type="range" min="-2" max="2" step="0.1" v-model.number="settings.frequency_penalty" class="slider" aria-label="Frequency Penalty" />
                <span class="setting-value">{{ settings.frequency_penalty.toFixed(1) }}</span>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Presence Penalty</span>
                <span class="setting-desc">Penalises words that have already appeared at all. Encourages new topics. Range −2 to 2.</span>
              </div>
              <div class="setting-control">
                <input type="range" min="-2" max="2" step="0.1" v-model.number="settings.presence_penalty" class="slider" aria-label="Presence Penalty" />
                <span class="setting-value">{{ settings.presence_penalty.toFixed(1) }}</span>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Repetition Penalty</span>
                <span class="setting-desc">MLC's multiplicative penalty on repeated words. 1.0 = off, above 1 reduces repetition.</span>
              </div>
              <div class="setting-control">
                <input type="range" min="1" max="2" step="0.05" v-model.number="settings.repetition_penalty" class="slider" aria-label="Repetition Penalty" />
                <span class="setting-value">{{ settings.repetition_penalty.toFixed(2) }}</span>
              </div>
            </div>
          </details>

          <button type="button" class="action-btn secondary reset-replies-btn" @click="confirmResetSettings">
            Reset to this model's recommended settings
          </button>
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
              <select v-model="settings.defaultPersona" class="settings-select persona-default-select" aria-label="Default persona for new chats">
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
          <h2 class="section-label">Documents</h2>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">Max Upload Size</span>
              <span class="setting-desc">Largest file you can attach to a chat (PDF, TXT, Markdown). Text is limited to about 200 pages either way.</span>
            </div>
            <div class="setting-control">
              <input type="range" min="1" max="200" step="1" v-model.number="settings.maxFileSizeMB" class="slider" aria-label="Max Upload Size" />
              <span class="setting-value">{{ settings.maxFileSizeMB }} MB</span>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h2 class="section-label">This device</h2>
          <p class="section-hint" style="margin-bottom:12px">What the app found about this browser and GPU. Useful when a model gives garbled replies.</p>
          <div class="device-info">
            <div class="device-row">
              <span class="device-key">App version</span>
              <span class="device-val">{{ appVersion }}</span>
            </div>
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
              <span class="device-key">Chats saved in</span>
              <span class="device-val" :class="{ warn: chatStorage.kind === 'localstorage' }">{{ chatStorageText }}</span>
            </div>
            <div class="device-row">
              <span class="device-key">Works offline</span>
              <span class="device-val" :class="{ warn: offlineReady === false }">{{ offlineText }}</span>
            </div>
            <div class="device-row">
              <span class="device-key">App</span>
              <span class="device-val">
                <button v-if="installPrompt" class="action-btn primary install-btn" @click="installApp">Install app</button>
                <template v-else>{{ installedApp ? "Installed" : "Use your browser's \u201cInstall\u201d or \u201cAdd to Home Screen\u201d" }}</template>
              </span>
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
          <div class="report-problem">
            <a class="action-btn secondary" :href="reportUrl" target="_blank" rel="noopener">Report a problem</a>
            <span class="section-hint">Opens a form on GitHub with the details above filled in. Nothing is sent until you submit it there; please don't include private chats.</span>
          </div>
          <button v-if="checkedCount" class="action-btn secondary" style="margin-top:10px" @click="forgetModelHealth">
            Forget check results ({{ checkedCount }})
          </button>
          <p class="section-hint" style="margin-top:8px">Offline, chats work with models you have already downloaded; downloading a model, and the first large document you attach (which fetches a small search model), need a connection.</p>
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
                <button type="button" class="action-btn secondary" @click="$refs.importSettingsInput.click()">
                  Import Settings
                </button>
                <input ref="importSettingsInput" type="file" class="import-settings-input" hidden accept=".json" @change="importSettings" />
              </div>
            </div>

            <div class="transfer-card">
              <div class="transfer-card-title">💬 Chat History</div>
              <div class="transfer-card-desc">Export all saved sessions to a JSON file, or import sessions from another browser (added alongside existing chats).</div>
              <div class="transfer-card-actions">
                <button class="action-btn secondary" @click="exportSessions">
                  Export Chats
                </button>
                <button type="button" class="action-btn secondary" @click="$refs.importSessionsInput.click()">
                  Import Chats
                </button>
                <input ref="importSessionsInput" type="file" class="import-chats-input" hidden accept=".json" @change="importSessions" />
              </div>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h2 class="section-label">Current chat</h2>
          <p class="section-hint" style="margin-bottom:12px">Deletes the chat that is open, with its messages and attached documents. You'll be asked first.</p>
          <button class="action-btn danger" @click="clearConversation" :disabled="messages.length === 0">
            Clear Conversation
          </button>
        </section>

      </div>
    </div>
  `,

  setup() {
    // ── Appearance ───────────────────────────────────────────────────
    // The theme itself is applied by the script in index.html
    // (window.appTheme); this is only the choice.
    const themeOptions = [
      { id: "system", name: "System", icon: "🖥" },
      { id: "light",  name: "Light",  icon: "☀️" },
      { id: "dark",   name: "Dark",   icon: "🌙" },
    ];
    const themePref = ref(window.appTheme ? window.appTheme.pref() : "dark");
    const themeNow = ref(window.appTheme ? window.appTheme.current() : "dark");
    function setTheme(id) {
      themePref.value = id;
      if (window.appTheme) themeNow.value = window.appTheme.set(id);
    }
    // Following the device: keep the hint right when the device switches
    window.matchMedia?.("(prefers-color-scheme: light)")
      .addEventListener?.("change", () => { if (window.appTheme) themeNow.value = window.appTheme.current(); });
    const themeHint = Vue.computed(() => themePref.value === "system"
      ? `Follows this device's setting (${themeNow.value} right now).`
      : `Always ${themePref.value}, whatever this device is set to.`);

    // A token is roughly ¾ of an English word
    function approxWords(tokens) {
      return Math.round(tokens * 0.75 / 10) * 10;
    }

    // The context window changed for the loaded model: it needs a reload,
    // which the user starts (or that happens on the next start).
    const contextPending = Vue.computed(() => {
      const key = sharedLoadedKey.value;
      const model = sharedSettings.value.model;
      if (!key || !model || sharedModelLoading.value) return false;
      const [loadedModel, loadedContext] = key.split("|");
      return loadedModel === model && Number(loadedContext) !== sharedSettings.value.contextWindowSize;
    });

    async function confirmResetSettings() {
      const ok = await askConfirm({
        title: "Reset reply settings?",
        subject: modelShortName(sharedSettings.value.model),
        message: "Temperature, Max Tokens, Context Window and the advanced sampling settings go back to what's recommended for this model. Personas and your custom instructions are kept.",
        confirmText: "Reset",
      });
      if (ok) sharedResetSettings();
    }

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
      approxWords,
      themeOptions,
      themePref,
      themeHint,
      setTheme,
      contextPending,
      confirmResetSettings,
      personas: PERSONAS,
      defaultPersona,
      modelOptionLabel,
      diagnostics: sharedDiagnostics,
      appVersion: APP_VERSION,
      reportUrl: Vue.computed(() => {
        const d = sharedDiagnostics.value || {};
        return problemReportUrl({
          browser: navigator.userAgent,
          gpu: d.webgpu === false ? "WebGPU not available" : d.gpu,
          shaderF16: d.shaderF16,
          model: sharedSettings.value.model,
          webllm: d.webllmVersion,
        });
      }),
      failedModels,
      checkedCount,
      f16Problem,
      f16Status,
      forgetModelHealth: () => sharedForgetModelHealth(),
      openPicker: () => sharedOpenPicker(),
      offlineReady: sharedOfflineReady,
      offlineText: Vue.computed(() => {
        if (!sharedSwSupported) return "Not supported in this browser";
        if (sharedOfflineReady.value === true) return "Yes, the app is saved on this device";
        if (sharedOfflineReady.value === false) return "Not yet: open the app once while online";
        return "Checking…";
      }),
      installPrompt: sharedInstallPrompt,
      installedApp: isInstalledApp(),
      installApp,
      chatStorage: sharedChatStorage,
      chatStorageText: Vue.computed(() => {
        const n = sharedSessions.value.length;
        const count = `${n} chat${n === 1 ? "" : "s"}`;
        if (sharedChatStorage.value.kind === "indexeddb") return `This browser's database (IndexedDB) · ${count}`;
        if (sharedChatStorage.value.kind === "localstorage") {
          return `Local storage, limited to ${FALLBACK_MAX_CHATS} chats of ${FALLBACK_MAX_MESSAGES} messages · ${count}`;
        }
        return "…";
      }),
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
      <confirm-dialog />
    `
  })
  .component("confirm-dialog", ConfirmDialog)
  .directive("dialog", dialogDirective)
  .use(router)
  .mount("#app");
