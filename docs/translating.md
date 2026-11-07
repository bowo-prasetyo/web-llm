# Translating Hearth

Hearth's words live in **`locales/<code>.js`**, one file per language. English (`locales/en.js`) is the source: every other language has the same keys. `i18n.js` looks the words up, and formats numbers and plurals the way each language writes them.

Everything the interface shows is in the catalog: about 400 messages. What stays in English on purpose: the product names (Hearth, WebLLM, WebGPU), model names and IDs, the instructions the personas give the model (small models follow English instructions best, and they already reply in the user's language), and the bug report sent to GitHub.

## Adding a language

1. Copy `locales/en.js` to `locales/<code>.js`. Use a [BCP 47](https://www.rfc-editor.org/info/bcp47) code: `id`, `de`, `pt-BR`, `zh-TW`.
2. Translate the **values**. Keep the keys and the `{placeholders}` exactly as they are; you may move a placeholder within the sentence.
3. Add the code to `SUPPORTED_LOCALES` in `i18n.js`.
4. Add `"./locales/<code>.js"` to `SHELL_FILES` in `sw.js`, so the language works offline.
5. Run `npm run test:unit`. It checks that your file has every English key, no extra ones, the same placeholders, and every plural form your language needs.

People choose the language in **Settings → Language**. Your language appears there under its own name (from the browser, e.g. "Deutsch") as soon as it is in `SUPPORTED_LOCALES`. With **Automatic**, the default, the app picks the first language in the browser's list that it ships, so a browser set to `pt-PT` gets `pt-BR` if that is the closest, and English when nothing matches. A missing message falls back to English, so a half-finished translation never shows a blank.

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

**Links, buttons and bold text inside a sentence.** Some messages have a placeholder that the page fills with markup, for example `"Suggested: {model}"`, where `{model}` is the model's name in bold, or `"Powered by {webllm}"`, where `{webllm}` is a link. Keep the placeholder; move it wherever your language needs it. A comment above such a message in `locales/en.js` says what it becomes.

## Translating the documentation

The README and the user manual can be translated too (Indonesian and Japanese are done):

* `README.<code>.md` next to `README.md`, and `docs/user-manual/<code>/` with **every** page of the English manual, same file names.
* Translate the headings too. Links to a heading (`#…`) follow the translated text, GitHub style: lower case, punctuation dropped, spaces become `-`. Update the links to match.
* Use the app's own words for anything on screen (`locales/<code>.js`), so readers find what the manual describes.
* Keep code, commands, file names and model names as they are. Say at the top that the English version wins if they differ.
* Add a link to your language at the top of `README.md` and of `docs/user-manual/README.md`.
* Screenshots of the app in your language: add a scene to `tests/screenshots/docs.spec.js` (`npm run screenshots`). Only show model replies that a model really wrote.

`npm run test:unit` checks every link and heading anchor in the docs (`tests/unit/docs.spec.js`) and that your manual has every page.

## For developers

```js
import { t } from "./i18n.js";
t("status.ready-profile", { profile: name });   // in any module
```

In Vue templates use `$t("key", params)`, `$n(number)` and `$d(date, options)`. Templates re-render when the language changes.

For a sentence with markup inside, keep it one message and give each piece a slot:

```html
<i18n-t path="health.suggested">
  <template #model><strong>{{ modelShortName(id) }}</strong></template>
</i18n-t>
```

`<i18n-t>` renders no wrapper element unless you pass `tag="span"`; other `{params}` go in `:params`.

- Put whole sentences in the catalog, never pieces glued together in code: word order differs between languages.
- Use a plural message for anything with a count; never `n === 1 ? "" : "s"`.
- Pass a number as a number (it gets formatted), and an ID or year as a string (it doesn't).
- Code that runs in the worker (`worker.js`, `context.js`) doesn't know the page's language: send a code and let the page translate (see `status.js`, and the `code` on errors from `context.js`).
- `tests/unit/i18n.spec.js` fails if the code uses a key that isn't in `locales/en.js`, or if a template has words outside the catalog.
- Keep code, model IDs and persona prompts for the model out of the catalog. The model prompts stay in English on purpose: small models follow English instructions best, and they already reply in the user's language.
