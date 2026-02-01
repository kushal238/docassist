-- Add email to profiles for lookup/assignment
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE public.profiles p
SET email = lower(u.email)
FROM auth.users u
WHERE u.id = p.id
  AND (p.email IS NULL OR p.email = '');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique
ON public.profiles (email)
WHERE email IS NOT NULL;

-- Update profile creation to store email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'patient'),
    lower(NEW.email)
  );
  RETURN NEW;
END;
$$;

-- Doctor-patient assignment table
CREATE TABLE IF NOT EXISTS public.doctor_patient (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (doctor_profile_id, patient_id)
);

ALTER TABLE public.doctor_patient ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can view own assignments"
ON public.doctor_patient
FOR SELECT
USING (doctor_profile_id = auth.uid());

CREATE POLICY "Doctors can create assignments"
ON public.doctor_patient
FOR INSERT
WITH CHECK (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND doctor_profile_id = auth.uid()
);

CREATE POLICY "Doctors can delete assignments"
ON public.doctor_patient
FOR DELETE
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND doctor_profile_id = auth.uid()
);

-- Atomic patient assignment by email (creates patient record if needed)
CREATE OR REPLACE FUNCTION public.assign_patient_by_email(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_id UUID := auth.uid();
  v_patient_profile RECORD;
  v_patient_id UUID;
  v_already_assigned BOOLEAN;
BEGIN
  IF public.get_user_role(v_doctor_id) != 'doctor'::public.user_role THEN
    RAISE EXCEPTION 'Only doctors can assign patients';
  END IF;

  -- Find patient profile by email
  SELECT id, full_name, role INTO v_patient_profile
  FROM public.profiles
  WHERE email = lower(p_email);

  IF v_patient_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'no_account', 'message', 'No patient account found for that email.');
  END IF;

  IF v_patient_profile.role != 'patient'::public.user_role THEN
    RETURN jsonb_build_object('error', 'not_patient', 'message', 'This email does not belong to a patient account.');
  END IF;

  -- Get or create patient record
  SELECT id INTO v_patient_id
  FROM public.patients
  WHERE owner_patient_profile_id = v_patient_profile.id;

  IF v_patient_id IS NULL THEN
    INSERT INTO public.patients (owner_patient_profile_id, full_name)
    VALUES (v_patient_profile.id, v_patient_profile.full_name)
    RETURNING id INTO v_patient_id;
  END IF;

  -- Check if already assigned
  SELECT EXISTS (
    SELECT 1 FROM public.doctor_patient
    WHERE doctor_profile_id = v_doctor_id AND patient_id = v_patient_id
  ) INTO v_already_assigned;

  IF v_already_assigned THEN
    RETURN jsonb_build_object('error', 'already_assigned', 'message', 'This patient is already assigned to you.');
  END IF;

  -- Create assignment
  INSERT INTO public.doctor_patient (doctor_profile_id, patient_id)
  VALUES (v_doctor_id, v_patient_id);

  RETURN jsonb_build_object('success', true, 'patient_id', v_patient_id);
END;
$$;

-- Atomic patient creation with doctor assignment
CREATE OR REPLACE FUNCTION public.create_patient_with_assignment(
  p_full_name TEXT,
  p_dob DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id UUID;
  v_doctor_id UUID := auth.uid();
BEGIN
  IF public.get_user_role(v_doctor_id) != 'doctor'::public.user_role THEN
    RAISE EXCEPTION 'Only doctors can create patients';
  END IF;

  INSERT INTO public.patients (full_name, dob, created_by_doctor_profile_id)
  VALUES (p_full_name, p_dob, v_doctor_id)
  RETURNING id INTO v_patient_id;

  INSERT INTO public.doctor_patient (doctor_profile_id, patient_id)
  VALUES (v_doctor_id, v_patient_id);

  RETURN v_patient_id;
END;
$$;

-- Helper to check doctor access to patient
CREATE OR REPLACE FUNCTION public.doctor_can_access_patient(doctor_id uuid, patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = patient_id
      AND (
        p.created_by_doctor_profile_id = doctor_id
        OR EXISTS (
          SELECT 1
          FROM public.doctor_patient dp
          WHERE dp.doctor_profile_id = doctor_id
            AND dp.patient_id = p.id
        )
      )
  );
$$;

-- Profiles policies (limit doctor visibility to patient profiles only)
DROP POLICY IF EXISTS "Doctors can view all profiles" ON public.profiles;
CREATE POLICY "Doctors can view patient profiles"
ON public.profiles
FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND role = 'patient'::public.user_role
);

-- Patients policies
DROP POLICY IF EXISTS "Require authentication for patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can view all patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can update patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can create patients" ON public.patients;

CREATE POLICY "Doctors can view assigned patients"
ON public.patients
FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), id)
);

CREATE POLICY "Doctors can update assigned patients"
ON public.patients
FOR UPDATE
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), id)
);

CREATE POLICY "Doctors can create patients"
ON public.patients
FOR INSERT
WITH CHECK (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND created_by_doctor_profile_id = auth.uid()
);

-- Documents policies
DROP POLICY IF EXISTS "Doctors can view all documents" ON public.documents;
DROP POLICY IF EXISTS "Users can upload documents" ON public.documents;

CREATE POLICY "Doctors can view documents for assigned patients"
ON public.documents
FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);

CREATE POLICY "Users can upload documents"
ON public.documents
FOR INSERT
WITH CHECK (
  uploader_profile_id = auth.uid()
  AND (
    (
      public.get_user_role(auth.uid()) = 'doctor'::public.user_role
      AND public.doctor_can_access_patient(auth.uid(), patient_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_id
        AND p.owner_patient_profile_id = auth.uid()
    )
  )
);

-- Symptoms policies
DROP POLICY IF EXISTS "Doctors can view all symptoms" ON public.symptoms;
DROP POLICY IF EXISTS "Doctors can insert symptoms" ON public.symptoms;

CREATE POLICY "Doctors can view symptoms for assigned patients"
ON public.symptoms
FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);

CREATE POLICY "Doctors can insert symptoms for assigned patients"
ON public.symptoms
FOR INSERT
WITH CHECK (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);

-- Doc chunks policies
DROP POLICY IF EXISTS "Doctors can view all doc chunks" ON public.doc_chunks;

CREATE POLICY "Doctors can view doc chunks for assigned patients"
ON public.doc_chunks
FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);

-- Briefs policies
DROP POLICY IF EXISTS "Doctors can manage briefs" ON public.briefs;

CREATE POLICY "Doctors can manage briefs for assigned patients"
ON public.briefs
FOR ALL
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
)
WITH CHECK (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
  AND (created_by_profile_id = auth.uid() OR created_by_profile_id IS NULL)
);

-- Chat sessions policies
DROP POLICY IF EXISTS "Doctors can view all chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can manage own chat sessions" ON public.chat_sessions;

CREATE POLICY "Users can manage own chat sessions"
ON public.chat_sessions
FOR ALL
USING (profile_id = auth.uid())
WITH CHECK (
  profile_id = auth.uid()
  AND (
    (
      public.get_user_role(auth.uid()) = 'doctor'::public.user_role
      AND public.doctor_can_access_patient(auth.uid(), patient_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_id
        AND p.owner_patient_profile_id = auth.uid()
    )
  )
);

-- Chat messages policies
DROP POLICY IF EXISTS "Doctors can view all chat messages" ON public.chat_messages;

CREATE POLICY "Users can view own session messages"
ON public.chat_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.chat_sessions cs
    WHERE cs.id = chat_messages.session_id
      AND cs.profile_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own session messages"
ON public.chat_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.chat_sessions cs
    WHERE cs.id = chat_messages.session_id
      AND cs.profile_id = auth.uid()
  )
);

-- Storage policies updated for doctor-patient access
DROP POLICY IF EXISTS "Authorized users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can delete documents" ON storage.objects;

CREATE POLICY "Authorized users can view documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents'
  AND auth.role() = 'authenticated'
  AND (
    public.get_user_role(auth.uid()) = 'doctor'::public.user_role
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE storage.objects.name LIKE 'patient/' || p.id::text || '/%'
        AND public.doctor_can_access_patient(auth.uid(), p.id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.owner_patient_profile_id = auth.uid()
        AND storage.objects.name LIKE 'patient/' || p.id::text || '/%'
    )
  )
);

CREATE POLICY "Authorized users can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents'
  AND auth.role() = 'authenticated'
  AND (
    public.get_user_role(auth.uid()) = 'doctor'::public.user_role
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE storage.objects.name LIKE 'patient/' || p.id::text || '/%'
        AND public.doctor_can_access_patient(auth.uid(), p.id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.owner_patient_profile_id = auth.uid()
        AND storage.objects.name LIKE 'patient/' || p.id::text || '/%'
    )
  )
);

CREATE POLICY "Authorized users can delete documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents'
  AND auth.role() = 'authenticated'
  AND (
    public.get_user_role(auth.uid()) = 'doctor'::public.user_role
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE storage.objects.name LIKE 'patient/' || p.id::text || '/%'
        AND public.doctor_can_access_patient(auth.uid(), p.id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.owner_patient_profile_id = auth.uid()
        AND storage.objects.name LIKE 'patient/' || p.id::text || '/%'
    )
  )
);
