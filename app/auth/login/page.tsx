import { redirect } from 'next/navigation'

export default async function AuthLoginRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = new URLSearchParams()
  const resolved = await searchParams
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string') params.set(key, value)
    else if (Array.isArray(value)) value.forEach(v => params.append(key, v))
  }
  const query = params.toString()
  redirect(query ? `/login?${query}` : '/login')
}
