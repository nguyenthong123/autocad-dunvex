# TASK-41 — Mac ↔ Windows sync handoff (review before deploy)

**Status:** root cause confirmed · fix SHA `9ff3d494` · **do not deploy until reviewer OK**  
**Date:** 2026-11-06

## Concrete document under test

| Field | Value |
|-------|--------|
| Document ID | `G5zyyoF_RQQdTN4qeFmjS` |
| Name | `ct nano thành ở kiến đức` |
| Account username | `thông` |
| Store name | `tâm an` |
| User ID | `f475072d00964fa53d5b4deaecb30225` |
| Server version (probe) | **18** |
| Server updated_at | `2026-11-06T15:14:14.995Z` |
| Backup | `docs/tasks/sync-evidence/BACKUP-G5zyyoF_RQQdTN4qeFmjS-20261106T151422Z.json` |

## Confirmed root cause

**Silent guest fallback on bad/missing JWT.**

1. UI shows “logged in” from `localStorage.dunvex_auth_user` (username / storeName).
2. Storage API scopes data by JWT `sub` via `Authorization: Bearer …`.
3. If the token is **missing, expired, or invalid**, the server previously called `extractAuthUserId` → **`"guest"`** with **HTTP 200**, returning the **guest** recent list / 404 for user docs.
4. Win therefore looked like the same account but listed guest projects — the Mac drawing never appeared.
5. Mac with a **valid** token saw the real user DB (7 projects including the probe doc).

### Broken data path

```
Mac (valid JWT, user f475…) ──PUT/GET──► /data/storage/users/f475…/dunvex_cad.sqlite  ✅
Win  (UI says “thông”, bad/expired JWT) ──GET──► guest DB  ❌  (doc 404 / wrong list)
```

**Not** “server missing the drawing.” VPS has the document under the correct user ID.

### Secondary observations

- `dunvex_test` (`288e702a…`) user DB had **0 projects** and briefly lacked a `version` column (ALTER applied during probe).
- Guest DB contains unrelated test docs + an older copy of `udYMcajQ_…` — consistent with past writes under guest / expired-token fallback.
- IndexedDB `put()` returning success was already treated as “saved” in toast/status — misleading vs VPS ACK.

## Dual-session evidence (live VPS, pre-deploy)

File: `docs/tasks/sync-evidence/dual-session-2026-11-06T15-17-17-568Z.json`

| Step | Result |
|------|--------|
| A `/api/auth/me` as thông | 200 · id `f475072d…` |
| A recents | 200 · **has** `G5zyyoF_…` (7 docs) |
| A GET document | 200 · version **18** |
| B guest recents | 200 · **no** probe doc |
| B guest GET | **404** |
| B invalid Bearer GET (VPS **before** fix) | **404** guest fallback (proves the bug) |
| A PUT stale baseVersion (identical body) | 200 `unchanged` v18 (dedup; conflict path covered in unit tests) |

Script: `docs/tasks/TASK-41-mac-win-sync-evidence.mjs`  
(`SYNC_EVIDENCE_TOKEN=<jwt> node docs/tasks/TASK-41-mac-win-sync-evidence.mjs http://136.66.95.155`)

After deploy, `B.invalidBearer.get` must become **401 UNAUTHORIZED** (covered by `server/test/storageServer.test.mjs`).

## Fix SHA (awaiting review — not deployed)

`9ff3d4940af875cb8500fc18484ca8a8523955b3` — `🐛 fix(storage): stop silent guest fallback on bad JWT for Mac↔Win sync`

## Fix contents

1. **Server** `resolveStorageUserId`: Bearer present but invalid → **401**, never guest. No header → guest (legacy).
2. **Client** `ensureAuthSession` + `authSessionInvalid`: clear stale localStorage when `/api/auth/me` or storage returns 401; home/ribbon verify session before listing.
3. **Sync status UX**: `local` / `saving` / `saved`(=VPS ACK) / `pending` / `error` / `conflict` — i18n: “Đã lưu trên máy”, “Đang đồng bộ…”, “Đã đồng bộ VPS”, …
4. Save toast uses `sync.local` (device save), not “synced”.

### Acceptance matrix (post-deploy)

- [ ] Two browsers A/B, same account: A save → status “Đã đồng bộ VPS” → B list+open same version
- [ ] Offline save → `local`/`pending` → online flush → VPS ACK → B sees it
- [ ] Re-login after logout: list matches user ID, not guest
- [ ] Expired token: UI clears session / prompts login; storage returns 401 (not guest list)
- [ ] Concurrent edit: 409 conflict dialog; local kept until resolve (overwrite / pull / save copy)

## Reviewer ask

Approve the fix, then deploy storage-api + web bundle together. Do **not** deploy only one side.
