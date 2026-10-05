# Validation

## Verified environment

Windows, Zotero `10.0.5-beta.2+c65dcb1cd`, EasyRead `1.3.0` and `1.3.2`.

Version 0.1.1 additionally passed 18 real Zotero/backend checks using EasyRead 1.3.2 and documented API v1, including note persistence, reuse, edited-note preservation and full fingerprints. Compatibility unit tests cover migrated-directory discovery, old/custom homes, unknown API rejection, native desktop links and documented note reads.

The installed plugin was also verified against the migrated real library: it resolved `<installation>/data`, negotiated API v1, verified a linked PDF's full fingerprint, read documented note parts and dispatched the official native desktop link. A temporary read-only diagnostic hook was removed after verification. No EasyRead archive patch was installed for 1.3.2.

The initial local implementation passed 6 Node tests, 2 Python archive tests, 18 real Zotero/backend checks, and 5 real restart/Electron checks. Application tests used synthetic PDFs and separate profiles/data directories. The installed local extension was subsequently confirmed active, with both menu groups registered and matching desktop/backend addresses.

The public package removes machine-specific defaults and recovery scripts. Its core unit tests run without installed applications. Generic public installation scripts have been checked for PowerShell syntax; automated live installation across multiple Windows configurations has not been performed.

## Core checks

```bash
node --test tests/core.test.cjs tests/compat.test.cjs
python -m unittest discover -s tests -p "test_*.py" -v
```

Checks cover rendering/escaping, page and paragraph links, optional AI/context, local URL validation, navigation acknowledgement, archive assets, idempotence, and rejection of unknown Electron layouts. The Python suite uses a synthetic ASAR fixture and does not require installed EasyRead.

## Optional real application tests (Windows)

These are development harnesses, not an unattended installer. They write only to `test-work/`, which is excluded from Git. Use Node 22+, Python 3.10+, and the verified application versions.

1. Run `python tests/setup_native.py` to create a separate Zotero profile and synthetic PDFs. It disables sync for the test profile; do not point it at a real library.
2. Launch the EasyRead bundled backend with `EASYREAD_HOME` set to the absolute `test-work/easyread-home` directory and arguments `serve --port 0`. That fixture disables automatic translation. Keep this process running.
3. Launch Zotero with `-no-remote -profile <absolute test-work/profile> -purgecaches`. The harness performs 18 checks, writes `test-work/native-report.json`, then quits the test application. Confirm `ok=true`.
4. Run `python tests/setup_desktop.py --source <EasyRead installation directory>`. This makes a disposable desktop copy with a fixed separate home and window profile. It never modifies the installed program.
5. Run `python tests/setup_restart.py`, then launch the same isolated Zotero profile again. Confirm all 5 checks and `ok=true` in `test-work/restart-report.json`.
6. Close the disposable desktop normally and shut down the separate backend through its authenticated local shutdown API. Do not publish the generated profiles, logs, PDFs, or reports.

An OS-level sandbox may block Electron from starting from a workspace directory. The original desktop integration check used normal desktop application execution with Electron's default sandbox intact.

## Limits

Cross-platform CI checks core logic only. macOS/Linux desktop patch installation and other Zotero versions are not verified. Sync is manual and one-way; native PDF highlight coordinates and bidirectional merging are outside this release. Future EasyRead versions may require updated APIs or desktop patches.
