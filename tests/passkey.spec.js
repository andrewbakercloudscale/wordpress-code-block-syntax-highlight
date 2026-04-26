/**
 * Passkey (WebAuthn) end-to-end Playwright tests
 *
 * Uses Playwright's built-in WebAuthn virtual authenticator via CDP.
 * No real hardware key or biometrics required — runs fully automated.
 *
 * Run: npx playwright test tests/passkey.spec.js --headed
 *
 * Requires:
 *   - CSDT_TEST_SECRET, CSDT_TEST_ROLE, CSDT_TEST_SESSION_URL  (admin panel access)
 *   - WP_TEST_USER, WP_TEST_PASS  (form-login user for passkey registration/login tests)
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
const TEST_USER   = process.env.WP_TEST_USER          || 'cs_devtools_test';
const TEST_PASS   = process.env.WP_TEST_PASS          || '';

if (!SECRET || !ROLE || !SESSION_URL) {
    throw new Error('CSDT_TEST_SECRET, CSDT_TEST_ROLE, and CSDT_TEST_SESSION_URL must be set in .env.test');
}

const LOGIN_URL    = `${SITE}/wp-login.php`;
const SECURITY_URL = `${SITE}/wp-admin/tools.php?page=cloudscale-devtools&tab=login`;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function addWpTestCookie(ctx) {
    await ctx.addCookies([{
        name: 'wordpress_test_cookie', value: 'WP Cookie check',
        domain: new URL(SITE).hostname, path: '/',
        secure: true, httpOnly: false, sameSite: 'Lax',
    }]);
}

/** Log in via WP login form — used for tests that exercise the login/passkey flow itself. */
async function wpLogin(page, user, pass) {
    await addWpTestCookie(page.context());
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await page.fill('#user_login', user);
    await page.fill('#user_pass', pass);
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        page.click('#wp-submit'),
    ]);
    if (page.url().includes('wp-login.php')) {
        const err = await page.locator('#login_error').textContent().catch(() => 'unknown');
        throw new Error(`Login failed: ${err.trim()}`);
    }
}

/**
 * Enables the CDP-based virtual WebAuthn authenticator on the page.
 * Returns { client, authenticatorId } for cleanup.
 */
async function enableVirtualAuthenticator(page) {
    const client = await page.context().newCDPSession(page);
    await client.send('WebAuthn.enable', { enableUI: false });
    const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
        options: {
            protocol:            'ctap2',
            transport:           'internal',
            hasResidentKey:      true,
            hasUserVerification: true,
            isUserVerified:      true,
        },
    });
    return { client, authenticatorId };
}

async function disableVirtualAuthenticator(client, authenticatorId) {
    await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }).catch(() => {});
    await client.send('WebAuthn.disable').catch(() => {});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 1. Passkey section renders on the Login Security tab
// ─────────────────────────────────────────────────────────────────────────────
test('Passkey section renders', async ({ browser }) => {
    const sess = await getAdminSession();
    const ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
    await injectCookies(ctx, sess);
    const page = await ctx.newPage();

    await page.goto(SECURITY_URL);

    await expect(page.locator('#cs-pk-row')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#cs-pk-add-btn')).toBeVisible();
    await expect(page.locator('#cs-pk-badge')).toBeVisible();

    console.log('✅  Passkey section renders.');
    await ctx.close();
    await logoutTestUser();
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Add Passkey wizard opens and closes
// ─────────────────────────────────────────────────────────────────────────────
test('Add Passkey wizard opens and cancels', async ({ browser }) => {
    const sess = await getAdminSession();
    const ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
    await injectCookies(ctx, sess);
    const page = await ctx.newPage();

    await page.goto(SECURITY_URL);

    await page.locator('#cs-pk-add-btn').click();
    await expect(page.locator('#cs-pk-wizard')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#cs-pk-name-input')).toBeVisible();
    await expect(page.locator('#cs-pk-register-btn')).toBeVisible();

    await page.locator('#cs-pk-cancel-btn').click();
    await expect(page.locator('#cs-pk-wizard')).toBeHidden({ timeout: 3000 });
    await expect(page.locator('#cs-pk-add-btn')).toBeVisible();

    console.log('✅  Passkey wizard opens and cancels correctly.');
    await ctx.close();
    await logoutTestUser();
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Register a passkey (virtual authenticator)
// ─────────────────────────────────────────────────────────────────────────────
test('Register a passkey via virtual authenticator', async ({ browser }) => {
    test.setTimeout(60_000);

    if (!TEST_PASS) {
        console.log('⏭️  Skipped passkey registration — WP_TEST_PASS not set.');
        return;
    }

    const ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();

    const { client, authenticatorId } = await enableVirtualAuthenticator(page);

    try {
        await wpLogin(page, TEST_USER, TEST_PASS);
        await page.goto(SECURITY_URL);

        await page.locator('#cs-pk-add-btn').click();
        await expect(page.locator('#cs-pk-wizard')).toBeVisible({ timeout: 5000 });

        await page.locator('#cs-pk-name-input').fill('Test Device');
        await page.locator('#cs-pk-register-btn').click();

        await page.waitForFunction(
            () => {
                const badge = document.getElementById('cs-pk-badge');
                return badge && badge.textContent.includes('passkey');
            },
            { timeout: 15000 }
        );

        const badgeText = await page.locator('#cs-pk-badge').textContent();
        expect(badgeText).toMatch(/\d+\s*passkey/i);
        console.log(`✅  Passkey registered. Badge: "${badgeText.trim()}"`);

        await expect(page.locator('#cs-pk-list .cs-pk-item').first()).toBeVisible({ timeout: 5000 });
        const itemName = await page.locator('#cs-pk-list .cs-pk-item .cs-pk-name').first().textContent();
        expect(itemName.trim()).toBe('Test Device');
        console.log('✅  Passkey item displayed in list.');

    } finally {
        await disableVirtualAuthenticator(client, authenticatorId);
        await ctx.close();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Login with passkey (2FA intercept)
// ─────────────────────────────────────────────────────────────────────────────
test('Login with passkey — 2FA intercept', async ({ browser }) => {
    test.setTimeout(60_000);

    if (!TEST_PASS) {
        console.log('⏭️  Skipped passkey login intercept — WP_TEST_PASS not set.');
        return;
    }

    const ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();

    const { client, authenticatorId } = await enableVirtualAuthenticator(page);

    try {
        await addWpTestCookie(ctx);
        await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
        await page.fill('#user_login', TEST_USER);
        await page.fill('#user_pass', TEST_PASS);
        await page.click('#wp-submit');

        await page.waitForURL(/cs_devtools_2fa|cs_devtools_token/, { timeout: 15000 });
        console.log('✅  Intercepted at passkey challenge page:', page.url());

        await page.waitForURL(/wp-admin/, { timeout: 20000 });
        console.log('✅  Logged in via passkey. URL:', page.url());

        await expect(page.locator('#wpbody')).toBeVisible({ timeout: 5000 });

    } finally {
        await disableVirtualAuthenticator(client, authenticatorId);
        await ctx.close();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Remove a passkey
// ─────────────────────────────────────────────────────────────────────────────
test('Remove a passkey', async ({ browser }) => {
    if (!TEST_PASS) {
        console.log('⏭️  Skipped passkey removal — WP_TEST_PASS not set.');
        return;
    }

    const ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();

    await wpLogin(page, TEST_USER, TEST_PASS);
    await page.goto(SECURITY_URL);

    const firstItem = page.locator('#cs-pk-list .cs-pk-item').first();
    await expect(firstItem).toBeVisible({ timeout: 5000 });

    page.on('dialog', d => d.accept());
    await firstItem.locator('.cs-pk-delete').click();

    await expect(firstItem).toBeHidden({ timeout: 5000 });

    const badgeText = await page.locator('#cs-pk-badge').textContent();
    console.log(`✅  Passkey removed. Badge now: "${badgeText.trim()}"`);

    await ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Cleanup — ensure cs_devtools_test has no passkeys left
// ─────────────────────────────────────────────────────────────────────────────
test('Cleanup — verify no passkeys remain for cs_devtools_test', async ({ browser }) => {
    if (!TEST_PASS) {
        console.log('⏭️  Skipped passkey cleanup check — WP_TEST_PASS not set.');
        return;
    }

    const ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();

    await wpLogin(page, TEST_USER, TEST_PASS);
    await page.goto(SECURITY_URL);

    const items = page.locator('#cs-pk-list .cs-pk-item');
    const count = await items.count();
    expect(count).toBe(0);

    const badge = page.locator('#cs-pk-badge');
    await expect(badge).toContainText(/none/i, { timeout: 3000 });
    console.log('✅  No passkeys remain for cs_devtools_test.');

    await ctx.close();
});
