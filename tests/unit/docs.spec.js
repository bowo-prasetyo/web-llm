// The documentation's links: every relative link points to a file that
// exists, and every #anchor to a heading in it (GitHub's anchor rules), in
// the English docs and their translations. Translated headings change the
// anchors, so this catches a link left pointing at the English one.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

function markdownFiles() {
  const out = fs.readdirSync(ROOT).filter(f => /^README(\.[\w-]+)?\.md$/.test(f)).map(f => path.join(ROOT, f));
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) out.push(p);
    }
  };
  walk(path.join(ROOT, "docs"));
  return out;
}

// GitHub's heading anchors: lower case, punctuation dropped (letters in any
// script, digits, spaces, "-" and "_" kept), spaces become "-", and a
// repeated heading gets "-1", "-2", …
export function anchors(markdown) {
  const seen = new Map();
  const out = new Set();
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    const m = !fenced && /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = m[1].replace(/<[^>]+>/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "");
    const base = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

// [text](target) and <img src="target">, outside code
function links(markdown) {
  const text = markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  const found = [];
  for (const m of text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) found.push(m[1]);
  for (const m of text.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)) found.push(m[1]);
  return found.filter(l => !/^[a-z][\w+.-]*:/i.test(l)); // not http:, mailto:, …
}

test("anchors follow GitHub's rules", () => {
  expect([...anchors("# Export / Import\n## Max Tokens\n## Max Tokens\n### Apa itu “token”?")])
    .toEqual(["export--import", "max-tokens", "max-tokens-1", "apa-itu-token"]);
});

test("every link in the docs points to a file and heading that exist", () => {
  const broken = [];
  const files = markdownFiles();
  expect(files.length).toBeGreaterThan(10);
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const link of links(source)) {
      const [target, hash] = link.split("#");
      const dest = target ? path.resolve(path.dirname(file), decodeURI(target)) : file;
      const where = `${path.relative(ROOT, file)} → ${link}`;
      if (!fs.existsSync(dest)) { broken.push(`${where} (no such file)`); continue; }
      if (hash && dest.endsWith(".md") && !anchors(fs.readFileSync(dest, "utf8")).has(decodeURIComponent(hash))) {
        broken.push(`${where} (no such heading)`);
      }
    }
  }
  expect(broken).toEqual([]);
});

test("each translated manual has every page of the English one", () => {
  const manual = path.join(ROOT, "docs/user-manual");
  const pages = fs.readdirSync(manual).filter(f => f.endsWith(".md")).sort();
  const translations = fs.readdirSync(manual, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  for (const code of translations) {
    expect(fs.readdirSync(path.join(manual, code)).filter(f => f.endsWith(".md")).sort(), code).toEqual(pages);
    expect(fs.existsSync(path.join(ROOT, `README.${code}.md`)), `README.${code}.md`).toBe(true);
  }
});
