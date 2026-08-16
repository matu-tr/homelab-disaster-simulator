# Security Policy

## Supported Versions

Only the latest released version (`latest` tag / most recent `vX.Y.Z` release)
is supported with security fixes.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report it privately via
[GitHub Security Advisories](https://github.com/matu-tr/homelab-disaster-simulator/security/advisories/new)
for this repository. Include:

- A description of the vulnerability and its impact
- Steps to reproduce
- Affected version(s)

You should receive a response within a few days. Once a fix is confirmed, a
new release will be published and the advisory disclosed.

## Scope notes

The app is read-only by design: it reads from the local Docker socket and,
optionally, the TrueNAS API, and stores its own settings (TrueNAS URL/API key,
public URL, backup job definitions) in a local SQLite file. Reports involving
credential handling (e.g. how the TrueNAS API key is stored or transmitted)
are very much in scope.
