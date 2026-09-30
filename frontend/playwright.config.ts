import { defineConfig } from "@playwright/test";

/**
 * QA suite: runs against a running stack (docker compose up, or vite preview
 * + backend). E2E_BASE_URL defaults to http://localhost:5173.
 * PLAYWRIGHT_CHROMIUM_PATH can point at a pre-installed Chromium.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    viewport: { width: 1440, height: 900 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
});
