'use strict';

const fs = require('node:fs');
const { defineConfig, devices } = require('@playwright/test');

const chromeLocal = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const usarChromeLocal = process.platform === 'win32' && fs.existsSync(chromeLocal);

module.exports = defineConfig({
  testDir: './test/e2e',
  globalSetup: require.resolve('./test/e2e/global-setup'),
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      ...(usarChromeLocal ? { launchOptions: { executablePath: chromeLocal } } : {})
    }
  }]
});
