import { redirect } from 'next/navigation'

// Canonical URL is /dashboard. Kept as a compat redirect for existing
// bookmarks and links that point at /events.
export default function EventsRedirect() {
  redirect('/dashboard')
}
