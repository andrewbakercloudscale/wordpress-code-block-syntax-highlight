#!/usr/bin/env node
/**
 * One-off script: applies targeted edits to post 3965 via WP REST API.
 * Authenticates using the CSDT test-session API (cookies + REST nonce).
 *
 * Usage:
 *   node scripts/edit-post-3965.js
 *
 * Reads credentials from REPO_BASE/.env.test
 *
 * What it changes:
 *   1. "For wordpress," → "For WordPress,"
 *   2. Section 5.3: adds a CDN cache-staleness paragraph after the TTFB section
 *   3. Section 7: adds a sentence about the plugin Fix button + auto-purge
 */

'use strict';
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// Load .env.test
const envFile = 'REPO_BASE/.env.test';
if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    });
}

const SITE        = process.env.WP_SITE             || 'https://andrewbaker.ninja';
const SECRET      = process.env.CSDT_TEST_SECRET    || '';
const ROLE        = process.env.CSDT_TEST_ROLE      || 'my_test_account';
const SESSION_URL = process.env.CSDT_TEST_SESSION_URL || '';
const POST_ID     = 3965;

if (!SECRET || !SESSION_URL) {
    console.error('CSDT_TEST_SECRET and CSDT_TEST_SESSION_URL must be set in .env.test');
    process.exit(1);
}

function rawRequest(method, fullUrl, body, headers) {
    return new Promise((resolve, reject) => {
        const u   = new URL(fullUrl);
        const lib = u.protocol === 'https:' ? https : http;
        const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

        const opts = {
            hostname: u.hostname,
            port:     u.port || (u.protocol === 'https:' ? 443 : 80),
            path:     u.pathname + u.search,
            method,
            headers: { ...headers },
            rejectUnauthorized: false,
        };

        if (payload) {
            if (!opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
            opts.headers['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = lib.request(opts, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString();
                let parsed;
                try { parsed = JSON.parse(text); } catch { parsed = text; }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed, text });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function main() {
    // ── Step 1: get test session cookies ────────────────────────────────────────
    console.log('Getting test session...');
    const sessResp = await rawRequest('POST', SESSION_URL, {
        secret: SECRET,
        role:   ROLE,
        ttl:    600,
    }, { 'Content-Type': 'application/json' });

    if (sessResp.status !== 200) {
        console.error('test-session failed:', sessResp.status, JSON.stringify(sessResp.body).slice(0, 200));
        process.exit(1);
    }

    const sess = sessResp.body;
    console.log(`Authenticated as: ${sess.username}`);

    // Build Cookie header from the two session cookies
    const cookieHeader = [
        `${sess.secure_auth_cookie_name}=${encodeURIComponent(sess.secure_auth_cookie)}`,
        `${sess.logged_in_cookie_name}=${encodeURIComponent(sess.logged_in_cookie)}`,
    ].join('; ');

    // ── Step 2: fetch admin dashboard to get REST nonce ─────────────────────────
    console.log('Fetching REST nonce from admin page...');
    const adminResp = await rawRequest('GET', `${SITE}/wp-admin/index.php`, null, {
        Cookie:          cookieHeader,
        'User-Agent':    'Mozilla/5.0 (compatible; CSDT-edit-script/1.0)',
        'Accept':        'text/html',
    });

    // Extract nonce from inline JS: "nonce":"xxxxxxxx" or wpApiSettings={"root":...,"nonce":"xxx",...}
    const nonceMatch = adminResp.text.match(/"nonce"\s*:\s*"([a-f0-9]+)"/);
    if (!nonceMatch) {
        console.error('Could not extract nonce from admin page. Status:', adminResp.status);
        console.error('Page snippet:', adminResp.text.slice(0, 500));
        process.exit(1);
    }
    const nonce = nonceMatch[1];
    console.log(`Got nonce: ${nonce}`);

    const restHeaders = {
        Cookie:         cookieHeader,
        'X-WP-Nonce':  nonce,
        'Content-Type': 'application/json',
        'User-Agent':   'Mozilla/5.0 (compatible; CSDT-edit-script/1.0)',
    };

    // ── Step 3: fetch current post content ──────────────────────────────────────
    console.log(`Fetching post ${POST_ID}...`);
    const getResp = await rawRequest('GET', `${SITE}/wp-json/wp/v2/posts/${POST_ID}?context=edit`, null, restHeaders);

    if (getResp.status !== 200) {
        console.error('GET post failed:', getResp.status, JSON.stringify(getResp.body).slice(0, 300));
        process.exit(1);
    }

    let content = getResp.body.content.raw;
    console.log(`Fetched. Content length: ${content.length} chars.`);

    // ── Change 1: Fix capitalisation ─────────────────────────────────────────────
    const c1 = content.includes('For wordpress,');
    content   = content.replace('For wordpress,', 'For WordPress,');
    console.log(`Change 1 (capitalisation): ${c1 ? 'applied' : 'already done / not found'}`);

    // ── Change 2: Section 5.3 — CDN cache-staleness paragraph ──────────────────
    const ttfbSentinel = 'In Cloudflare, verify that your cache rules are not excluding non-browser UAs. The target is a TTFB under 800ms.</p>\n<!-- /wp:paragraph -->';
    const ttfbReplace  = `In Cloudflare, verify that your cache rules are not excluding non-browser UAs. The target is a TTFB under 800ms.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p>A separate but related issue affects sites that publish posts before adding a featured image. If Cloudflare cached the page before the og:image existed, crawlers will see that stale cached version even after you generate social format images later. If you use the CloudScale DevTools plugin, social format generation automatically purges the post URL from Cloudflare so crawlers see the updated og:image immediately. If you are managing this manually, purge the post URL from your CDN cache any time you add or change the social image after the page has already been cached.</p>\n<!-- /wp:paragraph -->`;

    const c2 = content.includes(ttfbSentinel);
    content   = content.replace(ttfbSentinel, ttfbReplace);
    console.log(`Change 2 (CDN staleness paragraph): ${c2 ? 'applied' : 'already done / sentinel not found'}`);

    // ── Change 3: Section 7 — Fix button + auto-purge mention ──────────────────
    const sec7sentinel = 'Most WordPress SEO plugins generate the og:image tag from the featured image and if it is not set, there is no tag.';
    const sec7replace  = 'Most WordPress SEO plugins generate the og:image tag from the featured image and if it is not set, there is no tag. If you use the CloudScale DevTools plugin, the Thumbnails tab generates correctly-sized social format images for WhatsApp, LinkedIn, X, and Instagram in one click, and automatically purges the Cloudflare cache for the post URL so crawlers see the updated og:image straight away.';

    const c3 = content.includes(sec7sentinel);
    content   = content.replace(sec7sentinel, sec7replace);
    console.log(`Change 3 (Section 7 Fix button): ${c3 ? 'applied' : 'already done / sentinel not found'}`);

    if (!c1 && !c2 && !c3) {
        console.log('Nothing to change — all edits already applied.');
        return;
    }

    // ── Step 4: update the post ──────────────────────────────────────────────────
    console.log('Updating post...');
    const putResp = await rawRequest('POST', `${SITE}/wp-json/wp/v2/posts/${POST_ID}`, {
        content: content,
        status:  'publish',
    }, restHeaders);

    if (putResp.status === 200) {
        console.log(`Done. Post updated: ${putResp.body.link}`);
    } else {
        console.error('Update failed:', putResp.status, JSON.stringify(putResp.body).slice(0, 400));
        process.exit(1);
    }
}

main().catch(err => { console.error(err); process.exit(1); });
