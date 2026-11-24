#!/bin/bash
# Optional local first launch for this unsigned app only.
# Does not change Gatekeeper, SIP or any system-wide setting.
set -euo pipefail
app_dir="$(cd "$(dirname "$0")" && pwd)"
kumiko_app="$app_dir/Kumiko Studio.app"
if [ ! -d "$kumiko_app" ]; then
  printf '%s\n' 'Keep this command beside Kumiko Studio.app and try again.'
  exit 1
fi
printf '%s\n' 'Preparing this local Kumiko Studio build…'
/usr/bin/codesign --force --deep --sign - "$kumiko_app"
/usr/bin/codesign --verify --deep --strict "$kumiko_app"
if /usr/bin/xattr -p com.apple.quarantine "$kumiko_app" >/dev/null 2>&1; then
  /usr/bin/xattr -dr com.apple.quarantine "$kumiko_app"
fi
/usr/bin/open "$kumiko_app"
