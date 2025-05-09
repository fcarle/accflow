-- Enable Row Level Security on clients table
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to select only their own clients
CREATE POLICY select_clients ON clients
    FOR SELECT USING (auth.uid() = created_by);

-- Create policy to allow users to insert their own clients
CREATE POLICY insert_clients ON clients
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Create policy to allow users to update only their own clients
CREATE POLICY update_clients ON clients
    FOR UPDATE USING (auth.uid() = created_by);

-- Create policy to allow users to delete only their own clients
CREATE POLICY delete_clients ON clients
    FOR DELETE USING (auth.uid() = created_by); 