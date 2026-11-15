# Design — MVP (Windows)

## Decisões da pessoa (2026-11-14)
- Visual: "Ferramenta sóbria" (direção A do ux-ui): neutro claro e escuro, destaque azul, segue `prefers-color-scheme`, botão para alternar.
- Idioma: pt-BR no MVP; todas as strings em `web/i18n/pt-BR.js`, plurais com `Intl.PluralRules`, datas e números com `Intl`; inglês depois.
- Lixeira: por padrão vai para a Lixeira. Itens marcados `regenerable` (shaders, Temp, node_modules, dist/target/build, caches de pacotes) podem ser apagados definitivamente por escolha explícita da pessoa no modal, sempre com confirmação.
- Só Windows no MVP; Linux e macOS depois, com a porta aberta na arquitetura.

## Stack
- Node.js >= 20, ESM, no build step. Only runtime dependency: `trash` (MIT, uses bundled `windows-trash.exe`, the sindresorhus/recycle-bin binary).
- UI: static HTML + vanilla JS modules + CSS in `web/`, served by the same server. No framework.
- Tests: `node --test` (built-in). Pure UI logic (treemap layout, formatting, selection) lives in `web/lib/*.js` and is tested by node too.
- Entry: `bin/folga.js` → `npx folga` / `npm start`. Opens the browser at `http://127.0.0.1:<port>/#t=<token>`.

Why: no MFT reader exists on npm, and MFT needs admin, which conflicts with a never-elevated local app. A parallel Node walker is enough for the MVP; a Rust/MFT helper is possible later behind the same scanner interface.
Sources:
- WizTree reads the NTFS MFT and needs admin; Rust `ntfs-reader` crate: https://docs.rs/crate/ntfs-reader/latest
- kondo markers (project marker → artifacts): https://github.com/tbillington/kondo/blob/master/kondo-lib/src/lib.rs
- npkill (project last_mod, sensitive targets hidden): https://github.com/voidcosmos/npkill
- trash 10.x (ESM, Node >= 20, Windows binary): https://github.com/sindresorhus/trash — issue #107, a disabled Recycle Bin deletes for good: https://github.com/sindresorhus/trash/issues/107
- SHFileOperation / FOF_ALLOWUNDO, DE_PATHTOODEEP: https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shfileoperationa
- MAX_PATH and the `\\?\` prefix: https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation
- pnpm store prune (never delete the store folder): https://pnpm.io/cli/store

## Platform seam
`src/platform/index.js` exports `{ locations(), recycle, protectedPaths(), elevate }`. Only `win32.js` is implemented; on other platforms the app runs "What's big" and Dev only. Linux and macOS are out of scope for the MVP.

## Security (requirements)
1. Bind to `127.0.0.1` only. Port 0 by default (random free port), override with `--port`.
2. Each launch generates a 32-byte random token. Every `/api/*` call requires the header `X-Token: <token>`; the UI reads it from the URL hash, which never reaches the server or logs.
3. Reject with 403 when `Host` is not `127.0.0.1:<port>` or `localhost:<port>` (DNS rebinding), or when an `Origin` header is present and is not the app's own origin.
4. CSP: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'`. Plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
5. The client never sends paths to delete. It sends item IDs of the current scan session; the server resolves them.
6. Guard (`src/clean/guard.js`) runs again right before each delete:
   - the path still exists and is the same kind (dir/file);
   - neither it nor any ancestor up to the allowed root is a reparse point (symlink/junction);
   - it is under the catalog entry's allowed root;
   - it is not a protected path (drive roots, `%WINDIR%` except the allow-listed subfolders, Program Files, ProgramData root, user profile root and its first-level known folders, `$Recycle.Bin`, `System Volume Information`, pagefile/hiberfil).
7. Cleaning goes through `trash` (Recycle Bin) by default, or an official command, or, for admin items, a fixed elevated script. Permanent delete (`mode: "delete"`) is allowed only for items with `regenerable: true` and uses our own `src/clean/remove.js`: it walks with `lstat`, unlinks reparse points (symlinks and junctions) without descending into them, and never calls `fs.rm({recursive})` on a path that is not re-validated by the guard. A test puts a junction inside a fixture `node_modules` that points to a folder outside it, and the target must survive.
8. Admin: the app never runs elevated. Admin items run through `powershell -NoProfile -EncodedCommand <base64>` started with `Start-Process -Verb RunAs`. The script is built only from fixed catalog paths (env-expanded on the server), never from client input, and has no temp file that could be swapped. `GET /api/admin-script` returns the exact text that will run, and a test compares hashes.
9. Recycle Bin truth:
   - Before cleaning, read `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\BitBucket\Volume\{GUID}` (`NukeOnDelete`, `MaxCapacity`) for the volume.
   - Items larger than the quota, or on a volume with the bin off, are flagged `permanent: true`, and the modal says "Deletes permanently".
   - If `trash` fails (path too deep, in use), report the failure. Never fall back silently to a permanent delete.
10. No telemetry, no network calls. The only outbound action is launching `steam://` URLs and `explorer.exe` on user click.

## Scanner
- `src/scan/walk.js`: async, concurrency-limited (64 in flight). `UV_THREADPOOL_SIZE=32` is set in `bin` before any I/O.
- `readdir(withFileTypes)` + `lstat(bigint)`.
- Does not follow symlinks or junctions.
- Hard links (nlink > 1) are deduplicated by `ino`.
- Records both the logical size and the allocated size (rounded to 4 KiB clusters).
- Long paths use the `\\?\` prefix when the path is longer than 240 characters.
- `EPERM`/`EACCES`/`EBUSY` count toward `unreadable` and the folder is marked `noAccess`.
- Tree: each dir node keeps `{name, size, alloc, files, dirs, children[dirs], topFiles[≤50], otherFiles{count,size}, noAccess, mtime}`. Large files (≥ 500 MiB) are also collected globally.
- Cancel is an AbortSignal; the partial result is kept with `partial: true`.

## Catalog (cleanup detectors)
`src/catalog/*.js`: each entry is data plus a `detect(ctx)` function.

```
{ id, category, name, whatItIs, afterCleaning, risk: 'low'|'medium'|'high',
  action: 'clean'|'guided'|'admin', method: 'trash'|'trash-contents'|'command'|'admin-contents'|null,
  roots: [allowed root], paths: [...], command?, guide?: {steps[], copy?}, preselect: bool }
```

The Overview does not wait for the full disk scan: the catalog measures its known locations directly (small, targeted walks), in parallel.

Categories and items (from the ARM-0 x-ray of this PC, plus the new scope):
- **System:**
  - user Temp (`trash-contents`, low);
  - Windows Temp (admin);
  - Windows Update download cache `SoftwareDistribution\Download` (admin);
  - WER user (low) and WER system `ProgramData\Microsoft\Windows\WER` (admin);
  - `Windows\Logs` (admin, medium);
  - thumbnail cache `thumbcache_*.db` (low);
  - Prefetch (admin, low, not preselected);
  - CrashDumps (low);
  - Recycle Bin (guided: "Empty Recycle Bin…", its own confirm, via `Clear-RecycleBin` — run by the app after a separate confirm, not elevated);
  - WinSxS (guided, DISM).
- **Graphics:**
  - NVIDIA `%LOCALAPPDATA%\NVIDIA\DXCache`, `GLCache`, `%PROGRAMDATA%\NVIDIA Corporation\NV_Cache`;
  - AMD `%LOCALAPPDATA%\AMD\DxCache`, `GLCache`, `VkCache`, `DxcCache`;
  - DirectX `%LOCALAPPDATA%\D3DSCache`;
  - Steam `steamapps\shadercache`.
  - All low risk.
- **Browsers:**
  - Chrome and Edge profiles `Cache`, `Code Cache`, `GPUCache` (low).
  - `Service Worker`, `WebStorage` (medium, not preselected).
  - Never Cookies, Login Data, Local Storage, IndexedDB.
- **Apps:** Discord, Spotify, Teams caches, VS Code `workspaceStorage` (medium), `CachedData`.
- **Dev:**
  - project artifacts by marker (kondo table: node_modules, .next, dist, build, target, .turbo, .venv/venv, __pycache__, .gradle, bin/obj …), only when the marker is in the parent, with `lastTouched` = newest mtime of the project's non-artifact top-level files;
  - caches: npm (`npm cache clean --force`), pnpm (`pnpm store prune`), yarn (`yarn cache clean`), pip (`pip cache purge`), uv (`uv cache clean`), NuGet (`dotnet nuget locals all --clear`), Gradle `~\.gradle\caches` (trash), Cargo registry (trash, medium), Go mod (`go clean -modcache`), Playwright browsers (trash);
  - dumps `*.hprof`, `*.dmp` (low);
  - AI models `*.gguf`, `*.safetensors` (medium);
  - Docker / WSL vhdx (guided: `docker system prune`, then `wsl --shutdown` + compact steps).
- **Games:** Steam libraries from `libraryfolders.vdf`, games from `appmanifest_*.acf` (`name`, `SizeOnDisk`, `LastPlayed`). Guided: `steam://uninstall/<appid>`, and "Move in Steam" with steps.
- **Downloads:** `.exe`/`.msi`/`.zip`/`.iso`/`.7z` older than 30 days (medium, not preselected).
- **Large files:** from the full scan, guided ("Open in Explorer").

Commands run with `execFile` (no shell), with a fixed argv and a timeout, and only when the tool exists on PATH. Size is measured before and after.

## API (contract) — see `contract.md`

## Packages
1. Core: bin, server and security, walker, "What's big" API, SSE progress.
2a. Catalog and detectors and the `/api/cleanup` API (parallel with 2b).
2b. Web UI against fixtures (parallel with 2a).
3. Cleaner: guard, trash, commands, quota check, `/api/clean`, the Empty Recycle Bin flow.
4. Admin/UAC elevation (last; can slip without blocking done).
