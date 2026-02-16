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
