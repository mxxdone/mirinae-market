import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 구성
 * 실제 백엔드(포트 8081 등) 및 Vite 개발 서버(127.0.0.1:5173) 연동
 */
const testPort = Number(process.env.E2E_PORT ?? "5173");
if (!Number.isInteger(testPort) || testPort < 1 || testPort > 65535)
  throw new Error("E2E_PORT는 1~65535 정수여야 합니다.");
const baseURL = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["junit", { outputFile: "test-results/results.xml" }],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [
    {
      name: "default",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${testPort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
