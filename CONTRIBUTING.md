# Contributing

Issues and focused PRs are welcome. Include your OS, Zotero version, EasyRead version, and installation type when reporting a problem. Redact personal paths, paper contents, runtime tokens, and model credentials from logs.

Run the Node and Python suites listed in README before sending a PR. For an application-integration change, test with a separate Zotero profile and EasyRead data directory; never use someone else's library as a fixture. Describe which real application versions were tested.

Keep changes scoped and explain the user-visible behavior and validation. Do not commit `test-work`, backups, installation receipts, patched application archives, or PDFs. CI verifies core logic across operating systems; do not describe that as real application compatibility without separate evidence.

For upstream EasyRead improvements, follow [EasyRead's contribution guide](https://github.com/Edwardxlai/easyread/blob/main/CONTRIBUTING.md).
