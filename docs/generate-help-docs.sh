#!/usr/bin/env bash
set -euo pipefail

PLUGIN_REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_LABEL="CloudScale Cyber and Devtools"

source REPO_BASE/shared-help-docs/help-runner.sh

echo "--- Disabling CS Monitor for screenshots..."
run_wp "option update csdt_devtools_perf_monitor_enabled 0 --path=${WP_PATH}"

echo "--- Masking sensitive settings for screenshots..."
# Capture only the last non-empty, non-PERF line as the slug value
_orig_slug="$(run_wp "option get csdt_devtools_login_slug --path=${WP_PATH}" 2>/dev/null \
  | grep -v '^\[' | grep -v '^$' | tail -1 || true)"
# Use a random slug so the masked value can't be guessed from docs screenshots
_mask_slug="$(openssl rand -hex 4)"
run_wp "option update csdt_devtools_login_slug ${_mask_slug} --path=${WP_PATH}" 2>/dev/null || true
echo "    Masked login slug to: ${_mask_slug}"

# Register pre-cleanup hook — fires inside _helpdocs_cleanup (which overwrites any
# trap set here, so we hook into the runner's cleanup instead of using our own trap).
_helpdocs_pre_cleanup() {
  echo "--- Re-enabling CS Monitor..."
  run_wp "option update csdt_devtools_perf_monitor_enabled 1 --path=${WP_PATH}" 2>/dev/null || true
  echo "--- Restoring login slug to original value (${_orig_slug})..."
  if [ -n "${_orig_slug}" ]; then
    run_wp "option update csdt_devtools_login_slug ${_orig_slug} --path=${WP_PATH}" 2>/dev/null || true
    echo "    Done — login slug restored."
  else
    echo "    WARNING: _orig_slug was empty — login slug not restored."
  fi
}

run_help_docs "${PLUGIN_REPO_DIR}/docs/generate-help-docs.js"
