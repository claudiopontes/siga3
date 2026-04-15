import { createClient, SupabaseClient } from '@supabase/supabase-js'
import 'dotenv/config'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // service_role: acesso total (só no ETL)
  )
  return client
}
