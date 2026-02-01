-- =============================================================================
-- Doctor Delete Policies for Supabase
-- =============================================================================
-- Run this in the Supabase SQL Editor to enable doctor-only delete permissions
-- 
-- ROLE-BASED PERMISSIONS:
-- - Doctors: Full CRUD (Create, Read, Update, Delete)
-- - Patients: Add-only (Create, Read) - NO delete permissions
-- =============================================================================

-- Enable RLS on tables (if not already enabled)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE symptoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- DOCUMENTS TABLE
-- =============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "documents_select" ON documents;
DROP POLICY IF EXISTS "documents_insert" ON documents;
DROP POLICY IF EXISTS "documents_delete" ON documents;
DROP POLICY IF EXISTS "documents_update" ON documents;

-- SELECT: Both doctors and patients can read
CREATE POLICY "documents_select" ON documents
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role IN ('doctor', 'patient')
    )
  );

-- INSERT: Both doctors and patients can add documents
CREATE POLICY "documents_insert" ON documents
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role IN ('doctor', 'patient')
    )
  );

-- DELETE: Only doctors can delete documents
CREATE POLICY "documents_delete" ON documents
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role = 'doctor'
    )
  );

-- UPDATE: Only doctors can update documents
CREATE POLICY "documents_update" ON documents
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role = 'doctor'
    )
  );

-- =============================================================================
-- DOC_CHUNKS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "doc_chunks_select" ON doc_chunks;
DROP POLICY IF EXISTS "doc_chunks_insert" ON doc_chunks;
DROP POLICY IF EXISTS "doc_chunks_delete" ON doc_chunks;

-- SELECT: Both can read
CREATE POLICY "doc_chunks_select" ON doc_chunks
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role IN ('doctor', 'patient')
    )
  );

-- INSERT: Both can add
CREATE POLICY "doc_chunks_insert" ON doc_chunks
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role IN ('doctor', 'patient')
    )
  );

-- DELETE: Only doctors
CREATE POLICY "doc_chunks_delete" ON doc_chunks
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role = 'doctor'
    )
  );

-- =============================================================================
-- SYMPTOMS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "symptoms_select" ON symptoms;
DROP POLICY IF EXISTS "symptoms_insert" ON symptoms;
DROP POLICY IF EXISTS "symptoms_delete" ON symptoms;
DROP POLICY IF EXISTS "symptoms_update" ON symptoms;

-- SELECT: Both can read
CREATE POLICY "symptoms_select" ON symptoms
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role IN ('doctor', 'patient')
    )
  );

-- INSERT: Both can add symptoms
CREATE POLICY "symptoms_insert" ON symptoms
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role IN ('doctor', 'patient')
    )
  );

-- DELETE: Only doctors can delete symptoms
CREATE POLICY "symptoms_delete" ON symptoms
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role = 'doctor'
    )
  );

-- UPDATE: Only doctors can update symptoms
CREATE POLICY "symptoms_update" ON symptoms
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role = 'doctor'
    )
  );

-- =============================================================================
-- BRIEFS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "briefs_select" ON briefs;
DROP POLICY IF EXISTS "briefs_insert" ON briefs;
DROP POLICY IF EXISTS "briefs_delete" ON briefs;
DROP POLICY IF EXISTS "briefs_update" ON briefs;

-- SELECT: Both can read
CREATE POLICY "briefs_select" ON briefs
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role IN ('doctor', 'patient')
    )
  );

-- INSERT: Both can create briefs
CREATE POLICY "briefs_insert" ON briefs
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role IN ('doctor', 'patient')
    )
  );

-- DELETE: Only doctors can delete briefs
CREATE POLICY "briefs_delete" ON briefs
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role = 'doctor'
    )
  );

-- UPDATE: Only doctors can update briefs
CREATE POLICY "briefs_update" ON briefs
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() AND role = 'doctor'
    )
  );

-- =============================================================================
-- CHAT_MESSAGES TABLE (if exists)
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'chat_messages') THEN
    ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "chat_messages_select" ON chat_messages;
    DROP POLICY IF EXISTS "chat_messages_insert" ON chat_messages;
    
    CREATE POLICY "chat_messages_select" ON chat_messages
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
    
    CREATE POLICY "chat_messages_insert" ON chat_messages
      FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- =============================================================================
-- Verification Query
-- =============================================================================

-- Run this to verify policies are in place:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd 
-- FROM pg_policies 
-- WHERE tablename IN ('documents', 'doc_chunks', 'symptoms', 'briefs');
