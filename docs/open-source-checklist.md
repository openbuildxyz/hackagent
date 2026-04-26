# HackAgent Open Source Preparation Checklist

This repository is prepared for open source distribution when all items below are true.

## License

- [x] `LICENSE` exists.
- [x] `package.json` declares the license.

## Secrets

- [x] `.env*` files are ignored by git.
- [x] `.env.local.example` contains placeholders only.
- [x] Worker scripts require secrets from environment variables.
- [x] No service-role key or production worker secret fallback is committed.

## Documentation

- [x] `README.md` explains the project, setup, env vars, and worker usage.
- [x] `SECURITY.md` explains vulnerability reporting and secret handling.
- [x] `CONTRIBUTING.md` explains local development and PR expectations.

## CI

- [x] GitHub Actions workflow template exists at `docs/ci/github-actions.yml`.
- [ ] Enable it by copying to `.github/workflows/ci.yml` after a GitHub token with `workflow` scope is available for `jueduizone/hackagent`.
