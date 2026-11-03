// Scripted stand-in for WebLLM, routed in place of the jsDelivr import so
// the real worker.js runs without a GPU or model downloads.
// CreateMLCEngine returns an engine whose reply depends on the last user
// message. Every engine creation and request is reported to the page over
// a BroadcastChannel ("mock-engine"); the fixture collects them in
// window.__calls.
const bc = new BroadcastChannel("mock-engine");
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A real reply from Qwen2.5-Coder-0.5B that repeats itself (and contains
// seams from the old automatic continuation), for the repeat guard.
export const LOOPING_REPLY = "To code \"Hello World\" in JavaScript and show it on a browser, you need to write the following code:\n\n```javascript\nconsole.log(\"Hello World\");\n```\nThis code uses the console.log() function to display the string \"Hello World\" on the console. The console.log() function is a built-in function in JavaScript that can be used to output text to the console. The console.log() function is a simple way to display text on the console, and it's a good practice to use it in your code.\n\nTo show the output on a browser, you need to use the document.write() function. Here's an example:\n\n```javascript\nconsole.log(\"Hello World\");\ndocument.write(\"<br>\"); // Adding a line break to separate the output from the next line\n```\nIn this example, the document.write() function is used to write the string \"Hello World\" to the console. The document.write() function is a built-in function in JavaScript that can be used toThe document.write() function is used to write the string \"Hello World\" to the console. The document.write() function is a built-in function in JavaScript that can be used to write the string \"Hello World\" to the console. The document.write() function is a built-in function in JavaScript that can be used to write the string \"Hello World\" to the console. The document.write() function is a built-in function in JavaScript that can be used to write the string \"Hello World\" to the console. The document.write() function is a built-in function in JavaScript that can be used to write the string\n";

function script(lastUser) {
  if (lastUser.startsWith("Your previous reply was cut off")) return { text: "The rest of the answer, finished properly.", finish: "stop" };
  if (lastUser === "long") return { text: "Here is the first part of a long answer that keeps going and is used to", finish: "length" };
  if (lastUser === "loop") return { text: LOOPING_REPLY, finish: "stop" };
  if (lastUser === "junk") return { text: " outer".repeat(60), finish: "stop" };
  if (lastUser === "slow") return { text: "word ".repeat(200), finish: "stop", delay: 60 };
  if (lastUser === "boom") return { text: "Partial text before the crash.", finish: "stop", throwAfter: true };
  return { text: "Echo: " + lastUser, finish: "stop" };
}

export async function CreateMLCEngine(model, engineConfig, chatOpts) {
  bc.postMessage({ kind: "create", model, chatOpts: chatOpts || null });
  return {
    async unload() {},
    async resetChat() {},
    chat: { completions: { async create(req) {
      const lastUser = [...req.messages].reverse().find(m => m.role === "user")?.content || "";
      bc.postMessage({ kind: "request", stream: !!req.stream, max_tokens: req.max_tokens, messages: req.messages, extra_body: req.extra_body || null });
      if (!req.stream) return { choices: [{ message: { content: "Hello there, nice to meet you!" } }] };
      const s = script(lastUser);
      const pieces = s.text.match(/\S+\s*|\s+/g) || [];
      return (async function* () {
        for (let i = 0; i < pieces.length; i++) {
          if (s.delay) await sleep(s.delay);
          yield { choices: [{ delta: { content: pieces[i] }, finish_reason: null }] };
          if (s.throwAfter && i === pieces.length - 1) throw new Error("Something broke in the engine");
        }
        yield { choices: [{ delta: { content: "" }, finish_reason: s.finish }] };
      })();
    } } },
  };
}
