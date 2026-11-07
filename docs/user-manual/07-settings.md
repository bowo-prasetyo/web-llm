# 7. Settings

[← Choosing a model](06-models.md) · [Manual home](README.md) · [Next: Offline use and backup →](08-offline-and-backup.md)

Open Settings by tapping **⚙** in the top-right corner of the header. Tap **Back** to return to your chat.

> **Changes are saved automatically.** There's no Save or Apply button. Most changes apply to your next message.

> **Tip:** The default settings work well for most people. You only need this chapter if you want to fine-tune how replies behave.

## Settings at a glance

| Section | What's in it |
|---|---|
| [Model](#model) | Which AI model to use, and **Help me choose a model** |
| [Language](#language) | The language of the app's buttons and messages |
| [Replies](#replies) | Creativity, reply length, memory, and thinking |
| [Personas](#personas) | Default persona and your Custom instructions |
| [Documents](#documents) | Maximum file size for attachments |
| [This device](#this-device) | Information about your browser and GPU, and **Install app** |
| [Export / Import](#export--import) | Back up and move settings and chats |
| [Current chat](#current-chat) | Delete the chat that's open |

## Model

* **Model menu**: choose from all 55 models. The full technical model name is shown beneath the menu.
* **Help me choose a model**: opens the two-question picker.

Picking a different model also applies that model's recommended reply settings. See [Choosing a model](06-models.md) for help.

## Language

The language of the app itself: its buttons, menus and messages. Hearth is available in English and Indonesian (Bahasa Indonesia).

* **Automatic** (the default) uses your browser's language when Hearth has it, and English otherwise. The language it picked is shown in brackets.
* Or pick a language from the list. Each one is written in its own language, so you can find yours.

The change applies at once and is remembered on this device. It doesn't change the AI's replies: the AI answers in the language you write in.

Don't see your language? **Help translate Hearth** links to the guide for adding one.

## Replies

### Temperature

**How creative or predictable the replies are.** Range 0.0–2.0.

| Setting | Effect | Good for |
|---|---|---|
| Low (0.0–0.4) | Focused, consistent, predictable | Facts, code, step-by-step instructions |
| Medium (0.5–0.9) | Balanced | Everyday chat |
| High (1.0 and up) | Varied and surprising, but may ramble or make things up | Brainstorming, creative writing |

### Max Tokens

**The longest a single reply can be.** Range 16–2048 *tokens*. A token is a piece of a word; 100 tokens is roughly 75 English words. The app shows an approximate word count next to the slider.

* Too low: replies get cut off. You'll see a **Continue** button to get the rest.
* Higher: allows longer replies, but long replies take longer to write.

The default depends on the model's size (from 256 for the tiniest models to 1024 for 3B and up). It can't be more than half the Context Window.

### Context Window

**How much of the conversation the model can "remember" at once.** Range 512–8192 tokens.

* Bigger: the model remembers more of a long chat and can read more of an attached document, but uses more GPU memory.
* Smaller: uses less memory, but the model forgets earlier parts of a long chat sooner.

This is the only setting that needs the model to **reload**. After you change it, you'll see *"Saved. The model needs to reload to use it…"* Tap **Reload model now** to apply it straight away (it takes a few seconds), or it will apply the next time you open the app.

### Let reasoning models think first

**Off** by default. When **On**, Qwen3 and Qwen3.5 models reason step by step before they answer. This can help with tricky questions (math, logic, planning), but it's slower and uses up some of the reply length. The reasoning appears under a collapsible **Thought process** heading. DeepSeek-R1 models always reason, whatever this setting says.

### Advanced sampling

Folded away by default. *Most people never need these.* Tap **Advanced sampling** to open it.

| Setting | Range | In plain words |
|---|---|---|
| **Top P** | 0.01–1.0 | Lower values make the model stick to its most likely word choices. |
| **Frequency Penalty** | −2 to 2 | Higher values discourage repeating the same words. |
| **Presence Penalty** | −2 to 2 | Higher values encourage the model to bring up new topics. |
| **Repetition Penalty** | 1.0–2.0 | Higher values discourage repeating earlier text. Raise it slightly if replies get repetitive. |

### Reset to this model's recommended settings

Puts Temperature, Max Tokens, Context Window and the advanced settings back to the recommended values for the current model. You'll be asked to confirm. Your personas and Custom instructions are **not** affected.

## Personas

* **Default for new chats**: which persona new chats start with.
* **Show the … instructions**: read the instructions behind a persona.
* **🛠 Custom persona**: write your own instructions. **Reset to Friendly instructions** gives you a starting point.

See [Personas](04-personas.md) for details and tips.

## Documents

* **Max Upload Size**: the largest file you can attach, from 1 to 200 MB (default 50 MB). The text inside is always limited to about 200 pages.

See [Asking about your documents](05-documents.md).

## This device

Information the app has found about your browser and graphics chip. This is mostly useful when [troubleshooting](09-troubleshooting.md).

| Item | What it tells you |
|---|---|
| **WebLLM version** | The version of the AI engine the app uses |
| **GPU** | Your graphics chip, or *WebGPU not available* |
| **16-bit GPU support** | Whether your GPU supports the faster 16-bit models |
| **Chats saved in** | Where your chats are stored. A warning here means limited storage (for example, private browsing). |
| **Works offline** | Whether the app is saved for offline use |
| **App** | An **Install app** button where your browser supports it, or *Installed* |
| **16-bit (q4f16) models** | Whether 16-bit models work correctly here |

If any models failed the automatic quality check on your device, they're listed under **Failed the model check here**, with a sample of their garbled output.

**Forget check results** clears the results so each model is checked again. This is useful after a browser or graphics-driver update.

## Export / Import

| Button | What it does |
|---|---|
| **Export Settings** | Downloads your settings as a file named `hearth-settings-YYYY-MM-DD.json`. |
| **Import Settings** | Loads settings from an exported file. Your current model choice is kept, so importing never starts a surprise download. |
| **Export Chats** | Downloads all your chats (including attached documents) as `hearth-chats-YYYY-MM-DD.json`. |
| **Import Chats** | Adds chats from an exported file to the ones you already have. Chats you already have are skipped, so nothing is duplicated or overwritten. |

See [Back up and move your data](08-offline-and-backup.md#back-up-and-move-your-data) for step-by-step instructions.

## Current chat

* **Clear Conversation**: deletes the chat that's open, with its messages and attached documents. You'll be asked first.

At the very bottom of Settings you'll find the app's name and version, with links to its source code and to WebLLM, the engine it's built on.

> **Important:** Deleting a chat can't be undone. Export your chats first if you might want them later.

[← Choosing a model](06-models.md) · [Manual home](README.md) · [Next: Offline use and backup →](08-offline-and-backup.md)
