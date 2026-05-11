import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://twdnhxxfkugqcgndutsh.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3ZG5oeHhma3VncWNnbmR1dHNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzOTAxMzcsImV4cCI6MjA5Mzk2NjEzN30.6xWgqP6N-EyFHVC4bdHEWvgyXerx9nlqM_uEL11qO4Y';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
