// Translations: looks up the words the app shows, by key, in the current
// language, and formats numbers, plurals and dates the way that language
// writes them.
//
//   t("status.model-loaded")                     → "Model loaded successfully"
//   t("status.ready", { profile: "Safe GPU Mode" }) → "Ready (Safe GPU Mode)"
//   t("chats.count", { count: 3 })               → "3 chats"
//
// Messages live in locales/<code>.js, one object per language, nested by
// area ("status", "chats", …). A message is either
// - a string with {placeholders}: "Initializing {model}...", or
// - a plural: { one: "{count} chat", other: "{count} chats" }, chosen with
//   Intl.PluralRules from params.count. The forms are the language's own
//   (Russian uses one/few/many/other, Japanese only other), and an exact
//   number ("=0") wins over the form.
// Numbers in params are written the language's way (1,234.5 / 1.234,5).
// A key missing from a language falls back to English, then to the key
// itself, so a half-finished translation never shows a blank.
//
// No DOM or Vue needed (the worker and the unit tests use it too). When
// the page passes Vue's reactive(), switching language re-renders every
// template that called t(). docs/translating.md explains how to add a
// language.

import en from "./locales/en.js";

export const DEFAULT_LOCALE = "en";

// Languages the app ships, as BCP 47 codes. Each needs locales/<code>.js.
export const SUPPORTED_LOCALES = ["en", "id", "ja"];

// Written right to left
const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ps", "sd", "ug", "ur", "yi"]);

// The best supported language for what the browser asks for, e.g.
// ["pt-BR", "en"] → "pt-BR" if shipped, else "pt", else "en".
export function pickLocale(preferred, supported = SUPPORTED_LOCALES, fallback = DEFAULT_LOCALE) {
  const list = (Array.isArray(preferred) ? preferred : [preferred]).filter(Boolean);
  const lower = new Map(supported.map(s => [s.toLowerCase(), s]));
  for (const want of list) {
    const tag = String(want).toLowerCase();
    if (lower.has(tag)) return lower.get(tag);
    const base = tag.split("-")[0];
    if (lower.has(base)) return lower.get(base);
    // "zh" asked, only "zh-TW" shipped: still better than the fallback
    const regional = supported.find(s => s.toLowerCase().split("-")[0] === base);
    if (regional) return regional;
  }
  return fallback;
}

// What a saved choice means: "auto" (or nothing, or a language the app
// no longer ships) follows the browser; anything else is that language.
export function resolveLanguage(pref, preferred = browserLanguages(), supported = SUPPORTED_LOCALES) {
  if (pref && pref !== "auto" && supported.includes(pref)) return pref;
  return pickLocale(preferred, supported);
}

// The languages the browser asks for, most wanted first
export function browserLanguages(nav = globalThis.navigator) {
  const list = nav?.languages?.length ? nav.languages : [nav?.language];
  return list.filter(Boolean);
}

// A language's name in that language, as people look for it in a list:
// "English", "Deutsch", "Indonesia", "日本語" (CLDR's names).
export function languageName(code) {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    if (!name || name === code) return code;
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    return code;
  }
}

// How to write dates and numbers: the browser's own variant when it is the
// same language as the page ("en-GB" for English in a British browser:
// 7 Nov, not Nov 7), otherwise the page's language.
export function regionalLocale(locale, preferred = []) {
  const base = String(locale).toLowerCase().split("-")[0];
  const same = preferred.find(p => String(p).toLowerCase().split("-")[0] === base);
  return same || locale;
}

// "rtl" or "ltr"
export function textDirection(locale) {
  return RTL_LANGUAGES.has(String(locale || "").toLowerCase().split("-")[0]) ? "rtl" : "ltr";
}

function lookup(catalog, key) {
  let node = catalog;
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

// The {placeholders} a message uses (all plural forms together)
export function placeholders(message) {
  const texts = typeof message === "string" ? [message] : Object.values(message || {});
  const names = new Set();
  for (const text of texts) {
    for (const m of String(text).matchAll(/\{(\w+)\}/g)) names.add(m[1]);
  }
  return names;
}

// Every key in a catalog, as "area.name" (plural messages count as one)
export function catalogKeys(catalog, prefix = "") {
  const keys = [];
  for (const [name, value] of Object.entries(catalog || {})) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (isMessage(value)) keys.push(key);
    else keys.push(...catalogKeys(value, key));
  }
  return keys;
}

const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);

function isMessage(value) {
  if (typeof value === "string") return true;
  if (!value || typeof value !== "object") return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every(k => PLURAL_FORMS.has(k) || /^=\d+$/.test(k));
}

// A translator for one set of catalogs. `reactive` (optional) is Vue's
// reactive(), so templates follow language changes.
export function createI18n({
  locale = DEFAULT_LOCALE,
  messages = { [DEFAULT_LOCALE]: en },
  fallback = DEFAULT_LOCALE,
  reactive = x => x,
  onMissing = null,
  preferred = browserLanguages(),
} = {}) {
  const state = reactive({ locale, catalogs: { ...messages } });
  const cache = new Map(); // Intl objects are slow to create
  const reported = new Set();

  function intl(kind, loc, options) {
    const id = `${kind}|${loc}|${JSON.stringify(options || {})}`;
    if (!cache.has(id)) {
      const Ctor = { plural: Intl.PluralRules, number: Intl.NumberFormat, date: Intl.DateTimeFormat }[kind];
      let made;
      try { made = new Ctor(loc, options); } catch { made = new Ctor(fallback, options); }
      cache.set(id, made);
    }
    return cache.get(id);
  }

  function find(key) {
    const own = lookup(state.catalogs[state.locale], key);
    if (own !== undefined && isMessage(own)) return { message: own, locale: state.locale };
    const base = lookup(state.catalogs[fallback], key);
    if (base !== undefined && isMessage(base)) return { message: base, locale: fallback };
    return null;
  }

  function missing(key) {
    const id = `${state.locale}|${key}`;
    if (reported.has(id)) return;
    reported.add(id);
    if (onMissing) onMissing(key, state.locale);
  }

  // Dates and numbers: the browser's variant of the page's language
  function formatLocale(loc = state.locale) {
    return regionalLocale(loc, preferred);
  }

  function formatNumber(n, options) {
    return intl("number", formatLocale(), options).format(n);
  }

  function interpolate(text, params, loc) {
    return text.replace(/\{(\w+)\}/g, (whole, name) => {
      if (!(name in params)) return whole;
      const v = params[name];
      return typeof v === "number" ? intl("number", formatLocale(loc)).format(v) : String(v ?? "");
    });
  }

  function t(key, params = {}) {
    params = params || {};
    const found = find(key);
    if (!found) { missing(key); return key; }
    if (found.locale !== state.locale) missing(key);
    let { message } = found;
    if (typeof message === "object") {
      const count = Number(params.count);
      const exact = message[`=${count}`];
      const form = Number.isFinite(count) ? intl("plural", found.locale).select(count) : "other";
      message = exact ?? message[form] ?? message.other ?? "";
    }
    return interpolate(message, params, found.locale);
  }

  // Dates and times, e.g. formatDate(ts, { weekday: "short" })
  function formatDate(value, options) {
    return intl("date", formatLocale(), options).format(value instanceof Date ? value : new Date(value));
  }

  // Adds or replaces a language's messages (e.g. after loading them).
  function addMessages(code, catalog) {
    state.catalogs[code] = catalog;
  }

  // Switches language, loading locales/<code>.js the first time. Unknown
  // codes fall back to English. Returns the language now in use.
  async function setLocale(code, load = loadCatalog) {
    const next = pickLocale([code], Object.keys(state.catalogs).concat(SUPPORTED_LOCALES), fallback);
    if (!state.catalogs[next]) {
      try { addMessages(next, await load(next)); } catch (err) {
        console.warn(`Could not load the "${next}" translation`, err);
        return state.locale;
      }
    }
    state.locale = next;
    return next;
  }

  // Sets <html lang dir> so screen readers, fonts, hyphenation and
  // right-to-left layout follow the language.
  function applyToDocument(doc = globalThis.document) {
    if (!doc?.documentElement) return;
    doc.documentElement.lang = state.locale;
    doc.documentElement.dir = textDirection(state.locale);
  }

  return {
    t,
    formatNumber,
    formatDate,
    setLocale,
    addMessages,
    applyToDocument,
    get locale() { return state.locale; },
    get dir() { return textDirection(state.locale); },
    get catalogs() { return state.catalogs; },
    // Vue plugin: $t, $n, $d in every template
    install(app) {
      app.config.globalProperties.$t = t;
      app.config.globalProperties.$n = formatNumber;
      app.config.globalProperties.$d = formatDate;
    },
  };
}

export async function loadCatalog(code) {
  return (await import(`./locales/${code}.js`)).default;
}

// The app's shared translator, English until the page picks a language.
// Modules use t() from here; the page makes it reactive (useReactive) and
// chooses the language at startup.
let shared = createI18n({ onMissing: warnMissing });

function warnMissing(key, locale) {
  console.warn(`Missing translation: "${key}" (${locale})`);
}

// Called once by the page, before anything renders, with Vue's reactive()
export function useReactive(reactive) {
  shared = createI18n({ locale: shared.locale, messages: shared.catalogs, reactive, onMissing: warnMissing });
  return shared;
}

export function i18n() { return shared; }
export const t = (key, params) => shared.t(key, params);
export const formatNumber = (n, options) => shared.formatNumber(n, options);
export const formatDate = (value, options) => shared.formatDate(value, options);
