import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:5424', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5424', url: 'http://127.0.0.1:5424', reuseExistingServer: false },
})
