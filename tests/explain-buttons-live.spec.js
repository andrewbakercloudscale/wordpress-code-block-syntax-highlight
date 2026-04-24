/**
 * Explain button live-site tests — validates the Explain modal works on the
 * real WordPress admin page using a mobile viewport.
 *
 * Authentication: calls POST /wp-json/csdt/v1/test-session with the shared
 * secret to get short-lived admin cookies — no login form, no 2FA required.
 *
 * Prerequisites:
 *   Create a test user in Test Account Manager, then add to .env.test:
 *     CSDT_TEST_SECRET=<secret from the panel>
 *     CSDT_TEST_ROLE=<name you chose>
 *     CSDT_TEST_SESSION_URL=<Session URL from the panel>
 *     CSDT_TEST_LOGOUT_URL=<Logout URL from the panel>
 *     WP_SITE=https://your-wordpress-site.example.com
 *
 * Run:  npx playwright test tests/explain-buttons-live.spec.js --headed
 */

const { test, expect, devices, request: playwrightRequest } = require( '@playwright/test' );
const path = require( 'path' );

// Load .env.test — look in plugin dir first, then the github root (shared creds)
[ path.join( __dirname, '..', '.env.test' ),
  path.join( __dirname, '..', '..', '.env.test' ),
].forEach( p => { try { require( 'dotenv' ).config( { path: p } ); } catch {} } );

const SITE        = process.env.WP_SITE               || 'https://your-wordpress-site.example.com';
const SECRET      = process.env.CSDT_TEST_SECRET       || '';
const ROLE        = process.env.CSDT_TEST_ROLE          || '';
const SESSION_URL = process.env.CSDT_TEST_SESSION_URL   || '';
const LOGOUT_URL  = process.env.CSDT_TEST_LOGOUT_URL    || '';

const PLUGIN_TAB   = `${SITE}/wp-admin/tools.php?page=cloudscale-devtools&tab=optimizer`;
const SECURITY_TAB = `${SITE}/wp-admin/tools.php?page=cloudscale-devtools&tab=security`;

if ( ! SECRET || ! ROLE || ! SESSION_URL ) {
    throw new Error(
        'CSDT_TEST_SECRET, CSDT_TEST_ROLE, and CSDT_TEST_SESSION_URL must be set.\n' +
        'Copy them from the .env.test snippet in Test Account Manager.'
    );
}

/** Destroy all sessions for the test user — call in afterAll. */
async function logoutTestUser() {
    if ( ! LOGOUT_URL ) { return; }
    try {
        const ctx  = await playwrightRequest.newContext( { ignoreHTTPSErrors: true } );
        await ctx.post( LOGOUT_URL, { data: { secret: SECRET, role: ROLE } } );
        await ctx.dispose();
    } catch ( e ) {
        console.warn( 'logout failed (non-fatal):', e.message );
    }
}

test.afterAll( async () => {
    await logoutTestUser();
    console.log( '  Session destroyed via Logout API' );
} );

/** Call the test-session API and return cookie pair for Playwright. */
async function getAdminSession( ttl = 1200 ) {
    const ctx  = await playwrightRequest.newContext( { ignoreHTTPSErrors: true } );
    const resp = await ctx.post( SESSION_URL, {
        data: { secret: SECRET, role: ROLE, ttl },
    } );
    const ok   = resp.ok();
    const body = await resp.json().catch( () => resp.text() );
    await ctx.dispose();

    if ( ! ok ) {
        throw new Error( `test-session API returned ${resp.status()}: ${JSON.stringify( body )}` );
    }

    return body;
}

/** Inject WP auth cookies into a browser context from a session response. */
async function injectCookies( ctx, sess ) {
    await ctx.addCookies( [
        {
            name:     sess.secure_auth_cookie_name,
            value:    sess.secure_auth_cookie,
            domain:   sess.cookie_domain,
            path:     '/',
            secure:   true,
            httpOnly: true,
            sameSite: 'Lax',
        },
        {
            name:     sess.logged_in_cookie_name,
            value:    sess.logged_in_cookie,
            domain:   sess.cookie_domain,
            path:     '/',
            secure:   true,
            httpOnly: false,
            sameSite: 'Lax',
        },
    ] );
}

/** Navigate to a devtools tab and wait for the plugin app to render. */
async function gotoTab( page, url ) {
    await page.goto( url, { waitUntil: 'domcontentloaded', timeout: 30_000 } );
    await page.waitForSelector( '.cs-section-header, #cs-app', { timeout: 15_000 } );
}

/** Tap or click the first [data-cs-modal-open] button and return its modal. */
async function openFirstExplainModal( page, mobile ) {
    const btn = page.locator( '[data-cs-modal-open]' ).first();
    await expect( btn ).toBeVisible( { timeout: 10_000 } );
    const modalId = await btn.getAttribute( 'data-cs-modal-open' );
    const modal   = page.locator( `#${modalId}` );
    await expect( modal ).toHaveCSS( 'display', 'none' );
    if ( mobile ) { await btn.tap(); } else { await btn.click(); }
    return { btn, modal, modalId };
}

// ─────────────────────────────────────────────────────────────────────────────

test( 'live: test-session API returns valid cookies', async () => {
    const sess = await getAdminSession();
    expect( sess.username,                'username present' ).toBeTruthy();
    expect( sess.secure_auth_cookie,      'secure_auth_cookie present' ).toBeTruthy();
    expect( sess.logged_in_cookie,        'logged_in_cookie present' ).toBeTruthy();
    expect( sess.secure_auth_cookie_name, 'cookie name present' ).toMatch( /wordpress_sec_/ );
    expect( sess.expires_at,              'expires_at > now' ).toBeGreaterThan( Date.now() / 1000 );
    console.log( `✅  Session for user "${sess.username}", expires in ${sess.expires_at - Math.floor(Date.now()/1000)}s` );
} );

test( 'live desktop: Explain button opens and closes modal', async ( { browser } ) => {
    const sess = await getAdminSession();
    const ctx  = await browser.newContext( { ignoreHTTPSErrors: true } );
    await injectCookies( ctx, sess );
    const page = await ctx.newPage();

    await gotoTab( page, PLUGIN_TAB );

    const { modal, modalId } = await openFirstExplainModal( page, false );
    await expect( modal ).toHaveCSS( 'display', 'flex', { timeout: 5_000 } );
    await page.screenshot( { path: 'tests/screenshots/live-desktop-modal-open.png' } );

    await page.locator( `[data-cs-modal-close="${modalId}"]` ).first().click();
    await expect( modal ).toHaveCSS( 'display', 'none' );

    console.log( `✅  Desktop Explain modal #${modalId} opens and closes` );
    await ctx.close();
} );

test( 'live mobile: Explain button opens modal on Plugin Stack tab', async ( { browser } ) => {
    const sess = await getAdminSession();
    const ctx  = await browser.newContext( {
        ...devices[ 'iPhone 14 Pro Max' ],
        ignoreHTTPSErrors: true,
    } );
    await injectCookies( ctx, sess );
    const page = await ctx.newPage();

    await gotoTab( page, PLUGIN_TAB );
    await page.screenshot( { path: 'tests/screenshots/live-mobile-before-tap.png' } );

    const { modal, modalId } = await openFirstExplainModal( page, true );
    await expect( modal ).toHaveCSS( 'display', 'flex', { timeout: 5_000 } );

    await page.screenshot( { path: 'tests/screenshots/live-mobile-modal-open.png' } );
    console.log( `✅  Mobile Explain modal #${modalId} opened on Plugin Stack tab` );
    await ctx.close();
} );

test( 'live mobile: Explain button opens modal on Security tab', async ( { browser } ) => {
    const sess = await getAdminSession();
    const ctx  = await browser.newContext( {
        ...devices[ 'iPhone 14 Pro Max' ],
        ignoreHTTPSErrors: true,
    } );
    await injectCookies( ctx, sess );
    const page = await ctx.newPage();

    await gotoTab( page, SECURITY_TAB );

    const { modal, modalId } = await openFirstExplainModal( page, true );
    await expect( modal ).toHaveCSS( 'display', 'flex', { timeout: 5_000 } );

    await page.screenshot( { path: 'tests/screenshots/live-mobile-security-modal.png' } );
    console.log( `✅  Mobile Explain modal #${modalId} opened on Security tab` );
    await ctx.close();
} );

test( 'live: cs-admin-settings.js has touchend fix', async ( { browser } ) => {
    const sess = await getAdminSession();
    const ctx  = await browser.newContext( { ignoreHTTPSErrors: true } );
    await injectCookies( ctx, sess );
    const page = await ctx.newPage();

    const jsUrls = [];
    page.on( 'request', req => {
        if ( req.resourceType() === 'script' ) { jsUrls.push( req.url() ); }
    } );

    await gotoTab( page, PLUGIN_TAB );

    const settingsJs = jsUrls.find( u => u.includes( 'cs-admin-settings' ) );
    expect( settingsJs, 'cs-admin-settings.js must be loaded' ).toBeTruthy();

    const ver      = ( settingsJs.match( /[?&]ver=([^&]+)/ ) || [] )[ 1 ] || '0.0.0';
    const [ , , patch ] = ver.split( '.' ).map( Number );
    console.log( `  cs-admin-settings.js  ver=${ver}` );
    expect( patch, `ver patch (${ver}) must be >= 426 (touchend fix)` ).toBeGreaterThanOrEqual( 426 );

    const body = await ( await page.request.fetch( settingsJs ) ).text();
    expect( body, 'touchend handler missing from deployed JS' ).toContain( 'touchend' );

    console.log( '✅  Deployed JS has touchend fix' );
    await ctx.close();
} );
