-- Add all potentially missing columns to the clients table
-- Basic Info
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "clientName" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "clientEmail" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "clientPhone" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "clientRole" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "preferredContactMethod" TEXT;

-- Company Details
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "companyNumber" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "companyAddress" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "sicCode" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "companyStatus" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "incorporationDate" TEXT;

-- Key Dates
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "yearEndDate" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "nextAccountsDue" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "nextConfirmationStatementDue" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "vatFilingFrequency" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "nextVatDue" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "payrollDeadlines" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "corporationTaxDeadline" TEXT;

-- Services & Engagement
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "services" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "engagementLetterStatus" TEXT;

-- Task & Documents
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "requiredDocuments" JSONB DEFAULT '{}'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "taskStatus" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "recentFiles" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "lastInteractionNotes" TEXT;

-- Automations
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "reminderSchedule" JSONB DEFAULT '{}'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "customAlerts" JSONB DEFAULT '{}'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "automatedEmails" BOOLEAN DEFAULT TRUE;

-- Financial Summary
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "lastYearTurnover" NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "profitLoss" NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "taxOwed" NUMERIC DEFAULT 0;

-- Notes & History
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "meetingLog" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS "emailHistory" JSONB DEFAULT '[]'::jsonb; 