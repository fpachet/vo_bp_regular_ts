import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  use: { baseURL: "http://127.0.0.1:8091", trace: "retain-on-failure" },
  webServer: {
    command: "python3 -m http.server 8091 --bind 127.0.0.1 --directory _site",
    url: "http://127.0.0.1:8091",
    reuseExistingServer: false,
  },
});
