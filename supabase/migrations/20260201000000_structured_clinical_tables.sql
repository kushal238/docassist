-- Migration: Add structured clinical tables for fast pattern detection
-- This enables SQL-based trend analysis instead of repeated AI extraction

-- 1. Create new enum types
DO $$ BEGIN
  CREATE TYPE public.encounter_type AS ENUM ('office', 'ed', 'inpatient', 'telehealth', 'procedure');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.specialty_type AS ENUM ('pcp', 'cardiology', 'endocrine', 'nephrology', 'gi', 'hematology', 'pulmonology', 'neurology', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.med_status AS ENUM ('active', 'on_hold', 'discontinued');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create encounters table
CREATE TABLE IF NOT EXISTS public.encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  encounter_date DATE NOT NULL,
  encounter_type encounter_type NOT NULL DEFAULT 'office',
  specialty specialty_type NOT NULL DEFAULT 'pcp',
  chief_complaint TEXT,
  provider_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create SOAP notes table
CREATE TABLE IF NOT EXISTS public.soap_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  subjective TEXT,
  objective JSONB,
  assessment TEXT,
  plan TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create labs table (structured for trend queries)
CREATE TABLE IF NOT EXISTS public.labs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE SET NULL,
  source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  lab_name TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT,
  reference_low NUMERIC,
  reference_high NUMERIC,
  is_abnormal BOOLEAN DEFAULT FALSE,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create vitals table
CREATE TABLE IF NOT EXISTS public.vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE SET NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
  systolic_bp INTEGER,
  diastolic_bp INTEGER,
  heart_rate INTEGER,
  respiratory_rate INTEGER,
  temperature NUMERIC,
  o2_saturation INTEGER,
  weight NUMERIC,
  height NUMERIC,
  bmi NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create medications table
CREATE TABLE IF NOT EXISTS public.medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  drug_name TEXT NOT NULL,
  dose TEXT,
  frequency TEXT,
  route TEXT DEFAULT 'oral',
  status med_status DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  prescribing_specialty specialty_type,
  indication TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Create diagnoses table
CREATE TABLE IF NOT EXISTS public.diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE SET NULL,
  icd_code TEXT,
  diagnosis_name TEXT NOT NULL,
  diagnosis_type TEXT DEFAULT 'working',
  onset_date DATE,
  resolved_date DATE,
  documenting_specialty specialty_type,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Create clinical alerts table (AI-generated flags)
CREATE TABLE IF NOT EXISTS public.clinical_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  alert_type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'P1',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_json JSONB,
  source_data_json JSONB,
  status TEXT DEFAULT 'active',
  reviewed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Create indexes for fast pattern detection
CREATE INDEX IF NOT EXISTS idx_labs_patient_name_date ON public.labs(patient_id, lab_name, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_vitals_patient_date ON public.vitals(patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_medications_patient_status ON public.medications(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_diagnoses_patient ON public.diagnoses(patient_id, diagnosis_type);
CREATE INDEX IF NOT EXISTS idx_encounters_patient_date ON public.encounters(patient_id, encounter_date DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_alerts_patient_status ON public.clinical_alerts(patient_id, status, priority);

-- 10. Enable RLS on new tables
ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soap_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_alerts ENABLE ROW LEVEL SECURITY;

-- 11. RLS Policies using existing doctor_can_access_patient helper function

-- Encounters
CREATE POLICY "Users can view encounters for their patients" ON public.encounters
  FOR SELECT USING (
    -- Patient viewing own data
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.owner_patient_profile_id = auth.uid()
    )
    -- Doctor with access
    OR (
      public.get_user_role(auth.uid()) = 'doctor'::public.user_role
      AND public.doctor_can_access_patient(auth.uid(), patient_id)
    )
  );

CREATE POLICY "Doctors can insert encounters" ON public.encounters
  FOR INSERT WITH CHECK (
    public.get_user_role(auth.uid()) = 'doctor'::public.user_role
    AND public.doctor_can_access_patient(auth.uid(), patient_id)
  );

-- SOAP Notes
CREATE POLICY "Users can view SOAP notes for their patients" ON public.soap_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.owner_patient_profile_id = auth.uid()
    )
    OR (
      public.get_user_role(auth.uid()) = 'doctor'::public.user_role
      AND public.doctor_can_access_patient(auth.uid(), patient_id)
    )
  );

CREATE POLICY "Doctors can insert SOAP notes" ON public.soap_notes
  FOR INSERT WITH CHECK (
    public.get_user_role(auth.uid()) = 'doctor'::public.user_role
    AND public.doctor_can_access_patient(auth.uid(), patient_id)
  );

-- Labs
CREATE POLICY "Users can view labs for their patients" ON public.labs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.owner_patient_profile_id = auth.uid()
    )
    OR (
      public.get_user_role(auth.uid()) = 'doctor'::public.user_role
      AND public.doctor_can_access_patient(auth.uid(), patient_id)
    )
  );

CREATE POLICY "Doctors can insert labs" ON public.labs
  FOR INSERT WITH CHECK (
    public.get_user_role(auth.uid()) = 'doctor'::public.user_role
    AND public.doctor_can_access_patient(auth.uid(), patient_id)
  );

-- Vitals
CREATE POLICY "Users can view vitals for their patients" ON public.vitals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.owner_patient_profile_id = auth.uid()
    )
    OR (
      public.get_user_role(auth.uid()) = 'doctor'::public.user_role
      AND public.doctor_can_access_patient(auth.uid(), patient_id)
    )
  );

CREATE POLICY "Doctors can insert vitals" ON public.vitals
  FOR INSERT WITH CHECK (
    public.get_user_role(auth.uid()) = 'doctor'::public.user_role
    AND public.doctor_can_access_patient(auth.uid(), patient_id)
  );

-- Medications
CREATE POLICY "Users can view medications for their patients" ON public.medications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.owner_patient_profile_id = auth.uid()
    )
    OR (
      public.get_user_role(auth.uid()) = 'doctor'::public.user_role
      AND public.doctor_can_access_patient(auth.uid(), patient_id)
    )
  );

CREATE POLICY "Doctors can manage medications" ON public.medications
  FOR ALL USING (
    public.get_user_role(auth.uid()) = 'doctor'::public.user_role
    AND public.doctor_can_access_patient(auth.uid(), patient_id)
  );

-- Diagnoses
CREATE POLICY "Users can view diagnoses for their patients" ON public.diagnoses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.owner_patient_profile_id = auth.uid()
    )
    OR (
      public.get_user_role(auth.uid()) = 'doctor'::public.user_role
      AND public.doctor_can_access_patient(auth.uid(), patient_id)
    )
  );

CREATE POLICY "Doctors can manage diagnoses" ON public.diagnoses
  FOR ALL USING (
    public.get_user_role(auth.uid()) = 'doctor'::public.user_role
    AND public.doctor_can_access_patient(auth.uid(), patient_id)
  );

-- Clinical Alerts
CREATE POLICY "Users can view alerts for their patients" ON public.clinical_alerts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.owner_patient_profile_id = auth.uid()
    )
    OR (
      public.get_user_role(auth.uid()) = 'doctor'::public.user_role
      AND public.doctor_can_access_patient(auth.uid(), patient_id)
    )
  );

CREATE POLICY "Doctors can manage alerts" ON public.clinical_alerts
  FOR ALL USING (
    public.get_user_role(auth.uid()) = 'doctor'::public.user_role
    AND public.doctor_can_access_patient(auth.uid(), patient_id)
  );
