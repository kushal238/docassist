-- =============================================================================
-- Doctor Delete Policies
-- 
-- Run this MANUALLY in Supabase SQL Editor (Database → SQL Editor)
-- This adds DELETE permissions for doctors on patient data
-- =============================================================================

-- =============================================================================
-- DOCUMENTS: Doctors can delete
-- =============================================================================

-- Drop existing delete policy if any
DROP POLICY IF EXISTS "Doctors can delete documents" ON public.documents;

CREATE POLICY "Doctors can delete documents"
ON public.documents
FOR DELETE
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);

-- =============================================================================
-- DOC_CHUNKS: Doctors can delete (also cascades from documents)
-- =============================================================================

DROP POLICY IF EXISTS "Doctors can delete doc_chunks" ON public.doc_chunks;

CREATE POLICY "Doctors can delete doc_chunks"
ON public.doc_chunks
FOR DELETE
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);

-- =============================================================================
-- SYMPTOMS: Doctors can delete
-- =============================================================================

DROP POLICY IF EXISTS "Doctors can delete symptoms" ON public.symptoms;

CREATE POLICY "Doctors can delete symptoms"
ON public.symptoms
FOR DELETE
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);

-- =============================================================================
-- BRIEFS: Doctors can update and delete
-- =============================================================================

DROP POLICY IF EXISTS "Doctors can update briefs" ON public.briefs;
DROP POLICY IF EXISTS "Doctors can delete briefs" ON public.briefs;

CREATE POLICY "Doctors can update briefs"
ON public.briefs
FOR UPDATE
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);

CREATE POLICY "Doctors can delete briefs"
ON public.briefs
FOR DELETE
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);

-- =============================================================================
-- Verify policies were created
-- =============================================================================

SELECT 
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies 
WHERE schemaname = 'public' 
  AND policyname LIKE '%delete%'
ORDER BY tablename;
