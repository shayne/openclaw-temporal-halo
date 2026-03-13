# Agent Notes (Public Repo)

This repository is public. Do not add personal data, real identifiers, or machine-specific absolute paths anywhere in tracked files.

## Tooling

- Use `mise` for all tooling and tasks.
- Common commands:
  - `mise install`
  - `mise run lint`
  - `mise run check-types`
  - `mise run test`

## Code Style

- TypeScript (ESM).
- Keep the plugin provider-agnostic: do not hardcode APIs for email/calendar/chat services.
- Prefer small, testable pure functions.

## Publishing

- Local publish (manual fallback): `mise run publish-npm`
- CI publish (preferred): GitHub Actions Trusted Publishing via `.github/workflows/release.yml`
  - Do not add npm tokens to repo secrets.

## OpenClaw Runtime Maintenance

- This repository ships the Temporal Halo plugin. OpenClaw runtime changes are maintained separately.
- Only cut a plugin release when tracked plugin code in this repository changes. Do not bump, tag, or publish the plugin to ship OpenClaw-only runtime fixes.
- Maintain runtime patches in a user-owned OpenClaw fork, not as unpushed local-only commits.
- Preferred OpenClaw remote layout:
  - `origin` = the user-owned fork
  - `upstream` = the official `openclaw/openclaw` repository
- Keep runtime fixes on named branches in the fork. Rebase or cherry-pick onto fresh `upstream/main` as needed, then push the branch before relying on it operationally.
- If plugin behavior depends on an OpenClaw runtime patch, record the required OpenClaw branch or commit in the relevant plan, PR, or release notes.
- Update local environments in two separate steps:
  - republish or reinstall the plugin only when this repository changed
  - rebuild or restart OpenClaw only when the runtime fork changed
