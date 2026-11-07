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
import { APP_VERSION, REPO_URL, problemReportUrl } from "./version.js";
import { storageEstimate, spaceShortfall, requestPersistence, friendlyError } from "./storage.js";
import { STATUS, statusText, fatalText, isEngineReady } from "./status.js";
import {
  useReactive, t, formatNumber, formatDate as localDate,
  resolveLanguage, browserLanguages, languageName, SUPPORTED_LOCALES,
} from "./i18n.js";
import { markPending, clearPending, detectCrash, loadCrashes, forgetCrash, recordCrash, lighterModel } from "./crash.js";

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

// ── Language ──────────────────────────────────────────────────────────────
// The shared translator becomes reactive, so templates using $t() follow a
// language change. The choice (Settings → Language) is "auto" (default:
// the browser's languages, among those the app ships) or a language code.
// It is read before the first render, so the page never shows another
// language first.
const LANGUAGE_KEY = "webllm-language";
function loadLanguagePref() {
  let saved = null;
  try { saved = localStorage.getItem(LANGUAGE_KEY); } catch {}
  // A language this version doesn't ship (any more) counts as Automatic
  return SUPPORTED_LOCALES.includes(saved) ? saved : "auto";
}
const i18n = useReactive(Vue.reactive);
const sharedLanguagePref = Vue.ref(loadLanguagePref());

async function applyLanguage() {
  await i18n.setLocale(resolveLanguage(sharedLanguagePref.value));
  i18n.applyToDocument();
  document.title = t("app.title");
}

async function setLanguage(pref) {
  sharedLanguagePref.value = SUPPORTED_LOCALES.includes(pref) ? pref : "auto";
  try {
    if (sharedLanguagePref.value === "auto") localStorage.removeItem(LANGUAGE_KEY);
    else localStorage.setItem(LANGUAGE_KEY, sharedLanguagePref.value);
  } catch {}
  await applyLanguage();
}
await applyLanguage();

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

// ── <i18n-t>: a translated sentence with markup inside ─────────────────────
// For messages that contain links, bold text or buttons. The whole sentence
// stays one message (translators can reorder it); each {name} that has a
// slot of the same name is replaced by that slot, other {params} by text:
//   <i18n-t path="health.suggested"><template #model><strong>…</strong></template></i18n-t>
// Renders no wrapper element unless `tag` is given.
const I18nT = {
  props: {
    path: { type: String, required: true },
    params: { type: Object, default: () => ({}) },
    tag: { type: String, default: "" },
  },
  setup(props, { slots }) {
    return () => {
      const parts = t(props.path, props.params).split(/\{(\w+)\}/);
      const children = parts.flatMap((part, i) => {
        if (i % 2 === 0) return part ? [part] : [];
        return slots[part] ? slots[part]() : [`{${part}}`];
      });
      return props.tag ? Vue.h(props.tag, children) : Vue.h(Vue.Fragment, children);
    };
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
  confirmText: "",
  cancelText: "",
  danger: false,
  resolve: null,
});

function askConfirm(opts) {
  // A new question replaces one still open; the old one counts as cancelled.
  if (sharedConfirm.resolve) sharedConfirm.resolve(false);
  return new Promise(resolve => {
    Object.assign(sharedConfirm, {
      icon: "", subject: "", message: "", confirmText: t("common.ok"), cancelText: t("common.cancel"), danger: false,
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
const sharedModelSizes  = vRef({});  // {modelId: GPU memory in MB}
const sharedDownloadSizes = vRef({}); // {modelId: download size in MB}
// What downloading a model costs (MB); the memory figure if unknown.
function downloadMb(id) {
  return sharedDownloadSizes.value[id] || sharedModelSizes.value[id] || 0;
}
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

// ── Storage space ──────────────────────────────────────────────────────────
// What the browser lets this site store ({ quotaMb, usageMb, persisted }),
// refreshed before downloads. See storage.js.
const sharedStorageInfo = vRef(null);
async function refreshStorageInfo() {
  const estimate = await storageEstimate();
  let persisted = null;
  try { persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch {}
  sharedStorageInfo.value = estimate ? { ...estimate, persisted } : null;
  return sharedStorageInfo.value;
}
refreshStorageInfo();

// A warning when downloading `needMb` probably won't fit, or "".
function spaceWarning(needMb) {
  const short = spaceShortfall(sharedStorageInfo.value, needMb);
  if (!short) return "";
  const hint = t(sharedStorageInfo.value.quotaMb < 1024 ? "download.space-hint-private" : "download.space-hint-disk");
  return t("download.space-warning", {
    available: formatSize(short.availableMb) || t("units.mb", { size: 0 }),
    need: formatSize(short.needMb),
    hint,
  });
}

// After a model is downloaded, ask once per visit that the browser keep it
// (not delete it when space runs low). The browser decides.
let persistenceAsked = false;
function keepDownloadedModels() {
  if (persistenceAsked) return;
  persistenceAsked = true;
  requestPersistence().then(() => refreshStorageInfo());
}

// ── Page crashes (out of memory) ──────────────────────────────────────────
// See crash.js. Checked once, as the page opens and before any model loads.
const startupCrash = detectCrash(localStorage);    // { model, phase } or null
const sharedModelCrashes = vRef(loadCrashes(localStorage)); // {modelId: {phase, ts}}

// What the page is doing that could run out of memory, or "" (idle). The
// note in localStorage follows it, but only while the page is visible: a
// hidden or closing page is never counted as a crash.
let pendingWork = { model: "", phase: "" };
function setPendingWork(model, phase) {
  pendingWork = { model: phase ? model : "", phase };
  syncPendingNote();
}
function syncPendingNote() {
  if (pendingWork.phase && document.visibilityState === "visible") {
    markPending(localStorage, pendingWork.model, pendingWork.phase);
  } else {
    clearPending(localStorage);
  }
}
document.addEventListener("visibilitychange", syncPendingNote);
// Chrome also reports "hidden" when a page closes or reloads; pagehide covers
// browsers that don't (Safari).
window.addEventListener("pagehide", () => clearPending(localStorage));

function forgetModelCrash(model) {
  if (sharedModelCrashes.value[model]) sharedModelCrashes.value = { ...forgetCrash(localStorage, model) };
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
  const size = formatSize(downloadMb(id));
  let label = modelShortName(id) + (size ? " · " + size : "");
  if (isModelCached(id)) label += " ✓";
  if (sharedModelCrashes.value[id]) return t("models.label-crashed", { label });
  const h = sharedModelHealth.value[id];
  if (h && h.ok === false) {
    return t(h.reason === "no-f16" ? "models.label-needs-f16" : "models.label-garbled", { label });
  }
  if (isF16Model(id) && f16Problem()) return t("models.label-f16-risk", { label });
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
  "./version.js", "./crash.js", "./storage.js", "./status.js", "./i18n.js",
  "./locales/en.js",
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
            {{ $t(healthModal.reason === "degenerate" ? "health.title-may-not-work" : "health.title-doesnt-work") }}
          </h2>
          <p class="modal-body">
            <i18n-t :path="healthBodyKey">
              <template #model><strong>{{ modelShortName(healthModal.model) }}</strong> <span class="model-id">({{ healthModal.model }})</span></template>
              <template #sample><em>“{{ healthModal.sample }}…”</em></template>
            </i18n-t>
            <br><br>
            <i18n-t path="health.f16-explain"><template #q4f32><strong>q4f32</strong></template></i18n-t>
          </p>
          <p v-if="healthModal.suggestion" class="modal-body health-suggestion">
            <i18n-t path="health.suggested"><template #model><strong>{{ modelShortName(healthModal.suggestion) }}</strong></template></i18n-t>
            <span v-if="downloadMb(healthModal.suggestion)">{{ $t("health.suggested-size", { size: formatSize(downloadMb(healthModal.suggestion)) }) }}</span>
            <br><span class="model-id">{{ healthModal.suggestion }}</span>
          </p>
          <div class="modal-actions">
            <button class="action-btn secondary" @click="keepModelAnyway">{{ $t("health.keep") }}</button>
            <button v-if="healthModal.suggestion" class="action-btn primary" @click="switchToSuggestion">{{ $t("health.switch") }}</button>
          </div>
        </div>
      </div>

      <!-- The page closed while using a model last time (out of memory) -->
      <div class="modal-overlay" v-if="crashModal.show">
        <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="crash-title" aria-describedby="crash-body" v-dialog="chooseAfterCrash">
          <div class="modal-icon" aria-hidden="true">⚠</div>
          <h2 class="modal-title" id="crash-title">{{ $t(crashModal.kind === "gpu" ? "crash.title-gpu" : "crash.title-page") }}</h2>
          <p class="modal-body" id="crash-body">
            <i18n-t :path="'crash.body-' + (crashModal.kind === 'gpu' ? 'gpu' : 'page') + '-' + (crashModal.phase === 'answering' ? 'answering' : 'loading')">
              <template #model><strong>{{ modelShortName(crashModal.model) }}</strong></template>
            </i18n-t>
          </p>
          <p v-if="!crashModal.lighter" class="modal-body">
            {{ $t("crash.no-lighter") }}
          </p>
          <p v-if="crashModal.lighter" class="modal-body health-suggestion">
            <i18n-t path="crash.suggested" :params="{ lighterSize: formatSize(modelSizes[crashModal.lighter]), currentSize: formatSize(modelSizes[crashModal.model]) }">
              <template #model><strong>{{ modelShortName(crashModal.lighter) }}</strong></template>
            </i18n-t>
          </p>
          <div class="modal-actions crash-actions">
            <button class="action-btn secondary" @click="retryCrashedModel">{{ $t("crash.try-again") }}</button>
            <button class="action-btn secondary" @click="chooseAfterCrash">{{ $t("crash.choose-another") }}</button>
            <button v-if="crashModal.lighter" class="action-btn primary" @click="useLighterModel">{{ $t("crash.use", { model: friendlyModelName(crashModal.lighter) }) }}</button>
          </div>
        </div>
      </div>

      <!-- Model picker: first launch, or "Help me choose a model" -->
      <div v-if="picker.show" class="modal-overlay" @click.self="closePicker">
        <div class="modal picker" role="dialog" aria-modal="true" aria-labelledby="picker-title" v-dialog="closePicker">
          <template v-if="picker.step === 1">
            <h2 class="modal-title" id="picker-title">
              {{ $t(picker.firstRun ? "picker.title-first-run" : "picker.title") }}
            </h2>
            <p class="modal-body picker-intro">
              {{ $t("picker.intro") }}
            </p>
            <p class="picker-question">{{ $t("picker.question-use") }}</p>
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
                {{ $t(picker.firstRun ? "picker.skip" : "common.cancel") }}
              </button>
            </div>
          </template>

          <template v-else>
            <h2 class="modal-title" id="picker-title">{{ $t("picker.title-size") }}</h2>
            <p class="picker-device">{{ deviceSummary }}</p>
            <p v-if="pickerOnPhone" class="picker-phone-note" role="note">
              {{ $t("picker.phone-note") }}
            </p>
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
                    <span v-if="o.recommended" class="picker-badge">{{ $t("picker.recommended") }}</span>
                    <span v-if="o.current" class="picker-badge muted">{{ $t("picker.in-use") }}</span>
                  </span>
                  <span class="picker-model">{{ o.name }}</span>
                  <span class="picker-meta">{{ o.cached ? $t("picker.downloaded") : $t(online ? "picker.download-size" : "picker.needs-internet", { size: formatSize(o.sizeMb) || "?" }) }}</span>
                  <span v-if="o.space" class="picker-meta picker-crashed picker-space">⚠ {{ o.space }}</span>
                  <span v-if="o.crashed" class="picker-meta picker-crashed">{{ $t("picker.crashed") }}</span>
                  <span class="picker-desc">{{ o.desc }}</span>
                </span>
              </button>
            </div>
            <div class="modal-actions">
              <button type="button" class="action-btn secondary" @click="picker.step = 1">{{ $t("common.back") }}</button>
              <button type="button" class="action-btn primary" @click="confirmPick" :disabled="!selectedPick">
                {{ $t(selectedPick && selectedPick.cached ? "picker.start" : "picker.download-start") }}
              </button>
            </div>
          </template>
        </div>
      </div>

      <!-- WebGPU error screen — full overlay, shown when GPU is incompatible -->
      <div v-if="webgpuError" class="webgpu-error-overlay">
        <div class="webgpu-error-card" role="alertdialog" aria-modal="true" aria-labelledby="webgpu-error-title" v-dialog="null">
          <div class="webgpu-error-icon" aria-hidden="true">⚠</div>
          <h2 class="webgpu-error-title" id="webgpu-error-title">{{ $t("webgpu.title") }}</h2>
          <p class="webgpu-error-body">
            {{ $t("webgpu.body") }}
          </p>
          <div class="webgpu-error-steps">
            <div class="webgpu-step">
              <span class="step-num">1</span>
              <i18n-t path="webgpu.step-acceleration" tag="span"><template #setting><strong>{{ $t("webgpu.acceleration-setting") }}</strong></template></i18n-t>
            </div>
            <div class="webgpu-step">
              <span class="step-num">2</span>
              <i18n-t path="webgpu.step-flags" tag="span"><template #flags><code>chrome://flags</code></template><template #webgpu><strong>WebGPU</strong></template></i18n-t>
            </div>
            <div class="webgpu-step">
              <span class="step-num">3</span>
              <i18n-t path="webgpu.step-browsers" tag="span"><template #chrome><strong>Chrome 113+</strong></template><template #edge><strong>Edge</strong></template></i18n-t>
            </div>
            <div class="webgpu-step">
              <span class="step-num">4</span>
              <i18n-t path="webgpu.step-report" tag="span"><template #link><a href="https://webgpureport.org" target="_blank" rel="noopener">webgpureport.org</a></template></i18n-t>
            </div>
          </div>
          <button class="action-btn primary" style="margin-top:20px;width:100%" data-autofocus @click="webgpuError = false; applySettings()">
            {{ $t("webgpu.try-again") }}
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
          <h2 class="sidebar-title" id="sidebar-title">{{ $t("sidebar.title") }}</h2>
          <div class="sidebar-header-actions">
            <button class="new-chat-btn" @click="newChat" :disabled="loading || modelLoading">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {{ $t("sidebar.new-chat") }}
            </button>
            <button type="button" class="sidebar-close" @click="closeSidebar" :aria-label="$t(sidebarDocked ? 'sidebar.hide-list' : 'sidebar.close-list')" :title="$t(sidebarDocked ? 'sidebar.hide' : 'common.close')">
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
            :placeholder="$t('sidebar.search-placeholder')"
            :aria-label="$t('sidebar.search')"
            v-model="searchQuery"
            @input="onSearchInput"
          />
          <button v-if="searchQuery" type="button" class="search-clear" @click="searchQuery = ''; searchResults = []" :title="$t('sidebar.clear-search')" :aria-label="$t('sidebar.clear-search')">
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Search results -->
        <div v-if="searchQuery" class="sidebar-list">
          <div v-if="searchResults.length === 0 && !searchPending" class="sidebar-empty" role="status">
            {{ $t("sidebar.no-results", { query: searchQuery }) }}
          </div>
          <div v-if="searchPending" class="sidebar-empty" role="status">{{ $t("sidebar.searching") }}</div>
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
                  <span class="session-title">{{ r.session.id === currentSessionId ? $t("chats.current") : r.session.title }}</span>
                  <span class="session-date">{{ formatDate(r.session.ts) }}</span>
                </span>
                <!-- Show up to 3 matching excerpts per session -->
                <span
                  v-for="(match, mi) in r.matches.slice(0, 3)"
                  :key="mi"
                  class="search-match"
                >
                  <span class="match-role">{{ $t(match.role === "user" ? "sidebar.match-you" : "sidebar.match-ai") }}</span>
                  <span class="match-snippet" v-html="match.highlighted"></span>
                </span>
                <span v-if="r.matches.length > 3" class="search-more">{{ $t("sidebar.more-matches", { count: r.matches.length - 3 }) }}</span>
              </button>
            </div>
          </template>
        </div>

        <!-- Normal sessions list -->
        <div v-else class="sidebar-list">
          <div v-if="sessions.length === 0" class="sidebar-empty">{{ $t("sidebar.empty") }}</div>
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
            <button type="button" class="session-delete" @click="deleteSession(s.id)" :title="$t('sidebar.delete-chat')" :aria-label="$t('sidebar.delete-chat-named', { title: s.title })">
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
            :title="$t('header.chat-history')"
            :aria-label="$t('header.chat-history')"
            aria-controls="chat-sidebar"
            :aria-expanded="sidebarOpen || sidebarDocked ? 'true' : 'false'"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div class="header-brand">
            <svg class="header-mark" aria-hidden="true" viewBox="84 108 344 296" width="26" height="22"><g transform="translate(0 -16)" fill="none" stroke="currentColor" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"><path d="M150 400 V252 A106 106 0 0 1 362 252 V400"/><line x1="104" y1="400" x2="408" y2="400"/><path transform="translate(256 380) scale(1.1) translate(-256 -380)" d="M256 204 C272 238 314 262 314 316 C314 350 289 372 256 372 C223 372 198 350 198 316 C198 289 212 270 225 257 C227 278 235 291 246 296 C239 265 240 234 256 204 Z" fill="currentColor" stroke="none"/></g></svg>
            <div class="header-names">
              <h1 class="header-title">Hearth</h1>
              <span class="header-tagline">{{ $t("header.tagline") }}</span>
            </div>
          </div>
        </div>
        <div class="header-actions">
          <button class="icon-btn" @click="newChat" :disabled="loading || modelLoading" :title="$t('header.new-chat')" :aria-label="$t('header.new-chat')">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="icon-btn" @click="$router.push('/settings')" :title="$t('header.settings')" :aria-label="$t('header.settings')">
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
        <span v-if="!online" class="offline-badge" :title="$t('statusbar.offline-hint')">{{ $t("statusbar.offline") }}</span>
      </div>

      <!-- A newer version of the app was deployed while this tab was open -->
      <div v-if="updateAvailable && !updateDismissed" class="update-banner" role="status">
        <span class="update-text">{{ $t("update.available") }}</span>
        <button type="button" class="action-btn primary update-reload" @click="reloadApp" :disabled="loading">
          {{ $t(loading ? "update.reload-after" : "update.reload") }}
        </button>
        <button type="button" class="update-dismiss" @click="updateDismissed = true" :title="$t('update.later')" :aria-label="$t('common.dismiss')">×</button>
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
          >{{ $t("common.cancel") }}</button>
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
          {{ $t("load.note") }}
        </p>
      </div>

      <div class="messages" ref="messagesContainer" @click="onMessagesClick" @scroll.passive="onMessagesScroll" role="log" :aria-label="$t('messages.label')" :aria-busy="loading ? 'true' : 'false'">
        <!-- Welcome screen for an empty chat: pick a persona, try a starter -->
        <div v-if="messages.length === 0" class="welcome">
          <h2 class="welcome-title">{{ $t("welcome.title") }}</h2>
          <p class="welcome-sub">{{ $t("welcome.sub") }}</p>
          <div class="persona-grid" role="radiogroup" :aria-label="$t('welcome.persona')">
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
          >{{ $t("welcome.choose-model") }}</button>
          <p class="welcome-note">
            {{ $t("welcome.note") }}
            <button v-if="lastAppliedModel" type="button" class="link-btn inline" @click="openPicker()">{{ $t("welcome.help-choose") }}</button>
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
                <span v-if="item.thinkingDone">{{ $t("message.thought-process") }}</span>
                <span v-else class="thinking-live">{{ $t("message.thinking") }}</span>
              </summary>
              <div class="md thinking-body" v-html="item.thinkingHtml"></div>
            </details>
            <div v-if="item.answerHtml" class="md" v-html="item.answerHtml"></div>
            <p v-if="!item.streaming && item.message.notice === 'loop'" class="msg-note">
              {{ $t("message.note-loop") }}
            </p>
            <p v-if="!item.streaming && item.message.notice === 'continue-failed'" class="msg-note">
              {{ $t("message.note-continue-failed") }}
            </p>
            <p v-if="!item.streaming && item.message.notice === 'gpu-lost'" class="msg-note">
              {{ $t("message.note-gpu-lost") }}
            </p>
            <p v-if="!item.streaming && item.message.cutOff" class="msg-note">
              {{ cutOffNote(item.message.cutOff) }}
              <span v-if="item.isLast">{{ $t("message.press-continue") }}</span>
            </p>
            <div v-if="!item.streaming" class="msg-actions">
              <button
                type="button"
                class="msg-action"
                @click="copyMessage(item)"
                :title="$t(copiedIndex === item.index ? 'message.copied' : 'message.copy-reply')"
              >
                <svg v-if="copiedIndex !== item.index" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {{ $t(copiedIndex === item.index ? "message.copied" : "message.copy") }}
              </button>
              <button
                v-if="item.isLast && item.message.cutOff && !item.message.isError"
                type="button"
                class="msg-action msg-action-primary"
                @click="continueReply"
                :disabled="loading || modelLoading"
                :title="$t('message.continue-title')"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
                {{ $t("message.continue") }}
              </button>
              <button
                v-if="item.isLast"
                type="button"
                class="msg-action"
                @click="regenerate"
                :disabled="loading || modelLoading"
                :title="$t(item.message.isError ? 'message.try-again' : 'message.regenerate-title')"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                {{ $t(item.message.isError ? "message.retry" : "message.regenerate") }}
              </button>
            </div>
          </template>
        </div>
      </div>

      <!-- Documents from earlier versions were shared by all chats -->
      <div v-if="legacyDocs.length" class="legacy-docs-note">
        <span>
          {{ $t("legacy-docs.note", { files: legacyDocs.join(", ") }) }}
        </span>
        <button type="button" class="link-btn inline" @click="removeLegacyDocs">{{ $t("legacy-docs.remove") }}</button>
      </div>

      <div class="footer-container">
        <button
          v-if="showJumpToLatest && messages.length"
          type="button"
          class="jump-latest"
          @click="jumpToLatest"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
          {{ $t(loading ? "composer.follow-reply" : "composer.jump-latest") }}
        </button>
        <!-- Documents attached to this chat -->
        <div v-if="attachments.length" class="attachments" :aria-label="$t('composer.attachments')">
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
            <button type="button" class="attachment-remove" @click="removeAttachment(a.id)" :aria-label="$t('composer.remove-named', { name: a.name })" :title="$t('composer.remove-title')">×</button>
          </div>
        </div>
        <p v-if="speedNote" class="speed-note" :class="{ slow: speedNote.slow }">
          <span>{{ speedNote.text }}</span>
          <i18n-t v-if="speedNote.faster" path="speed.try-faster">
            <template #model><button type="button" class="link-btn speed-switch" @click="switchToFaster" :disabled="modelLoading || loading">{{ speedNote.fasterName }}</button></template>
          </i18n-t>
        </p>
        <p v-if="accuracyHint" class="accuracy-note" role="note">
          <span>{{ $t("accuracy.hint", { model: accuracyHint }) }}</span>
          <button type="button" class="accuracy-dismiss" @click="dismissAccuracyHint" :aria-label="$t('accuracy.hide-label')" :title="$t('accuracy.hide-title')">×</button>
        </p>
        <div class="toolbar">
          <select
            :value="currentPersonaId"
            @change="setPersona($event.target.value)"
            class="persona-select"
            :title="$t('composer.persona')"
            :aria-label="$t('composer.persona')"
          >
            <option v-for="p in personas" :key="p.id" :value="p.id">{{ p.icon }} {{ p.name }}</option>
          </select>
          <select
            v-model="settings.model"
            @change="applySettings()"
            :disabled="modelLoading || loading"
            class="model-select"
            :title="$t('composer.model')"
            :aria-label="$t('composer.model')"
          >
            <option disabled value="">{{ $t("composer.select-model") }}</option>
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
            :title="$t('composer.delete-chat')"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
            {{ $t("composer.clear") }}
          </button>

          <!-- A real button opening a hidden file input: a visible-but-tiny
               input would add the browser's "No file chosen" text to copied
               text and screen readers. -->
          <button type="button" class="upload-btn" :title="$t('composer.attach-title')" @click="$refs.attachInput.click()">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            <span>{{ $t("composer.attach") }}</span>
          </button>
          <input ref="attachInput" type="file" class="attach-input" hidden accept=".pdf,.txt,.md,.markdown,text/plain,text/markdown,application/pdf" @change="attachFile" />

        </div>

        <div class="footer">
          <textarea
            ref="promptInput"
            v-model="prompt"
            :aria-label="$t('composer.message')"
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
            :title="$t('composer.stop')"
            :aria-label="$t('composer.stop')"
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
            :title="$t('composer.send-title')"
            :aria-label="$t('composer.send')"
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
    const status = ref(t("statusbar.loading"));
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
    // Set after the first GPU crash on this page load. A second one stops
    // with the troubleshooting screen instead of offering models again.
    let safeModeActive = false;
    // A GPU crash to explain once the restarted worker reports its models
    let gpuCrashToShow = null;

    // Group the flat models list into labelled tiers for the <optgroup> select.
    // Smallest to largest, as in AVAILABLE_MODELS in worker.js, except the
    // Tiny group, which comes last.
    // Tests run on the lower-cased ID, in order; the first match wins.
    const MODEL_GROUPS_DEF = [
      { key: "micro",       test: m => m.includes("0.5b") || m.includes("0.6b") || m.includes("0.8b") },
      { key: "lightweight", test: m => !m.includes("tinyllama") && (m.includes("1.1b") || (m.includes("1b") && !m.includes("1.5b")) || m.includes("1.7b") || m.includes("1_6b") || m.includes("1.6b")) },
      { key: "small",       test: m => m.includes("1.5b") },
      { key: "mid",         test: m => m.includes("2b") || m.includes("3b") || m.includes("4b") },
      { key: "upper-mid",   test: m => m.includes("mini") },
      { key: "large",       test: m => m.includes("7b") || m.includes("8b") || m.includes("9b") },
      // Last, and labelled as such: 135M–360M models, and TinyLlama (1.1B
      // but from 2023, often reciting its instructions), can barely hold a
      // conversation, so nobody should judge the app by them. Kept for
      // testing and very weak devices; the picker never suggests them.
      { key: "tiny",        test: m => m.includes("135m") || m.includes("360m") || m.includes("tinyllama") },
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
        return { label: t(`models.group-${g.key}`), models: matched };
      });
      // Catch any unmatched models in an "Other" group
      const other = visibleModels.value.filter(m => !assigned.has(m));
      if (other.length) groups.push({ label: t("models.group-other"), models: other });
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
      isDownloading.value ? t("statusbar.downloading") : status.value);

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
        case "download": return t("load.downloading", { model: name });
        case "cache":    return t("load.from-device", { model: name });
        case "gpu":      return t("load.preparing", { model: name });
        default:         return t("load.loading", { model: name });
      }
    });

    // "34% · 760 MB of ~2.2 GB · about 2 min left"
    const loadDetail = Vue.computed(() => {
      const info = loadInfo.value;
      if (!info) return "";
      const parts = [];
      if (info.percent !== null) parts.push(info.percent + "%");
      if (info.phase === "download" && info.doneMb !== null) {
        const total = downloadMb(settings.value.model);
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
      keepDownloadedModels();
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
        status.value = t("persona.applies-next", { icon: persona.icon, name: persona.name });
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
      ? t("composer.placeholder-touch")
      : t("composer.placeholder"));

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
        button.textContent = t("message.copied");
        button.classList.add("copied");
        setTimeout(() => {
          button.textContent = t("message.copy");
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
      askModel({
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
      askModel({
        type: "generate",
        prompt: question.content,
        config: liveConfig(),
      });
    }

    // Send a question (or Continue) to the model, noting it in case the
    // page runs out of memory while answering (see crash.js).
    function askModel(message) {
      setPendingWork(settings.value.model, "answering");
      getWorker().postMessage(message);
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

      askModel({
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
      if (a.status === "reading") return t("attachments.reading");
      if (a.status === "indexing") {
        return a.total ? t("attachments.indexing-progress", { current: a.current, total: a.total }) : t("attachments.indexing");
      }
      if (a.status === "error") return t("attachments.cant-search");
      return a.chars >= 1000
        ? t("attachments.chars-thousands", { count: Math.round(a.chars / 1000) })
        : t("attachments.chars", { count: a.chars });
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
        status.value = t("attachments.too-large", {
          name: file.name,
          size: formatNumber(file.size / 1048576, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
          max: maxMB,
        });
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
        drop(t("attachments.couldnt-read", { name: file.name, error: err.message }));
        return;
      }
      if (!text) {
        drop(t("attachments.no-text", { name: file.name }));
        return;
      }
      if (text.length > MAX_ATTACHMENT_CHARS) {
        drop(t("attachments.too-long", { name: file.name, size: Math.round(text.length / 1000), max: MAX_ATTACHMENT_CHARS / 1000 }));
        return;
      }

      const record = { id, chatId, name: file.name, text, chars: text.length, ts: Date.now(), chunks: null };
      writeQueue = writeQueue
        .then(async () => (await chatStoreReady).saveAttachment(record))
        .catch(err => { status.value = t("attachments.couldnt-save", { name: file.name, error: err.message }); });
      if (chatId !== currentSessionId.value) return; // chat changed while reading

      attachmentRecords = [...attachmentRecords, record];
      attachments.value = attachments.value.map(a => a.id === id ? attachmentView(record) : a);
      saveConversation(); // keeps a chat that so far only has a document
      sendAttachments();
      status.value = t("attachments.attached", { name: file.name });
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
        const phase = data.phase || (pendingWork.phase === "answering" ? "answering" : "loading");
        setPendingWork("", "");

        // Keep what the reply had written, marked as cut off
        const tail = messages.value[messages.value.length - 1];
        if (tail && tail.role === "assistant-stream") {
          if (tail.content && tail.content.trim()) {
            tail.role = "assistant";
            tail.notice = "gpu-lost";
          } else {
            messages.value.pop();
          }
          saveConversation();
        }

        // A second GPU crash on this page load: stop and show the GPU
        // troubleshooting screen.
        if (gpuCrash && safeModeActive) {
          // Fresh, idle worker: "Try Again" on the error screen loads a
          // model only when the user asks for it.
          worker = replaceWorker(onWorkerMessage);
          getWorker().onerror = onWorkerError;
          sharedLoadedKey.value = "";
          status.value = t("statusbar.gpu-crashed-twice");
          webgpuError.value = true;
          return;
        }

        status.value = fatalText(data.reason, phase);

        if (gpuCrash) {
          // Usually out of memory, like a page crash: remember it, and let
          // the person choose what to load (never switch models silently).
          safeModeActive = true;
          const model = settings.value.model;
          sharedModelCrashes.value = { ...recordCrash(localStorage, model, phase) };
          gpuCrashToShow = { model, phase, kind: "gpu" };
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
          status.value = t("statusbar.download-cancelled");
          break;

        case "status":
          // The worker sends a code; the words are chosen here (status.js)
          status.value = statusText(data.code, data.params);
          // Any non-download status means the download phase is over
          isDownloading.value = false;
          if (isEngineReady(data.code)) {
            modelLoading.value = false;
            if (pendingWork.phase === "loading") setPendingWork("", "");
            // Mark this model as cached so future selects skip the confirmation
            markModelCached(settings.value.model);
            // Restore persisted conversation once per page load only.
            // Subsequent "Ready" status messages (after each generation)
            // must not re-run loadConversation, or it would overwrite
            // messages.value and lose the current live conversation.
            if (!conversationRestored.value) {
              conversationRestored.value = true;
              loadConversation();
            } else if (data.code === STATUS.MODEL_LOADED) {
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
        
          status.value = t("statusbar.thinking");
        
          streamingText.value = "";
        
          break;
        
        case "stream":
        
          status.value = t("statusbar.generating");
        
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
          status.value = t("statusbar.generating-words", { count: data.count });
          break;
                    
        case "response":
          setPendingWork("", "");
          // It answered: a crash recorded for this model no longer applies
          if (!data.outcome) forgetModelCrash(settings.value.model);

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
            reply.notice = data.notice || null;   // "loop" | "continue-failed" | "gpu-lost" | null
          }
        
          status.value = t("status.ready");
        
          loading.value = false;

          saveConversation();
          // The finished reply grows (highlighted code, Copy / Regenerate)
          scrollBottom();
        
          break;

        case "models": {
          models.value = data.models;
          sharedAltModels.value = data.altModels || [];
          if (data.downloadSizes) sharedDownloadSizes.value = data.downloadSizes;
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
                status.value = t("welcome.choose-model");
                openPicker({ firstRun: true });
              }
            }
          }

          if (settings.value.model) {
            // The page closed while using this model last time (most likely
            // out of memory): loading it again would close it again, so ask.
            if (gpuCrashToShow) {
              showCrashPrompt(gpuCrashToShow);
              gpuCrashToShow = null;
            } else if (!crashPromptShown && startupCrash && startupCrash.model === settings.value.model && !lastAppliedModel.value) {
              crashPromptShown = true;
              showCrashPrompt(startupCrash);
            } else {
              await applySettings();
            }
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
          setPendingWork("", "");
          sharedLoadedKey.value = "";
          webgpuError.value = true;
          modelLoading.value = false;
          loading.value = false;
          status.value = t("statusbar.webgpu-unavailable");
          break;

        case "error": {
          setPendingWork("", "");
          // Keep any text already streamed as a normal reply (or drop an
          // empty bubble) before adding the error.
          const tail = messages.value[messages.value.length - 1];
          if (tail && tail.role === "assistant-stream") {
            if (tail.content && tail.content.trim()) tail.role = "assistant";
            else messages.value.pop();
          }
          messages.value.push({ role: "assistant", content: t("reply.error", {
            error: data.code ? t(`errors.${data.code}`, data.params) : friendlyError(data.detail),
          }), isError: true });
          scrollBottom();
          loading.value = false;
          status.value = t("statusbar.something-wrong");
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
            ? { ...a, status: "error", error: data.error
              ? t("attachments.index-failed-detail", { error: data.error })
              : t("attachments.index-failed") }
            : a);
          break;
      }
    }

    // ── Model health ─────────────────────────────────────────────────────
    const healthModal = ref({ show: false, model: "", reason: "", sample: "", suggestion: "" });
    // Which sentence explains the problem (catalog keys under "health")
    const healthBodyKey = Vue.computed(() => {
      const { reason, sample } = healthModal.value;
      if (reason === "no-f16") return "health.body-no-f16";
      if (reason === "degenerate") return "health.body-degenerate";
      return sample ? "health.body-garbled-sample" : "health.body-garbled";
    });

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
          status.value = t("statusbar.needs-f16-browser");
        }
        offerReplacement(data.model, data.reason, data.sample);
      }
    }

    // Why a reply was cut short, under the reply (Continue gets the rest)
    function cutOffNote(reason) {
      if (reason === "stall") return t("reply.cut-off-stall");
      if (reason === "time") return t("reply.cut-off-time");
      return t("reply.cut-off-max-tokens", { max: settings.value.max_tokens });
    }

    // How fast the current model writes here, once known, with a smaller
    // model to try when it is slow.
    const speedNote = Vue.computed(() => {
      const model = settings.value.model;
      const speed = model && sharedModelSpeed.value[model];
      if (!speed || modelLoading.value) return null;
      const slow = isSlow(speed.wps);
      const faster = slow ? fasterModel(model, [...models.value, ...sharedAltModels.value].filter(id => !sharedModelCrashes.value[id])) : "";
      return {
        slow,
        text: t("speed.note", { model: friendlyModelName(model), speed: formatSpeed(speed.wps) }),
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
    // Keys under "reply" in the catalog
    const FAILED_REPLY_KEYS = { timeout: "reply.failed-timeout", empty: "reply.failed-empty" };

    function handleFailedReply(data) {
      const list = messages.value;
      const last = list[list.length - 1];
      const hasBubble = last && last.role === "assistant-stream";
      loading.value = false;
      status.value = t("status.ready");

      if (data.outcome === "stopped") {
        // Stopped before any text: just drop the empty bubble
        if (hasBubble) list.splice(list.length - 1, 1);
        status.value = t("statusbar.stopped");
        saveConversation();
        return;
      }

      const text = data.outcome === "degenerate"
        ? t(isF16Model(data.model) ? "reply.failed-degenerate-f16" : "reply.failed-degenerate")
        : t(FAILED_REPLY_KEYS[data.outcome] || FAILED_REPLY_KEYS.empty);
      const msg = { role: "assistant", content: text, isError: true };
      if (hasBubble) list.splice(list.length - 1, 1, msg);
      else list.push(msg);
      scrollBottom();
      saveConversation();

      if (data.outcome === "degenerate" && isF16Model(data.model)) {
        offerReplacement(data.model, "degenerate", "");
      }
    }

    // ── After a page crash ───────────────────────────────────────────────
    let crashPromptShown = false;
    const crashModal = ref({ show: false, kind: "page", model: "", phase: "", lighter: "" });

    // kind: "page" (found when the page opened) or "gpu" (WebLLM lost the GPU)
    function showCrashPrompt({ model, phase, kind = "page" }) {
      crashModal.value = {
        show: true,
        kind,
        model,
        phase,
        lighter: lighterModel(model, modelSizes.value, allModels(), sharedModelCrashes.value),
      };
      status.value = kind === "gpu"
        ? t("crash.status-gpu", { model: modelShortName(model) })
        : t("crash.status-page", { model: modelShortName(model) });
      refreshSessions();
      if (!currentSessionId.value) currentSessionId.value = genId();
    }

    // Load the lighter model, with its own recommended settings
    function useLighterModel() {
      const target = crashModal.value.lighter;
      crashModal.value.show = false;
      if (!target) return;
      settings.value.model = target;
      Object.assign(settings.value, getModelDefaults(target));
      applySettings(true);
    }

    function retryCrashedModel() {
      crashModal.value.show = false;
      applySettings(true);
    }

    function chooseAfterCrash() {
      crashModal.value.show = false;
      openPicker();
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

    const pickerOnPhone = computed(() => deviceInfo().mobile);

    const deviceSummary = computed(() => {
      const { mobile, memoryGB } = deviceInfo();
      const parts = [t(mobile ? "picker.device-phone" : "picker.device-computer")];
      if (memoryGB) parts.push(t("picker.device-memory", { gb: memoryGB }));
      const d = sharedDiagnostics.value;
      if (!f16Usable()) parts.push(t("picker.device-f16-unreliable"));
      else if (d && d.shaderF16 === true) parts.push(t("picker.device-f16-ok"));
      return t("picker.device", { details: parts.join(" · ") });
    });

    const pickerOptions = computed(() => {
      const recommended = recommendTier(deviceInfo());
      const known = allModels();
      return TIERS.map(t => {
        const id = pickModelId(picker.value.use, t.id, f16Usable(), deviceInfo());
        return {
          ...t,
          model: id,
          name: friendlyModelName(id),
          sizeMb: downloadMb(id),
          cached: isModelCached(id),
          recommended: t.id === recommended,
          current: id === lastAppliedModel.value,
          available: known.length === 0 || known.includes(id),
          crashed: !!sharedModelCrashes.value[id],
          space: isModelCached(id) ? "" : spaceWarning(downloadMb(id)),
        };
      }).filter(o => o.available);
    });

    const selectedPick = computed(() =>
      pickerOptions.value.find(o => o.id === picker.value.tier) || null);

    function openPicker({ firstRun = false } = {}) {
      refreshStorageInfo();
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
        status.value = t("welcome.choose-model");
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
        status.value = t("statusbar.offline-not-downloaded");
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
        const sizeMb = downloadMb(settings.value.model);
        if (sizeMb > 50) {
          const model = settings.value.model;
          const previousModel = lastAppliedModel.value;
          await refreshStorageInfo();
          const warning = spaceWarning(sizeMb);
          const ok = await askConfirm({
            icon: "⬇",
            title: t("download.confirm-title"),
            subject: modelShortName(model),
            message: warning
              ? t("download.confirm-body-warning", { size: formatSize(sizeMb), warning })
              : t("download.confirm-body", { size: formatSize(sizeMb) }),
            confirmText: t("download.confirm-ok"),
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
        status.value = t("statusbar.settings-applied");
        return;
      }

      modelLoading.value = true;
      sharedLoadedKey.value = engineKey();
      // Until the first progress report: an indeterminate bar
      loadInfo.value = { phase: "other", percent: null, doneMb: null, eta: null };
      loadPhaseStart = null;

      status.value = t("statusbar.loading-model", { model: modelShortName(settings.value.model) });
      setPendingWork(settings.value.model, "loading");
    
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
      status.value = t("statusbar.download-cancelled");

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
        `hearth-settings-${ts}.json`
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
        status.value = t("backup.settings-imported");
      } catch (err) {
        status.value = t("backup.import-failed", { error: err.message });
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
          title: titleFromMessages(messages.value) || t("chats.current"),
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
        `hearth-chats-${ts}.json`
      );
      status.value = t("backup.exported", { count: allSessions.length });
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
            title:    session.title   || t("chats.imported"),
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
          status.value = t("backup.all-exist", { count: skipped });
        } else if (skipped > 0) {
          status.value = t("backup.imported-skipped", {
            added: t("backup.new-sessions", { count: added }),
            skipped: t("backup.duplicates", { count: skipped }),
          });
        } else {
          status.value = t("backup.imported", { count: added });
        }
      } catch (err) {
        status.value = t("backup.import-failed", { error: err.message });
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
      if (!first) return t("chats.new");
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
      if (diffDays === 0) return localDate(d, { hour: "2-digit", minute: "2-digit" });
      if (diffDays === 1) return t("dates.yesterday");
      if (diffDays < 7)  return localDate(d, { weekday: "short" });
      return localDate(d, { month: "short", day: "numeric" });
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
          status.value = t("chats.couldnt-save", { error: err.message });
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
        askModel({ type: "generate", prompt: unanswered, config: liveConfig() });
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
        title: t("chats.delete-title"),
        subject: title || "",
        message: t("chats.delete-body"),
        confirmText: t("chats.delete-ok"),
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
        ? `${err.message || t("common.unknown")} (${err.filename || "?"}:${err.lineno || "?"})`
        : t("statusbar.worker-load-failed");
      console.error("Worker error:", msg, err);
      status.value = t("statusbar.worker-error", { error: msg });
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
            title: titleFromMessages(messages.value) || t("chats.current"),
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
      pickerOnPhone,
      formatSize,
      openPicker,
      chooseUse,
      closePicker,
      confirmPick,
      lastAppliedModel,
      modelOptionLabel,
      healthModal,
      healthBodyKey,
      switchToSuggestion,
      crashModal,
      useLighterModel,
      retryCrashedModel,
      chooseAfterCrash,
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
      downloadMb,
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
          {{ $t("common.back") }}
        </button>
        <h1 class="settings-title">{{ $t("settings.title") }}</h1>
        <span class="settings-saved">{{ $t("settings.saved") }}</span>
      </div>

      <div class="settings-body">

        <section class="settings-section">
          <h2 class="section-label">{{ $t("settings.model") }}</h2>
          <select v-model="settings.model" @change="applySettings()" :disabled="modelLoading || loading" class="settings-select" :aria-label="$t('settings.model')" aria-describedby="model-hint">
            <option disabled value="">{{ $t("composer.select-model") }}</option>
            <template v-for="group in modelGroups" :key="group.label">
              <optgroup :label="group.label">
                <option v-for="model in group.models" :key="model" :value="model">{{ modelOptionLabel(model) }}</option>
              </optgroup>
            </template>
          </select>
          <p class="section-hint" id="model-hint">
            {{ $t("settings.model-hint") }}
            <span v-if="settings.model" class="model-id">{{ settings.model }}</span>
          </p>
          <button class="action-btn secondary" style="margin-top:10px" @click="$router.push('/'); openPicker()">
            {{ $t("welcome.help-choose") }}
          </button>
        </section>

        <section class="settings-section">
          <h2 class="section-label" id="appearance-label">{{ $t("settings.appearance") }}</h2>
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
          <h2 class="section-label" id="language-label">{{ $t("settings.language") }}</h2>
          <select
            class="settings-select language-select"
            :value="languagePref"
            @change="setLanguage($event.target.value)"
            aria-labelledby="language-label"
            aria-describedby="language-hint"
          >
            <option value="auto">{{ $t("settings.language-auto", { language: languageName(browserLanguage) }) }}</option>
            <!-- Each language in its own words, so people find theirs -->
            <option v-for="code in languages" :key="code" :value="code" :lang="code">{{ languageName(code) }}</option>
          </select>
          <p class="section-hint" id="language-hint">
            {{ $t("settings.language-hint") }}
            <i18n-t path="settings.language-help">
              <template #link><a :href="translateUrl" target="_blank" rel="noopener">{{ $t("settings.language-help-link") }}</a></template>
            </i18n-t>
          </p>
        </section>

        <section class="settings-section">
          <h2 class="section-label">{{ $t("settings.replies") }}</h2>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name" id="label-temperature">{{ $t("settings.temperature") }}</span>
              <span class="setting-desc">{{ $t("settings.temperature-desc") }}</span>
            </div>
            <div class="setting-control">
              <input type="range" min="0" max="2" step="0.05" v-model.number="settings.temperature" class="slider" :aria-label="$t('settings.temperature')" />
              <span class="setting-value">{{ $n(settings.temperature, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">{{ $t("settings.max-tokens") }}</span>
              <span class="setting-desc">{{ $t("settings.max-tokens-desc") }}</span>
            </div>
            <div class="setting-control">
              <input type="range" min="16" max="2048" step="16" v-model.number="settings.max_tokens" class="slider" :aria-label="$t('settings.max-tokens')" :aria-valuetext="$t('settings.max-tokens-value', { tokens: String(settings.max_tokens), words: String(approxWords(settings.max_tokens)) })" />
              <span class="setting-value">{{ settings.max_tokens }}<small class="setting-sub">{{ $t("settings.approx-words", { count: String(approxWords(settings.max_tokens)) }) }}</small></span>
            </div>
          </div>

          <div class="setting-row" :class="{ pending: contextPending }">
            <div class="setting-info">
              <span class="setting-name">{{ $t("settings.context-window") }}</span>
              <span class="setting-desc">{{ $t("settings.context-window-desc") }}</span>
            </div>
            <div class="setting-control">
              <input type="range" min="512" max="8192" step="512" v-model.number="settings.contextWindowSize" class="slider" :aria-label="$t('settings.context-window')" />
              <span class="setting-value">{{ settings.contextWindowSize }}</span>
            </div>
            <div v-if="contextPending" class="setting-pending" role="status">
              <span>{{ $t("settings.context-pending") }}</span>
              <button type="button" class="action-btn primary reload-model-btn" @click="applySettings()" :disabled="modelLoading || loading">{{ $t("settings.reload-model") }}</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name" id="label-thinking">{{ $t("settings.thinking") }}</span>
              <span class="setting-desc">{{ $t("settings.thinking-desc") }}</span>
            </div>
            <div class="setting-control">
              <label class="toggle">
                <input type="checkbox" v-model="settings.thinking" class="thinking-toggle" aria-labelledby="label-thinking" />
                <span aria-hidden="true">{{ $t(settings.thinking ? "common.on" : "common.off") }}</span>
              </label>
            </div>
          </div>

          <details class="advanced">
            <summary>{{ $t("settings.advanced") }} <span class="advanced-sub">{{ $t("settings.advanced-sub") }}</span></summary>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">{{ $t("settings.top-p") }}</span>
                <span class="setting-desc">{{ $t("settings.top-p-desc") }}</span>
              </div>
              <div class="setting-control">
                <input type="range" min="0.01" max="1" step="0.01" v-model.number="settings.top_p" class="slider" :aria-label="$t('settings.top-p')" />
                <span class="setting-value">{{ $n(settings.top_p, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">{{ $t("settings.frequency-penalty") }}</span>
                <span class="setting-desc">{{ $t("settings.frequency-penalty-desc") }}</span>
              </div>
              <div class="setting-control">
                <input type="range" min="-2" max="2" step="0.1" v-model.number="settings.frequency_penalty" class="slider" :aria-label="$t('settings.frequency-penalty')" />
                <span class="setting-value">{{ $n(settings.frequency_penalty, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }}</span>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">{{ $t("settings.presence-penalty") }}</span>
                <span class="setting-desc">{{ $t("settings.presence-penalty-desc") }}</span>
              </div>
              <div class="setting-control">
                <input type="range" min="-2" max="2" step="0.1" v-model.number="settings.presence_penalty" class="slider" :aria-label="$t('settings.presence-penalty')" />
                <span class="setting-value">{{ $n(settings.presence_penalty, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }}</span>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">{{ $t("settings.repetition-penalty") }}</span>
                <span class="setting-desc">{{ $t("settings.repetition-penalty-desc") }}</span>
              </div>
              <div class="setting-control">
                <input type="range" min="1" max="2" step="0.05" v-model.number="settings.repetition_penalty" class="slider" :aria-label="$t('settings.repetition-penalty')" />
                <span class="setting-value">{{ $n(settings.repetition_penalty, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
              </div>
            </div>
          </details>

          <button type="button" class="action-btn secondary reset-replies-btn" @click="confirmResetSettings">
            {{ $t("settings.reset-replies") }}
          </button>
        </section>

        <section class="settings-section">
          <h2 class="section-label">{{ $t("settings.personas") }}</h2>
          <p class="section-hint" style="margin-bottom:12px">{{ $t("settings.personas-hint") }}</p>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">{{ $t("settings.default-persona") }}</span>
              <span class="setting-desc">{{ defaultPersona.tagline }}</span>
            </div>
            <div class="setting-control">
              <select v-model="settings.defaultPersona" class="settings-select persona-default-select" :aria-label="$t('settings.default-persona-label')">
                <option v-for="p in personas" :key="p.id" :value="p.id">{{ p.icon }} {{ p.name }}</option>
              </select>
            </div>
          </div>

          <details v-if="defaultPersona.prompt" class="persona-prompt-preview">
            <summary>{{ $t("settings.show-instructions", { name: defaultPersona.name }) }}</summary>
            <pre>{{ defaultPersona.prompt }}</pre>
          </details>

          <h3 class="subsection-label">{{ $t("settings.custom-persona") }}</h3>
          <p class="section-hint" style="margin-bottom:10px">{{ $t("settings.custom-persona-hint") }}</p>
          <textarea
            class="system-prompt-editor"
            v-model="settings.system_prompt"
            :placeholder="$t('settings.custom-placeholder')"
            rows="7"
            spellcheck="false"
          ></textarea>
          <button class="action-btn secondary" style="margin-top:8px" @click="resetSystemPrompt">
            {{ $t("settings.reset-custom") }}
          </button>
        </section>

        <section class="settings-section">
          <h2 class="section-label">{{ $t("settings.documents") }}</h2>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">{{ $t("settings.max-upload") }}</span>
              <span class="setting-desc">{{ $t("settings.max-upload-desc") }}</span>
            </div>
            <div class="setting-control">
              <input type="range" min="1" max="200" step="1" v-model.number="settings.maxFileSizeMB" class="slider" :aria-label="$t('settings.max-upload')" />
              <span class="setting-value">{{ $t("units.mb", { size: settings.maxFileSizeMB }) }}</span>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h2 class="section-label">{{ $t("device.title") }}</h2>
          <p class="section-hint" style="margin-bottom:12px">{{ $t("device.hint") }}</p>
          <div class="device-info">
            <div class="device-row">
              <span class="device-key">{{ $t("device.app-version") }}</span>
              <span class="device-val">{{ appVersion }}</span>
            </div>
            <div class="device-row">
              <span class="device-key">{{ $t("device.webllm-version") }}</span>
              <span class="device-val">{{ diagnostics?.webllmVersion || "…" }}</span>
            </div>
            <div class="device-row">
              <span class="device-key">{{ $t("device.gpu") }}</span>
              <span class="device-val">{{ diagnostics ? (diagnostics.webgpu ? (diagnostics.gpu || $t("device.no-adapter")) : $t("device.no-webgpu")) : "…" }}</span>
            </div>
            <div class="device-row">
              <span class="device-key">{{ $t("device.f16-support") }}</span>
              <span class="device-val">{{ $t(diagnostics == null || diagnostics.shaderF16 == null ? "common.unknown" : (diagnostics.shaderF16 ? "common.yes" : "common.no")) }}</span>
            </div>
            <div class="device-row">
              <span class="device-key">{{ $t("device.chats-saved-in") }}</span>
              <span class="device-val" :class="{ warn: chatStorage.kind === 'localstorage' }">{{ chatStorageText }}</span>
            </div>
            <div class="device-row">
              <span class="device-key">{{ $t("device.storage") }}</span>
              <span class="device-val" :class="{ warn: storageInfo && storageInfo.quotaMb < 2048 }">{{ storageText }}</span>
            </div>
            <div class="device-row">
              <span class="device-key">{{ $t("device.works-offline") }}</span>
              <span class="device-val" :class="{ warn: offlineReady === false }">{{ offlineText }}</span>
            </div>
            <div class="device-row">
              <span class="device-key">{{ $t("device.app") }}</span>
              <span class="device-val">
                <button v-if="installPrompt" class="action-btn primary install-btn" @click="installApp">{{ $t("device.install") }}</button>
                <template v-else>{{ $t(installedApp ? "device.installed" : "device.install-hint") }}</template>
              </span>
            </div>
            <div class="device-row">
              <span class="device-key">{{ $t("device.f16-models") }}</span>
              <span class="device-val" :class="{ warn: f16Problem() }">{{ f16Status() }}</span>
            </div>
          </div>
          <div v-if="failedModels.length" class="device-failed">
            <span class="device-key">{{ $t("device.failed-check") }}</span>
            <ul>
              <li v-for="f in failedModels" :key="f.id">
                <code>{{ f.id }}</code>
                <span class="device-sample" v-if="f.sample">“{{ f.sample.slice(0, 40) }}…”</span>
              </li>
            </ul>
          </div>
          <div class="report-problem">
            <a class="action-btn secondary" :href="reportUrl" target="_blank" rel="noopener">{{ $t("device.report") }}</a>
            <span class="section-hint">{{ $t("device.report-hint") }}</span>
          </div>
          <button v-if="checkedCount" class="action-btn secondary" style="margin-top:10px" @click="forgetModelHealth">
            {{ $t("device.forget-checks", { count: checkedCount }) }}
          </button>
          <p class="section-hint" style="margin-top:8px">{{ $t("device.offline-note") }}</p>
          <p class="section-hint" style="margin-top:8px">{{ $t("device.checks-note") }}</p>
        </section>

        <section class="settings-section">
          <h2 class="section-label">{{ $t("backup.title") }}</h2>
          <p class="section-hint" style="margin-bottom:12px">{{ $t("backup.hint") }}</p>

          <div class="transfer-grid">
            <div class="transfer-card">
              <div class="transfer-card-title">{{ $t("backup.settings-title") }}</div>
              <div class="transfer-card-desc">{{ $t("backup.settings-desc") }}</div>
              <div class="transfer-card-actions">
                <button class="action-btn secondary" @click="exportSettings">
                  {{ $t("backup.export-settings") }}
                </button>
                <button type="button" class="action-btn secondary" @click="$refs.importSettingsInput.click()">
                  {{ $t("backup.import-settings") }}
                </button>
                <input ref="importSettingsInput" type="file" class="import-settings-input" hidden accept=".json" @change="importSettings" />
              </div>
            </div>

            <div class="transfer-card">
              <div class="transfer-card-title">{{ $t("backup.chats-title") }}</div>
              <div class="transfer-card-desc">{{ $t("backup.chats-desc") }}</div>
              <div class="transfer-card-actions">
                <button class="action-btn secondary" @click="exportSessions">
                  {{ $t("backup.export-chats") }}
                </button>
                <button type="button" class="action-btn secondary" @click="$refs.importSessionsInput.click()">
                  {{ $t("backup.import-chats") }}
                </button>
                <input ref="importSessionsInput" type="file" class="import-chats-input" hidden accept=".json" @change="importSessions" />
              </div>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h2 class="section-label">{{ $t("chats.current") }}</h2>
          <p class="section-hint" style="margin-bottom:12px">{{ $t("settings.current-chat-hint") }}</p>
          <button class="action-btn danger" @click="clearConversation" :disabled="messages.length === 0">
            {{ $t("settings.clear-conversation") }}
          </button>
        </section>

        <footer class="about-credit">
          <span class="about-name">Hearth {{ appVersion }}</span>
          <span>{{ $t("about.tagline") }}</span>
          <span>
            <a :href="repoUrl" target="_blank" rel="noopener">{{ $t("about.open-source") }}</a> ·
            <i18n-t path="about.powered-by"><template #webllm><a href="https://github.com/mlc-ai/web-llm" target="_blank" rel="noopener">WebLLM</a></template></i18n-t>
          </span>
        </footer>

      </div>
    </div>
  `,

  setup() {
    // ── Appearance ───────────────────────────────────────────────────
    // The theme itself is applied by the script in index.html
    // (window.appTheme); this is only the choice.
    const themeOptions = [
      { id: "system", get name() { return t("settings.theme-system"); }, icon: "🖥" },
      { id: "light",  get name() { return t("settings.theme-light"); },  icon: "☀️" },
      { id: "dark",   get name() { return t("settings.theme-dark"); },   icon: "🌙" },
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
      ? t("settings.theme-hint-system", { mode: t(`settings.theme-mode-${themeNow.value}`) })
      : t("settings.theme-hint-fixed", { mode: t(`settings.theme-mode-${themePref.value}`) }));

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
        title: t("settings.reset-title"),
        subject: modelShortName(sharedSettings.value.model),
        message: t("settings.reset-body"),
        confirmText: t("settings.reset-ok"),
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
      if (d && d.shaderF16 === false) return t("device.f16-not-supported");
      const f16 = Object.entries(sharedModelHealth.value).filter(([id]) => isF16Model(id));
      if (f16.some(([, h]) => h && h.ok === false)) return t("device.f16-garbled");
      if (f16.some(([, h]) => h && h.ok)) return t("device.f16-working");
      return t("device.f16-not-checked");
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
      languagePref: sharedLanguagePref,
      languages: SUPPORTED_LOCALES,
      // The language "Automatic" picks right now
      browserLanguage: Vue.computed(() => resolveLanguage("auto", browserLanguages())),
      languageName,
      setLanguage,
      translateUrl: `${REPO_URL}/blob/main/docs/translating.md`,
      setTheme,
      contextPending,
      confirmResetSettings,
      personas: PERSONAS,
      defaultPersona,
      modelOptionLabel,
      diagnostics: sharedDiagnostics,
      appVersion: APP_VERSION,
      repoUrl: REPO_URL,
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
      storageInfo: sharedStorageInfo,
      storageText: Vue.computed(() => {
        const s = sharedStorageInfo.value;
        if (!s) return t("common.unknown");
        const usage = t("device.storage-usage", {
          used: formatSize(s.usageMb) || t("units.mb", { size: 0 }),
          allowed: formatSize(s.quotaMb),
        });
        if (s.persisted === true) return t("device.storage-kept", { usage });
        if (s.persisted === false) return t("device.storage-may-clear", { usage });
        return usage;
      }),
      offlineText: Vue.computed(() => {
        if (!sharedSwSupported) return t("device.offline-unsupported");
        if (sharedOfflineReady.value === true) return t("device.offline-ready");
        if (sharedOfflineReady.value === false) return t("device.offline-not-yet");
        return t("device.checking");
      }),
      installPrompt: sharedInstallPrompt,
      installedApp: isInstalledApp(),
      installApp,
      chatStorage: sharedChatStorage,
      chatStorageText: Vue.computed(() => {
        const n = sharedSessions.value.length;
        const count = t("chats.count", { count: n });
        if (sharedChatStorage.value.kind === "indexeddb") return t("device.chats-indexeddb", { count });
        if (sharedChatStorage.value.kind === "localstorage") {
          return t("device.chats-localstorage", { chats: FALLBACK_MAX_CHATS, messages: FALLBACK_MAX_MESSAGES, count });
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
  .component("i18n-t", I18nT)
  .directive("dialog", dialogDirective)
  .use(i18n)
  .use(router)
  .mount("#app");
