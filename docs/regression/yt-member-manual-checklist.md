# YouTube Member Blocker Manual Checklist

Run `bash scripts/yt-member-manual-check.sh` for a quick guided flow.

## Key scenes

1. Desktop home/subscriptions rich cards
2. Desktop search list cards
3. Desktop related cards (`/watch`)
4. Desktop channel section grid (`page-subtype="channels"`)
5. Mobile home/subscriptions/search (device emulation)
6. Mobile channel home shelves

## Pass criteria

1. `all` mode: all members-only cards hidden with no obvious flash
2. `blocklist` mode: hide only blocklisted channels' members-only cards
3. `allowlist` mode: keep allowlisted channels' members-only cards, hide others
4. After repeated SPA navigation, behavior is stable and CPU/memory does not climb visibly
