# 6. Choosing a model

[← Documents](05-documents.md) · [Manual home](README.md) · [Next: Settings →](07-settings.md)

The **model** is the AI that writes the replies. Hearth offers 55 open models, from tiny ones that run on phones to large ones that need a powerful graphics card. This chapter helps you pick the right one and switch between them.

## The short version

* **Not sure? Use the picker.** Open **Settings → Help me choose a model** (or **Help me choose a model** on the welcome screen). Answer the two questions, and it picks a model that suits your device.
* **Replies too slow?** Choose a smaller model.
* **Answers not good enough?** Choose a bigger model, if your device can handle it.
* **Switching models never deletes your chats.** The new model continues the conversation.

## Bigger vs smaller models

Model sizes are measured in **parameters**, written like *0.8B* or *9B* (B = billion). More parameters usually means a smarter model, but also a bigger download and slower replies.

| Size | Download | Speed | Answer quality | Runs on |
|---|---|---|---|---|
| Tiny (under 1B) | ~0.6–2 GB | Fastest | Basic; may get facts wrong | Most phones, older laptops |
| Small (1–2B) | ~0.7–2.6 GB | Fast | Good for everyday tasks | Most laptops; phones with plenty of memory |
| Mid (3–4B) | ~2.2–5.4 GB | Moderate | Noticeably better | Laptops with a good GPU |
| Large (7–9B) | ~4.8–7.4 GB | Slower | Best available here | Computers with a dedicated graphics card (6 GB+ video memory) |

## Phones

Phones give the AI much less memory than computers do. A model that is too big for your phone doesn't show an error: the phone simply closes the page. When you open it again, the app tells you what happened, doesn't load that model again, and suggests a smaller one, so you can step down one size at a time. The model menu marks models that crashed with **⚠ crashed on this device**.

How far down you need to go depends on the phone. On one tested Android phone, Qwen3.5 0.8B, Llama 3.2 1B, Gemma 3 1B and TinyLlama all closed the page, and only SmolLM2 360M (about 0.6 GB) fit. Tiny models like that can barely hold a conversation, so for real use a computer works much better.

## Recommended picks

| If you want… | Try |
|---|---|
| The lightest option | Gemma 3 1B or Qwen3.5 0.8B |
| Something for a phone | Llama 3.2 1B or Gemma 3 1B if your phone has enough memory; otherwise SmolLM2 360M (see [Phones](#phones)) |
| Everyday chat | Qwen3.5 2B, or Qwen3.5 4B on a stronger device |
| Coding help | Qwen3.5 4B or Qwen3.5 9B |
| Writing help | Qwen3.5 4B or Ministral 3 3B |
| Step-by-step reasoning | Qwen3.5 with **Let reasoning models think first** turned on, or DeepSeek-R1 Distill Qwen 7B |
| Other languages | Qwen3.5 2B or Qwen3.5 4B |
| Following instructions closely | Phi-4-mini |
| The most capable model | Qwen3.5 9B (needs a strong GPU) |

## Use the model picker

1. Open the picker from **Settings → Help me choose a model**, or from the welcome screen.
2. Choose what you'll mostly use it for: **Everyday chat**, **Coding**, or **Writing**.
3. Choose a size: **Fast**, **Balanced**, or **Smart**.
   * **Recommended** marks the best fit for your device.
   * **In use** marks the model you have now.
   * **Already downloaded** means no download is needed.
4. Tap **Download & start** (or **Start**, if it's already downloaded).

## Pick a model from the list

The **model menu** is in the toolbar (and also in **Settings → Model**). Models are grouped by size, from lightest to heaviest.

Each entry reads like this:

> **Qwen3.5 2B · 16-bit · 2.2 GB ✓**

| Part | Meaning |
|---|---|
| Qwen3.5 2B | The model's name and size |
| 16-bit / 32-bit | The type of math the model uses on your GPU (see below) |
| 2.2 GB | Approximate download size |
| ✓ | Already downloaded to this device |
| ⚠ | May not work on this device (see below) |

### Downloading a new model

The first time you pick a model, a **Download Model?** dialog shows its size. Tap **Download & Load** to continue, or **Cancel** to keep your current model.

While it downloads, you can tap **Cancel** in the progress panel. The app goes back to the model and settings you had before.

> **Note:** You need an internet connection to download a new model. Offline, the app explains this instead of trying.

### Switching models mid-chat

You can switch at any time. The current conversation stays on screen, and the new model picks it up from there. The new model's recommended reply settings are applied automatically.

## 16-bit vs 32-bit models

Many models come in two versions:

* **16-bit (q4f16)**: smaller and faster. This is usually the better choice.
* **32-bit (q4f32)**: a bit larger and slower, but works on more devices.

Some graphics chips do 16-bit math incorrectly. When that happens, a 16-bit model replies with gibberish (for example *"outer outer outer…"*).

**The app checks for this automatically.** The first time each model loads on your device, it runs a quick test. If the model fails, a dialog titled **This model doesn't work on your GPU** offers a working 32-bit version:

* **Switch model** — use the suggested 32-bit model (recommended).
* **Keep this model** — keep the current one anyway.

On devices where 16-bit doesn't work, the model list marks 16-bit models with ⚠, and the picker automatically suggests 32-bit versions.

## The speed hint

After a model has written a few replies, a line above the toolbar shows how fast it writes on your device, for example:

> *Qwen3.5 4B writes about 2 words/sec on this device. For quicker replies, try **Qwen3.5 2B**.*

Tap the suggested model's name to switch to it.

## Free up storage

Downloaded models stay in your browser so they load instantly next time. Large models can take several gigabytes. To remove them, clear this site's data in your browser settings.

> **Important:** Clearing site data removes **everything**: downloaded models, chats, documents and settings. Export your chats first if you want to keep them (see [Back up and move your data](08-offline-and-backup.md#back-up-and-move-your-data)).

[← Documents](05-documents.md) · [Manual home](README.md) · [Next: Settings →](07-settings.md)
