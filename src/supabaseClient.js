import { createClient } from '@supabase/supabase-js'

// Centralized Supabase client so all components reuse the same instance.
// These values mirror what was previously in App.jsx. For local development
// you may prefer to use import.meta.env.VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
// and not check secrets into source control.
const SUPABASE_URL = "https://uieniviriyblquryluxx.supabase.co"
const SUPABASE_ANON_KEY = "sb_publishable_-L-eQJsyRREQZBO7dnTMPw_e2Se9VcF"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Also expose on window for legacy code that expects a global (optional)
if (typeof window !== 'undefined') window.supabase = supabase

export default supabase
