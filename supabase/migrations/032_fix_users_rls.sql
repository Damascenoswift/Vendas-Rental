-- Allow all authenticated users to read basic user info (needed for Task Assignment)

-- Drop existing policies if they exist (both old names and potentially the new one if re-running)
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON "public"."users";
DROP POLICY IF EXISTS "Users can view their own data" ON "public"."users";
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON "public"."users";

-- Re-create stricter but inclusive policy
-- We want everyone (authenticated) to be able to see names/depts of other users to assign tasks.
CREATE POLICY "Enable read access for all authenticated users" ON "public"."users"
    FOR SELECT
    USING (auth.role() = 'authenticated');
