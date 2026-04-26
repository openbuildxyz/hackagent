import { cookies } from 'next/headers'
import type { Locale } from './i18n'

export const LOCALE_COOKIE = 'hackagent-locale'

/** Read the locale from cookies on the server. Defaults to 'zh'. */
export async function getServerLocale(): Promise<Locale> {
  const c = await cookies()
  const v = c.get(LOCALE_COOKIE)?.value
  return v === 'en' ? 'en' : 'zh'
}
