/**
 * Supabase client for server-side operations.
 * Uses the SERVICE_ROLE_KEY which bypasses Row Level Security —
 * this is the backend, so full access is needed for inserts/updates.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabase;
