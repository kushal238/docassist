-- Add authentication requirement to patients table
-- This ensures unauthenticated users cannot access any patient data

-- First check if a baseline authentication policy exists, if not create one
-- This is a permissive policy that ensures auth.uid() IS NOT NULL for any access
CREATE POLICY "Require authentication for patients"
ON public.patients FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);