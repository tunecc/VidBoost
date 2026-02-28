#!/usr/bin/env bash

set -euo pipefail

cat <<'EOF'
VidBoost YouTube Member Blocker - Manual Regression Checklist

Preparation
1. Reload extension build.
2. Open YouTube in a fresh tab and ensure login state is stable.
3. Prepare test channels:
   - One with members-only videos.
   - One without members-only videos.
4. Cold-load a watch page once (new tab, hard refresh) to verify network prefilter behavior.

Mode A: all
1. Set mode to all.
2. Visit Home, Search, Related, Channel videos tab, Mobile layout (devtools device mode).
3. Expected:
   - Members-only cards never visibly flash before disappearing.
   - Non-members videos remain visible.

Mode B: blocklist
1. Set mode to blocklist and add one member-channel handle.
2. Repeat key scenes.
3. Expected:
   - Only blocklisted channel members-only cards are hidden.
   - Other channels members-only cards stay visible.

Mode C: allowlist
1. Set mode to allowlist and add one member-channel handle.
2. Repeat key scenes.
3. Expected:
   - Allowlisted channel members-only cards stay visible.
   - Other channels members-only cards are hidden with no obvious flash.

SPA / Navigation
1. Navigate between pages via YouTube internal links.
2. Expected:
   - No progressive slowdown.
   - Filter behavior remains consistent after multiple navigations.

Network prefilter smoke
1. With mode=all, hard-refresh Home/Search/Watch once each.
2. Expected:
   - Membership cards should rarely appear then disappear (flash should be near-zero).
EOF
