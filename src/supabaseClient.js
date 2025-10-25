import { createClient } from '@supabase/supabase-js'

// Centralized Supabase client so all components reuse the same instance.
// Prefer environment variables in production. For local development set:
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in a .env file (not checked in).
const FALLBACK_SUPABASE_URL = "https://uieniviriyblquryluxx.supabase.co"
const FALLBACK_SUPABASE_ANON_KEY = "sb_publishable_-L-eQJsyRREQZBO7dnTMPw_e2Se9VcF"

const SUPABASE_URL = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL
	? import.meta.env.VITE_SUPABASE_URL
	: FALLBACK_SUPABASE_URL

const SUPABASE_ANON_KEY = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY
	? import.meta.env.VITE_SUPABASE_ANON_KEY
	: FALLBACK_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Also expose on window for legacy code that expects a global (optional)
if (typeof window !== 'undefined') window.supabase = supabase

export default supabase
