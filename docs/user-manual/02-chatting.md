# 2. Chatting with the assistant

[← Getting started](01-getting-started.md) · [Manual home](README.md) · [Next: Managing your chats →](03-managing-chats.md)

This chapter covers the controls you'll use every day.

## Send a message

1. Click or tap the message box at the bottom of the screen (it says *Ask something…*).
2. Type your question or request.
3. Send it:
   * **On a computer:** press **Enter**.
   * **On a phone or tablet:** tap the **Send** button (paper-plane icon).
   * **Anywhere:** **Ctrl+Enter** (Windows, Linux) or **Cmd+Enter** (Mac) also sends.

### Start a new line instead of sending

* **On a computer:** press **Shift+Enter**.
* **On a phone or tablet:** press **Enter** on the on-screen keyboard. (On touch screens, Enter adds a new line, and only the Send button sends.)

The message box grows as you type so you can see your whole message.

> **Note:** If you type in Chinese, Japanese, Korean or another language that uses an input method, pressing Enter to confirm a character never sends the message by mistake.

## Watch the reply arrive

Replies appear word by word as the AI writes them. While it writes:

* The **Send** button turns into a red, pulsing **Stop** button.
* You can **scroll up** to reread earlier messages. The screen stays where you put it.
* A **Follow the reply** button appears. Tap it to jump back down and follow the new text. (When nothing is being written, the same button says **Jump to latest**.)

> **How fast is it?** After a few replies, a line above the toolbar says how fast the current model writes on your device, for example *"Qwen3.5 2B writes about 6 words/sec on this device."* If it's slow, the app suggests a smaller model you can switch to with one tap. See [Choosing a model](06-models.md).

## Stop a reply

Tap the red **Stop** button at any time. The part already written is kept and saved.

Useful when the answer is going in the wrong direction or is longer than you need.

## Reply tools

Under each finished reply you'll find:

| Button | What it does |
|---|---|
| **Copy** | Copies the whole reply to your clipboard. The button briefly shows **Copied**. |
| **Regenerate** | *(Last reply only)* Asks the AI to answer your last message again. You'll usually get a different answer. |
| **Retry** | *(Shown instead of Regenerate after an error)* Tries the last request again. |
| **Continue** | *(Only when a reply was cut off)* Picks up where the reply stopped. |

### Why was my reply cut off?

Sometimes a reply ends with a note. Here's what each one means:

| Note | Meaning | What to do |
|---|---|---|
| *Cut off at the Max Tokens limit (…)* | The reply reached the maximum length set in Settings. | Tap **Continue** for the rest, or increase **Max Tokens** in [Settings](07-settings.md#max-tokens). |
| *Stopped: the model stopped writing for a minute.* | The model got stuck and stopped making progress. | Tap **Continue** or **Regenerate**. If it keeps happening, try a smaller model. |
| *Cut off at the 20-minute limit for one reply.* | A safety limit for very long replies. | Tap **Continue**. |
| *The reply started repeating itself, so it was stopped there.* | The model began repeating the same sentence. The repeats were removed. | Ask a follow-up, or **Regenerate**. |

## How replies are formatted

Replies are formatted for easy reading: headings, bullet lists, numbered steps, tables and links. Links open in a new tab.

**Code** appears in a shaded box that shows the programming language and has its own **Copy** button, so you can copy just the code. Colors (syntax highlighting) are added once the reply finishes.

Your own messages are always shown exactly as you typed them.

## "Thinking" models

Some models (Qwen3, Qwen3.5 and DeepSeek-R1) can reason step by step before answering.

* While the model is thinking, you'll see **Thinking…** with its working notes.
* When it's done, those notes fold away under **Thought process**. Tap it to read them.
* The notes aren't included when you copy the reply.

For Qwen3 and Qwen3.5, thinking is **off** by default because it's slower and uses up reply length. Turn it on in **Settings → Replies → Let reasoning models think first** if you want it for hard questions. DeepSeek-R1 always thinks.

## Does the assistant remember the conversation?

Yes, within a chat. Each chat remembers what you said earlier, so you can ask follow-up questions such as *"Make it shorter"* or *"Now explain the second point."*

Different chats don't share memory. Very long chats eventually exceed what the model can "see" at once (its *context window*). When that happens, the oldest messages are quietly left out of what the model reads. They stay on your screen, though. To give the model more memory, see [Context Window](07-settings.md#context-window).

## Tips for better answers

* **Be specific.** *"Write a 3-sentence thank-you email to my landlord for fixing the heater"* works better than *"Write an email."*
* **Say the format you want.** *"Answer in a table"*, *"Give me 5 bullet points"*, *"Keep it under 100 words."*
* **Use follow-ups.** If the answer isn't quite right, say what to change instead of starting over.
* **Pick the right persona.** **Precise** for short facts, **Writer** for text, **Coder** for code. See [Personas](04-personas.md).
* **Check important facts.** Small on-device models know less than large online services and can be confidently wrong.

[← Getting started](01-getting-started.md) · [Manual home](README.md) · [Next: Managing your chats →](03-managing-chats.md)
