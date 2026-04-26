# Roadmap

This roadmap is directional, not a commitment to specific dates.

## Current focus

- Harden the open-source release package.
- Keep the hosted production service stable.
- Improve local setup, demo data, and contribution flow.

## Near term

- Complete public documentation for architecture, deployment, permissions, and database setup.
- Add automated CI once a GitHub token with `workflow` scope and repo write permission is available.
- Add a small test suite around auth, permissions, event status transitions, and API key flows.
- Improve demo seed coverage for reviewer and agent workflows.

## Mid term

- Better admin tools for role management and audit review.
- More robust queue/worker observability.
- First-class support for external model gateways.
- Exportable event reports and public results pages.

## Not planned

- Shipping production secrets or real customer data in the open repository.
- Restricting commercial usage of the code beyond the Apache-2.0 license.
- Allowing unofficial forks to impersonate the official HackAgent brand.
