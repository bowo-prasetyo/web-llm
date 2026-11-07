// i18n.js: translated messages, plurals, numbers, language choice.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import {
  createI18n, pickLocale, textDirection, placeholders, catalogKeys,
  SUPPORTED_LOCALES, DEFAULT_LOCALE, t,
} from "../../i18n.js";
import en from "../../locales/en.js";

const MESSAGES = {
  en: {
    greet: "Hello {name}",
    files: { one: "{count} file", other: "{count} files" },
    zero: { "=0": "No chats", one: "{count} chat", other: "{count} chats" },
    only: { en: "English only" },
  },
  // A partial translation: "only.en" is missing
  ru: {
    greet: "Привет, {name}",
    files: { one: "{count} файл", few: "{count} файла", many: "{count} файлов", other: "{count} файла" },
  },
  ja: { files: { other: "{count} 件のファイル" } },
  ar: { greet: "مرحبا {name}" },
};

test("messages are looked up by key, with placeholders filled in", () => {
  const i = createI18n({ messages: MESSAGES });
  expect(i.t("greet", { name: "Ana" })).toBe("Hello Ana");
  expect(i.t("greet")).toBe("Hello {name}");  // a missing param stays visible
  expect(i.t("only.en")).toBe("English only");
});

test("plurals follow each language's rules", async () => {
  const i = createI18n({ messages: MESSAGES });
  expect(i.t("files", { count: 1 })).toBe("1 file");
  expect(i.t("files", { count: 2 })).toBe("2 files");
  expect(i.t("zero", { count: 0 })).toBe("No chats");  // exact "=0" wins
  expect(i.t("zero", { count: 1 })).toBe("1 chat");

  await i.setLocale("ru");
  expect(i.t("files", { count: 1 })).toBe("1 файл");
  expect(i.t("files", { count: 3 })).toBe("3 файла");
  expect(i.t("files", { count: 5 })).toBe("5 файлов");
  expect(i.t("files", { count: 21 })).toBe("21 файл");

  await i.setLocale("ja");
  expect(i.t("files", { count: 1 })).toBe("1 件のファイル");
});

test("numbers are written the language's way", async () => {
  const i = createI18n({ messages: MESSAGES });
  expect(i.t("files", { count: 1234 })).toBe("1,234 files");
  expect(i.formatNumber(1234.5)).toBe("1,234.5");
  await i.setLocale("ru");
  expect(i.formatNumber(1234.5)).toBe("1 234,5");
});

test("a missing translation falls back to English, then to the key, and is reported once", async () => {
  const missing = [];
  const i = createI18n({ messages: MESSAGES, onMissing: (key, loc) => missing.push(`${loc}:${key}`) });
  await i.setLocale("ru");
  expect(i.t("only.en")).toBe("English only");
  expect(i.t("only.en")).toBe("English only");
  expect(i.t("no.such.key")).toBe("no.such.key");
  expect(missing).toEqual(["ru:only.en", "ru:no.such.key"]);
});

test("a key pointing at a group, not a message, is treated as missing", () => {
  const i = createI18n({ messages: { en: { group: { a: "A" } } } });
  expect(i.t("group")).toBe("group");
  expect(i.t("group.a.b")).toBe("group.a.b");
});

test("the language is picked from the browser's list", () => {
  const shipped = ["en", "pt-BR", "zh-TW", "id"];
  expect(pickLocale(["pt-BR", "en"], shipped)).toBe("pt-BR");
  expect(pickLocale(["pt-PT"], shipped)).toBe("pt-BR");   // same language, other region
  expect(pickLocale(["id-ID", "en"], shipped)).toBe("id");
  expect(pickLocale(["zh"], shipped)).toBe("zh-TW");
  expect(pickLocale(["EN-us"], shipped)).toBe("en");
  expect(pickLocale(["fr", "de"], shipped)).toBe("en");     // nothing matches
  expect(pickLocale([], shipped)).toBe("en");
  expect(pickLocale(undefined, shipped)).toBe("en");
  expect(pickLocale("id", shipped)).toBe("id");
});

test("switching language: loads it, or keeps the current one when it can't", async () => {
  const i = createI18n({ messages: { en: MESSAGES.en } });
  const loaded = await i.setLocale("ru", async () => MESSAGES.ru);
  // "ru" isn't shipped (SUPPORTED_LOCALES), so it falls back to English
  expect(loaded).toBe("en");

  i.addMessages("ru", MESSAGES.ru);
  expect(await i.setLocale("ru")).toBe("ru");
  expect(i.locale).toBe("ru");

  const j = createI18n({ messages: { en: MESSAGES.en } });
  const quiet = console.warn; console.warn = () => {};
  try {
    expect(await j.setLocale("en", async () => { throw new Error("offline"); })).toBe("en");
  } finally { console.warn = quiet; }
});

test("right-to-left languages are recognised, and <html> follows the language", async () => {
  expect(textDirection("ar")).toBe("rtl");
  expect(textDirection("he-IL")).toBe("rtl");
  expect(textDirection("en")).toBe("ltr");
  expect(textDirection("")).toBe("ltr");

  const i = createI18n({ messages: MESSAGES });
  await i.setLocale("ar");
  const doc = { documentElement: {} };
  i.applyToDocument(doc);
  expect(doc.documentElement).toEqual({ lang: "ar", dir: "rtl" });
  expect(i.dir).toBe("rtl");
  i.applyToDocument(undefined); // no document (worker, tests): no error
});

test("reactive state: a language change is visible to whoever reads t()", async () => {
  let reads = 0;
  const reactive = obj => new Proxy(obj, { get(o, k) { if (k === "locale") reads++; return o[k]; } });
  const i = createI18n({ messages: MESSAGES, reactive });
  i.t("greet", { name: "x" });
  expect(reads).toBeGreaterThan(0);
});

test("the Vue plugin adds $t, $n and $d to templates", () => {
  const i = createI18n({ messages: MESSAGES });
  const app = { config: { globalProperties: {} } };
  i.install(app);
  expect(app.config.globalProperties.$t("greet", { name: "B" })).toBe("Hello B");
  expect(app.config.globalProperties.$n(1000)).toBe("1,000");
  expect(app.config.globalProperties.$d(new Date(2026, 0, 2), { year: "numeric" })).toBe("2026");
});

test("the shared translator speaks English by default", () => {
  expect(t("status.model-loaded")).toBe("Model loaded successfully");
  expect(t("chats.count", { count: 1 })).toBe("1 chat");
  expect(t("chats.count", { count: 12 })).toBe("12 chats");
});

// ── Catalogs ──────────────────────────────────────────────────────────────

test("helpers list a catalog's keys and a message's placeholders", () => {
  expect(catalogKeys(MESSAGES.en).sort()).toEqual(["files", "greet", "only.en", "zero"]);
  expect([...placeholders("Initializing {model} at {percent}")]).toEqual(["model", "percent"]);
  expect([...placeholders({ one: "{count} chat", other: "{count} chats" })]).toEqual(["count"]);
});

test("English is shipped and every message in it has text", () => {
  expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
  const keys = catalogKeys(en);
  expect(keys.length).toBeGreaterThan(20);
  const i = createI18n();
  for (const key of keys) expect(i.t(key, { count: 2 }), key).not.toBe(key);
});

test("every shipped language has English's keys and placeholders, and plural forms it uses", async () => {
  for (const code of SUPPORTED_LOCALES) {
    const catalog = (await import(`../../locales/${code}.js`)).default;
    const keys = new Set(catalogKeys(catalog));
    const rules = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
    for (const key of catalogKeys(en)) {
      expect(keys.has(key), `${code}: ${key} is missing`).toBe(true);
      const message = key.split(".").reduce((o, k) => o[k], catalog);
      const source = key.split(".").reduce((o, k) => o[k], en);
      expect([...placeholders(message)].sort(), `${code}: ${key} placeholders`)
        .toEqual([...placeholders(source)].sort());
      if (typeof message === "object") {
        for (const form of rules) expect(message[form] ?? message.other, `${code}: ${key}.${form}`).toBeTruthy();
      }
    }
    for (const key of keys) expect(catalogKeys(en), `${code}: ${key} is not in English`).toContain(key);
  }
});

test("translations are saved for offline use", () => {
  const sw = fs.readFileSync(new URL("../../sw.js", import.meta.url), "utf8");
  expect(sw).toContain('"./i18n.js"');
  for (const code of SUPPORTED_LOCALES) expect(sw).toContain(`"./locales/${code}.js"`);
});

// ── The app's own use of the catalog ─────────────────────────────────────

const SOURCES = ["app.js", "status.js", "pace.js", "picker.js", "personas.js", "storage.js", "markdown.js", "chatstore.js"];

// Keys written out in full: t("a.b"), $t('a.b'), path="a.b", and both
// sides of $t(cond ? "a.b" : "a.c")
function literalKeys(src) {
  const keys = new Set();
  const patterns = [
    /\$?\bt\(\s*["'`]([a-z][\w-]*(?:\.[\w-]+)+)["'`]/g,
    /\bpath="([a-z][\w-]*(?:\.[\w-]+)+)"/g,
    /\$?\bt\([^()"'`]*\?\s*["']([a-z][\w-]*(?:\.[\w-]+)+)["']\s*:\s*["']([a-z][\w-]*(?:\.[\w-]+)+)["']/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) for (const k of m.slice(1)) if (k) keys.add(k);
  }
  return keys;
}

test("every key the app uses is in the English catalog", () => {
  const known = new Set(catalogKeys(en));
  let found = 0;
  for (const file of SOURCES) {
    const src = fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    for (const key of literalKeys(src)) {
      found++;
      expect(known.has(key), `${file}: "${key}" is not in locales/en.js`).toBe(true);
    }
  }
  expect(found).toBeGreaterThan(300);
});

test("keys built at run time exist too", () => {
  const known = new Set(catalogKeys(en));
  const built = [
    ...["micro", "lightweight", "small", "mid", "upper-mid", "large", "tiny", "other"].map(g => `models.group-${g}`),
    ...["gpu", "page"].flatMap(k => ["loading", "answering"].map(p => `crash.body-${k}-${p}`)),
    ...["light", "dark"].map(m => `settings.theme-mode-${m}`),
    ...["friendly", "precise", "writer", "coder", "brainstorm", "custom"].flatMap(p => [`personas.${p}.name`, `personas.${p}.tagline`]),
    "errors.context-too-long",
  ];
  for (const key of built) expect(known.has(key), key).toBe(true);
});

test("the update check fingerprints every script the app is made of", () => {
  const app = fs.readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const sw = fs.readFileSync(new URL("../../sw.js", import.meta.url), "utf8");
  const appFiles = app.match(/const APP_FILES = \[([\s\S]*?)\];/)[1];
  for (const [, file] of sw.matchAll(/"(\.\/[\w/.-]+\.js)"/g)) {
    if (file === "./sw.js") continue;
    expect(appFiles, `${file} is cached by sw.js but not in APP_FILES`).toContain(`"${file}"`);
  }
});

test("the page's templates have no words outside the catalog", () => {
  // Product names, a URL and a browser address stay as they are
  const allowed = new Set(["Hearth", "WebGPU", "WebLLM", "Chrome 113+", "Edge", "chrome://flags", "webgpureport.org"]);
  const src = fs.readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const leftovers = [];
  for (const [, raw] of src.matchAll(/template:\s*`([\s\S]*?)`,?\n/g)) {
    const tpl = raw.replace(/<!--[\s\S]*?-->/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/\{\{[\s\S]*?\}\}/g, "");
    for (const [, text] of tpl.matchAll(/>([^<>]*[A-Za-z]{2,}[^<>]*)</g)) {
      if (text.trim() && !allowed.has(text.trim())) leftovers.push(text.trim());
    }
    for (const [, attr, value] of tpl.matchAll(/\s(title|aria-label|placeholder|alt|label)="([^"]*[A-Za-z][^"]*)"/g)) {
      leftovers.push(`${attr}="${value}"`);
    }
  }
  expect(leftovers).toEqual([]);
});
