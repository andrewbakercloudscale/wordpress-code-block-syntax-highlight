/**
 * Thumbnails — Regenerate Missing Sizes UX
 *
 * Verifies:
 *   - "Scan for Missing Sizes" button works and shows results
 *   - "Regenerate All Missing" button shows confirm dialog then runs
 *   - After completion button text stays "⚙️ Regenerate All Missing" (not "Done")
 *   - A done label appears with regeneration count
 *   - The done label disappears after ~10 seconds
 *
 * Run: npx playwright test tests/ux-thumbnails-regen.spec.js
 */

const { test, expect, request: playwrightRequest } = require('@playwright/test');
const path = require('path');

[
    path.join(__dirname, '..', '.env.test'),
    path.join(__dirname, '..', '..', '.env.test'),
].forEach(p => { try { require('dotenv').config({ path: p }); } catch {} });

const SITE        = process.env.WP_SITE              || 'https://your-wordpress-site.example.com';
const SECRET      = process.env.CSDT_TEST_SECRET     || '';
const ROLE        = process.env.CSDT_TEST_ROLE        || '';
const SESSION_URL = process.env.CSDT_TEST_SESSION_URL || '';

if (!SECRET || !ROLE || !SESSION_URL) {
    throw new Error('CSDT_TEST_SECRET, CSDT_TEST_ROLE, and CSDT_TEST_SESSION_URL must be set in .env.test');
}

const PLUGIN_URL = `${SITE}/wp-admin/tools.php?page=cloudscale-devtools&tab=thumbnails`;

async function getAdminSession(ttl = 900) {
    const ctx  = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
    const resp = await ctx.post(SESSION_URL, { data: { secret: SECRET, role: ROLE, ttl } });
    const body = await resp.json().catch(() => resp.text());
    await ctx.dispose();
    if (!resp.ok()) throw new Error(`test-session API: ${resp.status()} ${JSON.stringify(body)}`);
    return body;
}

async function injectCookies(ctx, sess) {
    await ctx.addCookies([
        { name: sess.secure_auth_cookie_name, value: sess.secure_auth_cookie,  domain: sess.cookie_domain, path: '/', secure: true,  httpOnly: true,  sameSite: 'Lax' },
        { name: sess.logged_in_cookie_name,   value: sess.logged_in_cookie,    domain: sess.cookie_domain, path: '/', secure: true,  httpOnly: false, sameSite: 'Lax' },
    ]);
}

test.describe('Thumbnails — Regenerate Missing Sizes', () => {
    test('scan button shows results', async ({ browser }) => {
        const sess = await getAdminSession();
        const ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
        await injectCookies(ctx, sess);
        const page = await ctx.newPage();

        await page.goto(PLUGIN_URL, { waitUntil: 'domcontentloaded' });

        const scanBtn = page.locator('#csdt-regen-scan-btn');
        await expect(scanBtn).toBeVisible();
        await scanBtn.click();

        // Wait for scan to complete (button re-enables)
        await expect(scanBtn).toBeEnabled({ timeout: 30000 });

        // Results div should be visible
        const resultsDiv = page.locator('#csdt-regen-results');
        await expect(resultsDiv).toBeVisible();

        await ctx.close();
    });

    test('after regen: button text stays unchanged, done label appears then hides', async ({ browser }) => {
        const sess = await getAdminSession();
        const ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
        await injectCookies(ctx, sess);
        const page = await ctx.newPage();

        await page.goto(PLUGIN_URL, { waitUntil: 'domcontentloaded' });

        // Scan first
        const scanBtn    = page.locator('#csdt-regen-scan-btn');
        const regenBtn   = page.locator('#csdt-regen-all-btn');
        const doneLabel  = page.locator('#csdt-regen-done-label');

        await scanBtn.click();
        await expect(scanBtn).toBeEnabled({ timeout: 30000 });

        const resultsDiv = page.locator('#csdt-regen-results');
        await expect(resultsDiv).toBeVisible();

        // If there are no missing images, skip the regen part
        const hasMissing = await regenBtn.isVisible();
        if (!hasMissing) {
            console.log('No missing thumbnails — skipping regen flow test.');
            await ctx.close();
            return;
        }

        const origText = await regenBtn.textContent();

        // Click regen — accept the confirm dialog
        page.on('dialog', d => d.accept());
        await regenBtn.click();

        // Wait for regen to finish (button re-enables)
        await expect(regenBtn).toBeEnabled({ timeout: 120000 });

        // Button text must NOT be "Done" (or any variant) — must stay as original
        const newText = await regenBtn.textContent();
        expect(newText.trim()).toBe(origText.trim());
        expect(newText).not.toMatch(/done/i);

        // Done label must be visible with regeneration count
        await expect(doneLabel).toBeVisible();
        await expect(doneLabel).toContainText('Done');

        // Log div should be hidden
        const logDiv = page.locator('#csdt-regen-log');
        await expect(logDiv).toBeHidden();

        // After 10s the done label disappears
        await page.waitForTimeout(11000);
        await expect(doneLabel).toBeHidden();

        await ctx.close();
    });

    test('after regen: re-scan shows fewer or zero missing', async ({ browser }) => {
        const sess = await getAdminSession();
        const ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
        await injectCookies(ctx, sess);
        const page = await ctx.newPage();

        await page.goto(PLUGIN_URL, { waitUntil: 'domcontentloaded' });

        const scanBtn  = page.locator('#csdt-regen-scan-btn');
        const regenBtn = page.locator('#csdt-regen-all-btn');

        // First scan
        await scanBtn.click();
        await expect(scanBtn).toBeEnabled({ timeout: 30000 });

        const hasMissing = await regenBtn.isVisible();
        if (!hasMissing) {
            console.log('No missing thumbnails — nothing to test.');
            await ctx.close();
            return;
        }

        // Get missing count before regen
        const resultsDiv = page.locator('#csdt-regen-results');
        const beforeText = await resultsDiv.textContent();
        const beforeMatch = beforeText.match(/(\d+) of \d+ images are missing/);
        const beforeCount = beforeMatch ? parseInt(beforeMatch[1]) : null;
        console.log(`Before regen: ${beforeCount} missing`);

        // Regen
        page.on('dialog', d => d.accept());
        await regenBtn.click();
        await expect(regenBtn).toBeEnabled({ timeout: 120000 });

        // Re-scan
        await scanBtn.click();
        await expect(scanBtn).toBeEnabled({ timeout: 30000 });

        // Check after count — should be zero (all-clear message) or less than before
        const afterResultsText = await resultsDiv.innerText();
        const afterMatch = afterResultsText.match(/(\d+) of \d+ images are missing/);
        if (afterMatch) {
            const afterCount = parseInt(afterMatch[1]);
            console.log(`After regen: ${afterCount} missing`);
            expect(afterCount).toBeLessThan(beforeCount ?? Infinity);
        } else {
            // All clear message
            expect(afterResultsText).toMatch(/All .* images have their thumbnail sizes/);
            console.log('After regen: all clear');
        }

        await ctx.close();
    });
});
