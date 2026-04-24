/**
 * Brute-force chart — verify 7-day scroll behaviour.
 *
 * Checks:
 *   1. Chart renders with bars after page load.
 *   2. The chart is scrolled to the right (most recent day visible).
 *   3. The chart is horizontally scrollable (scrollWidth > clientWidth).
 *   4. Exactly 7 bars are visible in the initial viewport.
 *
 * Run: npx playwright test tests/bf-chart.spec.js --headed
 */

const { test, expect } = require('@playwright/test');

const SITE       = process.env.WP_SITE       || 'https://andrewbaker.ninja';
const ADMIN_USER = process.env.WP_ADMIN_USER || 'andrew';
const ADMIN_PASS = process.env.WP_ADMIN_PASS || '';

const LOGIN_TAB_URL = `${SITE}/wp-admin/tools.php?page=cloudscale-devtools&tab=login`;

async function wpLogin( page, user, pass ) {
    await page.goto( `${SITE}/wp-login.php`, { waitUntil: 'domcontentloaded' } );
    await page.fill( '#user_login', user );
    await page.fill( '#user_pass', pass );
    await Promise.all( [
        page.waitForNavigation( { waitUntil: 'domcontentloaded', timeout: 30000 } ),
        page.click( '#wp-submit' ),
    ] );
    if ( page.url().includes( 'wp-login.php' ) ) {
        throw new Error( 'Login failed — check WP_ADMIN_PASS env var' );
    }
}

test( 'BF chart: renders, scrolls to recent day, is wider than viewport', async ( { page } ) => {
    await wpLogin( page, ADMIN_USER, ADMIN_PASS );
    await page.goto( LOGIN_TAB_URL, { waitUntil: 'networkidle' } );

    const chart = page.locator( '#cs-bf-chart' );
    await expect( chart ).toBeVisible( { timeout: 10000 } );

    // Wait for the AJAX data to load and bars to render.
    await expect( chart.locator( '.cs-bf-day' ).first() ).toBeVisible( { timeout: 15000 } );

    // Give the setTimeout(scrollToEnd, 50) time to fire.
    await page.waitForTimeout( 200 );

    const metrics = await chart.evaluate( el => ( {
        scrollLeft:  el.scrollLeft,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        barCount:    el.querySelectorAll( '.cs-bf-day' ).length,
        barWidths:   Array.from( el.querySelectorAll( '.cs-bf-day' ) ).map( b => b.offsetWidth ),
        todayLabel:  el.querySelector( '.cs-bf-day:last-child .cs-bf-day-label' )?.textContent?.trim() ?? '',
    } ) );

    console.log( 'Chart metrics:', metrics );

    // 14 bars generated.
    expect( metrics.barCount ).toBe( 14 );

    // All bars have the same non-zero width (JS-computed).
    const uniqueWidths = [ ...new Set( metrics.barWidths ) ];
    expect( uniqueWidths.length ).toBe( 1 );
    expect( uniqueWidths[0] ).toBeGreaterThan( 20 );
    console.log( `✅  All 14 bars have uniform width: ${uniqueWidths[0]}px` );

    // Chart scrolls (content wider than visible area).
    expect( metrics.scrollWidth ).toBeGreaterThan( metrics.clientWidth );
    console.log( `✅  Chart is scrollable: scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth}` );

    // Chart is scrolled to the right (most-recent day visible).
    const maxScroll = metrics.scrollWidth - metrics.clientWidth;
    expect( metrics.scrollLeft ).toBeGreaterThan( maxScroll * 0.8 );
    console.log( `✅  Scrolled to right end: scrollLeft=${metrics.scrollLeft} (max=${maxScroll})` );

    // Approximately 7 bars visible.
    const barW          = uniqueWidths[0];
    const approxVisible = Math.round( ( metrics.clientWidth - 28 ) / ( barW + 4 ) );
    expect( approxVisible ).toBeGreaterThanOrEqual( 6 );
    expect( approxVisible ).toBeLessThanOrEqual( 8 );
    console.log( `✅  Approx bars visible: ${approxVisible} (target 7)` );
} );
