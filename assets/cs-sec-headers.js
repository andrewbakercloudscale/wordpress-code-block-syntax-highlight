/* global csdtVulnScan, ajaxurl */
'use strict';

( function () {
    var btn = document.getElementById( 'csdt-sec-headers-save' );
    if ( ! btn ) { return; }
    var msg = document.getElementById( 'csdt-sec-headers-msg' );

    btn.addEventListener( 'click', function () {
        btn.disabled = true;
        var fd = new FormData();
        fd.append( 'action',  'csdt_sec_headers_save' );
        fd.append( 'nonce',   csdtVulnScan.nonce );
        fd.append( 'enabled', document.getElementById( 'csdt-sec-headers-enabled' ).checked ? '1' : '0' );
        fd.append( 'ext_ack', document.getElementById( 'csdt-sec-headers-ext' ).checked     ? '1' : '0' );
        fetch( ajaxurl, { method: 'POST', body: fd } )
            .then( function ( r ) { return r.json(); } )
            .then( function () {
                if ( msg ) {
                    msg.style.display = '';
                    setTimeout( function () { msg.style.display = 'none'; }, 3000 );
                }
            } )
            .finally( function () { btn.disabled = false; } );
    } );
} )();
