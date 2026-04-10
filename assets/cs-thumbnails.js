/* ===========================================================
   CloudScale DevTools — Thumbnails / Social Preview  v1.9.5
   Handles: URL checker, recent posts scan, Cloudflare
            crawler test, CF cache purge, media auditor.
   =========================================================== */
( function () {
    'use strict';

    const { ajaxUrl, nonce, siteUrl } = window.csDevtoolsThumbs || {};

    // ── Helpers ───────────────────────────────────────────────────────────

    function post( action, data ) {
        const body = new URLSearchParams( { action, nonce, ...data } );
        return fetch( ajaxUrl, { method: 'POST', body } )
            .then( r => r.json() )
            .then( res => {
                if ( res === -1 || res === 0 ) {
                    return { success: false, data: { message: 'Session expired — please reload.' } };
                }
                return res;
            } );
    }

    function esc( str ) {
        return String( str )
            .replace( /&/g, '&amp;' ).replace( /</g, '&lt;' )
            .replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );
    }

    function setLoading( el, msg ) {
        el.style.display = 'block';
        el.innerHTML = `<p style="color:#555;font-size:13px">⏳ ${esc( msg || 'Loading…' )}</p>`;
    }

    // ── URL Checker ───────────────────────────────────────────────────────

    const checkBtn     = document.getElementById( 'cs-thumb-check-btn' );
    const checkUrlEl   = document.getElementById( 'cs-thumb-check-url' );
    const checkResults = document.getElementById( 'cs-thumb-check-results' );

    if ( checkBtn ) {
        checkBtn.addEventListener( 'click', () => {
            const url = ( checkUrlEl?.value || '' ).trim();
            if ( ! url ) { alert( 'Please enter a URL.' ); return; }
            checkBtn.disabled = true;
            checkBtn.textContent = 'Running…';
            setLoading( checkResults, 'Running all diagnostic checks — this may take 10–20 seconds…' );

            post( 'cs_devtools_social_check_url', { url } ).then( res => {
                checkBtn.disabled = false;
                checkBtn.textContent = '🔍 Run Diagnostic';
                if ( ! res.success ) {
                    checkResults.innerHTML = `<p style="color:#8c2020">${esc( res.data?.message || 'Error' )}</p>`;
                    return;
                }
                checkResults.innerHTML = renderReport( res.data );
            } ).catch( () => {
                checkBtn.disabled = false;
                checkBtn.textContent = '🔍 Run Diagnostic';
                checkResults.innerHTML = '<p style="color:#8c2020">AJAX request failed. Check your connection.</p>';
            } );
        } );
    }

    function renderReport( data ) {
        const t = data.totals;
        const cls = t.fail > 0 ? 'fail' : t.warn > 0 ? 'warn' : 'pass';
        const msg = t.fail > 0
            ? `${t.fail} critical issue(s) found`
            : t.warn > 0 ? `${t.warn} warning(s) — review recommended` : 'All checks passed';

        const icons = { pass: '✔', warn: '⚠', fail: '✘', info: 'ℹ' };
        let html = `
            <div class="cs-thumb-report-hdr cs-thumb-${cls}-hdr">
                <strong>${esc( msg )}</strong>
                <span class="cs-thumb-tally">
                    <span style="color:#276227">✔ ${t.pass}</span>
                    <span style="color:#7a5a00">⚠ ${t.warn}</span>
                    <span style="color:#8c2020">✘ ${t.fail}</span>
                </span>
            </div>`;

        for ( const sec of data.sections ) {
            html += `<div class="cs-thumb-section">
                <div class="cs-thumb-section-title">${esc( sec.title )}</div>
                <ul class="cs-thumb-results-list">`;
            for ( const r of sec.results ) {
                const icon = icons[ r.type ] || 'ℹ';
                html += `<li class="cs-thumb-result cs-thumb-${r.type || 'info'}">
                    <span>${icon}</span>
                    <span>${esc( r.msg )}</span>
                </li>`;
            }
            html += '</ul></div>';
        }
        return html;
    }

    // ── Recent Posts Scan ─────────────────────────────────────────────────

    const scanBtn     = document.getElementById( 'cs-thumb-scan-btn' );
    const scanResults = document.getElementById( 'cs-thumb-scan-results' );

    if ( scanBtn ) {
        scanBtn.addEventListener( 'click', () => {
            scanBtn.disabled = true;
            scanBtn.textContent = 'Scanning…';
            setLoading( scanResults, 'Checking last 10 posts — each takes 10–20 seconds…' );

            post( 'cs_devtools_social_scan_posts', {} ).then( res => {
                scanBtn.disabled = false;
                scanBtn.textContent = '📋 Scan Recent Posts';
                if ( ! res.success ) {
                    scanResults.innerHTML = `<p style="color:#8c2020">${esc( res.data?.message || 'Error' )}</p>`;
                    return;
                }
                scanResults.innerHTML = renderPostsTable( res.data );
            } ).catch( () => {
                scanBtn.disabled = false;
                scanBtn.textContent = '📋 Scan Recent Posts';
                scanResults.innerHTML = '<p style="color:#8c2020">Request failed.</p>';
            } );
        } );
    }

    function renderPostsTable( posts ) {
        if ( ! posts.length ) {
            return '<p style="color:#555;font-size:13px">No published posts with featured images found.</p>';
        }
        let html = `<table class="cs-thumb-posts-table">
            <thead><tr>
                <th>Post</th><th>Status</th><th>Image Size</th><th>Dimensions</th><th>Actions</th>
            </tr></thead><tbody>`;
        for ( const p of posts ) {
            const t = p.totals;
            const badgeCls  = t.fail > 0 ? 'fail' : t.warn > 0 ? 'warn' : 'ok';
            const badgeText = t.fail > 0 ? `✘ ${t.fail} issue(s)` : t.warn > 0 ? `⚠ ${t.warn} warning(s)` : '✔ OK';
            const sizeText  = p.img_kb !== null ? `${p.img_kb} KB${p.img_kb > 300 ? ' ⚠ over limit' : ''}` : '—';
            const dimText   = ( p.img_w && p.img_h ) ? `${p.img_w}×${p.img_h}px` : '—';
            html += `<tr>
                <td><a href="${esc( p.url )}" target="_blank" rel="noopener">${esc( p.title )}</a></td>
                <td><span class="cs-thumb-badge-${badgeCls}">${esc( badgeText )}</span></td>
                <td>${esc( sizeText )}</td>
                <td>${esc( dimText )}</td>
                <td>
                    <button class="button button-small cs-thumb-recheck-btn" data-url="${esc( p.url )}">Re-check</button>
                    <a href="${esc( p.url )}" target="_blank" rel="noopener" class="button button-small" style="margin-left:4px">View</a>
                </td>
            </tr>`;
        }
        html += '</tbody></table>';
        return html;
    }

    // Re-check individual post from scan table.
    document.addEventListener( 'click', ( e ) => {
        const btn = e.target.closest( '.cs-thumb-recheck-btn' );
        if ( ! btn ) return;
        const url = btn.dataset.url;
        if ( checkUrlEl ) checkUrlEl.value = url;
        checkResults.style.display = 'block';
        setLoading( checkResults, `Re-checking ${url}…` );
        checkBtn?.scrollIntoView( { behavior: 'smooth', block: 'center' } );

        post( 'cs_devtools_social_check_url', { url } ).then( res => {
            if ( ! res.success ) {
                checkResults.innerHTML = `<p style="color:#8c2020">${esc( res.data?.message || 'Error' )}</p>`;
                return;
            }
            checkResults.innerHTML = renderReport( res.data );
            checkResults.scrollIntoView( { behavior: 'smooth', block: 'start' } );
        } ).catch( () => {
            checkResults.innerHTML = '<p style="color:#8c2020">Request failed.</p>';
        } );
    } );

    // ── Cloudflare Crawler Test ───────────────────────────────────────────

    const cfTestBtn     = document.getElementById( 'cs-thumb-cf-test-btn' );
    const cfTestUrl     = document.getElementById( 'cs-thumb-cf-test-url' );
    const cfTestResults = document.getElementById( 'cs-thumb-cf-test-results' );

    if ( cfTestBtn ) {
        cfTestBtn.addEventListener( 'click', () => {
            const url = ( cfTestUrl?.value || siteUrl || '' ).trim();
            if ( ! url ) { alert( 'Please enter a URL to test.' ); return; }
            cfTestBtn.disabled = true;
            cfTestBtn.textContent = 'Testing…';
            setLoading( cfTestResults, 'Sending requests with each social crawler user agent…' );

            post( 'cs_devtools_social_cf_test', { url } ).then( res => {
                cfTestBtn.disabled = false;
                cfTestBtn.textContent = '🤖 Test Crawler Access';
                if ( ! res.success ) {
                    cfTestResults.innerHTML = `<p style="color:#8c2020">${esc( res.data?.message || 'Error' )}</p>`;
                    return;
                }
                cfTestResults.innerHTML = renderCfTestResults( res.data, url );
            } ).catch( () => {
                cfTestBtn.disabled = false;
                cfTestBtn.textContent = '🤖 Test Crawler Access';
                cfTestResults.innerHTML = '<p style="color:#8c2020">Request failed.</p>';
            } );
        } );
    }

    function renderCfTestResults( results, url ) {
        const allPass = Object.values( results ).every( r => r.type === 'pass' );
        const header  = allPass
            ? '<p style="color:#276227;font-weight:600">✔ All crawlers can access the page — your WAF skip rule is working correctly.</p>'
            : '<p style="color:#8c2020;font-weight:600">✘ One or more crawlers are being blocked. Check your Cloudflare WAF skip rule.</p>';

        let chips = '<div class="cs-thumb-ua-grid">';
        for ( const [ label, r ] of Object.entries( results ) ) {
            const chipCls = r.type === 'pass' ? 'ok' : 'fail';
            const icon    = r.type === 'pass' ? '✔' : '✘';
            chips += `<div class="cs-thumb-ua-chip cs-thumb-ua-${chipCls}" title="${esc( r.msg )}">${icon} ${esc( label )}</div>`;
        }
        chips += '</div>';

        let detail = '<ul class="cs-thumb-results-list" style="margin-top:10px">';
        for ( const [ label, r ] of Object.entries( results ) ) {
            detail += `<li class="cs-thumb-result cs-thumb-${r.type}">
                <span>${r.type === 'pass' ? '✔' : '✘'}</span>
                <span><strong>${esc( label )}:</strong> ${esc( r.msg )}</span>
            </li>`;
        }
        detail += '</ul>';

        return header + chips + detail;
    }

    // ── Cloudflare Cache Purge ────────────────────────────────────────────

    const cfPurgeBtn    = document.getElementById( 'cs-cf-purge-btn' );
    const cfPurgeUrl    = document.getElementById( 'cs-cf-purge-url' );
    const cfPurgeResult = document.getElementById( 'cs-cf-purge-result' );
    const cfSaveBtn     = document.getElementById( 'cs-cf-save-btn' );
    const cfZoneId      = document.getElementById( 'cs-cf-zone-id' );
    const cfApiToken    = document.getElementById( 'cs-cf-api-token' );
    const cfSaved       = document.getElementById( 'cs-cf-saved' );

    if ( cfSaveBtn ) {
        cfSaveBtn.addEventListener( 'click', () => {
            cfSaveBtn.disabled = true;
            post( 'cs_devtools_cf_save', {
                zone_id:   cfZoneId?.value.trim() || '',
                api_token: cfApiToken?.value || '',
            } ).then( res => {
                cfSaveBtn.disabled = false;
                if ( res.success ) {
                    if ( cfSaved ) { cfSaved.classList.add( 'visible' ); setTimeout( () => cfSaved.classList.remove( 'visible' ), 3000 ); }
                    if ( cfApiToken ) cfApiToken.value = '';
                } else {
                    alert( res.data?.message || 'Save failed.' );
                }
            } ).catch( () => { cfSaveBtn.disabled = false; alert( 'Request failed.' ); } );
        } );
    }

    if ( cfPurgeBtn ) {
        cfPurgeBtn.addEventListener( 'click', () => {
            cfPurgeBtn.disabled = true;
            cfPurgeBtn.textContent = 'Purging…';
            setLoading( cfPurgeResult, 'Sending purge request to Cloudflare…' );

            post( 'cs_devtools_cf_purge', { purge_url: cfPurgeUrl?.value.trim() || '' } ).then( res => {
                cfPurgeBtn.disabled = false;
                cfPurgeBtn.textContent = '🗑️ Purge Cache';
                cfPurgeResult.style.display = 'block';
                cfPurgeResult.innerHTML = res.success
                    ? `<p style="color:#276227;font-weight:600">✔ ${esc( res.data?.message || 'Purged.' )}</p>`
                    : `<p style="color:#8c2020">✘ ${esc( res.data?.message || 'Purge failed.' )}</p>`;
            } ).catch( () => {
                cfPurgeBtn.disabled = false;
                cfPurgeBtn.textContent = '🗑️ Purge Cache';
                cfPurgeResult.innerHTML = '<p style="color:#8c2020">Request failed.</p>';
            } );
        } );
    }

    // ── Media Library Audit ───────────────────────────────────────────────

    const auditBtn      = document.getElementById( 'cs-thumb-audit-btn' );
    const auditProgress = document.getElementById( 'cs-thumb-audit-progress' );
    const auditResults  = document.getElementById( 'cs-thumb-audit-results' );

    if ( auditBtn ) {
        auditBtn.addEventListener( 'click', () => {
            auditBtn.disabled = true;
            auditBtn.textContent = 'Scanning…';
            if ( auditProgress ) auditProgress.textContent = 'Querying media library…';
            setLoading( auditResults, 'Scanning media library for oversized or under-dimensioned images…' );

            post( 'cs_devtools_social_scan_media', {} ).then( res => {
                auditBtn.disabled = false;
                auditBtn.textContent = '🔎 Audit Media Library';
                if ( auditProgress ) auditProgress.textContent = '';
                if ( ! res.success ) {
                    auditResults.innerHTML = `<p style="color:#8c2020">${esc( res.data?.message || 'Error' )}</p>`;
                    return;
                }
                auditResults.innerHTML = renderAuditTable( res.data );
            } ).catch( () => {
                auditBtn.disabled = false;
                auditBtn.textContent = '🔎 Audit Media Library';
                if ( auditProgress ) auditProgress.textContent = '';
                auditResults.innerHTML = '<p style="color:#8c2020">Request failed.</p>';
            } );
        } );
    }

    // Fix button handler (event delegation).
    document.addEventListener( 'click', ( e ) => {
        const btn = e.target.closest( '.cs-thumb-fix-btn' );
        if ( ! btn ) return;
        const id     = btn.dataset.id;
        const status = document.getElementById( `cs-fix-status-${id}` );
        btn.disabled = true;
        btn.textContent = 'Working…';

        post( 'cs_devtools_social_fix_image', { attachment_id: id } ).then( res => {
            if ( ! res.success ) {
                if ( status ) { status.style.color = '#8c2020'; status.textContent = res.data?.message || 'Failed'; }
                btn.disabled = false;
                btn.textContent = 'Retry';
                return;
            }
            const r = res.data;
            if ( status ) {
                status.style.color = r.under_limit ? '#276227' : '#7a5a00';
                status.textContent = r.message + ( r.backup ? ` (backup: ${r.backup})` : '' );
            }
            btn.remove();
            const row = document.getElementById( `cs-audit-row-${id}` );
            if ( row ) row.querySelector( 'td:nth-child(2)' ).textContent = `${r.new_size_kb} KB ✔`;
        } ).catch( () => {
            if ( status ) { status.style.color = '#8c2020'; status.textContent = 'AJAX error'; }
            btn.disabled = false;
            btn.textContent = 'Retry';
        } );
    } );

    function renderAuditTable( data ) {
        const { total_scanned, issues_found, issues } = data;
        if ( ! issues_found ) {
            return `<p style="color:#276227;font-weight:600">✔ Scanned ${esc( total_scanned )} images — no issues found.</p>`;
        }
        let html = `<p style="margin-bottom:10px;font-size:13px">Scanned <strong>${esc( total_scanned )}</strong> images — <strong>${esc( issues_found )}</strong> have potential social-preview issues.</p>
        <table class="cs-thumb-audit-table">
            <thead><tr>
                <th>Image</th><th>Size</th><th>Dimensions</th><th>Issues</th><th>Action</th>
            </tr></thead><tbody>`;
        for ( const img of issues ) {
            const flagHtml = img.flags.map( f =>
                `<span style="color:${f.severity==='fail'?'#8c2020':'#7a5a00'};display:block">${esc( f.issue )}</span>`
            ).join( '' );
            const action = img.can_fix
                ? `<button class="button button-small cs-thumb-fix-btn" data-id="${esc( img.id )}">Recompress</button>
                   <span id="cs-fix-status-${esc( img.id )}" style="display:block;font-size:11px;margin-top:4px"></span>`
                : '<span style="color:#999;font-size:11px">Manual fix needed</span>';
            html += `<tr id="cs-audit-row-${esc( img.id )}">
                <td><a href="${esc( img.url )}" target="_blank" rel="noopener">${esc( img.file )}</a></td>
                <td>${esc( String( img.size_kb ) )} KB</td>
                <td>${esc( `${img.width}×${img.height}px` )}</td>
                <td>${flagHtml}</td>
                <td>${action}</td>
            </tr>`;
        }
        html += '</tbody></table>';
        return html;
    }

} )();
