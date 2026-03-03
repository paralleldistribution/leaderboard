import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://aevkhwguhmyrdwzgvvtp.supabase.co'
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFldmtod2d1aG15cmR3emd2dnRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDE2NjYsImV4cCI6MjA4NjUxNzY2Nn0.gDCyLoFQqAE0PQcekAWwhV_E9p15UYXe4_9fz7MZNl0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
