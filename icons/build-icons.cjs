// Draws the Hearth icons: a flame inside an arched hearth, amber on the
// app's dark background. Run `npm run icons` after changing the geometry;
// it rewrites hearth.svg and the PNGs in this folder. The same mark is
// drawn inline in the app header (app.js, .header-mark).
const path = require("path");
const fs = require("fs");
const { chromium } = require("@playwright/test");

const AMBER = "#ffab1a", BG = "#0f0f0f";

// The mark in a 512×512 box. `inner` adds the dark core of the flame,
// which is too fine for the favicon.
function mark({ inner = true, stroke = 34 } = {}) {
  return `<g transform="translate(0 -16)">
  <path d="M150 400 V252 A106 106 0 0 1 362 252 V400" fill="none" stroke="${AMBER}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="104" y1="400" x2="408" y2="400" stroke="${AMBER}" stroke-width="${stroke}" stroke-linecap="round"/>
  <g transform="translate(256 380) scale(1.1) translate(-256 -380)">
  <path d="M256 204 C272 238 314 262 314 316 C314 350 289 372 256 372 C223 372 198 350 198 316 C198 289 212 270 225 257 C227 278 235 291 246 296 C239 265 240 234 256 204 Z" fill="${AMBER}"/>
  ${inner ? `<path d="M256 294 C267 311 279 322 279 338 C279 351 269 359 256 359 C243 359 233 351 233 338 C233 322 245 311 256 294 Z" fill="${BG}"/>` : ""}</g></g>`;
}

// maskable: full-bleed background with the mark inside the 80% safe circle
// (Android masks; iOS rounds the corners of apple-touch-icon itself).
function icon({ maskable = false, inner = true, stroke = 34, radius = 112, scale = 1 } = {}) {
  const s = maskable ? 0.78 : scale, t = 256 * (1 - s);
  const bg = maskable ? `<rect width="512" height="512" fill="${BG}"/>`
                      : `<rect width="512" height="512" rx="${radius}" fill="${BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bg}<g transform="translate(${t} ${t}) scale(${s})">${mark({ inner, stroke })}</g></svg>`;
}

(async () => {
  const dir = __dirname;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const jobs = [
    ["icon-512.png", 512, icon()],
    ["icon-192.png", 192, icon()],
    ["apple-touch-icon.png", 180, icon({ maskable: true })],
    ["icon-maskable-512.png", 512, icon({ maskable: true })],
    ["favicon-32.png", 32, icon({ inner: false, stroke: 46, radius: 96, scale: 1.22 })],
  ];
  for (const [name, size, svg] of jobs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
    await page.locator("svg").screenshot({ path: path.join(dir, name), omitBackground: true });
  }
  fs.writeFileSync(path.join(dir, "hearth.svg"), icon() + "\n");
  await browser.close();
})();
