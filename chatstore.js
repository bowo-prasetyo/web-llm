// Chat storage.
//
// Chats live in IndexedDB (database "webllm-chats"):
//   chats        { id, title, preview, model, persona, ts }   - the sidebar list
//   messages     { id, messages: [...] }                       - one record per chat
//   attachments  { id, chatId, name, text, chars, ts, chunks } - documents attached
//                to a chat (chunks: [{ text, embedding }] for large ones)
// so the sidebar loads without reading every message. There is no limit on
// the number of chats or messages beyond the browser's storage quota.
//
// Chats saved by earlier versions in localStorage ("webllm-sessions-index",
// "webllm-session:<id>", and the older single "webllm-conversation") are
// copied over once; the old keys are removed only after the copy committed.
//
// If IndexedDB can't be used (some private-browsing modes, blocked storage),
// the same API runs on localStorage with the old limits, so the app still
// works.

const DB_NAME = "webllm-chats";
const DB_VERSION = 2; // 2: attachments

const LEGACY_INDEX = "webllm-sessions-index";
const LEGACY_PREFIX = "webllm-session:";
const LEGACY_SINGLE = "webllm-conversation";

// Limits of the localStorage fallback (its quota is about 5 MB)
export const FALLBACK_MAX_MESSAGES = 40;
export const FALLBACK_MAX_CHATS = 50;

const promisify = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const committed = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
});

const byNewest = (a, b) => (b.ts || 0) - (a.ts || 0);

// Plain copies: IndexedDB can't store Vue's reactive proxies.
const plain = value => JSON.parse(JSON.stringify(value));

function metaOf(chat) {
  return {
    id: chat.id,
    title: chat.title || "Chat",
    preview: chat.preview || "",
    model: chat.model || "",
    persona: chat.persona || null,
    ts: chat.ts || Date.now(),
  };
}

function openDatabase(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined" || !indexedDB) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const timer = setTimeout(() => reject(new Error("IndexedDB did not open in time")), timeoutMs);
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("chats")) db.createObjectStore("chats", { keyPath: "id" });
      if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages", { keyPath: "id" });
      if (!db.objectStoreNames.contains("attachments")) {
        db.createObjectStore("attachments", { keyPath: "id" }).createIndex("chatId", "chatId");
      }
    };
    request.onsuccess = () => { clearTimeout(timer); resolve(request.result); };
    request.onerror = () => { clearTimeout(timer); reject(request.error); };
  });
}

class IndexedDbStore {
  constructor(db) {
    this.db = db;
    this.kind = "indexeddb";
  }

  async list() {
    const tx = this.db.transaction("chats", "readonly");
    const all = await promisify(tx.objectStore("chats").getAll());
    return all.sort(byNewest);
  }

  async getMessages(id) {
    const tx = this.db.transaction("messages", "readonly");
    const record = await promisify(tx.objectStore("messages").get(id));
    return Array.isArray(record?.messages) ? record.messages : [];
  }

  // Save several chats ({ ...meta, messages }) in one transaction.
  async putMany(chats) {
    if (!chats.length) return;
    const tx = this.db.transaction(["chats", "messages"], "readwrite");
    for (const chat of chats) {
      tx.objectStore("chats").put(metaOf(chat));
      tx.objectStore("messages").put({ id: chat.id, messages: plain(chat.messages || []) });
    }
    await committed(tx);
  }

  save(meta, messages) {
    return this.putMany([{ ...meta, messages }]);
  }

  // Delete a chat with its messages and attachments
  async delete(id) {
    const tx = this.db.transaction(["chats", "messages", "attachments"], "readwrite");
    tx.objectStore("chats").delete(id);
    tx.objectStore("messages").delete(id);
    const attachments = tx.objectStore("attachments");
    const keys = await promisify(attachments.index("chatId").getAllKeys(id));
    keys.forEach(k => attachments.delete(k));
    await committed(tx);
  }

  // ── attachments ──
  async listAttachments(chatId) {
    const tx = this.db.transaction("attachments", "readonly");
    const all = await promisify(tx.objectStore("attachments").index("chatId").getAll(chatId));
    return all.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }

  async saveAttachment(attachment) {
    const tx = this.db.transaction("attachments", "readwrite");
    tx.objectStore("attachments").put(plain(attachment));
    await committed(tx);
  }

  async deleteAttachment(id) {
    const tx = this.db.transaction("attachments", "readwrite");
    tx.objectStore("attachments").delete(id);
    await committed(tx);
  }
}

// The old storage, kept as a fallback when IndexedDB can't be used.
class LocalStorageStore {
  constructor() {
    this.kind = "localstorage";
    // Documents would overflow localStorage's ~5 MB quota, so attachments
    // are kept for this visit only.
    this.attachments = new Map();
  }

  readIndex() {
    try { return JSON.parse(localStorage.getItem(LEGACY_INDEX) || "[]") || []; }
    catch { return []; }
  }

  writeIndex(index) {
    index.sort(byNewest);
    // Over the limit: drop the oldest chats and their messages
    for (const old of index.splice(FALLBACK_MAX_CHATS)) {
      localStorage.removeItem(LEGACY_PREFIX + old.id);
    }
    localStorage.setItem(LEGACY_INDEX, JSON.stringify(index));
  }

  async list() {
    return this.readIndex().sort(byNewest);
  }

  async getMessages(id) {
    try {
      const parsed = JSON.parse(localStorage.getItem(LEGACY_PREFIX + id) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  async putMany(chats) {
    const index = this.readIndex();
    for (const chat of chats) {
      localStorage.setItem(LEGACY_PREFIX + chat.id,
        JSON.stringify(plain(chat.messages || []).slice(-FALLBACK_MAX_MESSAGES)));
      const meta = metaOf(chat);
      const i = index.findIndex(c => c.id === chat.id);
      if (i >= 0) index[i] = meta; else index.push(meta);
    }
    this.writeIndex(index);
  }

  save(meta, messages) {
    return this.putMany([{ ...meta, messages }]);
  }

  async delete(id) {
    localStorage.removeItem(LEGACY_PREFIX + id);
    localStorage.setItem(LEGACY_INDEX, JSON.stringify(this.readIndex().filter(c => c.id !== id)));
    for (const [key, a] of this.attachments) if (a.chatId === id) this.attachments.delete(key);
  }

  async listAttachments(chatId) {
    return [...this.attachments.values()].filter(a => a.chatId === chatId).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }

  async saveAttachment(attachment) {
    this.attachments.set(attachment.id, plain(attachment));
  }

  async deleteAttachment(id) {
    this.attachments.delete(id);
  }
}

function legacyTitle(messages) {
  const first = messages.find(m => m.role === "user");
  if (!first) return "Chat";
  const text = String(first.content || "").trim();
  return text.slice(0, 42) + (text.length > 42 ? "…" : "");
}

// Chats in localStorage from earlier versions, as { ...meta, messages }.
function readLegacyChats() {
  const chats = [];
  let index = [];
  try { index = JSON.parse(localStorage.getItem(LEGACY_INDEX) || "[]") || []; } catch {}
  for (const entry of index) {
    if (!entry || !entry.id) continue;
    let messages = [];
    try { messages = JSON.parse(localStorage.getItem(LEGACY_PREFIX + entry.id) || "[]"); } catch {}
    chats.push({ ...entry, messages: Array.isArray(messages) ? messages : [] });
  }
  // The single conversation saved before multiple chats existed
  try {
    const single = JSON.parse(localStorage.getItem(LEGACY_SINGLE) || "null");
    if (Array.isArray(single) && single.length) {
      chats.push({ id: "legacy-" + Date.now().toString(36), title: legacyTitle(single), preview: "", ts: Date.now(), messages: single });
    }
  } catch {}
  return chats;
}

function removeLegacyKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === LEGACY_INDEX || key === LEGACY_SINGLE || key.startsWith(LEGACY_PREFIX)) keys.push(key);
  }
  keys.forEach(k => localStorage.removeItem(k));
}

// Copy chats from localStorage into IndexedDB once. Returns how many.
export async function migrateFromLocalStorage(store) {
  let hasLegacy = false;
  try {
    hasLegacy = localStorage.getItem(LEGACY_INDEX) !== null ||
      localStorage.getItem(LEGACY_SINGLE) !== null;
  } catch { return 0; }
  if (!hasLegacy) return 0;

  const chats = readLegacyChats();
  await store.putMany(chats); // throws (and keeps the old keys) if it fails
  removeLegacyKeys();
  return chats.length;
}

// The chat store to use: IndexedDB (after migrating old chats), or the
// localStorage fallback when IndexedDB can't be opened.
export async function openChatStore() {
  try {
    const store = new IndexedDbStore(await openDatabase());
    try {
      store.migrated = await migrateFromLocalStorage(store);
    } catch (err) {
      console.warn("Could not move chats from localStorage yet", err);
      store.migrated = 0;
    }
    return store;
  } catch (err) {
    console.warn("IndexedDB unavailable; saving chats in localStorage", err);
    const store = new LocalStorageStore();
    // Fold the single pre-multi-chat conversation into the index
    try {
      const single = JSON.parse(localStorage.getItem(LEGACY_SINGLE) || "null");
      if (Array.isArray(single) && single.length) {
        await store.putMany([{ id: "legacy-" + Date.now().toString(36), title: legacyTitle(single), ts: Date.now(), messages: single }]);
      }
      localStorage.removeItem(LEGACY_SINGLE);
    } catch {}
    return store;
  }
}
