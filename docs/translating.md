# Translating Hearth

Hearth's words live in **`locales/<code>.js`**, one file per language. English (`locales/en.js`) is the source: every other language has the same keys. `i18n.js` looks the words up, and formats numbers and plurals the way each language writes them.

> **Status:** the translation system is in place, but most of the interface is still written directly in `app.js`. Moving those strings into `locales/en.js` happens step by step; until it's done, a new language translates only what is already in the catalog.

## Adding a language

1. Copy `locales/en.js` to `locales/<code>.js`. Use a [BCP 47](https://www.rfc-editor.org/info/bcp47) code: `id`, `de`, `pt-BR`, `zh-TW`.
2. Translate the **values**. Keep the keys and the `{placeholders}` exactly as they are; you may move a placeholder within the sentence.
3. Add the code to `SUPPORTED_LOCALES` in `i18n.js`.
4. Add `"./locales/<code>.js"` to `SHELL_FILES` in `sw.js`, so the language works offline.
5. Run `npm run test:unit`. It checks that your file has every English key, no extra ones, the same placeholders, and every plural form your language needs.

The app picks the first language in the browser's list that it ships, so a browser set to `pt-PT` gets `pt-BR` if that is the closest, and English when nothing matches. A missing message falls back to English, so a half-finished translation never shows a blank.

## Messages

```js
status: {
  "model-loaded": "Model loaded successfully",       // plain text
  "initializing-model": "Initializing {model}...",   // a placeholder
},
chats: {
  // a plural: chosen by {count}
  "count": { one: "{count} chat", other: "{count} chats" },
},
```

**Plurals.** Give the forms your language uses, from `zero`, `one`, `two`, `few`, `many` and `other` (see the [CLDR plural rules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html)). Russian needs `one`, `few`, `many` and `other`; Japanese only `other`. An exact number such as `"=0": "No chats"` is used before the form.

**Numbers.** A number in a placeholder is written your language's way automatically (`1,234.5` in English, `1 234,5` in Russian).

**Right-to-left.** Arabic, Hebrew, Persian and Urdu set `<html dir="rtl">` automatically.

## For developers

```js
import { t } from "./i18n.js";
t("status.ready-profile", { profile: name });   // in any module
```

In Vue templates use `$t("key", params)`, `$n(number)` and `$d(date, options)`. Templates re-render when the language changes.

- Put whole sentences in the catalog, never pieces glued together in code: word order differs between languages.
- Use a plural message for anything with a count; never `n === 1 ? "" : "s"`.
- Pass a number as a number (it gets formatted), and an ID or year as a string (it doesn't).
- Keep code, model IDs and persona prompts for the model out of the catalog. The model prompts stay in English on purpose: small models follow English instructions best, and they already reply in the user's language.
