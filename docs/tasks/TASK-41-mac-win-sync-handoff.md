# TASK-41 — Mac ↔ Windows sync handoff (review before deploy)

**Status:** follow-up ready · **do not deploy until reviewer OK**  
**Date:** 2026-11-06

## Fix SHAs

| SHA | Note |
|-----|------|
| `9ff3d494` | First pass (401 on bad Bearer, sync status labels) — **not approved alone** |
|  | Owner-bound outbox + safe `ensureAuthSession` + tests + scrub user dumps |

## Concrete document under test

| Field | Value |
|-------|--------|
| Document ID | `G5zyyoF_RQQdTN4qeFmjS` |
| Name | `ct nano thành ở kiến đức` |
| User ID | `f475072d00964fa53d5b4deaecb30225` (`thông` / `tâm an`) |
| Private backup | Agent store `sync-evidence-private/` (removed from git) |

## Root cause (unchanged)

Silent guest fallback on bad/expired JWT while UI still showed a logged-in username. Win listed the guest DB; Mac with a valid token saw the user DB.

## Follow-up (this SHA)

1. **Outbox ownership** — each item stores `ownerUserId` at enqueue; flush skips mismatches (logout / switch account / mid-retry); never uploads A’s rows as guest or B.
2. **`ensureAuthSession`** — clears session only on **401/403**; keeps identity on **5xx** / network / missing token (offline scoping). `page()` with user-id and no token uses local fallback only (no guest API).
3. **Tests** — owner isolation, expired-token retry, A→B switch, re-login A, auth/me 5xx, dual-session same-account on real storage server; existing offline / conflict / local-fallback suites retained.
4. **Evidence** — synthetic dual-session in `clientServerIntegration.test.ts`; pre-fix VPS probe kept as metadata-only JSON; full drawing dumps out of git.

## Reviewer ask

Approve this SHA, then deploy **web + storage-api together**. Do not deploy one side alone.
