-- 6. Create RLS Policies

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Ensure users can insert their own profile during signup
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Doctors can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'doctor');

-- Patients policies
CREATE POLICY "Patients can view own patient record" ON public.patients
  FOR SELECT USING (owner_patient_profile_id = auth.uid());

CREATE POLICY "Doctors can view all patients" 
ON public.patients 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'doctor');

CREATE POLICY "Doctors can create patients" 
ON public.patients 
FOR INSERT 
WITH CHECK (public.get_user_role(auth.uid()) = 'doctor');

CREATE POLICY "Doctors can update patients" 
ON public.patients 
FOR UPDATE 
USING (public.get_user_role(auth.uid()) = 'doctor');

CREATE POLICY "Patients can create own patient record" ON public.patients
  FOR INSERT WITH CHECK (owner_patient_profile_id = auth.uid());

-- Documents policies
CREATE POLICY "Patients can view own documents" ON public.documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.patients WHERE id = patient_id AND owner_patient_profile_id = auth.uid())
  );

CREATE POLICY "Doctors can view all documents" 
ON public.documents 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'doctor');

CREATE POLICY "Users can upload documents" ON public.documents
  FOR INSERT WITH CHECK (uploader_profile_id = auth.uid());

-- Symptoms policies
CREATE POLICY "Patients can manage own symptoms" ON public.symptoms
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.patients WHERE id = patient_id AND owner_patient_profile_id = auth.uid())
  );

CREATE POLICY "Doctors can view all symptoms" 
ON public.symptoms 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'doctor');

CREATE POLICY "Doctors can insert symptoms" 
ON public.symptoms 
FOR INSERT 
WITH CHECK (public.get_user_role(auth.uid()) = 'doctor');

-- Doc chunks policies
CREATE POLICY "Doctors can view all doc chunks" 
ON public.doc_chunks 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'doctor');

CREATE POLICY "Patients can view own doc chunks" ON public.doc_chunks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.patients WHERE id = patient_id AND owner_patient_profile_id = auth.uid())
  );

-- Briefs policies
CREATE POLICY "Doctors can manage briefs" 
ON public.briefs 
FOR ALL 
USING (public.get_user_role(auth.uid()) = 'doctor');

CREATE POLICY "Patients can view own briefs" ON public.briefs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.patients WHERE id = patient_id AND owner_patient_profile_id = auth.uid())
  );

-- Chat sessions policies
CREATE POLICY "Users can manage own chat sessions" ON public.chat_sessions
  FOR ALL USING (profile_id = auth.uid());

CREATE POLICY "Doctors can view all chat sessions" 
ON public.chat_sessions 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'doctor');

-- Chat messages policies
CREATE POLICY "Users can manage own chat messages" ON public.chat_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = session_id AND profile_id = auth.uid())
  );

CREATE POLICY "Doctors can view all chat messages" 
ON public.chat_messages 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'doctor');

-- 7. Create Storage Bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');

CREATE POLICY "Users can view documents they have access to"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents' AND auth.role() = 'authenticated');
