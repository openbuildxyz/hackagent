# HackAgent Open Source Preparation Checklist

This repository is prepared for open source distribution when all items below are true.

## License

- [x] `LICENSE` exists.
- [x] `package.json` declares the license.

## Secrets

- [x] `.env*` files are ignored by git.
- [x] `.env.example` contains placeholders only and is committed.
- [x] Worker scripts require secrets from environment variables.
- [x] No service-role key or production worker secret fallback is committed.

## Documentation

- [x] `README.md` explains the project, setup, env vars, and worker usage.
- [x] `SECURITY.md` explains vulnerability reporting and secret handling.
- [x] `CONTRIBUTING.md` explains local development and PR expectations.

## CI

- [x] GitHub Actions workflow exists at `.github/workflows/ci.yml`.
- [x] `npm run validate:open-source` validates that `.env.example` exists and that Quick Start points at `openbuildxyz/hackagent`.
