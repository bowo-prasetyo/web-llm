// A stand-in for worker.js that speaks the same message protocol, for UI
// tests. Behaviour is driven by the test through /__mode (routed by the
// fixture) and by the prompt text:
//   md / think        stream a Markdown / <think> reply ("…slow" streams slowly)
//   degen / timeout   reply that collapsed into junk / timed out (no text)
//   stopnow / fail    stopped before any text / engine error
// The model lists are filled in from the real worker.js by the fixture.
const { models: MODELS, altModels: ALT, sizes: SIZES } = __MODELS__;

const MD = "Here is **bold** and `inline` code.\n\n```js\nfunction add(a, b) {\n  return a + b; // sum\n}\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nRaw <img src=x onerror=\"window.__xss=1\"> and <b>tag</b>.\n\n[bad](javascript:window.__xss=2) [good](https://example.com)\n\n- one\n- two";
const THINK = "<think>\nLet me reason about **this** step by step.\n</think>\n\nThe answer is **42**.";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const mode = async () => {
  try { return await (await fetch("/__mode")).json(); } catch { return {}; }
};
let replies = 0;

self.onmessage = async (event) => {
  const d = event.data;
  const m = await mode();

  if (d.type === "init") {
    postMessage({ type: "models", models: MODELS, altModels: ALT, sizes: SIZES });
    postMessage({ type: "diagnostics", webllmVersion: "0.2.84", webgpu: true, gpu: "test gpu", shaderF16: m.f16 !== false });
  }

  if (d.type === "set-config") {
    const model = d.config.model;
    if (m.crash) {
      postMessage({ type: "fatal", reason: "gpu-crash", text: "GPU crashed" });
      return;
    }
    const verdict = (m.check || {})[model] || "ok";
    if (d.config.selfTest) {
      if (verdict === "no-f16") {
        postMessage({ type: "model-check", model, ok: false, reason: "no-f16", sample: "" });
        postMessage({ type: "status", text: "This model needs 16-bit GPU support" });
        return;
      }
      postMessage({
        type: "model-check", model, ok: verdict === "ok",
        reason: verdict === "ok" ? "" : "one word repeated",
        sample: verdict === "ok" ? "Hello there!" : " outer outer outer outer outer outer",
      });
    }
    // mode.download: [{ text, progress }] steps reported before the load
    // finishes, mode.downloadDelay ms apart (a simulated download)
    for (const step of m.download || []) {
      await sleep(m.downloadDelay || 100);
      postMessage({ type: "downloading", text: step.text, progress: step.progress });
    }
    if (m.downloadHang) return; // stays "downloading" until cancelled
    if (m.download) await sleep(m.downloadDelay || 100);
    postMessage({ type: "status", text: "Model loaded successfully" });
  }

  if (d.type === "generate") {
    const p = d.prompt;
    if (p === "fail") { postMessage({ type: "error", text: "boom" }); return; }
    postMessage({ type: "thinking" });
    if (p === "degen") {
      postMessage({ type: "stream", text: "outer outer outer outer" });
      await sleep(50);
      postMessage({ type: "response", text: "", outcome: "degenerate", model: d.config.model });
      return;
    }
    if (p === "timeout") { postMessage({ type: "response", text: "", outcome: "timeout", model: d.config.model }); return; }
    if (p === "stopnow") { postMessage({ type: "response", text: "", outcome: "stopped", model: d.config.model }); return; }
    const full = p.startsWith("think") ? THINK : p.startsWith("md") ? MD : `reply ${++replies} to ${p}`;
    const steps = 6;
    const pause = p.endsWith("slow") ? 700 : 30;
    for (let i = 1; i <= steps; i++) {
      postMessage({ type: "stream", text: full.slice(0, Math.ceil(full.length * i / steps)) });
      await sleep(pause);
    }
    postMessage({ type: "response", text: full });
  }
};
