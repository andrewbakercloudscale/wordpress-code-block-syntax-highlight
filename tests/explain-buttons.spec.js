/**
 * Explain button modal tests — validates data-cs-modal-open button behaviour on
 * desktop (click) and mobile (tap), including the iOS Safari overflow:hidden fix.
 *
 * Does NOT require admin login or live site access.
 * Uses page.setContent() to replicate the exact DOM structure produced by
 * render_explain_btn() inside a .cs-panel (overflow:hidden) section header.
 *
 * Run:  npx playwright test tests/explain-buttons.spec.js --headed
 */

const { test, expect, devices } = require( '@playwright/test' );
const fs   = require( 'fs' );
const path = require( 'path' );

// Inline the real handler so we test the deployed JS, not a mock.
const HANDLER_JS = fs.readFileSync(
    path.join( __dirname, '..', 'assets', 'cs-admin-settings.js' ),
    'utf8'
);

// Replicates what render_explain_btn() + cs-section-header produce in the DOM.
// The key detail: .cs-panel has overflow:hidden and the button is inside that container.
function makeHtml( extraStyle = '' ) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        /* Matches .cs-panel */
        .cs-panel {
            background: #fff;
            border: 1.5px solid #dce3ef;
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 18px;
            ${extraStyle}
        }
        /* Matches .cs-section-header */
        .cs-section-header {
            background: linear-gradient(135deg, #1a3a8f, #1e6fd9);
            color: #fff;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 10px 16px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .cs-header-hint {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            margin-left: auto;
        }
    </style>
</head>
<body style="margin:0;padding:16px;background:#f0f4ff;">
    <div class="cs-panel">
        <div class="cs-section-header">
            <span>🔍 Plugin Stack Scanner</span>
            <span class="cs-header-hint">Find plugins CloudScale replaces</span>
            <!-- render_explain_btn() output -->
            <button id="cs-explain-btn-test"
                data-cs-modal-open="cs-explain-modal-test"
                style="background:#2563eb!important;border:1px solid rgba(255,255,255,0.35)!important;border-radius:5px!important;color:#fff!important;font-size:12px!important;font-weight:700!important;padding:5px 14px!important;cursor:pointer!important;margin-left:auto!important;flex-shrink:0!important;display:block!important;">
                Explain&hellip;
            </button>
            <div id="cs-explain-modal-test"
                 style="display:none;position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,0.55);align-items:center;justify-content:center;padding:16px;"
                 data-cs-modal-backdrop="true">
                <div id="modal-card" style="background:#fff;border-radius:10px;max-width:600px;width:100%;padding:20px;">
                    <strong>Explain Modal</strong>
                    <p>This is the explain modal content.</p>
                    <button id="modal-close-btn" data-cs-modal-close="cs-explain-modal-test"
                        style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:5px;padding:6px 18px;font-size:12px;cursor:pointer;">
                        Got it
                    </button>
                </div>
            </div>
        </div>
        <div style="padding:16px;"><p>Panel body content</p></div>
    </div>
    <script>${HANDLER_JS}</script>
</body>
</html>`;
}

// ─── Desktop tests ────────────────────────────────────────────────────────────

test( 'desktop: click opens modal', async ( { page } ) => {
    await page.setContent( makeHtml() );

    const modal = page.locator( '#cs-explain-modal-test' );
    await expect( modal ).toHaveCSS( 'display', 'none' );

    await page.locator( '#cs-explain-btn-test' ).click();

    await expect( modal ).toHaveCSS( 'display', 'flex' );
    console.log( '✅  Desktop click opens modal' );
} );

test( 'desktop: close button hides modal', async ( { page } ) => {
    await page.setContent( makeHtml() );

    await page.locator( '#cs-explain-btn-test' ).click();
    await expect( page.locator( '#cs-explain-modal-test' ) ).toHaveCSS( 'display', 'flex' );

    await page.locator( '#modal-close-btn' ).click();
    await expect( page.locator( '#cs-explain-modal-test' ) ).toHaveCSS( 'display', 'none' );
    console.log( '✅  Desktop close button hides modal' );
} );

test( 'desktop: backdrop click hides modal', async ( { page } ) => {
    await page.setContent( makeHtml() );

    await page.locator( '#cs-explain-btn-test' ).click();
    await expect( page.locator( '#cs-explain-modal-test' ) ).toHaveCSS( 'display', 'flex' );

    // Click the backdrop (the overlay div), not the card inside it.
    await page.locator( '#cs-explain-modal-test' ).click( { position: { x: 5, y: 5 } } );
    await expect( page.locator( '#cs-explain-modal-test' ) ).toHaveCSS( 'display', 'none' );
    console.log( '✅  Desktop backdrop click hides modal' );
} );

// ─── Mobile tests (iPhone emulation) ─────────────────────────────────────────

test( 'mobile: tap opens modal (overflow:hidden parent)', async ( { browser } ) => {
    const ctx  = await browser.newContext( { ...devices[ 'iPhone 14 Pro Max' ] } );
    const page = await ctx.newPage();
    await page.setContent( makeHtml() );

    const modal = page.locator( '#cs-explain-modal-test' );
    await expect( modal ).toHaveCSS( 'display', 'none' );

    await page.locator( '#cs-explain-btn-test' ).tap();

    await expect( modal ).toHaveCSS( 'display', 'flex' );
    console.log( '✅  Mobile tap opens modal (overflow:hidden parent)' );
    await ctx.close();
} );

test( 'mobile: close button tap hides modal', async ( { browser } ) => {
    const ctx  = await browser.newContext( { ...devices[ 'iPhone 14 Pro Max' ] } );
    const page = await ctx.newPage();
    await page.setContent( makeHtml() );

    await page.locator( '#cs-explain-btn-test' ).tap();
    await expect( page.locator( '#cs-explain-modal-test' ) ).toHaveCSS( 'display', 'flex' );

    await page.locator( '#modal-close-btn' ).tap();
    await expect( page.locator( '#cs-explain-modal-test' ) ).toHaveCSS( 'display', 'none' );
    console.log( '✅  Mobile close button tap hides modal' );
    await ctx.close();
} );

test( 'mobile: backdrop tap hides modal', async ( { browser } ) => {
    const ctx  = await browser.newContext( { ...devices[ 'iPhone 14 Pro Max' ] } );
    const page = await ctx.newPage();
    await page.setContent( makeHtml() );

    await page.locator( '#cs-explain-btn-test' ).tap();
    await expect( page.locator( '#cs-explain-modal-test' ) ).toHaveCSS( 'display', 'flex' );

    // Tap top-left corner of the backdrop (outside the modal card).
    await page.locator( '#cs-explain-modal-test' ).tap( { position: { x: 5, y: 5 } } );
    await expect( page.locator( '#cs-explain-modal-test' ) ).toHaveCSS( 'display', 'none' );
    console.log( '✅  Mobile backdrop tap hides modal' );
    await ctx.close();
} );

// ─── iOS Safari isolation: verify touchend handler works independently ────────
// Simulate the iOS Safari condition where overflow:hidden swallows the click
// event by patching document.addEventListener to block 'click' for modal actions.
// If the test still passes, the touchend handler alone is sufficient.

test( 'mobile: touchend handler works even without click event', async ( { browser } ) => {
    const ctx  = await browser.newContext( { ...devices[ 'iPhone 14 Pro Max' ] } );
    const page = await ctx.newPage();
    await page.setContent( makeHtml() );

    // Patch the document click handler AFTER cs-admin-settings.js runs,
    // inserting a capturing listener that swallows clicks on modal-open buttons —
    // this simulates iOS Safari's overflow:hidden swallowing the click event.
    await page.evaluate( () => {
        document.addEventListener(
            'click',
            function ( e ) {
                if ( e.target && e.target.closest( '[data-cs-modal-open]' ) ) {
                    e.stopImmediatePropagation();
                }
            },
            true  // capture phase — fires before the delegated listener
        );
    } );

    const modal = page.locator( '#cs-explain-modal-test' );
    await expect( modal ).toHaveCSS( 'display', 'none' );

    // tap() dispatches touchstart → touchend → (blocked) click
    await page.locator( '#cs-explain-btn-test' ).tap();

    // Should still open because our touchend handler ran before click was blocked.
    await expect( modal ).toHaveCSS( 'display', 'flex' );
    console.log( '✅  Touchend handler opens modal even when click is swallowed' );
    await ctx.close();
} );

// ─── Regression: second Explain button in the same panel ─────────────────────

test( 'mobile: second explain button works independently', async ( { browser } ) => {
    const ctx  = await browser.newContext( { ...devices[ 'iPhone 14 Pro Max' ] } );
    const page = await ctx.newPage();

    const html = makeHtml().replace(
        '</body>',
        `<div class="cs-panel">
            <div class="cs-section-header">
                <span>Second Panel</span>
                <button id="cs-explain-btn-second"
                    data-cs-modal-open="cs-explain-modal-second"
                    style="margin-left:auto;flex-shrink:0;background:#2563eb;color:#fff;font-size:12px;padding:5px 14px;border-radius:5px;cursor:pointer;border:none;display:block;">
                    Explain&hellip;
                </button>
                <div id="cs-explain-modal-second"
                     style="display:none;position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,0.55);align-items:center;justify-content:center;"
                     data-cs-modal-backdrop="true">
                    <div style="background:#fff;border-radius:10px;padding:20px;max-width:600px;width:90%;">
                        <p>Second modal</p>
                        <button data-cs-modal-close="cs-explain-modal-second"
                            style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:5px;padding:6px 18px;font-size:12px;cursor:pointer;">
                            Got it
                        </button>
                    </div>
                </div>
            </div>
        </div></body>`
    );

    await page.setContent( html );

    // Tap second button — only second modal opens.
    await page.locator( '#cs-explain-btn-second' ).tap();
    await expect( page.locator( '#cs-explain-modal-second' ) ).toHaveCSS( 'display', 'flex' );
    await expect( page.locator( '#cs-explain-modal-test' ) ).toHaveCSS( 'display', 'none' );

    console.log( '✅  Second explain button works independently' );
    await ctx.close();
} );
