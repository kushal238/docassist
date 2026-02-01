-- 1. Create Types
CREATE TYPE public.user_role AS ENUM ('doctor', 'patient');
CREATE TYPE public.doc_type AS ENUM ('note', 'lab', 'imaging', 'meds', 'other');
CREATE TYPE public.doc_status AS ENUM ('pending', 'processed');
CREATE TYPE public.encounter_type AS ENUM ('office', 'ed', 'inpatient', 'telehealth', 'procedure');
CREATE TYPE public.specialty_type AS ENUM ('pcp', 'cardiology', 'endocrine', 'nephrology', 'gi', 'hematology', 'pulmonology', 'neurology', 'other');
CREATE TYPE public.med_status AS ENUM ('active', 'on_hold', 'discontinued');

-- 2. Create Tables

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

-- ============================================
-- STRUCTURED CLINICAL DATA TABLES
-- For fast pattern detection and trend analysis
-- ============================================

-- Encounters: tracks each clinical visit/interaction
CREATE TABLE public.encounters (
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

-- SOAP notes: structured clinical documentation
CREATE TABLE public.soap_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  subjective TEXT,                    -- Patient's reported symptoms, history
  objective JSONB,                    -- Vitals, exam findings, structured data
  assessment TEXT,                    -- Diagnosis/impression
  plan TEXT,                          -- Treatment plan
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Labs: structured lab values for trend queries
CREATE TABLE public.labs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE SET NULL,
  source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  lab_name TEXT NOT NULL,             -- e.g., 'creatinine', 'eGFR', 'A1c', 'Hgb'
  value NUMERIC NOT NULL,
  unit TEXT,                          -- e.g., 'mg/dL', '%', 'g/dL'
  reference_low NUMERIC,
  reference_high NUMERIC,
  is_abnormal BOOLEAN DEFAULT FALSE,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vitals: structured vital signs for trend analysis
CREATE TABLE public.vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE SET NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
  systolic_bp INTEGER,                -- mmHg
  diastolic_bp INTEGER,               -- mmHg
  heart_rate INTEGER,                 -- bpm
  respiratory_rate INTEGER,           -- breaths/min
  temperature NUMERIC,                -- Celsius
  o2_saturation INTEGER,              -- %
  weight NUMERIC,                     -- kg
  height NUMERIC,                     -- cm
  bmi NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Medications: structured medication list
CREATE TABLE public.medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  drug_name TEXT NOT NULL,
  dose TEXT,                          -- e.g., '10mg', '500mg'
  frequency TEXT,                     -- e.g., 'daily', 'BID', 'PRN'
  route TEXT DEFAULT 'oral',          -- e.g., 'oral', 'IV', 'topical'
  status med_status DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  prescribing_specialty specialty_type,
  indication TEXT,                    -- Why prescribed
  notes TEXT,                         -- e.g., 'on hold due to GI bleed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Diagnoses: problem list / diagnosis tracking
CREATE TABLE public.diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE SET NULL,
  icd_code TEXT,                      -- Optional ICD-10 code
  diagnosis_name TEXT NOT NULL,
  diagnosis_type TEXT DEFAULT 'working', -- 'confirmed', 'working', 'ruled_out', 'historical'
  onset_date DATE,
  resolved_date DATE,
  documenting_specialty specialty_type,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Clinical alerts: AI-generated flags for review
CREATE TABLE public.clinical_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  alert_type TEXT NOT NULL,           -- e.g., 'renal_decline', 'missed_anticoagulation', 'cancer_red_flag'
  priority TEXT NOT NULL DEFAULT 'P1', -- 'P0' (critical), 'P1' (high), 'P2' (moderate)
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_json JSONB,                -- Supporting data points
  source_data_json JSONB,             -- References to labs, encounters, etc.
  status TEXT DEFAULT 'active',       -- 'active', 'reviewed', 'dismissed', 'resolved'
  reviewed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for fast pattern detection queries
CREATE INDEX idx_labs_patient_name_date ON public.labs(patient_id, lab_name, collected_at DESC);
CREATE INDEX idx_vitals_patient_date ON public.vitals(patient_id, recorded_at DESC);
CREATE INDEX idx_medications_patient_status ON public.medications(patient_id, status);
CREATE INDEX idx_diagnoses_patient ON public.diagnoses(patient_id, diagnosis_type);
CREATE INDEX idx_encounters_patient_date ON public.encounters(patient_id, encounter_date DESC);
CREATE INDEX idx_clinical_alerts_patient_status ON public.clinical_alerts(patient_id, status, priority);
