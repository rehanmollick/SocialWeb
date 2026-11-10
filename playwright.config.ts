import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:3101",
    viewport: { width: 1440, height: 1000 },
    launchOptions: { channel: "chrome" },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "DB_PATH=/tmp/socialweb-e2e.db ANTHROPIC_API_KEY= node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
