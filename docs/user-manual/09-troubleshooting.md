# 9. Troubleshooting

[← Offline use and backup](08-offline-and-backup.md) · [Manual home](README.md) · [Next: FAQ and glossary →](10-faq-and-glossary.md)

Find your problem in the list below, then follow the steps in order. Most problems are solved by step 1 or 2.

**Jump to:**
[WebGPU Not Available](#webgpu-not-available) ·
[Download is slow or fails](#the-download-is-slow-or-fails) ·
[Replies are very slow](#replies-are-very-slow) ·
[Garbled replies](#replies-are-gibberish-or-repeat-the-same-words) ·
[Replies are cut off](#replies-are-cut-off) ·
[Poor or wrong answers](#answers-are-poor-or-wrong) ·
[It forgot earlier messages](#the-assistant-forgot-what-i-said-earlier) ·
[Document problems](#a-document-wont-attach-or-the-answers-ignore-it) ·
[The app crashed or froze](#the-app-crashed-froze-or-the-screen-went-blank) ·
[My chats are missing](#my-chats-are-missing) ·
[Offline problems](#the-app-doesnt-work-offline) ·
[Storage is full](#my-device-is-running-out-of-storage)

---

## "WebGPU Not Available"

**What it means:** your browser can't give the app access to your graphics chip, which it needs to run the AI.

1. **Use a supported browser:** Chrome 121 or newer, or Edge, on a computer. On Apple devices, update to macOS 14 / iOS 17 or newer and use Safari.
2. **Update your browser** to the latest version.
3. **Turn on hardware acceleration.** In Chrome or Edge, open the browser's Settings, search for *hardware acceleration*, turn on **Use graphics acceleration when available**, and restart the browser.
4. **On Chrome for Android:** go to `chrome://flags`, search for **WebGPU**, enable it, and restart Chrome.
5. **Update your graphics drivers** (on Windows, via Windows Update or your GPU maker's website).
6. **Check your device** at [webgpureport.org](https://webgpureport.org). If it reports that WebGPU isn't supported, try a different browser or device.

Then tap **Try Again** on the error screen.

## The download is slow or fails

1. **Check your connection.** Models are large (1–8 GB), so use Wi‑Fi if possible.
2. **Keep the tab open** and your device awake until the download finishes.
3. **"Not enough storage space to download this model"?** In a **private (incognito) window** the browser allows only a little storage, far less than a model needs: open the app in a normal window. Otherwise free up space; see [Storage is full](#my-device-is-running-out-of-storage). The model picker and the **Download Model?** question warn you beforehand when a model probably won't fit, and **Settings → This device → Storage** shows how much the browser allows.
4. **Try again.** Pick the model again from the model menu. If you cancelled earlier, you'll be asked to confirm the download again; that's normal.
5. **Choose a smaller model** if your connection or storage is limited.

## Replies are very slow

The AI runs on your own device, so speed depends on your hardware and the model's size.

1. **Look at the speed hint** above the toolbar. If the app suggests a smaller model, tap its name to switch.
2. **Choose a smaller model** (for example, *Fast* in the picker). See [Choosing a model](06-models.md).
3. **Turn off thinking.** In **Settings → Replies**, set **Let reasoning models think first** to **Off**.
4. **Close other heavy apps and browser tabs**, especially games, video editors, or other AI tools that use the GPU.
5. **Plug in your laptop.** On battery, many laptops slow down the graphics chip to save power.
6. **The very first reply after loading** is often slower while the model warms up. Later replies are faster.

## Replies are gibberish or repeat the same words

For example: *"outer outer outer outer…"*

**What it means:** your graphics chip handles the faster 16-bit math incorrectly. It's a known issue with some GPUs and drivers, not a problem with your device.

1. If a dialog titled **This model doesn't work on your GPU** (or **This model may not work on your GPU**) appears, tap **Switch model**. It picks a working 32-bit version.
2. Otherwise, open the model menu and choose a model labelled **32-bit** instead of 16-bit.
3. After updating your browser or graphics driver, you can give 16-bit models another chance: **Settings → This device → Forget check results**.

The app also stops replies that collapse into repeated words, explains what happened, and keeps them out of the conversation so they don't confuse the model later.

## Replies are cut off

| You see | Do this |
|---|---|
| *Cut off at the Max Tokens limit* | Tap **Continue**. To allow longer replies, raise **Max Tokens** in [Settings](07-settings.md#max-tokens). |
| *Stopped: the model stopped writing for a minute.* | Tap **Continue** or **Regenerate**. If it happens often, use a smaller model. |
| *The reply started repeating itself…* | Tap **Regenerate**, or ask your question differently. Raising **Repetition Penalty** slightly in Advanced sampling can also help. |

## Answers are poor or wrong

On-device models are much smaller than big online AI services, so they know less and make more mistakes.

1. **Try a bigger model** if your device can handle it (Balanced or Smart in the picker).
2. **Use the Precise persona** for factual questions. It's told to say "I'm not sure" rather than guess.
3. **Lower the Temperature** (for example to 0.3) for more focused answers.
4. **Give more detail** in your question, and say what format you want.
5. **Start a new chat** if the conversation has drifted far from your current topic.
6. **Always double-check** important facts with a trusted source.

## The assistant forgot what I said earlier

Every model can only "see" a limited amount of conversation at once (its *context window*). In long chats, the oldest messages are left out of what it reads.

1. **Remind it** of the key details in your next message.
2. **Increase the Context Window** in **Settings → Replies**, then tap **Reload model now**. (Larger values use more GPU memory.)
3. **Start a new chat** for a new topic.

## A document won't attach, or the answers ignore it

1. **Check the file type:** only PDF, TXT and Markdown (`.md`) are supported.
2. **Check the size:** the default limit is 50 MB. Raise it in **Settings → Documents → Max Upload Size** (up to 200 MB).
3. **Scanned PDFs can't be read.** If you can't select the text with your mouse, the PDF is a picture. Use a PDF tool with text recognition (OCR) first, or copy the text into a `.txt` file.
4. **Very long documents** (over about 200 pages) are cut at the limit.
5. **First large document offline?** The app needs to download a small search helper once. Connect to the internet and try again.
6. **Ask more specific questions.** For long documents, the app finds the passages that match your question. Specific words from the document help it find the right part.
7. **Make sure you're in the right chat.** Documents belong to the chat they were attached to.

## The app crashed, froze, or the screen went blank

The app recovers from most GPU and engine errors automatically: if the browser takes the GPU away (phones do this in the background), the model is reloaded and your question is answered.

When a model is too big for the device's memory, the GPU stops working or the whole page closes. The app then shows **The GPU stopped working** or, when you open it again, **The page closed unexpectedly**. It doesn't load that model again by itself (so it can't get stuck crashing), keeps what the reply had written, and offers a smaller model, **Try again**, or **Choose another model**. The model menu marks it **⚠ crashed on this device** until it works again.

1. **Wait a moment.** Recovery can take a few seconds.
2. **Reload the page.** Your chats are saved, and an unanswered question is asked again automatically.
3. **Choose a smaller model.** Crashes usually mean the model is too big for your GPU's memory. On phones, step down one size at a time (see [Phones](06-models.md#phones)).
4. **Close other GPU-heavy tabs and apps.**
5. If the GPU crashes twice in one visit, the app stops and shows the troubleshooting screen; follow [the steps above](#webgpu-not-available).

> **Note:** After 30 minutes without use, the app unloads the model to free GPU memory. The next message reloads it from your device, which takes a few seconds.

## My chats are missing

1. **Same browser and device?** Chats are stored in the browser where you created them. They don't sync between browsers or devices. Use [Export and Import](08-offline-and-backup.md#back-up-and-move-your-data) to move them.
2. **Private / incognito window?** Chats created there may be removed when you close the window. Check **Settings → This device → Chats saved in**.
3. **Cleared browsing data?** Clearing "site data" or "cookies and site data" removes your chats. If you have an export file, use **Import Chats** to restore them.
4. **Search for them.** Open the chat list and type a word you remember into **Search chats**.

## The app doesn't work offline

1. **Open the app once while online** so it can save itself. Then check **Settings → This device → Works offline**.
2. **Use a model you've downloaded** (marked ✓). New models need a connection.
3. **Private / incognito windows** may not keep the offline copy.

## My device is running out of storage

Downloaded models take the most space (often several gigabytes each). **Settings → This device → Storage** shows how much the app uses and how much the browser allows. After the first model loads, the app asks the browser to keep its storage, so models aren't deleted when space runs low; whether that's granted is up to the browser ("kept by the browser" in the same row).

1. **Export your chats first:** **Settings → Export Chats**.
2. In your browser's settings, find the site data for `bowo-prasetyo.github.io` and clear it. In Chrome: **Settings → Privacy and security → Site settings → View permissions and data stored across sites**.
3. Open the app again, choose **one** model, and import your chats.

> **Important:** Clearing site data removes **everything** the app has stored: models, chats, documents and settings.

## Still stuck?

* Note what you see in **Settings → This device**. It's useful when describing the problem.
* Report the issue on the project's [GitHub page](https://github.com/bowo-prasetyo/web-llm/issues). Don't include private chat content in your report.

[← Offline use and backup](08-offline-and-backup.md) · [Manual home](README.md) · [Next: FAQ and glossary →](10-faq-and-glossary.md)
