# Security Policy

## Reporting a vulnerability

If you find a security issue in skillsight, please report it privately rather
than opening a public issue:

- Email **shane@studiobr.io** with the details and, if possible, steps to reproduce.
- Or use GitHub's **[Private vulnerability reporting](https://github.com/shanegriffiths/skillsight/security/advisories/new)** on this repository.

You'll get an acknowledgement as soon as possible, and a fix or mitigation
coordinated before any public disclosure.

## Scope & posture

skillsight is a **read-only, offline** inventory tool. By design it:

- never writes, moves, or deletes files;
- makes no network calls (no telemetry, no phone-home);
- never executes subprocesses or evaluates configuration;
- reduces MCP `env`/`headers` to **key names only** — secret values are never read into memory or emitted.

The most relevant classes of issue are therefore: accidental disclosure of a
secret value in any output mode, a path-traversal or symlink-resolution flaw
during the scan, or a supply-chain issue in a dependency. Reports in those
areas are especially welcome.

## Supported versions

skillsight is pre-1.0; fixes land on the latest published version.
