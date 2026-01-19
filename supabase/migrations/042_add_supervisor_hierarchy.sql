-- Add supervisor_id to users table to link a user to their supervisor
ALTER TABLE users 
ADD COLUMN supervisor_id UUID REFERENCES users(id);

-- Add created_by_supervisor_id to indicacoes to track if a supervisor created it
ALTER TABLE indicacoes 
ADD COLUMN created_by_supervisor_id UUID REFERENCES users(id);

-- Create an index for performance on queries filtering by supervisor
CREATE INDEX idx_users_supervisor_id ON users(supervisor_id);
