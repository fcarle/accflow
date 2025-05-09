-- Add the recent_files column to the clients table if it doesn't exist
ALTER TABLE clients ADD COLUMN IF NOT EXISTS recent_files JSONB DEFAULT '[]'::jsonb; 