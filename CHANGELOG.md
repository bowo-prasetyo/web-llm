# Changelog

What changed in each version of Private AI Chat. The version is shown in
**Settings → This device**.

## [1.0.0] - Unreleased

The first release: a private AI chat that runs entirely in your browser.

### Chat
- Chat with an AI model that runs on your own GPU (WebGPU). No server, no account; messages, chats and documents never leave your device.
- Replies stream in and are formatted: headings, lists, tables, links, and highlighted code with a Copy button.
- Copy any reply; regenerate or retry the last one; Stop at any time.
- A reply cut off by its length limit, or one that stops making progress, ends with a note and a **Continue** button.
- Replies that collapse into junk or keep repeating a sentence are stopped and explained.
- Reasoning models (Qwen3, Qwen3.5 with thinking on, DeepSeek-R1) show their reasoning folded away as "Thought process".

### Personas
- Friendly, Precise, Writer, Coder and Brainstorm, or your own instructions (Custom). Chosen per chat and switchable mid-conversation.
- Personas gently correct mistakes instead of agreeing, and stay consistent with what they said earlier.

### Models
- 55 open models from 135M to 9B parameters, including Qwen3.5, Llama 3, Phi-4-mini, Gemma, Mistral and OLMo 2.
- First-run picker: choose what it's for (chat, coding, writing) and a size (Fast, Balanced, Smart); it picks a model that works on your device.
- A quick check after a model's first load catches GPUs with broken 16-bit math and offers a version that works.
- Shows how fast the model writes on your device, and suggests a smaller one when it's slow.
- Honest about small models: they often get facts wrong, and the app says so.
- Download progress with time left and Cancel; downloaded models are marked ✓.

### Chats and documents
- Multiple chats, saved automatically in the browser (IndexedDB), with search across all of them.
- Attach PDF, text or Markdown documents to a chat and ask about them; large ones are searched for the parts that match each question.
- Export and import chats and settings to move them to another browser.

### Works anywhere
- Works offline after the first visit; installable as an app on desktop and phone.
- Light and dark themes, following the device or chosen in Settings.
- Keyboard and screen-reader friendly; docked chat list on wide screens, a drawer on phones.
- Fonts are served with the app: nothing is requested from third parties except the model and library downloads.
- **Report a problem** in Settings → This device opens a GitHub issue form with your browser, GPU and model filled in.

[1.0.0]: https://github.com/bowo-prasetyo/web-llm/releases/tag/v1.0.0
