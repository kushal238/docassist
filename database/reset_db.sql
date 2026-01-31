-- ==========================================
-- 1. RESET / TEAR DOWN (DROP EVERYTHING)
-- ==========================================

-- Drop policies on storage.objects first (since we don't drop the table itself)
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view documents they have access to" ON storage.objects;

-- Drop triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- Note: Triggers on public tables (like patients) are automatically dropped when the table is dropped with CASCADE.

-- Drop functions (CASCADE to remove dependent triggers/policies if any remain)
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role(uuid) CASCADE;

-- Drop tables (CASCADE ensures all dependent constraints/foreign keys are removed)
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_sessions CASCADE;
DROP TABLE IF EXISTS public.briefs CASCADE;
DROP TABLE IF EXISTS public.doc_chunks CASCADE;
DROP TABLE IF EXISTS public.symptoms CASCADE;
DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.patients CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop types (CASCADE to remove dependent columns)
DROP TYPE IF EXISTS public.doc_status CASCADE;
DROP TYPE IF EXISTS public.doc_type CASCADE;
DROP TYPE IF EXISTS public.user_role CASCADE;

-- ==========================================
-- 2. RE-CREATE SCHEMA
-- ==========================================

-- Create Types
CREATE TYPE public.user_role AS ENUM ('doctor', 'patient');
CREATE TYPE public.doc_type AS ENUM ('note', 'lab', 'imaging', 'meds', 'other');
CREATE TYPE public.doc_status AS ENUM ('pending', 'processed');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'patient',
  full_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Patients table
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_patient_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_doctor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  dob DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents table
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  uploader_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  doc_type doc_type DEFAULT 'other',
  status doc_status DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Symptoms table
CREATE TABLE public.symptoms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  onset_date DATE,
  severity INTEGER CHECK (severity >= 1 AND severity <= 10),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document chunks for RAG
CREATE TABLE public.doc_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  chunk_text TEXT NOT NULL,
  page_num INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Clinical briefs
CREATE TABLE public.briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content_json JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat sessions
CREATE TABLE public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat messages
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  citations_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 4. HELPER FUNCTIONS
-- ==========================================

-- Check user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = user_id
$$;

-- Handle updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Handle new user creation (Automatic Profile Trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'patient')
  );
  RETURN NEW;
END;
$$;

-- ==========================================
-- 5. TRIGGERS
-- ==========================================

CREATE TRIGGER update_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- 6. RLS POLICIES
-- ==========================================

-- --- PROFILES ---
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- CRITICAL FIX: Allow users to insert their own profile (for fallback mechanism)
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Doctors can view all profiles" ON public.profiles 
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'doctor');

-- --- PATIENTS ---
CREATE POLICY "Patients can view own patient record" ON public.patients
  FOR SELECT USING (owner_patient_profile_id = auth.uid());

CREATE POLICY "Patients can create own patient record" ON public.patients
  FOR INSERT WITH CHECK (owner_patient_profile_id = auth.uid());

CREATE POLICY "Doctors can view all patients" ON public.patients 
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'doctor');

CREATE POLICY "Doctors can create patients" ON public.patients 
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'doctor');

CREATE POLICY "Doctors can update patients" ON public.patients 
  FOR UPDATE USING (public.get_user_role(auth.uid()) = 'doctor');

-- --- DOCUMENTS ---
CREATE POLICY "Patients can view own documents" ON public.documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.patients WHERE id = patient_id AND owner_patient_profile_id = auth.uid())
  );

CREATE POLICY "Doctors can view all documents" ON public.documents 
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'doctor');

CREATE POLICY "Users can upload documents" ON public.documents
  FOR INSERT WITH CHECK (uploader_profile_id = auth.uid());

-- --- SYMPTOMS ---
CREATE POLICY "Patients can manage own symptoms" ON public.symptoms
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.patients WHERE id = patient_id AND owner_patient_profile_id = auth.uid())
  );

CREATE POLICY "Doctors can view all symptoms" ON public.symptoms 
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'doctor');

CREATE POLICY "Doctors can insert symptoms" ON public.symptoms 
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'doctor');

-- --- DOC CHUNKS ---
CREATE POLICY "Doctors can view all doc chunks" ON public.doc_chunks 
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'doctor');

CREATE POLICY "Patients can view own doc chunks" ON public.doc_chunks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.patients WHERE id = patient_id AND owner_patient_profile_id = auth.uid())
  );

-- --- BRIEFS ---
CREATE POLICY "Doctors can manage briefs" ON public.briefs 
  FOR ALL USING (public.get_user_role(auth.uid()) = 'doctor');

CREATE POLICY "Patients can view own briefs" ON public.briefs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.patients WHERE id = patient_id AND owner_patient_profile_id = auth.uid())
  );

-- --- CHAT SESSIONS ---
CREATE POLICY "Users can manage own chat sessions" ON public.chat_sessions
  FOR ALL USING (profile_id = auth.uid());

CREATE POLICY "Doctors can view all chat sessions" ON public.chat_sessions 
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'doctor');

-- --- CHAT MESSAGES ---
CREATE POLICY "Users can manage own chat messages" ON public.chat_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = session_id AND profile_id = auth.uid())
  );

CREATE POLICY "Doctors can view all chat messages" ON public.chat_messages 
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'doctor');

-- ==========================================
-- 7. STORAGE (Bucket & Policies)
-- ==========================================
-- Create bucket if not exists
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');

CREATE POLICY "Users can view documents they have access to"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents' AND auth.role() = 'authenticated');
