-- Add the automatedEmails column to the clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "automatedEmails" BOOLEAN DEFAULT TRUE; 