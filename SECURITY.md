# Security Policy

## Reporting a vulnerability

Do not report vulnerabilities in public issues or discussions.

Send a private report to the maintainers through the official project contact channel. If no dedicated security mailbox is published for your deployment, contact the repository owner directly and include `SECURITY` in the subject.

Include:

- Affected version or commit.
- Reproduction steps.
- Impact assessment.
- Whether credentials, user data, billing data, or service-role access may be exposed.
- Suggested fix if available.

## Response expectations

- Initial acknowledgement: best effort within 72 hours.
- Triage update: best effort within 7 days.
- Fix timeline depends on severity and exploitability.

## Scope

In scope:

- Authentication and authorization bypasses.
- Service-role key, API token, or secret exposure.
- Cross-user data access.
- Stored XSS or remote code execution.
- Billing/credit abuse.

Out of scope:

- Social engineering.
- Denial-of-service without a concrete application bug.
- Vulnerabilities in third-party services not controlled by this project.

## Secret handling

This repository must not contain production `.env` files, real service-role keys, database URLs, email provider keys, model gateway keys, Vercel tokens, GitHub tokens, or real user data.

If a real secret has ever been committed to git history, consider it compromised and rotate it. Removing it from the current tree is not enough.
