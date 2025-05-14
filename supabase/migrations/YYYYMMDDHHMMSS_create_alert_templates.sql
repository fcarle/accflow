-- Create the default_alert_templates table to store master templates
CREATE TABLE public.default_alert_templates (
    alert_type TEXT PRIMARY KEY NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.default_alert_templates IS 'Stores master default message templates for client alerts that are copied to new users.';
COMMENT ON COLUMN public.default_alert_templates.alert_type IS 'The unique identifier for the alert type (e.g., NEXT_ACCOUNTS_DUE).';
COMMENT ON COLUMN public.default_alert_templates.subject IS 'The default subject line for the alert.';
COMMENT ON COLUMN public.default_alert_templates.body IS 'The default HTML message body content, supporting placeholders.';

-- Insert initial default templates into default_alert_templates
INSERT INTO public.default_alert_templates (alert_type, subject, body) VALUES
('NEXT_ACCOUNTS_DUE', 'Reminder: Accounts Due for {{company_name}}', '<p>Dear {{client_name}},</p><p>I hope this email finds you well.</p><p>I am writing to remind you that your company''s statutory accounts for {{company_name}} are due to be filed with Companies House by <strong>{{due_date}}</strong>.</p><p>To ensure we meet this statutory deadline and avoid any late filing penalties (which begin at £150 for accounts overdue by less than 1 month, and increase substantially thereafter), we would appreciate if you could:</p><ul><li>Confirm that all business transactions up to your year-end have been properly recorded</li><li>Provide any outstanding bank statements, invoices, or receipts we have previously requested</li><li>Review and approve any draft accounts we have already sent to you</li></ul><p>For your convenience, you can securely upload any outstanding documentation through your client portal: <a href="{{client_portal_link}}">Access Your Client Portal</a></p><p>Please be aware that Companies House does not provide extensions except in very exceptional circumstances, so prompt attention to this matter is highly recommended.</p><p>Should you have any questions regarding your accounts or require clarification on any items we need from you, please do not hesitate to contact me directly.</p>'),
('NEXT_CONFIRMATION_STATEMENT_DUE', 'Reminder: Confirmation Statement Due for {{company_name}}', '<p>Dear {{client_name}},</p><p>I trust this email finds you well.</p><p>This is a courtesy reminder that your company''s confirmation statement is due to be filed with Companies House by <strong>{{due_date}}</strong>.</p><p>The confirmation statement (which replaced the annual return in 2016) is a statutory filing that confirms the information Companies House holds about your company is correct and up-to-date.</p><p>Please review and confirm the accuracy of the following information:</p><ul><li>Registered office address</li><li>Directors'' details (names, addresses, dates of birth, nationalities, occupations)</li><li>Company secretary details (if applicable)</li><li>Shareholders'' information and share capital</li><li>People with Significant Control (PSC) details</li><li>Standard Industrial Classification (SIC) codes</li></ul><p>If there are any changes to the above information, please inform us promptly so we can make the necessary updates before filing.</p><p>You can review your company information through your secure client portal: <a href="{{client_portal_link}}">Access Your Client Portal</a></p><p>Failure to file the confirmation statement on time is a criminal offence and may result in the company and its officers being prosecuted. Companies House may also initiate proceedings to strike off the company from the register.</p><p>Should you have any questions or require assistance with this matter, please don''t hesitate to contact me.</p>'),
('NEXT_VAT_DUE', 'Reminder: VAT Return Due', '<p>Dear {{client_name}},</p><p>I hope you are keeping well.</p><p>I am writing to remind you that your next VAT return is due to be submitted to HMRC by <strong>{{due_date}}</strong>.</p><p>To ensure we can prepare and submit your VAT return accurately and on time, please provide the following as soon as possible:</p><ul><li>All sales invoices issued during the period</li><li>All purchase invoices received during the period</li><li>Bank statements covering the entire VAT quarter</li><li>Details of any cash transactions not recorded through the bank</li><li>Information about any unusual or significant transactions</li><li>For any capital expenditure items, please provide full details and supporting documentation</li></ul><p>As you may be aware, HMRC imposes penalties for late VAT submissions and payments, particularly under the Making Tax Digital regime. The standard penalty for late payment starts at 2% of the VAT due and increases the longer the payment remains outstanding.</p><p>You can securely upload all documentation through your client portal: <a href="{{client_portal_link}}">Access Your Client Portal</a></p><p>If you anticipate any issues with providing the required information or meeting the payment deadline, please contact me at your earliest convenience so we can discuss possible arrangements.</p>'),
('CORPORATION_TAX_DEADLINE', 'Reminder: Corporation Tax Payment Due for {{company_name}}', '<p>Dear {{client_name}},</p><p>I trust this email finds you well.</p><p>This is an important reminder that your corporation tax payment for {{company_name}} is due to be paid to HMRC by <strong>{{due_date}}</strong>.</p><p>Based on the calculations in your tax computation and CT600 return that we previously prepared, please ensure that payment is made to HMRC before the deadline.</p><p>Please be aware that HMRC charges interest on late payments of corporation tax from the day after the payment was due. The current interest rate for late payments is 2.75% (rate subject to change).</p><p>You can make payment to HMRC using the following methods:</p><ul><li>Online or telephone banking (Faster Payments)</li><li>CHAPS</li><li>Direct Debit (if previously set up)</li><li>Corporate credit or debit card online</li></ul><p>When making payment, please ensure you use your 17-character corporation tax reference number as the payment reference to ensure it is correctly allocated to your company''s tax account.</p><p>You can review your corporation tax return and payment details in your client portal: <a href="{{client_portal_link}}">Access Your Client Portal</a></p><p>If you foresee any difficulties in meeting this payment deadline, please contact me as soon as possible as HMRC may consider ''Time to Pay'' arrangements in certain circumstances.</p>'),
('CLIENT_TASK', 'Action Required: {{task_title}} by {{due_date}}', '<p>Dear {{client_name}},</p><p>I hope this email finds you well.</p><p>I am writing to remind you about the following matter that requires your attention by <strong>{{due_date}}</strong>:</p><p><strong>{{task_title}}</strong></p><p>{{task_description}}</p><p>Your prompt attention to this matter will help ensure all your business affairs remain in good order and compliant with the relevant regulations.</p><p>You can track the progress of this task and securely upload any relevant documents through your client portal: <a href="{{client_portal_link}}">Access Your Client Portal</a></p><p>If you require any clarification or assistance with this task, or if there are any circumstances that might prevent you from addressing this by the deadline, please don''t hesitate to contact me to discuss further.</p>'),
('DEFAULT', 'Important Reminder: Upcoming Deadline', '<p>Dear {{client_name}},</p><p>I hope you are well.</p><p>This is a courtesy reminder about an important upcoming deadline on <strong>{{due_date}}</strong> that requires your attention.</p><p>Addressing this matter in a timely manner will help ensure your business affairs remain compliant and avoid any potential penalties or complications.</p><p>For full details regarding this deadline, please log in to your secure client portal: <a href="{{client_portal_link}}">Access Your Client Portal</a></p><p>Should you have any questions or require any assistance with this matter, please do not hesitate to contact me directly.</p>')
ON CONFLICT (alert_type) DO NOTHING;

-- Alter the alert_templates table for user-specific templates
DROP TABLE IF EXISTS public.alert_templates; -- Drop if exists to recreate with new structure cleanly
CREATE TABLE public.alert_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT user_alert_type_unique UNIQUE (user_id, alert_type)
);

-- Add comments to the table and columns
COMMENT ON TABLE public.alert_templates IS 'Stores user-specific customizable message templates for client alerts.';
COMMENT ON COLUMN public.alert_templates.id IS 'Unique identifier for the user-specific alert template.';
COMMENT ON COLUMN public.alert_templates.user_id IS 'Identifier of the user who owns this template, references auth.users.id.';
COMMENT ON COLUMN public.alert_templates.alert_type IS 'The type of the alert (e.g., NEXT_ACCOUNTS_DUE).';
COMMENT ON COLUMN public.alert_templates.subject IS 'The user-customized subject line for the alert.';
COMMENT ON COLUMN public.alert_templates.body IS 'The user-customized HTML message template content, supporting placeholders.';

-- Enable Row Level Security
ALTER TABLE public.alert_templates ENABLE ROW LEVEL SECURITY;

-- Create policies for RLS
CREATE POLICY "Users can view their own templates" ON public.alert_templates
AS PERMISSIVE FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates" ON public.alert_templates
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own templates" ON public.alert_templates
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates" ON public.alert_templates
AS PERMISSIVE FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Function to copy default templates to a new user
CREATE OR REPLACE FUNCTION public.clone_default_templates_for_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Important: To operate on tables it might not have direct access to via RLS
AS $$
BEGIN
  INSERT INTO public.alert_templates (user_id, alert_type, subject, body)
  SELECT target_user_id, dt.alert_type, dt.subject, dt.body
  FROM public.default_alert_templates dt
  ON CONFLICT (user_id, alert_type) DO NOTHING; -- In case the function is called multiple times
END;
$$;

-- Trigger to call the function when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user_alert_templates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Must be SECURITY DEFINER to call clone_default_templates_for_user which is also SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.clone_default_templates_for_user(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_clone_alert_templates
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_alert_templates();

-- Trigger to automatically update updated_at timestamp on alert_templates
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_alert_templates
BEFORE UPDATE ON public.alert_templates
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- Trigger to automatically update updated_at timestamp on default_alert_templates
CREATE TRIGGER set_timestamp_default_alert_templates
BEFORE UPDATE ON public.default_alert_templates
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp(); 