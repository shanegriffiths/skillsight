# Publishing skillsight

The release process for the `skillsight` npm package — first-time setup, the
per-release checklist, and the security practices behind it. Read it top to
bottom the first time; after that, the **Every release** list is the day-to-day.

`skillsight` publishes as an **unscoped, public** package (`skillsight`), which
is ideal for a `npx skillsight` CLI. The GitHub repo and the npm package are
independent — the repo can live under any org; the npm name stays `skillsight`.

---

## Launch to-do (revisit)

Status board for the first release. The reference process is in the sections
below; this is what's actually left. Last reviewed 2026-07-06.

### Done
- [x] Package identity: unscoped `skillsight`; `repository`/`homepage`/`bugs` → `github.com/shanegriffiths/skillsight`.
- [x] `files` allowlist, `prepublishOnly` build, committed lockfile, **no lifecycle scripts**.
- [x] `engines.node` `>=22`; dead deps removed; tarball verified (`dist` + `README` + `LICENSE`, ~31 kB).
- [x] Privacy/security posture documented (README) + `SECURITY.md`.
- [x] Security checks run: `npm audit` = 1 low, **dev-only** (esbuild via tsup/vitest — not shipped); source has no network calls / no filesystem writes / no subprocess execution; git history clean of secrets and sensitive files.

### Only you can do (accounts & publish)
- [ ] Create the public repo `shanegriffiths/skillsight` and push `main`.
- [ ] Create an npm account and **enable 2FA** ("Authorization and Publishing" level).
- [ ] Run a full secret scan once before the repo goes public: `brew install gitleaks && gitleaks detect`.
- [ ] `npm publish --dry-run`, then `npm publish`; `git push --follow-tags`; verify with `npx skillsight@latest`.

### Deferred polish (nice-to-have, revisit)
- [ ] **GitHub Actions release workflow** — tests on PR, publish-on-tag with `--provenance` via OIDC trusted publishing (no stored token). Highest-leverage: turns a release into `git tag` + push.
- [ ] **README badges** — npm version, node, license (render once published).
- [ ] **`npm audit fix`** — clear the dev-only esbuild advisory.
- [ ] **Packed-install smoke test** — `npm pack` → `npm i -g ./skillsight-*.tgz` → run → `npm rm -g skillsight`, proving the published binary works end-to-end.

---

## One-time setup

### npm account
- [ ] Create / log in to an npm account: `npm login` (or `npm adduser`).
- [ ] **Enable 2FA at the "Authorization and Publishing" level** (npmjs.com → Account → Two-Factor Authentication). Use an authenticator app or a passkey/WebAuthn. This is the single most important account-security step — it means a leaked password alone can't publish.
- [ ] Confirm the name is free: `npm view skillsight` → a 404 means it's available.

### Repo
- [ ] Create the public repo under your org and push `main`.
- [ ] Make sure `repository`, `homepage`, and `bugs` in `package.json` point at it.
- [ ] **Secret-scan the history before it goes public** (see Security checklist).
- [ ] Add a `SECURITY.md` with a disclosure contact (optional but expected for public tools).

---

## Every release

1. [ ] Clean tree, on `main`, up to date: `git status`.
2. [ ] Clean install from the lockfile: `npm ci`.
3. [ ] Green checks: `npm run typecheck && npm test`.
4. [ ] Fresh build: `npm run build`.
5. [ ] `npm audit` — no vulnerabilities in **shipped** (runtime) deps. Dev-only findings are acceptable; note them (see below).
6. [ ] Inspect the tarball: `npm pack --dry-run`. It must contain only `dist/`, `README.md`, `LICENSE`, `package.json` — no source, tests, `.env`, or machine-local files.
7. [ ] Smoke-test the packed artifact end-to-end:
   ```sh
   npm pack                               # produces skillsight-x.y.z.tgz
   npm i -g ./skillsight-x.y.z.tgz
   skillsight --report && skillsight --json | head
   npm rm -g skillsight
   ```
8. [ ] Bump the version (creates a commit + tag): `npm version patch|minor|major`.
9. [ ] Publish: `npm publish` (add `--provenance` when publishing from CI — see below).
10. [ ] Push the tag: `git push --follow-tags`.
11. [ ] Verify live: `npm view skillsight version`, then `npx skillsight@latest` in an empty directory.

---

## Provenance & trusted publishing (recommended once it's live)

Publishing from CI with **provenance** attaches a signed, verifiable record of
exactly which repo, commit, and workflow built the package. npmjs.com shows a
"Provenance" badge, and it's the strongest supply-chain trust signal you can
give users.

- **Best practice:** GitHub Actions + npm **Trusted Publishing** (OIDC) — no
  long-lived npm token stored anywhere. You register the trusted publisher on
  the package's npm settings page, add a release workflow, and the workflow
  runs `npm publish --provenance`. Tokens can't leak because there aren't any.
- **Until then**, local `npm publish` with 2FA is fine for early releases;
  provenance simply isn't available for local publishes.

_A ready-to-use `.github/workflows/release.yml` (test on PR, publish on tag with
provenance) can be added when you want to move off local publishing — ask for it._

---

## Security checklist

Before the repo goes public and before the first publish:

- [ ] **Secret-scan the git history:** `gitleaks detect` or `trufflehog git file://.`. skillsight reads secrets but never persists them — this catches anything accidental (tokens, `.env`, the machine-local `.claude/settings.local.json`).
- [ ] **`.gitignore` covers** `node_modules`, `dist`, `.env*`, and `.claude/settings.local.json` (already ignored).
- [ ] **Tarball is governed by a `files` allowlist**, not `.npmignore` — already set to `dist`, `README.md`, `LICENSE`. Allowlists fail safe (a stray file isn't shipped by accident).
- [ ] **`prepublishOnly: npm run build`** guarantees a fresh `dist` ships — already set.
- [ ] **No lifecycle scripts** (`postinstall`/`preinstall`) in skillsight. These are a common supply-chain attack vector; keep it that way, and consider `npm install --ignore-scripts` in CI.
- [ ] **Lockfile committed** (`package-lock.json`) for reproducible installs.
- [ ] **Minimal, mainstream deps** (7 runtime). Re-run `npm audit` each release; optionally `npm audit signatures` to verify the registry signatures of installed deps.

### The tool's own security posture (verified)

skillsight is intentionally low-risk to run against a real machine:

- **read-only** — no filesystem writes anywhere;
- **no network** — zero http/network calls, no telemetry;
- **no subprocess execution** — never spawns a process or evals config;
- **secrets are key-names-only** — MCP `env`/`headers` values are never read or emitted.

### Current audit status

`npm audit` reports **one low-severity finding in `esbuild`**, reached only via
`tsup`/`tsx`/`vitest` — all **devDependencies**. It is not in the published
tarball (which ships `dist` only) and concerns the esbuild dev-server on
Windows, which this project never runs. Clear it whenever convenient with
`npm audit fix`; it has no effect on installed users.

---

## Notes & gotchas

- **Unpublish window:** you can `npm unpublish` within **72 hours** of a publish; after that you can only `npm deprecate <pkg>@<version>`. So get `0.1.0` right, or use `0.0.x` for any throwaway test publishes.
- **Semver:** a `0.x` version signals an unstable public API — appropriate for a first release. Move to `1.0.0` when you're ready to commit to the CLI flags and the `--json` schema as a contract.
- **`engines.node` is `>=22`** (Ink 7's requirement). npm only *warns* on mismatch; it doesn't block install.
- **Scoped vs unscoped:** we publish unscoped (`skillsight`). If you ever scope it (`@your-org/skillsight`), scoped packages are private by default — add `"publishConfig": { "access": "public" }` or publish with `--access public`.
