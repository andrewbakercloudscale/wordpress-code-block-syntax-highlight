// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir:   './tests',
    timeout:   120_000,
    retries:   0,
    workers:   1,
    use: {
        headless:          false,
        ignoreHTTPSErrors: true,
        screenshot:        'only-on-failure',
        video:             'retain-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
});
