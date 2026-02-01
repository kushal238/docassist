-- Create symptom_reports table for storing patient symptom assessments
CREATE TABLE IF NOT EXISTS public.symptom_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  primary_symptom TEXT NOT NULL,
  onset_text TEXT,
  severity INTEGER CHECK (severity >= 1 AND severity <= 10),
  progression TEXT,
  associated_symptoms TEXT[],
  red_flags JSONB,
  full_transcript TEXT,
  full_report TEXT NOT NULL,
  summary_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.symptom_reports ENABLE ROW LEVEL SECURITY;

-- Patients can only view their own symptom reports
DROP POLICY IF EXISTS "Patients can view own symptom reports" ON public.symptom_reports;
CREATE POLICY "Patients can view own symptom reports" ON public.symptom_reports
  FOR SELECT USING (
    patient_id IN (
      SELECT id FROM public.patients 
      WHERE owner_patient_profile_id = auth.uid()
    )
  );

-- Patients can insert their own symptom reports
DROP POLICY IF EXISTS "Patients can insert own symptom reports" ON public.symptom_reports;
CREATE POLICY "Patients can insert own symptom reports" ON public.symptom_reports
  FOR INSERT WITH CHECK (
    patient_id IN (
      SELECT id FROM public.patients 
      WHERE owner_patient_profile_id = auth.uid()
    )
  );

-- Doctors can view symptom reports for their assigned patients
DROP POLICY IF EXISTS "Doctors can view assigned patients symptom reports" ON public.symptom_reports;
CREATE POLICY "Doctors can view assigned patients symptom reports" ON public.symptom_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.doctor_patient dp
      JOIN public.profiles p ON dp.doctor_profile_id = p.id
      WHERE dp.patient_id = symptom_reports.patient_id
        AND p.id = auth.uid()
        AND p.role = 'doctor'
    )
  );

-- Add index for better performance (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_symptom_reports_patient_id ON public.symptom_reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_symptom_reports_created_at ON public.symptom_reports(created_at DESC);