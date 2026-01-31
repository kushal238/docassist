-- Create security definer function to check user role without triggering RLS
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = user_id
$$;

-- Drop the problematic policy
DROP POLICY IF EXISTS "Doctors can view all profiles" ON public.profiles;

-- Recreate using the security definer function
CREATE POLICY "Doctors can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'doctor');

-- Also fix other tables that have similar patterns referencing profiles
DROP POLICY IF EXISTS "Doctors can manage briefs" ON public.briefs;
CREATE POLICY "Doctors can manage briefs" 
ON public.briefs 
FOR ALL 
USING (public.get_user_role(auth.uid()) = 'doctor');

DROP POLICY IF EXISTS "Doctors can view all chat messages" ON public.chat_messages;
CREATE POLICY "Doctors can view all chat messages" 
ON public.chat_messages 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'doctor');

DROP POLICY IF EXISTS "Doctors can view all chat sessions" ON public.chat_sessions;
CREATE POLICY "Doctors can view all chat sessions" 
ON public.chat_sessions 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'doctor');

DROP POLICY IF EXISTS "Doctors can view all doc chunks" ON public.doc_chunks;
CREATE POLICY "Doctors can view all doc chunks" 
ON public.doc_chunks 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'doctor');

DROP POLICY IF EXISTS "Doctors can view all documents" ON public.documents;
CREATE POLICY "Doctors can view all documents" 
ON public.documents 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'doctor');

DROP POLICY IF EXISTS "Doctors can create patients" ON public.patients;
CREATE POLICY "Doctors can create patients" 
ON public.patients 
FOR INSERT 
WITH CHECK (public.get_user_role(auth.uid()) = 'doctor');

DROP POLICY IF EXISTS "Doctors can update patients" ON public.patients;
CREATE POLICY "Doctors can update patients" 
ON public.patients 
FOR UPDATE 
USING (public.get_user_role(auth.uid()) = 'doctor');

DROP POLICY IF EXISTS "Doctors can view all patients" ON public.patients;
CREATE POLICY "Doctors can view all patients" 
ON public.patients 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'doctor');

DROP POLICY IF EXISTS "Doctors can insert symptoms" ON public.symptoms;
CREATE POLICY "Doctors can insert symptoms" 
ON public.symptoms 
FOR INSERT 
WITH CHECK (public.get_user_role(auth.uid()) = 'doctor');

DROP POLICY IF EXISTS "Doctors can view all symptoms" ON public.symptoms;
CREATE POLICY "Doctors can view all symptoms" 
ON public.symptoms 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'doctor');