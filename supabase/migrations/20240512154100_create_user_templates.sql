-- Migration to create user_templates table for user-specific template customizations

-- Create the user_templates table 
CREATE TABLE public.user_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  schedule_index INT NOT NULL DEFAULT 0,
  message_template TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Each user can only have one override per alert_type and schedule_index
  UNIQUE(user_id, alert_type, schedule_index)
);

-- Add comments
COMMENT ON TABLE public.user_templates IS 'Stores user-specific overrides for alert templates';
COMMENT ON COLUMN public.user_templates.user_id IS 'The user who owns this template override';
COMMENT ON COLUMN public.user_templates.alert_type IS 'The type of alert this template is for';
COMMENT ON COLUMN public.user_templates.schedule_index IS 'Index of the schedule (0 = primary, 1 = first follow-up, etc.)';
COMMENT ON COLUMN public.user_templates.message_template IS 'The HTML message template content, supporting placeholders';

-- Add RLS policies (ensure users can only access their own templates)
ALTER TABLE public.user_templates ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own templates
CREATE POLICY "Users can view their own templates" 
ON public.user_templates FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to insert their own templates
CREATE POLICY "Users can create their own templates" 
ON public.user_templates FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own templates
CREATE POLICY "Users can update their own templates" 
ON public.user_templates FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own templates
CREATE POLICY "Users can delete their own templates" 
ON public.user_templates FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Add a trigger to update updated_at timestamp automatically
CREATE TRIGGER set_user_templates_timestamp
BEFORE UPDATE ON public.user_templates
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp(); 