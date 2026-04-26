/**
 * Dashboard Widget — Playwright test
 * Verifies the security summary widget shows a single "View Cyber and Devtools"
 * button with gradient styling, and no "Run Security Scan" or "Open Plugin" buttons.
 *
 * Authentication: test-session API — no new WP users created.
 * Requires .env.test with CSDT_TEST_SECRET, CSDT_TEST_ROLE, CSDT_TEST_SESSION_URL.
 *
 * Run:  npx playwright test tests/dashboard-widget.spec.js --headed
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
const LOGOUT_URL  = process.env.CSDT_TEST_LOGOUT_URL  || '';

if (!SECRET || !ROLE || !SESSION_URL) {
    throw new Error('CSDT_TEST_SECRET, CSDT_TEST_ROLE, and CSDT_TEST_SESSION_URL must be set in .env.test');
}

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

async function logoutTestUser() {
    if (!LOGOUT_URL) return;
    try {
        const ctx = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
        await ctx.post(LOGOUT_URL, { data: { secret: SECRET, role: ROLE } });
        await ctx.dispose();
    } catch {}
}

test.describe.configure({ mode: 'serial' });

test.describe('Dashboard security widget', () => {

    test.afterAll(async () => {
        await logoutTestUser();
    });

    test('widget has exactly one button — View Cyber and Devtools', async ({ browser }) => {
        const sess = await getAdminSession();
        const ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
        await injectCookies(ctx, sess);
        const page = await ctx.newPage();

        await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');

        const widget = page.locator('#csdt_security_summary');
        await expect(widget).toBeVisible();

        await widget.screenshot({ path: 'tests/screenshots/dashboard-widget.png' });

        const widgetHTML = await widget.innerHTML();
        const actionsMatch = widgetHTML.match(/.{200}cs-dw-actions.{500}/s);
        console.log('ACTIONS CONTEXT:', actionsMatch ? actionsMatch[0] : 'NOT FOUND');
        const allAnchors = await widget.locator('a').all();
        for (let i = 0; i < allAnchors.length; i++) {
            const html = await allAnchors[i].evaluate(el => el.outerHTML);
            console.log(`ANCHOR[${i}]:`, html.substring(0, 300));
        }

        const actions = widget.locator('.cs-dw-actions');
        await expect(actions).toBeVisible();

        const buttons = actions.locator('a');
        await expect(buttons).toHaveCount(1);

        await expect(buttons.first()).toHaveText('View Cyber and Devtools');

        const bg = await buttons.first().evaluate(el => getComputedStyle(el).background || el.style.background);
        console.log('Button background:', bg);
        expect(bg).toContain('linear-gradient');

        await expect(widget.locator('text=Run Security Scan')).toHaveCount(0);
        await expect(widget.locator('text=Open Plugin')).toHaveCount(0);

        await ctx.close();
    });

    test('button navigates to plugin page', async ({ browser }) => {
        const sess = await getAdminSession();
        const ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
        await injectCookies(ctx, sess);
        const page = await ctx.newPage();

        await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');

        const btn = page.locator('#csdt_security_summary .cs-dw-actions a').first();
        await btn.click();
        await page.waitForURL('**/tools.php?page=cloudscale-devtools**', { timeout: 10000 });

        await ctx.close();
    });
});
