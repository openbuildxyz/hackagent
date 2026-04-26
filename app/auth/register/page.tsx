import { redirect } from 'next/navigation'

export default function AuthRegisterAlias() {
  redirect('/login?mode=register')
}
