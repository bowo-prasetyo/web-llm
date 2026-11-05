// Tests: `npm test` (all), `npm run test:unit`, `npm run test:e2e`.
// `npm run screenshots` redraws the documentation images (docs/*.png); it
// is left out of `npm test` because it rewrites them.
// Browser tests run against the repository served as-is (tests/support/
// server.js), with CDN libraries served from node_modules and WebLLM mocked
// (tests/support/fixtures.js): no network, GPU or model downloads needed.
import { defineConfig } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1000, height: 900 },
    // The service worker is tested on its own (offline.spec.js); elsewhere
    // it would only add caching between test steps.
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "unit", testMatch: /unit\/.*\.spec\.js$/ },
    { name: "e2e", testMatch: /e2e\/.*\.spec\.js$/, use: { browserName: "chromium" } },
    ...(process.env.SCREENSHOTS
      ? [{ name: "screenshots", testMatch: /screenshots\/.*\.spec\.js$/, use: { browserName: "chromium" } }]
      : []),
  ],
  webServer: {
    command: "node tests/support/server.js",
    url: `http://localhost:${PORT}/index.html`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
});
