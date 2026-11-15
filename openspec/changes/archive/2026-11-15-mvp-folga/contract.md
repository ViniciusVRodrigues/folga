# API contract (v1)

All `/api/*` routes require the header `X-Token` and pass the Host/Origin checks. Requests and responses are JSON (UTF-8). Sizes are in bytes, as JSON numbers (safe up to 9 PB). Times are ISO 8601 strings.

Errors use the shape `{ "error": { "code": "<CODE>", "message": "<text>" } }`:

| Code | HTTP | Meaning |
|---|---|---|
| `FORBIDDEN` | 403 | Bad token, Host or Origin |
| `NOT_FOUND` | 404 | |
| `BAD_REQUEST` | 400 | |
| `SCAN_RUNNING` | 409 | |
| `NO_SCAN` | 409 | |
| `STALE_ITEM` | 409 | |
| `UNSUPPORTED` | 501 | |

## GET /api/drives
```json
{ "drives": [ { "root": "C:\\", "label": "Windows", "total": 1023…, "free": 17…, "fs": "NTFS", "system": true } ],
  "home": "C:\\Users\\vinic", "shortcuts": [ { "label": "Home", "path": "C:\\Users\\vinic" } ] }
```

## POST /api/scan
Body: `{ "path": "C:\\Users\\vinic" }`. Returns `202 { "scanId": "s1" }`.
- Only one scan runs at a time; a second one gets 409 `SCAN_RUNNING`.
- The path must exist and be a directory; otherwise 400.

## GET /api/scan/status
`{ "state": "idle"|"running"|"done", "root": "C:\…"|null, "progress": { files, dirs, bytes, unreadable, … }|null, "partial": false }`.
- `idle` until the first scan starts; `running` while it runs; `done` once a result exists (a cancelled scan is `done` with `partial: true`).
- The UI asks for it when `#/map` opens, so a reload shows the finished result (or the progress) instead of scanning again.

## POST /api/scan/cancel → `{ "ok": true }`

## GET /api/events  (Server-Sent Events, token in the query string `?t=` because EventSource cannot set headers)
Events:
- `scan-progress` `{ scanId, files, dirs, bytes, current, unreadable, elapsedMs }`: at most every 250 ms.
- `scan-done` `{ scanId, partial, files, dirs, bytes, unreadable, elapsedMs }`
- `cleanup-progress` `{ category, done, total, pending: [group label] }` (`category` is null on the first, `done: 0` event; `pending` lists the groups of the detectors still running)
- `cleanup-done` `{ ok: true }` or `{ ok: false, error }` (the UI shows the failure)
- `clean-progress` `{ jobId, itemId, status: "running"|"done"|"failed"|"skipped", reason? }`
- `clean-done` `{ jobId }`

## GET /api/tree?path=<abs path inside scan root>&limit=200
```json
{ "path": "C:\\Users\\vinic", "name": "vinic", "size": 1, "alloc": 1, "files": 1, "dirs": 1, "noAccess": false, "partial": false,
  "parent": "C:\\Users",
  "children": [ { "name": "AppData", "path": "C:\\Users\\vinic\\AppData", "type": "dir", "size": 1, "alloc": 1, "items": 1, "noAccess": false, "mtime": "…" },
                { "name": "x.iso", "path": "…", "type": "file", "size": 1, "alloc": 1, "mtime": "…" } ],
  "more": { "count": 214, "size": 310000000 } }
```
- Children are sorted by size, descending.
- `parent` is null at the scan root.
- 404 when the path is outside the scan root.

## GET /api/large-files?min=524288000 → `{ "files": [ { "path", "size", "mtime", "ext" } ] }`

## POST /api/cleanup/refresh → `202` (measures every catalog entry; progress through `cleanup-progress`)
- Each detector has a time limit (default 90 s, `detectorTimeoutMs`). The signal is passed down to `measure`/`scanTree`; a detector that runs out of time returns what it measured, with the item `unreadable: true`, and does not block the others. One that ignores the signal is cut after a short grace period and returns nothing.
- A second call while measuring does not start another run.

## GET /api/cleanup/status
`{ "running": true, "progress": { category, done, total, pending }|null, "generatedAt": "…"|null, "error": null|"<text>" }`. Lets the UI resume the "Medindo… N de M" state after a reload. `error` is the last refresh failure (null while running).

## GET /api/cleanup
409 `NO_SCAN` until the first `POST /api/cleanup/refresh` has finished.

```json
{ "generatedAt": "…", "drive": { "root": "C:\\", "total": 1, "free": 1 },
  "summary": { "safeNow": 1, "needsDecision": 1 },
  "checked": [ "Windows", "Steam", "Chrome", "Edge", "Docker e WSL", "Projetos de dev" ],
  "categories": [
    { "id": "system", "name": "System", "size": 1, "counts": { "safe": 1, "admin": 1, "decision": 1 }, "scanning": false,
      "items": [ {
        "id": "system.user-temp", "name": "Temporary files (your account)",
        "whatItIs": "…", "afterCleaning": "…",
        "size": 1, "risk": "low", "action": "clean", "needsAdmin": false, "preselect": true,
        "paths": [ "C:\\Users\\vinic\\AppData\\Local\\Temp" ], "lastUsed": null,
        "permanent": false, "regenerable": true, "inUseBy": [], "guide": null, "unreadable": false
      } ] } ] }
```
- `action` is one of `clean`, `guided` or `admin`. `needsAdmin` is true only when `action` is `admin`.
- `guide` is `{ steps: [string], copy?: string, open?: { kind: "steam"|"explorer"|"url", target }, url?: string }`. `url` is the `steam://` link of a game item (the server only opens `steam://` URLs).
- `checked` is the list of group labels the catalog looked at (shown as "what I checked"), in detector order and without repeats.
- Dev project items add `project: { root, name, lastTouched }`.
- Game items add `game: { appid, library, lastPlayed }`.
- `safeNow` is the sum of `size` for items with `risk = low`, `action = clean` and `needsAdmin = false`.
- `needsDecision` is the sum over everything else, including guided items such as games, vhdx and large files.

## POST /api/open
Body: `{ "itemId": "...", "kind": "explorer"|"steam-uninstall"|"steam-move" }`.
- The server opens only targets that belong to that item; the target is never taken from the client.

## GET /api/admin-script?items=a,b → `{ "script": "<exact PowerShell text>", "sha256": "…" }`

## POST /api/clean
Body: `{ "items": [ { "id": "system.user-temp", "mode": "trash" }, { "id": "dev.node_modules:abcd", "mode": "delete" } ] }`. `mode` is `trash` (default) or `delete`; `delete` on an item without `regenerable: true` returns 400. Each item may carry `confirmPermanent: true` (default false): without it, an item that would end up permanent (the Recycle Bin is too small for it) is not removed and fails with `reason: "would-be-permanent"`. Returns `202 { "jobId": "j1", "plan": [ { "itemId", "size", "permanent", "needsAdmin" } ] }`; `plan[].permanent` is true for `delete`, admin and command items, and for trash items that will not fit in the Recycle Bin.
- Unknown or stale IDs return 409 `STALE_ITEM` with the ids in `error.items`: `{ "error": { "code": "STALE_ITEM", "message": "…", "items": ["id"] } }`.
- Items whose `action` is `guided` return 400.
- Normal items run first; admin items then run as one UAC elevation.

## GET /api/clean/:jobId
```json
{ "jobId", "status": "running"|"done", "freed": 1, "movedToBin": 1, "deletedPermanently": 1,
  "items": [ { "itemId", "status": "done"|"failed"|"skipped", "freed": 1, "reason": "in-use"|"access-denied"|"not-found"|"too-deep"|"admin-declined"|"protected"|"outside-root"|"reparse"|"would-be-permanent"|null } ],
  "drive": { "root": "C:\\", "free": 1 } }
```

`reason` values: `in-use` (a file is open), `access-denied`, `not-found` (already gone; status `skipped`), `too-deep` (path too long), `admin-declined` (the person refused the UAC prompt), `protected` (the guard blocks the path, or admin cleanup is not available), `outside-root` and `reparse` (the target left the item's roots or is a link/junction; never followed), `would-be-permanent` (see `confirmPermanent`). A partly done item is `done` with the `reason` of the first failure.

## POST /api/recycle-bin/empty
Body: `{ "confirm": true }`. Runs `Clear-RecycleBin -Force` for the current user, not elevated. Returns `{ freed }`.

## Item ID rules
- IDs are stable within one catalog refresh.
- Dynamic items (projects, games, dumps) use `<catalogId>:<sha1(path)[0..12]>`.
- The server keeps a map `id → { paths, method, roots }`; the client never sends paths.
