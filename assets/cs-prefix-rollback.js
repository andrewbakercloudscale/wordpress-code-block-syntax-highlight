/* global csdtVulnScan */
'use strict';

( function () {
    function csdtPrefixRollbackInit() {
        var btn = document.getElementById( 'csdt-prefix-rollback-persistent-btn' );
        if ( ! btn ) { return; }
        btn.addEventListener( 'click', function () {
            if ( ! confirm( 'Roll back all renamed tables and restore wp-config.php?' ) ) { return; }
            btn.disabled = true; btn.textContent = '⏳ Rolling back…';
            var msg = document.getElementById( 'csdt-prefix-rollback-persistent-msg' );
            var fd  = new FormData();
            fd.append( 'action', 'csdt_db_prefix_rollback' );
            fd.append( 'nonce',  csdtVulnScan.nonce );
            fetch( csdtVulnScan.ajaxUrl, { method: 'POST', body: fd, credentials: 'same-origin' } )
                .then( function ( r ) { return r.json(); } )
                .then( function ( r ) {
                    btn.disabled = false;
                    if ( msg ) {
                        msg.style.display = '';
                        msg.style.color   = r.success ? '#16a34a' : '#dc2626';
                        msg.textContent   = ( r.data && r.data.message ) || ( r.success ? 'Rolled back.' : 'Failed.' );
                    }
                    if ( r.success ) {
                        btn.textContent = '✓ Done'; btn.disabled = true;
                        var wrap = btn.closest( 'div[style]' );
                        if ( wrap ) { wrap.style.background = '#f0fdf4'; }
                    } else {
                        btn.textContent = '↩ Rollback Now';
                    }
                } )
                .catch( function () { btn.disabled = false; btn.textContent = '↩ Rollback Now'; } );
        } );
    }

    // ── Boot ────────────────────────────────────────────────────────────────
    if ( document.readyState === 'loading' ) {
        document.addEventListener( 'DOMContentLoaded', csdtPrefixRollbackInit );
    } else {
        csdtPrefixRollbackInit();
    }
    document.addEventListener( 'csdt:tab-shown', function ( e ) {
        if ( e.detail && e.detail.tab === 'security' ) csdtPrefixRollbackInit();
    } );
} )();
