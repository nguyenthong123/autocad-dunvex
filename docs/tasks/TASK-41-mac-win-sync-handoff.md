# TASK-41 — Mac ↔ Windows sync handoff (review before deploy)

**Status:** ready for review · **do not deploy until reviewer OK**  
**Date:** 2026-11-06

## Final handoff SHA

`3f82747d4e2ca63be40c1f3e1ebbd260977d9ac3` — `🐛 fix(storage): ignore stale 401 after account switch`

Local stack on top of `origin/dev` (`b31f6b53`), **not pushed**. History rewritten locally so user drawing dumps from the old `9ff3d494` tip are **absent** from this range (private copies in agent store `sync-evidence-private/`).

| Prior tip | Role |
|-----------|------|
| `9ff3d494` (rewritten → `714f90ca`) | 401 on bad Bearer + sync labels — dumps stripped |
| `2092798d` (rewritten → `dd76a6dc`) | Owner-bound outbox |
| `3f82747d` | Stale-request 401 / GET/page isolation (**handoff**) |

## Root cause

Silent guest fallback on bad/expired JWT while UI still showed a logged-in username → Win listed guest DB.

## Fixes included

1. Bearer invalid → **401** (never guest).
2. Outbox `ownerUserId`; flush skips foreign owners; no auto-transfer to guest/B.
3. `ensureAuthSession` clears only on **401/403**; keeps identity on 5xx/network.
4. **Per-request session stamp** (token + userId); 401 / stale GET/page only affect the live session if it still matches the sender — A's in-flight 401 cannot log out B; stale lists/docs do not update B's cache.
5. Sync status: local / syncing / VPS synced / conflict / error.

## Dual-session evidence (same account)

Automated (synthetic fixture, no user drawing payload):

`packages/storage/test/clientServerIntegration.test.ts`  
→ `dual session same account: A saves → server ACK → B lists and opens same version`

Pre-fix VPS metadata only: `docs/tasks/sync-evidence/dual-session-2026-11-06T15-17-17-568Z.json`

## Verification (this tip)

| Check | Result |
|-------|--------|
| rstest storage/UI related | **51 passed** |
| server `storageServer.test.mjs` | **17/17** |
| `tsc --noEmit` | pass |
| Biome (touched files) | pass (warnings only) |
| User dump paths in `origin/dev..HEAD` | **none** |

## Reviewer ask

Approve `3f82747d`, then deploy **web + storage-api together**. Do not push until approved — local history was rewritten to scrub dumps.
