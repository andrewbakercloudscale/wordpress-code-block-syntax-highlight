/**
 * Version diagnostic — reads the deployed plugin version directly from the
 * server via WP-CLI over SSH. No browser login or 2FA required.
 *
 * Run: npx playwright test tests/version-check.spec.js
 */

const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');

function wpCli(phpExpr) {
    return execSync(
        `ssh pi "docker exec pi_wordpress php -r \\"require '/var/www/html/wp-load.php'; ${phpExpr}\\" 2>/dev/null"`,
        { encoding: 'utf8', stdio: 'pipe', timeout: 15_000 }
    ).trim();
}

test('deployed plugin version matches local cs-code-block.php header', async () => {
    // ── Local version from plugin header ──────────────────────────────────
    const localHeader = execSync(
        `grep "* Version:" /Users/cp363412/Desktop/github/wordpress-devtools-plugin/cs-code-block.php`,
        { encoding: 'utf8' }
    ).trim();
    const localMatch = localHeader.match(/Version:\s*([\d.]+)/);
    const localVersion = localMatch ? localMatch[1] : '(not found)';

    // ── Deployed version from WordPress plugin registry ───────────────────
    const deployedVersion = wpCli(
        `$plugins = get_plugins(); ` +
        `foreach ($plugins as $file => $data) { ` +
        `  if (strpos($file, 'cloudscale-devtools') !== false || strpos($file, 'cs-code-block') !== false) { ` +
        `    echo $data['Version']; break; ` +
        `  } ` +
        `}`
    );

    // ── VERSION constant in deployed file ─────────────────────────────────
    const phpConstant = execSync(
        `ssh pi "grep -m1 \\"const VERSION\\" /var/www/html/wp-content/plugins/cloudscale-devtools/cs-code-block.php 2>/dev/null | grep -oE \\"[0-9]+\\\\.[0-9]+\\\\.[0-9]+\\""`,
        { encoding: 'utf8', stdio: 'pipe', timeout: 10_000 }
    ).trim();

    console.log(`\n  Local header version:   ${localVersion}`);
    console.log(`  Deployed plugin version: ${deployedVersion || '(not found)'}`);
    console.log(`  PHP VERSION constant:    ${phpConstant}`);
    console.log('');

    // All three should match
    expect(deployedVersion, 'Deployed version should match local header').toBe(localVersion);
    expect(phpConstant, 'PHP constant should match local header').toBe(localVersion);
});
