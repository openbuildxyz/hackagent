import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service role admin client for DB operations (API routes and server components)
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
