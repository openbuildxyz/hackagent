# Permissions

HackAgent uses application-level permissions enforced in API routes. Do not rely on client-side UI checks for authorization.

## Roles

- **viewer**: regular participant/user. Can view public events, manage their own profile, register, and submit where allowed.
- **organizer**: can create and manage events they own. Cannot manage another organizer's event unless explicitly granted or admin.
- **reviewer**: can access assigned review workflows for specific events. Reviewer status is scoped by event assignment or invite.
- **admin**: can manage users, roles, audits, and operational settings.

If a deployment stores role data outside `users`, document the exact schema and keep role changes audited.

## Event ownership

`events.user_id` is the owner. Organizer routes must check that the authenticated user owns the target event before allowing edits, status transitions, registration management, project imports, reviewer management, or credit-spending operations.

A non-owner organizer must not operate on another organizer's event unless there is an explicit server-side grant.

## Reviewer access

Reviewer routes must verify that the current user is assigned to the event via reviewer invite/assignment tables before exposing submissions or accepting scores.

## Admin grants

Admin role changes should go through controlled admin API routes and be logged in `admin_audit_log`. Production-only emergency scripts should not be exposed to public users.

## API keys and agents

Agent-facing `/api/v1` routes authenticate with API keys and agent records. API keys must be scoped to the owning user and must not bypass event ownership checks unless the route is explicitly public/read-only.

## Server-side checks checklist

For each privileged API route, verify:

1. Authenticated user or valid API key exists.
2. User/agent owns or is assigned to the resource.
3. Requested event/project/registration belongs to the expected parent resource.
4. Credit-spending actions check balance before provider calls.
5. Admin-only routes reject non-admin users in production.
