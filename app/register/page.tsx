import { redirect } from 'next/navigation'

// /register is an alias for /login (sign-up tab inside the same page).
// Kept as a permanent redirect so external links / docs don't 404.
export default function RegisterAlias() {
  redirect('/login?mode=register')
}
