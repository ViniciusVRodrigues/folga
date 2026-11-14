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

## POST /api/scan/cancel → `{ "ok": true }`

## GET /api/events  (Server-Sent Events, token in the query string `?t=` because EventSource cannot set headers)
Events:
- `scan-progress` `{ scanId, files, dirs, bytes, current, unreadable, elapsedMs }`: at most every 250 ms.
- `scan-done` `{ scanId, partial, files, dirs, bytes, unreadable, elapsedMs }`
- `cleanup-progress` `{ category, done, total }` / `cleanup-done` `{ }`
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

## GET /api/cleanup
```json
{ "generatedAt": "…", "drive": { "root": "C:\\", "total": 1, "free": 1 },
  "summary": { "safeNow": 1, "needsDecision": 1 },
  "checked": [ "NVIDIA", "AMD", "Steam", "Chrome", "Edge", "Docker" ],
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
- `guide` is `{ steps: [string], copy?: string, open?: { kind: "steam"|"explorer"|"url", target } }`.
- Dev project items add `project: { root, name, lastTouched }`.
- Game items add `game: { appid, library, lastPlayed }`.
- `safeNow` is the sum of `size` for items with `risk = low`, `action = clean` and `needsAdmin = false`.
- `needsDecision` is the sum over everything else, including guided items such as games, vhdx and large files.

## POST /api/open
Body: `{ "itemId": "...", "kind": "explorer"|"steam-uninstall"|"steam-move" }`.
- The server opens only targets that belong to that item; the target is never taken from the client.

## GET /api/admin-script?items=a,b → `{ "script": "<exact PowerShell text>", "sha256": "…" }`

## POST /api/clean
Body: `{ "items": [ { "id": "system.user-temp", "mode": "trash" }, { "id": "dev.node_modules:abcd", "mode": "delete" } ] }`. `mode` is `trash` (default) or `delete`; `delete` on an item without `regenerable: true` returns 400. Returns `202 { "jobId": "j1", "plan": [ { "itemId", "size", "permanent", "needsAdmin" } ] }`.
- Unknown or stale IDs return 409 `STALE_ITEM` with the list.
- Items whose `action` is `guided` return 400.
- Normal items run first; admin items then run as one UAC elevation.

## GET /api/clean/:jobId
```json
{ "jobId", "status": "running"|"done", "freed": 1, "movedToBin": 1, "deletedPermanently": 1,
  "items": [ { "itemId", "status": "done"|"failed"|"skipped", "freed": 1, "reason": "in-use"|"access-denied"|"not-found"|"too-deep"|"admin-declined"|null } ],
  "drive": { "root": "C:\\", "free": 1 } }
```

## POST /api/recycle-bin/empty
Body: `{ "confirm": true }`. Runs `Clear-RecycleBin -Force` for the current user, not elevated. Returns `{ freed }`.

## Item ID rules
- IDs are stable within one catalog refresh.
- Dynamic items (projects, games, dumps) use `<catalogId>:<sha1(path)[0..12]>`.
- The server keeps a map `id → { paths, method, roots }`; the client never sends paths.
