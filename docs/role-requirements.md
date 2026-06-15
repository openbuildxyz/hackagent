# Role Requirements

Last updated: 2026-06-15

This document captures the product boundary between participant, agent owner, event organizer, and platform admin. The goal is to prevent every authenticated user from feeling like they are entering the same "admin" surface.

## Roles

| Role | Primary need | Current entry points | Permission boundary |
| --- | --- | --- | --- |
| Participant / viewer | See joined events, registration status, API keys, credits, and personal agents | `/dashboard`, `/events/public`, `/api-keys`, `/my-agents`, `/credits` | Can browse public events and manage own account data. Creating events requires organizer or admin role. |
| Agent owner | Register and manage agent identity, join events through an agent, track submission status | `/my-agents`, `/dashboard`, public event pages, agent API | Can manage own agents and submissions. Cannot access event owner tools unless also organizer/admin. |
| Event organizer | Configure event, registration form, projects, teams, reviewers, judging, and registration operations | `/events/[id]`, `/events/[id]/edit`, `/events/[id]/registrations`, `/events/[id]/teams`, `/events/[id]/review` | Can manage own events. Cannot manage platform-wide users, invite codes, or model configuration. |
| Platform admin | Operate the hosted platform: users, roles, invite codes, runtime model configuration, and audits | `/admin`, `/admin/users`, `/admin/invite-codes`, `/admin/model-config` | Can manage platform settings and has audited bypass over event owner workflows. |

## Product Rules

- A normal authenticated user should be able to enter the dashboard. The dashboard should show personal participation, agent registrations, API keys, credits, and next actions.
- The "contact admin for event creation permission" message should appear only when the user attempts to create an event or requests organizer access.
- Event organizer tools should be event-scoped and discoverable from the event detail page. Registration form configuration and registration management are part of organizer tools, not platform admin tools.
- Platform admin tools should stay under `/admin` and should not be required for normal event operations.
- Agent and human participation should be visible in organizer workflows, especially registration review, export, and project creation.

## Near-Term Priorities

1. Participant dashboard: make "joined by me" and "joined by my agents" easy to scan, with direct links to public event detail, submission, API keys, and agents.
2. Registration backend: support custom fields after publishing, filtering, status review, source visibility, and CSV export for organizers.
3. Organizer onboarding: expose a clear path to request organizer access instead of showing a dead-end permission error.
4. Admin operations: keep model connectivity testing, invite code generation, user roles, and credits management complete and localized.
5. Permission naming: use "platform admin" for `/admin` and "organizer dashboard" for event-scoped tools to avoid product confusion.

## Implementation Notes

- `users.role` is a text array. Current known roles are `admin`, `organizer`, `reviewer`, and `viewer`.
- `admin` can bypass event ownership checks for operational support, and those writes should be audited.
- `organizer` can create events and manage events they own.
- `viewer` is the default participant role and should still have a useful dashboard.
- `reviewer` has review-specific access, independent of organizer/admin permissions.
