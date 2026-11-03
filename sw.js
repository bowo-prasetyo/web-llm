// Service worker: makes the app work offline and installable.
//
// - The app's own files: network first (so updates arrive on the next
//   visit), falling back to the saved copy when offline or slow.
// - Pinned CDN libraries (exact versions, never change): saved on install
//   and served from the cache first.
// - Google Fonts: cache first.
// - Model weights and model libraries (Hugging Face, GitHub) are NOT
//   handled here: WebLLM and Transformers.js already keep them in the
//   browser's cache, and saving them twice would double several GB.

const SHELL_CACHE = "webllm-shell-v1";
const LIB_CACHE = "webllm-libs-v1";
const KNOWN_CACHES = [SHELL_CACHE, LIB_CACHE];

const SHELL_FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./worker.js",
  "./style.css",
  "./personas.js",
  "./markdown.js",
  "./quality.js",
  "./context.js",
  "./picker.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

// Requested exactly as the pages request them (classic scripts without
// crossorigin are no-cors; scripts with integrity and module imports are
// cors), so the saved responses match later requests.
const LIBS = [
  ["https://unpkg.com/vue@3.5.44/dist/vue.global.prod.js", "no-cors"],
  ["https://unpkg.com/vue-router@4.6.4/dist/vue-router.global.prod.js", "no-cors"],
  ["https://cdn.jsdelivr.net/npm/marked@18.1.1/lib/marked.umd.js", "cors"],
  ["https://cdn.jsdelivr.net/npm/dompurify@3.4.17/dist/purify.min.js", "cors"],
  ["https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.12.0/highlight.min.js", "cors"],
  ["https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs", "cors"],
  ["https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs", "cors"],
  ["https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.84/+esm", "cors"],
  ["https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2", "cors"],
];

// Library URLs that pin an exact version, so a saved copy never goes stale.
function isPinnedLibrary(url) {
  return (
    (url.hostname === "cdn.jsdelivr.net" && /\/npm\/(@[^/]+\/)?[^/@]+@\d[^/]*/.test(url.pathname)) ||
    (url.hostname === "unpkg.com" && /^\/(@[^/]+\/)?[^/@]+@\d/.test(url.pathname)) ||
    (url.hostname === "cdnjs.cloudflare.com" && /\/ajax\/libs\/[^/]+\/\d/.test(url.pathname))
  );
}

function isFont(url) {
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    // cache: "reload" skips the HTTP cache so the saved copy is current
    await shell.addAll(SHELL_FILES.map(u => new Request(u, { cache: "reload" })));

    const libs = await caches.open(LIB_CACHE);
    await Promise.all(LIBS.map(async ([url, mode]) => {
      if (await libs.match(url)) return;
      try {
        const res = await fetch(new Request(url, { mode }));
        if (res.ok || res.type === "opaque") await libs.put(url, res);
      } catch (err) {
        // Saved on first use instead (the runtime handler below)
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("webllm-") && !KNOWN_CACHES.includes(name) &&
          (name.includes("shell") || name.includes("libs"))) {
        await caches.delete(name);
      }
    }
    await self.clients.claim();
  })());
});

// Network first with a timeout; the saved copy when offline or too slow.
async function networkFirst(request, cacheKey) {
  const cache = await caches.open(SHELL_CACHE);
  const network = fetch(request).then(res => {
    if (res.ok) cache.put(cacheKey, res.clone());
    return res;
  });
  network.catch(() => {}); // a late failure after the timeout is expected offline
  const timeout = new Promise(resolve => setTimeout(resolve, 4000, null));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {}
  const cached = await cache.match(cacheKey, { ignoreSearch: true });
  if (cached) return cached;
  return network; // nothing saved: wait for the network (or fail)
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request.url);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") cache.put(request.url, res.clone());
  return res;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
    // Page loads (any path in scope) use the saved index.html offline
    const key = request.mode === "navigate"
      ? new URL("./index.html", self.registration.scope).href
      : url.origin + url.pathname;
    event.respondWith(networkFirst(request, key));
    return;
  }

  if (isPinnedLibrary(url)) {
    event.respondWith(cacheFirst(request, LIB_CACHE));
    return;
  }

  if (isFont(url)) {
    event.respondWith(cacheFirst(request, LIB_CACHE).catch(() => new Response("", { status: 504 })));
  }
  // Everything else (model weights, model libraries) goes to the network
  // untouched; WebLLM and Transformers.js cache those themselves.
});

// The app asks whether everything needed to start offline is saved.
self.addEventListener("message", event => {
  if (event.data?.type !== "offline-status") return;
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    const libs = await caches.open(LIB_CACHE);
    const shellOk = (await Promise.all(SHELL_FILES.map(u => shell.match(new URL(u, self.registration.scope).href)))).every(Boolean);
    const libsOk = (await Promise.all(LIBS.map(([u]) => libs.match(u)))).every(Boolean);
    event.source?.postMessage({ type: "offline-status", ready: shellOk && libsOk, shellOk, libsOk });
  })());
});
