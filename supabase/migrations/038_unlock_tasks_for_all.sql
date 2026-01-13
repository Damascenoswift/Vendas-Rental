-- Unlock Tasks for All Employees
-- Request: "Libera a parte de tarefas para todos os funcionarios"

-- Drop restrictive policies
DROP POLICY IF EXISTS "Admins Full Access Tasks" ON tasks;
DROP POLICY IF EXISTS "Users View Own Tasks" ON tasks;
DROP POLICY IF EXISTS "Users Update Assigned Tasks" ON tasks;
DROP POLICY IF EXISTS "Users Create Tasks" ON tasks;

-- 1. View All Tasks (Employees need to see the team board)
CREATE POLICY "Employees View All Tasks"
ON tasks FOR SELECT
USING (
  auth.role() = 'authenticated'
);

-- 2. Create Tasks (Anyone can create)
CREATE POLICY "Employees Create Tasks"
ON tasks FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
);

-- 3. Update Tasks (Anyone can move cards or edit - collaborative board)
CREATE POLICY "Employees Update Tasks"
ON tasks FOR UPDATE
USING (
  auth.role() = 'authenticated'
);

-- 4. Delete Tasks (Only Admins)
CREATE POLICY "Admins Delete Tasks"
ON tasks FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('adm_mestre', 'adm_dorata', 'supervisor')
  )
);
