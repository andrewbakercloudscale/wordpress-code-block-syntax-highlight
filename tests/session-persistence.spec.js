/**
 * Session Persistence — focused Playwright test
 *
 * Verifies that when a custom session duration is configured, the WordPress
 * auth cookie is written as a persistent cookie (explicit expiry, not expire=0)
 * so it survives a browser kill / swipe-up on mobile.
 *
 * Admin configuration uses the test-session API. The actual cookie behavior is
 * verified by form-logging in as the test user, since the test-session API
 * bypasses the login flow and would not produce the same cookie.
 *
 * Run:  npx playwright test tests/session-persistence.spec.js --headed
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
const TEST_USER   = process.env.WP_TEST_USER          || 'cs_session_test';
const TEST_PASS   = process.env.WP_TEST_PASS          || '';

if (!SECRET || !ROLE || !SESSION_URL) {
    throw new Error('CSDT_TEST_SECRET, CSDT_TEST_ROLE, and CSDT_TEST_SESSION_URL must be set in .env.test');
}

const LOGIN_URL    = `${SITE}/wp-login.php`;
const SETTINGS_URL = `${SITE}/wp-admin/tools.php?page=cloudscale-devtools&tab=login`;

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

/** Set session duration via test-session API (admin panel). */
async function setSessionDuration( browser, duration ) {
    const sess = await getAdminSession();
    const ctx  = await browser.newContext( { ignoreHTTPSErrors: true } );
    await injectCookies( ctx, sess );
    const page = await ctx.newPage();
    await page.goto( SETTINGS_URL );
    await page.locator( '#cs-session-duration' ).selectOption( duration );
    await page.locator( '#cs-session-save' ).click();
    await page.locator( '#cs-session-saved' ).waitFor( { state: 'visible', timeout: 5_000 } );
    console.log( `✅  Session duration set to ${duration}.` );
    await ctx.close();
    await logoutTestUser();
}

/** Add the WP test cookie (browser compatibility check). */
async function addWpTestCookie( ctx ) {
    await ctx.addCookies( [ {
        name:     'wordpress_test_cookie',
        value:    'WP Cookie check',
        domain:   new URL( SITE ).hostname,
        path:     '/',
        secure:   true,
        httpOnly: false,
        sameSite: 'Lax',
    } ] );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Baseline — confirm default WP sessions ARE session cookies (expire = -1)
// ─────────────────────────────────────────────────────────────────────────────
test( 'Baseline — default WP session is a session cookie (expires=-1)', async ( { browser } ) => {
    if ( !TEST_PASS ) {
        console.log( '⏭️  Skipped — WP_TEST_PASS not set.' );
        return;
    }

    await setSessionDuration( browser, 'default' );

    const ctx  = await browser.newContext( { ignoreHTTPSErrors: true } );
    const page = await ctx.newPage();

    await addWpTestCookie( ctx );
    await page.goto( LOGIN_URL, { waitUntil: 'domcontentloaded' } );
    await page.fill( '#user_login', TEST_USER );
    await page.fill( '#user_pass',  TEST_PASS );
    await Promise.all( [
        page.waitForNavigation( { waitUntil: 'domcontentloaded', timeout: 30_000 } ),
        page.click( '#wp-submit' ),
    ] );

    const cookies  = await ctx.cookies();
    const authCook = cookies.find( c => c.name.startsWith( 'wordpress_logged_in_' ) );
    console.log( `  Auth cookie expires = ${authCook?.expires}` );

    expect( authCook ).toBeTruthy();
    expect( authCook.expires ).toBe( -1 );
    console.log( '✅  Confirmed: default login is a session cookie (expires=-1).' );

    await ctx.close();
} );

// ─────────────────────────────────────────────────────────────────────────────
// 2. With custom duration — cookie must be persistent (expires > 0)
// ─────────────────────────────────────────────────────────────────────────────
test( 'Custom 30-day session — auth cookie must be persistent (expires > 0)', async ( { browser } ) => {
    if ( !TEST_PASS ) {
        console.log( '⏭️  Skipped — WP_TEST_PASS not set.' );
        return;
    }

    await setSessionDuration( browser, '30' );

    const ctx  = await browser.newContext( { ignoreHTTPSErrors: true } );
    const page = await ctx.newPage();

    await addWpTestCookie( ctx );
    await page.goto( LOGIN_URL, { waitUntil: 'domcontentloaded' } );
    await page.fill( '#user_login', TEST_USER );
    await page.fill( '#user_pass',  TEST_PASS );
    await Promise.all( [
        page.waitForNavigation( { waitUntil: 'domcontentloaded', timeout: 30_000 } ),
        page.click( '#wp-submit' ),
    ] );

    const cookies  = await ctx.cookies();
    const authCook = cookies.find( c => c.name.startsWith( 'wordpress_logged_in_' ) );
    console.log( `  Auth cookie expires = ${authCook?.expires}  (0 = session cookie, >0 = persistent)` );

    expect( authCook ).toBeTruthy();
    expect( authCook.expires ).toBeGreaterThan( 0 );

    const expiryDate = new Date( authCook.expires * 1000 );
    const daysFromNow = ( authCook.expires - Date.now() / 1000 ) / 86400;
    console.log( `  Expires: ${expiryDate.toISOString()} (~${Math.round( daysFromNow )} days from now)` );
    expect( daysFromNow ).toBeGreaterThan( 25 );
    console.log( '✅  Auth cookie is persistent — survives browser kill/swipe-up.' );

    await ctx.close();
} );

// ─────────────────────────────────────────────────────────────────────────────
// 3. Simulate browser kill — new context with saved cookies stays logged in
// ─────────────────────────────────────────────────────────────────────────────
test( 'Simulated browser kill — re-opening with saved cookies stays logged in', async ( { browser } ) => {
    if ( !TEST_PASS ) {
        console.log( '⏭️  Skipped — WP_TEST_PASS not set.' );
        return;
    }

    await setSessionDuration( browser, '30' );

    // First context: log in via form and grab cookies.
    const ctx1  = await browser.newContext( { ignoreHTTPSErrors: true } );
    const page1 = await ctx1.newPage();

    await addWpTestCookie( ctx1 );
    await page1.goto( LOGIN_URL, { waitUntil: 'domcontentloaded' } );
    await page1.fill( '#user_login', TEST_USER );
    await page1.fill( '#user_pass',  TEST_PASS );
    await Promise.all( [
        page1.waitForNavigation( { waitUntil: 'domcontentloaded', timeout: 30_000 } ),
        page1.click( '#wp-submit' ),
    ] );

    const cookies = await ctx1.cookies();
    const authCook = cookies.find( c => c.name.startsWith( 'wordpress_logged_in_' ) );
    expect( authCook?.expires ).toBeGreaterThan( 0 );
    console.log( `  Captured persistent cookie: ${authCook?.name}, expires ${new Date( authCook.expires * 1000 ).toISOString()}` );

    // "Kill" the browser — close context 1.
    await ctx1.close();
    console.log( '  Browser context closed (simulating swipe-up / app kill).' );

    // "Reopen" — new context with the saved cookies (simulating restored session).
    const ctx2   = await browser.newContext( { ignoreHTTPSErrors: true } );
    await ctx2.addCookies( cookies );
    const page2  = await ctx2.newPage();
    await page2.goto( `${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' } );

    const finalUrl = page2.url();
    console.log( `  After "reopen", landed at: ${finalUrl}` );
    expect( finalUrl ).not.toContain( 'wp-login.php' );
    expect( finalUrl ).toContain( 'wp-admin' );
    console.log( '✅  Session survived simulated browser kill — still logged in.' );

    await ctx2.close();
} );

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup — restore default session duration
// ─────────────────────────────────────────────────────────────────────────────
test( 'Cleanup — restore default session duration', async ( { browser } ) => {
    await setSessionDuration( browser, 'default' );
    console.log( '✅  Session duration restored to default.' );
} );
