# 4. Personas

[← Managing your chats](03-managing-chats.md) · [Manual home](README.md) · [Next: Documents →](05-documents.md)

A **persona** sets *how* the assistant talks: its tone, its level of detail, and what it focuses on. The same question can get a chatty answer, a one-line answer, or a polished piece of writing depending on the persona.

## The six personas

| Persona | Best for | Example request |
|---|---|---|
| 💬 **Friendly** *(default)* | Everyday help and easygoing chat | *"What's a good way to start learning the guitar?"* |
| 🎯 **Precise** | Short, factual answers with no tangents. Says "I'm not sure" rather than guessing. | *"What's the boiling point of water at sea level?"* |
| ✍️ **Writer** | Drafting, rewriting and polishing emails, messages, essays and stories | *"Rewrite this message so it sounds more polite: …"* |
| 💻 **Coder** | Writing, explaining and debugging code | *"Why does this Python loop never end? …"* |
| 💡 **Brainstorm** | Exploring ideas and options | *"Give me 10 name ideas for a bakery."* |
| 🛠 **Custom** | Your own instructions, written in Settings | Anything you set up |

Every built-in persona is told to stay consistent with what it said earlier, and to politely correct you if you say something that isn't right instead of just agreeing.

Every built-in persona also knows its name is **Hearth**, so it answers "What's your name?" with "Hearth". Asked who made it, it can explain that Hearth is an open-source app and that its replies come from an open AI model running on your device. The **Custom** persona uses only your own instructions, so it goes by whatever name you give it, or none.

## Choose a persona for a new chat

On the welcome screen of a new chat, tap one of the persona cards. Each persona also offers a few **starter prompts** below the cards. Tap one to send it straight away.

## Switch persona in the middle of a chat

Use the **persona menu** on the left of the toolbar (it shows the current persona's icon and name).

* The new persona applies from your **next** message.
* The conversation so far is kept.
* Each chat remembers its own persona, so switching here doesn't affect your other chats.

## Set the default persona for new chats

1. Open **Settings** (⚙).
2. Go to **Personas → Default for new chats**.
3. Pick a persona.

To see exactly what a persona is told to do, open **Show the … instructions** under that menu.

## Create your own persona (Custom)

The **Custom** persona follows instructions you write yourself.

1. Open **Settings → Personas**.
2. Under **🛠 Custom persona**, type your instructions in the text box.
3. Go back to a chat and choose **🛠 Custom** in the persona menu.

Changes apply from your next message. There's no need to reload anything.

**Tips for writing good instructions:**

* **Keep it short and plain.** Small on-device models follow a few clear sentences much better than a long list of rules.
* **Say who it is and what to do.** For example:
  > *You are a patient tutor for a 10-year-old. Explain things in simple words, use everyday examples, and end each answer with one question to check understanding.*
* **Say what to avoid** in one sentence if needed: *"Don't use jargon."*

To start over, tap **Reset to Friendly instructions**. This fills the box with the Friendly persona's instructions as a starting point.

## What personas don't change

Personas only change the assistant's instructions. They don't change the model, reply length, creativity (temperature), or any other setting in [Settings](07-settings.md).

[← Managing your chats](03-managing-chats.md) · [Manual home](README.md) · [Next: Documents →](05-documents.md)
