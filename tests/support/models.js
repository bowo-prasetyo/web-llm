// The model lists and sizes from the real worker.js, so test doubles stay
// in sync with the app.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function literal(source, name, open, close) {
  const start = source.indexOf(open, source.indexOf(name));
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === open) depth++;
    else if (source[i] === close && --depth === 0) {
      return Function(`"use strict"; return (${source.slice(start, i + 1)});`)();
    }
  }
  throw new Error(`${name} not found in worker.js`);
}

export function workerModels() {
  const src = fs.readFileSync(path.join(ROOT, "worker.js"), "utf8");
  const sizes = literal(src, "const MODEL_SIZES_MB", "{", "}");
  const alternatives = literal(src, "const F32_ALTERNATIVES_MB", "{", "}");
  const models = literal(src, "const AVAILABLE_MODELS", "[", "]");
  return { models, altModels: Object.keys(alternatives), sizes: { ...sizes, ...alternatives } };
}
