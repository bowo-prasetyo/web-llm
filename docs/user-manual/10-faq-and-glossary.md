# 10. FAQ and glossary

[← Troubleshooting](09-troubleshooting.md) · [Manual home](README.md) · [Quick reference →](quick-reference.md)

## Frequently asked questions

### Privacy and data

**Is it really private?**
Yes. The AI model runs on your own device. Your messages, chats, documents and settings are stored only in your browser and are never sent to a server. There's no account and no tracking of what you type.

**Then what does the app download?**
Only things it needs to run: the app itself, the AI model files (from Hugging Face and GitHub), a few code libraries, fonts, and, for large documents, a small search helper. None of these requests contain anything you've typed.

**Can other people see my chats?**
Not through the app. But anyone who can use your device and browser can open the app and see your chats, just like your browsing history. On a shared computer, use your own browser profile, or delete chats when you're done.

**Is it safe to attach confidential documents?**
The documents are read and stored only on your device and are never uploaded. Remember that exported chat files include your attached documents, so store those files carefully.

### Cost and accounts

**Does it cost anything?**
No. There's no subscription, no account, and no API key.

**Do I need to sign up?**
No.

### Using the app

**Does it work on my phone?**
Often, yes, with a small model (choose **Fast**). You need a recent phone and browser with WebGPU: Safari on iOS 17 or newer, or a recent Chrome on Android.

**Why is the first start so slow?**
The first time, the app downloads an AI model, often 1.6 GB or more. After that it loads from your device in seconds.

**Can I use it without internet?**
Yes, once the app and a model are downloaded. See [Offline use](08-offline-and-backup.md#use-the-app-offline).

**Can it search the web or see today's news?**
No. The model only knows what it learned during training, plus what you type or attach. It can't browse the internet and may not know about recent events.

**Can it read images or audio?**
No. It works with text, and with PDF, TXT and Markdown documents that contain text.

**Can I use more than one model?**
Yes. You can download several and switch between them at any time from the model menu, even in the middle of a chat.

**How do I get my chats onto another device?**
Export them in **Settings → Export Chats**, copy the file, and use **Import Chats** on the other device. See [Back up and move your data](08-offline-and-backup.md#back-up-and-move-your-data).

**Is it as good as large online AI assistants?**
Usually not. Models that fit on a personal device are much smaller. They're great for everyday questions, writing help, brainstorming and simple code, but they make more mistakes on complex or specialist topics. In return, you get full privacy and offline use.

**Why does the same question get different answers?**
AI models include some randomness. Tap **Regenerate** for another version. For more consistent answers, lower the **Temperature** in Settings.

**Does it understand languages other than English?**
Many models do. Qwen3.5 models are a good choice for other languages.

---

## Glossary

| Term | Meaning |
|---|---|
| **AI model** (or **model**) | The "brain" that writes the replies. Different models vary in size, speed and quality. |
| **Attachment** | A document (PDF, TXT, Markdown) added to a chat so you can ask about it. |
| **Chat** (or **session**) | One conversation. Each chat is saved separately in the chat list. |
| **Context window** | How much text the model can "see" at once: your conversation, plus any document passages. Older messages beyond this limit are left out. |
| **Export / Import** | Saving your chats or settings to a file, and loading them back, for backup or moving to another device. |
| **GPU** | Graphics processing unit, the chip in your device that draws graphics. The app uses it to run the AI quickly. |
| **Max Tokens** | The longest a single reply is allowed to be. |
| **Parameters** (e.g. **2B**, **9B**) | A measure of a model's size. "2B" means 2 billion parameters. Bigger usually means smarter but slower. |
| **Persona** | A style for the assistant: Friendly, Precise, Writer, Coder, Brainstorm, or your own Custom instructions. |
| **PWA / Install app** | Installing the web app so it opens in its own window with an icon, like a regular app. |
| **q4f16 / q4f32** (16-bit / 32-bit) | Two versions of the same model. 16-bit is smaller and faster; 32-bit works on more GPUs. |
| **Regenerate** | Ask the AI to write the last reply again. |
| **Starter prompt** | A suggested first message on the welcome screen. Tap one to send it. |
| **Temperature** | How creative (high) or predictable (low) replies are. |
| **Thinking / Thought process** | Step-by-step reasoning that some models write before their answer. It's shown folded away so you can read it if you like. |
| **Token** | A piece of a word the model reads and writes. About 100 tokens ≈ 75 English words. |
| **WebGPU** | A browser feature that lets web pages use your GPU. Required by this app. |
| **WebLLM** | The open-source engine that runs AI models inside a web browser. Private AI Chat is built on it. |

[← Troubleshooting](09-troubleshooting.md) · [Manual home](README.md) · [Quick reference →](quick-reference.md)
