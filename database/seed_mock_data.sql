-- Mock patient data seed (AI-native structured data for pattern detection)
-- Populates: documents, doc_chunks, symptoms, encounters, soap_notes, labs, vitals, medications, diagnoses

BEGIN;

-- ============================================
-- CLEANUP (only for IDs used in this seed)
-- ============================================

DELETE FROM public.clinical_alerts WHERE patient_id IN (
  '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
  '90ffe60d-cbf1-488e-9747-ab8319b418f2',
  'b49a037f-deb5-4a9d-a147-bfcf54cb3a72'
);

DELETE FROM public.diagnoses WHERE patient_id IN (
  '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
  '90ffe60d-cbf1-488e-9747-ab8319b418f2',
  'b49a037f-deb5-4a9d-a147-bfcf54cb3a72'
);

DELETE FROM public.medications WHERE patient_id IN (
  '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
  '90ffe60d-cbf1-488e-9747-ab8319b418f2',
  'b49a037f-deb5-4a9d-a147-bfcf54cb3a72'
);

DELETE FROM public.vitals WHERE patient_id IN (
  '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
  '90ffe60d-cbf1-488e-9747-ab8319b418f2',
  'b49a037f-deb5-4a9d-a147-bfcf54cb3a72'
);

DELETE FROM public.labs WHERE patient_id IN (
  '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
  '90ffe60d-cbf1-488e-9747-ab8319b418f2',
  'b49a037f-deb5-4a9d-a147-bfcf54cb3a72'
);

DELETE FROM public.soap_notes WHERE patient_id IN (
  '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
  '90ffe60d-cbf1-488e-9747-ab8319b418f2',
  'b49a037f-deb5-4a9d-a147-bfcf54cb3a72'
);

DELETE FROM public.encounters WHERE patient_id IN (
  '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
  '90ffe60d-cbf1-488e-9747-ab8319b418f2',
  'b49a037f-deb5-4a9d-a147-bfcf54cb3a72'
);

DELETE FROM public.symptoms WHERE patient_id IN (
  '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
  '90ffe60d-cbf1-488e-9747-ab8319b418f2',
  'b49a037f-deb5-4a9d-a147-bfcf54cb3a72'
);

DELETE FROM public.doc_chunks WHERE patient_id IN (
  '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
  '90ffe60d-cbf1-488e-9747-ab8319b418f2',
  'b49a037f-deb5-4a9d-a147-bfcf54cb3a72'
);

DELETE FROM public.documents WHERE patient_id IN (
  '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
  '90ffe60d-cbf1-488e-9747-ab8319b418f2',
  'b49a037f-deb5-4a9d-a147-bfcf54cb3a72'
);

-- ============================================
-- PATIENT 1: JOHN ANDERSON
-- Case: Cardio-Renal-Metabolic Spiral (P0)
-- Pattern: HF + CKD + DM worsening together
-- ============================================

-- Documents
INSERT INTO public.documents (id, patient_id, storage_path, filename, doc_type, status, created_at) VALUES
  ('00000000-0000-0000-0000-000000000101', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', 'mock/john-anderson/echo-2025-10-05.txt', 'Echo_Report_2025-10-05.txt', 'imaging', 'processed', '2025-10-05'),
  ('00000000-0000-0000-0000-000000000102', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', 'mock/john-anderson/labs-2025-10-01.txt', 'Lab_Report_2025-10-01.txt', 'lab', 'processed', '2025-10-01'),
  ('00000000-0000-0000-0000-000000000103', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', 'mock/john-anderson/cardiology-2025-11-10.txt', 'Cardiology_Followup_2025-11-10.txt', 'note', 'processed', '2025-11-10'),
  ('00000000-0000-0000-0000-000000000104', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', 'mock/john-anderson/labs-2025-12-01.txt', 'Lab_Report_2025-12-01.txt', 'lab', 'processed', '2025-12-01'),
  ('00000000-0000-0000-0000-000000000105', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', 'mock/john-anderson/endocrine-2025-12-15.txt', 'Endocrine_Followup_2025-12-15.txt', 'note', 'processed', '2025-12-15');

-- Encounters
INSERT INTO public.encounters (id, patient_id, source_document_id, encounter_date, encounter_type, specialty, chief_complaint, provider_name) VALUES
  ('00000000-0000-0000-0001-000000000101', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0000-000000000101', '2025-10-05', 'procedure', 'cardiology', 'Echocardiogram', 'Dr. Sarah Kim'),
  ('00000000-0000-0000-0001-000000000102', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0000-000000000102', '2025-10-01', 'office', 'pcp', 'Routine labs', 'Dr. Michael Torres'),
  ('00000000-0000-0000-0001-000000000103', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0000-000000000103', '2025-11-10', 'office', 'cardiology', 'HF follow-up, increased edema', 'Dr. Sarah Kim'),
  ('00000000-0000-0000-0001-000000000104', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0000-000000000104', '2025-12-01', 'office', 'pcp', 'Follow-up labs', 'Dr. Michael Torres'),
  ('00000000-0000-0000-0001-000000000105', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0000-000000000105', '2025-12-15', 'office', 'endocrine', 'Diabetes management', 'Dr. Lisa Chang');

-- SOAP Notes
INSERT INTO public.soap_notes (id, encounter_id, patient_id, subjective, objective, assessment, plan) VALUES
  ('00000000-0000-0000-0002-000000000103', '00000000-0000-0000-0001-000000000103', '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
   'Patient reports increased lower extremity swelling over past 2 weeks. Mild dyspnea on exertion, can walk 1 block before SOB. Denies orthopnea or PND. Adherent to medications.',
   '{"bp": "138/82", "hr": 78, "weight_kg": 92, "weight_change": "+3kg from last visit", "exam": "2+ pitting edema bilateral LE, JVP 10cm, lungs clear"}',
   'HFpEF with volume overload, NYHA Class II. Likely dietary indiscretion vs undertreated.',
   'Increase furosemide 20mg to 40mg daily. Low sodium diet reinforced. Recheck renal function in 3 weeks. Call if weight gain >2kg or worsening SOB.'),
  ('00000000-0000-0000-0002-000000000105', '00000000-0000-0000-0001-000000000105', '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
   'Here for diabetes follow-up. Admits to missing metformin doses 2-3x/week due to GI upset. Reports increased thirst and urination. No hypoglycemia.',
   '{"bp": "142/88", "hr": 82, "weight_kg": 93, "a1c": "8.9%", "prior_a1c": "7.6%"}',
   'Type 2 DM with worsening control, A1c 8.9% (up from 7.6%). Likely medication non-adherence + possible progression. Concurrent HFpEF and early CKD complicate therapy.',
   'Consider SGLT2 inhibitor (would help both DM and HF). Check renal function first given recent creatinine rise. If eGFR >30, start empagliflozin 10mg. Nutrition consult for carb counting.');

-- Labs (CRITICAL: structured for trend detection)
INSERT INTO public.labs (id, patient_id, encounter_id, source_document_id, lab_name, value, unit, reference_low, reference_high, is_abnormal, collected_at) VALUES
  -- Baseline labs (Oct 2025)
  ('00000000-0000-0000-0003-000000000101', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000102', '00000000-0000-0000-0000-000000000102', 'creatinine', 1.2, 'mg/dL', 0.7, 1.3, FALSE, '2025-10-01'),
  ('00000000-0000-0000-0003-000000000102', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000102', '00000000-0000-0000-0000-000000000102', 'eGFR', 68, 'mL/min/1.73m2', 60, 120, FALSE, '2025-10-01'),
  ('00000000-0000-0000-0003-000000000103', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000102', '00000000-0000-0000-0000-000000000102', 'BUN', 22, 'mg/dL', 7, 25, FALSE, '2025-10-01'),
  ('00000000-0000-0000-0003-000000000104', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000102', '00000000-0000-0000-0000-000000000102', 'potassium', 4.2, 'mEq/L', 3.5, 5.0, FALSE, '2025-10-01'),
  ('00000000-0000-0000-0003-000000000105', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000102', '00000000-0000-0000-0000-000000000102', 'A1c', 7.6, '%', 4.0, 5.6, TRUE, '2025-10-01'),
  ('00000000-0000-0000-0003-000000000106', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000102', '00000000-0000-0000-0000-000000000102', 'BNP', 280, 'pg/mL', 0, 100, TRUE, '2025-10-01'),
  -- Follow-up labs (Dec 2025) - SHOWING DECLINE
  ('00000000-0000-0000-0003-000000000201', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000104', '00000000-0000-0000-0000-000000000104', 'creatinine', 1.6, 'mg/dL', 0.7, 1.3, TRUE, '2025-12-01'),
  ('00000000-0000-0000-0003-000000000202', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000104', '00000000-0000-0000-0000-000000000104', 'eGFR', 52, 'mL/min/1.73m2', 60, 120, TRUE, '2025-12-01'),
  ('00000000-0000-0000-0003-000000000203', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000104', '00000000-0000-0000-0000-000000000104', 'BUN', 32, 'mg/dL', 7, 25, TRUE, '2025-12-01'),
  ('00000000-0000-0000-0003-000000000204', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000104', '00000000-0000-0000-0000-000000000104', 'potassium', 4.9, 'mEq/L', 3.5, 5.0, FALSE, '2025-12-01'),
  ('00000000-0000-0000-0003-000000000205', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000105', '00000000-0000-0000-0000-000000000105', 'A1c', 8.9, '%', 4.0, 5.6, TRUE, '2025-12-15');

-- Vitals
INSERT INTO public.vitals (id, patient_id, encounter_id, recorded_at, systolic_bp, diastolic_bp, heart_rate, o2_saturation, weight) VALUES
  ('00000000-0000-0000-0004-000000000101', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000102', '2025-10-01', 132, 78, 72, 97, 89),
  ('00000000-0000-0000-0004-000000000102', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000103', '2025-11-10', 138, 82, 78, 96, 92),
  ('00000000-0000-0000-0004-000000000103', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000105', '2025-12-15', 142, 88, 82, 95, 93);

-- Medications
INSERT INTO public.medications (id, patient_id, drug_name, dose, frequency, status, start_date, prescribing_specialty, indication) VALUES
  ('00000000-0000-0000-0005-000000000101', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', 'lisinopril', '10mg', 'daily', 'active', '2024-03-01', 'cardiology', 'HTN, HFpEF'),
  ('00000000-0000-0000-0005-000000000102', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', 'furosemide', '40mg', 'daily', 'active', '2025-11-10', 'cardiology', 'HFpEF volume overload'),
  ('00000000-0000-0000-0005-000000000103', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', 'metformin', '1000mg', 'BID', 'active', '2023-06-01', 'endocrine', 'Type 2 DM'),
  ('00000000-0000-0000-0005-000000000104', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', 'atorvastatin', '20mg', 'daily', 'active', '2024-01-15', 'pcp', 'Hyperlipidemia');

-- Diagnoses
INSERT INTO public.diagnoses (id, patient_id, encounter_id, icd_code, diagnosis_name, diagnosis_type, onset_date, documenting_specialty) VALUES
  ('00000000-0000-0000-0006-000000000101', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000103', 'I50.32', 'Heart failure with preserved ejection fraction (HFpEF)', 'confirmed', '2024-08-01', 'cardiology'),
  ('00000000-0000-0000-0006-000000000102', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000105', 'E11.9', 'Type 2 diabetes mellitus', 'confirmed', '2023-06-01', 'endocrine'),
  ('00000000-0000-0000-0006-000000000103', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000102', 'I10', 'Essential hypertension', 'confirmed', '2022-01-01', 'pcp'),
  ('00000000-0000-0000-0006-000000000104', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', '00000000-0000-0000-0001-000000000104', 'N18.3', 'Chronic kidney disease, stage 3a', 'working', '2025-12-01', 'pcp');

-- Symptoms
INSERT INTO public.symptoms (id, patient_id, description, onset_date, severity, created_at) VALUES
  ('00000000-0000-0000-0007-000000000101', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', 'Dyspnea on exertion', '2025-11-01', 5, '2025-11-10'),
  ('00000000-0000-0000-0007-000000000102', '782811c6-67fb-4cad-a318-97e3a1d9bfe6', 'Lower extremity edema', '2025-10-20', 4, '2025-11-10');

-- Doc chunks (raw text for RAG backup)
INSERT INTO public.doc_chunks (id, document_id, patient_id, chunk_text, page_num, created_at) VALUES
  ('00000000-0000-0000-0008-000000000101', '00000000-0000-0000-0000-000000000101', '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
   'Echo Report 2025-10-05: EF 55%, Grade I diastolic dysfunction, mild LA enlargement. No significant valvular disease. RVSP 35mmHg.', 1, '2025-10-05'),
  ('00000000-0000-0000-0008-000000000102', '00000000-0000-0000-0000-000000000103', '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
   'Cardiology follow-up 2025-11-10: HFpEF, NYHA II. Increased furosemide from 20mg to 40mg daily due to 2+ bilateral LE edema. Reports mild DOE.', 1, '2025-11-10'),
  ('00000000-0000-0000-0008-000000000103', '00000000-0000-0000-0000-000000000104', '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
   'Labs 2025-12-01: Creatinine 1.6 (prior 1.2), eGFR 52 (prior 68), BUN 32, K 4.9. Concerning for AKI on CKD vs diuretic-induced.', 1, '2025-12-01'),
  ('00000000-0000-0000-0008-000000000104', '00000000-0000-0000-0000-000000000105', '782811c6-67fb-4cad-a318-97e3a1d9bfe6',
   'Endocrine 2025-12-15: A1c 8.9% (prior 7.6%). Patient admits poor adherence. Consider SGLT2i for dual benefit in HF/DM but check renal function.', 1, '2025-12-15');


-- ============================================
-- PATIENT 2: MARIA CHEN
-- Case: Occult Malignancy Pattern (P0)
-- Pattern: Weight loss + IDA + GI bleeding across specialties
-- ============================================

-- Documents
INSERT INTO public.documents (id, patient_id, storage_path, filename, doc_type, status, created_at) VALUES
  ('00000000-0000-0000-0000-000000000201', '90ffe60d-cbf1-488e-9747-ab8319b418f2', 'mock/maria-chen/pcp-2025-10-20.txt', 'PCP_Visit_2025-10-20.txt', 'note', 'processed', '2025-10-20'),
  ('00000000-0000-0000-0000-000000000202', '90ffe60d-cbf1-488e-9747-ab8319b418f2', 'mock/maria-chen/gi-2025-11-05.txt', 'GI_Consult_2025-11-05.txt', 'note', 'processed', '2025-11-05'),
  ('00000000-0000-0000-0000-000000000203', '90ffe60d-cbf1-488e-9747-ab8319b418f2', 'mock/maria-chen/labs-2025-11-15.txt', 'Lab_Report_2025-11-15.txt', 'lab', 'processed', '2025-11-15'),
  ('00000000-0000-0000-0000-000000000204', '90ffe60d-cbf1-488e-9747-ab8319b418f2', 'mock/maria-chen/heme-2025-11-18.txt', 'Heme_Consult_2025-11-18.txt', 'note', 'processed', '2025-11-18'),
  ('00000000-0000-0000-0000-000000000205', '90ffe60d-cbf1-488e-9747-ab8319b418f2', 'mock/maria-chen/ct-2025-12-02.txt', 'CT_Abdomen_2025-12-02.txt', 'imaging', 'processed', '2025-12-02');

-- Encounters
INSERT INTO public.encounters (id, patient_id, source_document_id, encounter_date, encounter_type, specialty, chief_complaint, provider_name) VALUES
  ('00000000-0000-0000-0001-000000000201', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0000-000000000201', '2025-10-20', 'office', 'pcp', 'Fatigue, unintentional weight loss', 'Dr. Robert Williams'),
  ('00000000-0000-0000-0001-000000000202', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0000-000000000202', '2025-11-05', 'office', 'gi', 'Intermittent rectal bleeding', 'Dr. Jennifer Park'),
  ('00000000-0000-0000-0001-000000000203', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0000-000000000203', '2025-11-15', 'office', 'pcp', 'Lab review', 'Dr. Robert Williams'),
  ('00000000-0000-0000-0001-000000000204', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0000-000000000204', '2025-11-18', 'office', 'hematology', 'Anemia workup', 'Dr. Amanda Foster'),
  ('00000000-0000-0000-0001-000000000205', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0000-000000000205', '2025-12-02', 'procedure', 'gi', 'CT abdomen for GI workup', 'Dr. Jennifer Park');

-- SOAP Notes
INSERT INTO public.soap_notes (id, encounter_id, patient_id, subjective, objective, assessment, plan) VALUES
  ('00000000-0000-0000-0002-000000000201', '00000000-0000-0000-0001-000000000201', '90ffe60d-cbf1-488e-9747-ab8319b418f2',
   'Patient reports fatigue x 2 months, feels tired even after sleeping 8 hours. Notes clothes fitting looser - estimates 8lb weight loss over 3 months without trying. Appetite decreased. Not on any weight loss medications or GLP-1 agonists. Denies fever, night sweats.',
   '{"bp": "118/72", "hr": 88, "weight_kg": 58, "prior_weight_kg": 61.6, "exam": "Appears fatigued, pale conjunctivae, no lymphadenopathy, abdomen soft non-tender"}',
   'Unintentional weight loss (8 lbs/3.6kg over 3 months) with fatigue. Differential includes malignancy, malabsorption, depression, hyperthyroidism. Pale conjunctivae concerning for anemia.',
   'CBC with diff, CMP, TSH, iron studies. Consider age-appropriate cancer screening. Return in 2 weeks for results. If anemia confirmed, will refer hematology.'),
  ('00000000-0000-0000-0002-000000000202', '00000000-0000-0000-0001-000000000202', '90ffe60d-cbf1-488e-9747-ab8319b418f2',
   'Referred for intermittent blood in stool noticed over past 2 months. Describes bright red blood on toilet paper, sometimes mixed with stool. Denies abdominal pain. Reports recent weight loss being evaluated by PCP. Last colonoscopy was 7 years ago - had one adenomatous polyp removed.',
   '{"bp": "122/74", "hr": 82, "exam": "Abdomen soft, no masses, rectal exam with trace heme-positive stool, no hemorrhoids visualized"}',
   'Intermittent hematochezia x 2 months in patient with history of adenomatous polyp. High-risk for colorectal neoplasia. Concurrent weight loss is concerning.',
   'Schedule colonoscopy within 2 weeks. Obtain CT abdomen to evaluate for mass or metastatic disease. Coordinate with PCP regarding anemia workup.'),
  ('00000000-0000-0000-0002-000000000204', '00000000-0000-0000-0001-000000000204', '90ffe60d-cbf1-488e-9747-ab8319b418f2',
   'Referred for anemia evaluation. Labs show Hgb 9.8, MCV 74, ferritin 8. Reports fatigue, weight loss, and intermittent rectal bleeding currently being worked up by GI.',
   '{"bp": "116/70", "hr": 92, "exam": "Pallor, no petechiae, no hepatosplenomegaly"}',
   'Iron deficiency anemia (microcytic anemia with low ferritin). Likely GI blood loss given history of hematochezia. Must rule out GI malignancy given weight loss + IDA + bleeding triad.',
   'Agree with GI workup - colonoscopy is priority. Hold iron supplementation until after colonoscopy. If colonoscopy negative, will need upper endoscopy. Follow up after GI procedures.');

-- Labs (showing anemia pattern)
INSERT INTO public.labs (id, patient_id, encounter_id, source_document_id, lab_name, value, unit, reference_low, reference_high, is_abnormal, collected_at) VALUES
  -- Initial labs showing anemia
  ('00000000-0000-0000-0003-000000000301', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0001-000000000203', '00000000-0000-0000-0000-000000000203', 'hemoglobin', 9.8, 'g/dL', 12.0, 16.0, TRUE, '2025-11-15'),
  ('00000000-0000-0000-0003-000000000302', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0001-000000000203', '00000000-0000-0000-0000-000000000203', 'MCV', 74, 'fL', 80, 100, TRUE, '2025-11-15'),
  ('00000000-0000-0000-0003-000000000303', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0001-000000000203', '00000000-0000-0000-0000-000000000203', 'ferritin', 8, 'ng/mL', 12, 150, TRUE, '2025-11-15'),
  ('00000000-0000-0000-0003-000000000304', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0001-000000000203', '00000000-0000-0000-0000-000000000203', 'iron', 35, 'mcg/dL', 60, 170, TRUE, '2025-11-15'),
  ('00000000-0000-0000-0003-000000000305', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0001-000000000203', '00000000-0000-0000-0000-000000000203', 'TIBC', 450, 'mcg/dL', 250, 400, TRUE, '2025-11-15'),
  ('00000000-0000-0000-0003-000000000306', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0001-000000000203', '00000000-0000-0000-0000-000000000203', 'platelets', 410, 'K/uL', 150, 400, TRUE, '2025-11-15');

-- Vitals (showing weight loss trend)
INSERT INTO public.vitals (id, patient_id, encounter_id, recorded_at, systolic_bp, diastolic_bp, heart_rate, o2_saturation, weight) VALUES
  ('00000000-0000-0000-0004-000000000201', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0001-000000000201', '2025-10-20', 118, 72, 88, 98, 58),
  ('00000000-0000-0000-0004-000000000202', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0001-000000000202', '2025-11-05', 122, 74, 82, 97, 57),
  ('00000000-0000-0000-0004-000000000203', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0001-000000000204', '2025-11-18', 116, 70, 92, 97, 56.5);

-- Medications (minimal - patient not on many meds)
INSERT INTO public.medications (id, patient_id, drug_name, dose, frequency, status, start_date, prescribing_specialty, indication) VALUES
  ('00000000-0000-0000-0005-000000000201', '90ffe60d-cbf1-488e-9747-ab8319b418f2', 'omeprazole', '20mg', 'daily', 'active', '2025-11-05', 'gi', 'GI protection during workup');

-- Diagnoses
INSERT INTO public.diagnoses (id, patient_id, encounter_id, icd_code, diagnosis_name, diagnosis_type, onset_date, documenting_specialty) VALUES
  ('00000000-0000-0000-0006-000000000201', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0001-000000000201', 'R63.4', 'Unintentional weight loss', 'confirmed', '2025-08-01', 'pcp'),
  ('00000000-0000-0000-0006-000000000202', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0001-000000000204', 'D50.9', 'Iron deficiency anemia', 'confirmed', '2025-11-15', 'hematology'),
  ('00000000-0000-0000-0006-000000000203', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0001-000000000202', 'K62.5', 'Hematochezia', 'confirmed', '2025-09-10', 'gi'),
  ('00000000-0000-0000-0006-000000000204', '90ffe60d-cbf1-488e-9747-ab8319b418f2', '00000000-0000-0000-0001-000000000202', 'Z86.010', 'History of colonic polyps', 'historical', '2018-01-01', 'gi');

-- Symptoms
INSERT INTO public.symptoms (id, patient_id, description, onset_date, severity, created_at) VALUES
  ('00000000-0000-0000-0007-000000000201', '90ffe60d-cbf1-488e-9747-ab8319b418f2', 'Unintentional weight loss (8 lbs over 3 months)', '2025-08-15', 3, '2025-10-20'),
  ('00000000-0000-0000-0007-000000000202', '90ffe60d-cbf1-488e-9747-ab8319b418f2', 'Intermittent rectal bleeding', '2025-09-10', 4, '2025-11-05'),
  ('00000000-0000-0000-0007-000000000203', '90ffe60d-cbf1-488e-9747-ab8319b418f2', 'Fatigue', '2025-08-15', 5, '2025-10-20');

-- Doc chunks
INSERT INTO public.doc_chunks (id, document_id, patient_id, chunk_text, page_num, created_at) VALUES
  ('00000000-0000-0000-0008-000000000201', '00000000-0000-0000-0000-000000000201', '90ffe60d-cbf1-488e-9747-ab8319b418f2',
   'PCP visit 2025-10-20: Reports fatigue and 8 lb unintentional weight loss over 3 months. No GLP-1 medications. Appetite decreased. Pale conjunctivae on exam.', 1, '2025-10-20'),
  ('00000000-0000-0000-0008-000000000202', '00000000-0000-0000-0000-000000000202', '90ffe60d-cbf1-488e-9747-ab8319b418f2',
   'GI consult 2025-11-05: Intermittent hematochezia x 2 months. History of adenomatous polyp, colonoscopy 7 years ago. Recommending colonoscopy and CT abdomen.', 1, '2025-11-05'),
  ('00000000-0000-0000-0008-000000000203', '00000000-0000-0000-0000-000000000203', '90ffe60d-cbf1-488e-9747-ab8319b418f2',
   'Labs 2025-11-15: Hgb 9.8 g/dL (low), MCV 74 fL (low), Ferritin 8 ng/mL (low), Platelets 410 (mildly elevated). Classic iron deficiency anemia pattern.', 1, '2025-11-15'),
  ('00000000-0000-0000-0008-000000000204', '00000000-0000-0000-0000-000000000204', '90ffe60d-cbf1-488e-9747-ab8319b418f2',
   'Hematology 2025-11-18: Iron deficiency anemia confirmed. Pattern concerning for GI blood loss. Must rule out malignancy given triad of weight loss + IDA + bleeding.', 1, '2025-11-18'),
  ('00000000-0000-0000-0008-000000000205', '00000000-0000-0000-0000-000000000205', '90ffe60d-cbf1-488e-9747-ab8319b418f2',
   'CT Abdomen 2025-12-02: No acute findings. Mild colonic wall thickening in ascending colon - correlate with colonoscopy. No hepatic lesions. Recommend colonoscopy.', 1, '2025-12-02');


-- ============================================
-- PATIENT 3: SAGAR PATEL
-- Case: AFib with Anticoagulation Held (P1)
-- Pattern: Tests suppression logic - anticoag intentionally held
-- ============================================

-- Documents
INSERT INTO public.documents (id, patient_id, storage_path, filename, doc_type, status, created_at) VALUES
  ('00000000-0000-0000-0000-000000000301', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', 'mock/sagar-patel/ecg-2025-11-28.txt', 'ECG_2025-11-28.txt', 'imaging', 'processed', '2025-11-28'),
  ('00000000-0000-0000-0000-000000000302', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', 'mock/sagar-patel/gi-bleed-2025-12-01.txt', 'GI_Bleed_Admission_2025-12-01.txt', 'note', 'processed', '2025-12-01'),
  ('00000000-0000-0000-0000-000000000303', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', 'mock/sagar-patel/labs-2025-12-02.txt', 'Lab_Report_2025-12-02.txt', 'lab', 'processed', '2025-12-02'),
  ('00000000-0000-0000-0000-000000000304', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', 'mock/sagar-patel/cardiology-2025-12-08.txt', 'Cardiology_Followup_2025-12-08.txt', 'note', 'processed', '2025-12-08');

-- Encounters
INSERT INTO public.encounters (id, patient_id, source_document_id, encounter_date, encounter_type, specialty, chief_complaint, provider_name) VALUES
  ('00000000-0000-0000-0001-000000000301', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0000-000000000301', '2025-11-28', 'office', 'cardiology', 'Palpitations, ECG', 'Dr. David Chen'),
  ('00000000-0000-0000-0001-000000000302', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0000-000000000302', '2025-12-01', 'inpatient', 'gi', 'Melena, GI bleed', 'Dr. Susan Lee'),
  ('00000000-0000-0000-0001-000000000303', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0000-000000000303', '2025-12-02', 'inpatient', 'gi', 'GI bleed - day 2', 'Dr. Susan Lee'),
  ('00000000-0000-0000-0001-000000000304', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0000-000000000304', '2025-12-08', 'office', 'cardiology', 'Post-GI bleed cardiology follow-up', 'Dr. David Chen');

-- SOAP Notes
INSERT INTO public.soap_notes (id, encounter_id, patient_id, subjective, objective, assessment, plan) VALUES
  ('00000000-0000-0000-0002-000000000302', '00000000-0000-0000-0001-000000000302', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72',
   'Patient presents with 2 episodes of black tarry stools over past 24 hours. Feels lightheaded when standing. On warfarin for AFib. Denies hematemesis, abdominal pain. Last INR was 2.8 one week ago.',
   '{"bp": "98/62", "hr": 102, "orthostatic": "positive", "exam": "Pale, dry mucous membranes, abdomen soft, melena on rectal exam", "hemoglobin": 8.7}',
   'Upper GI bleed on anticoagulation. Hemodynamically significant given tachycardia and orthostasis. AFib rhythm stable.',
   'NPO, IV fluids, type and cross 2 units. Hold warfarin. Urgent EGD in AM. GI consulted. Monitor Hgb q6h. Give vitamin K 2.5mg IV.'),
  ('00000000-0000-0000-0002-000000000304', '00000000-0000-0000-0001-000000000304', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72',
   'Follow-up after GI bleed hospitalization. Warfarin held since admission. EGD showed gastric ulcer which was treated. Feeling better, no further melena. Concerned about stroke risk without anticoagulation.',
   '{"bp": "128/78", "hr": 68, "rhythm": "AFib with controlled rate", "exam": "No pallor, abdomen non-tender, no edema"}',
   'AFib with CHADS2-VASc score 4 (HTN, DM, age 72, vascular disease). High stroke risk. Recent GI bleed requiring anticoagulation hold. Complex risk-benefit.',
   'Continue holding warfarin for 4 more weeks per GI. Repeat EGD in 4 weeks to confirm ulcer healing. If healed, restart anticoagulation - consider DOAC vs warfarin. Discussed stroke risk during this period. Will see patient in 4 weeks, sooner if symptoms.');

-- Labs
INSERT INTO public.labs (id, patient_id, encounter_id, source_document_id, lab_name, value, unit, reference_low, reference_high, is_abnormal, collected_at) VALUES
  ('00000000-0000-0000-0003-000000000401', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0001-000000000302', '00000000-0000-0000-0000-000000000303', 'hemoglobin', 8.7, 'g/dL', 13.5, 17.5, TRUE, '2025-12-01'),
  ('00000000-0000-0000-0003-000000000402', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0001-000000000303', '00000000-0000-0000-0000-000000000303', 'hemoglobin', 9.2, 'g/dL', 13.5, 17.5, TRUE, '2025-12-02'),
  ('00000000-0000-0000-0003-000000000403', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0001-000000000302', '00000000-0000-0000-0000-000000000303', 'INR', 2.8, '', 2.0, 3.0, FALSE, '2025-12-01'),
  ('00000000-0000-0000-0003-000000000404', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0001-000000000303', '00000000-0000-0000-0000-000000000303', 'INR', 1.1, '', 2.0, 3.0, TRUE, '2025-12-02'),
  ('00000000-0000-0000-0003-000000000405', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0001-000000000302', '00000000-0000-0000-0000-000000000303', 'BUN', 42, 'mg/dL', 7, 25, TRUE, '2025-12-01'),
  ('00000000-0000-0000-0003-000000000406', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0001-000000000302', '00000000-0000-0000-0000-000000000303', 'creatinine', 1.1, 'mg/dL', 0.7, 1.3, FALSE, '2025-12-01');

-- Vitals
INSERT INTO public.vitals (id, patient_id, encounter_id, recorded_at, systolic_bp, diastolic_bp, heart_rate, o2_saturation, weight) VALUES
  ('00000000-0000-0000-0004-000000000301', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0001-000000000301', '2025-11-28', 138, 82, 88, 96, 78),
  ('00000000-0000-0000-0004-000000000302', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0001-000000000302', '2025-12-01', 98, 62, 102, 97, 78),
  ('00000000-0000-0000-0004-000000000303', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0001-000000000304', '2025-12-08', 128, 78, 68, 98, 77);

-- Medications (showing warfarin on hold)
INSERT INTO public.medications (id, patient_id, drug_name, dose, frequency, status, start_date, end_date, prescribing_specialty, indication, notes) VALUES
  ('00000000-0000-0000-0005-000000000301', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', 'warfarin', '5mg', 'daily', 'on_hold', '2024-01-15', NULL, 'cardiology', 'AFib stroke prevention', 'HELD 2025-12-01 due to GI bleed. Reassess in 4 weeks.'),
  ('00000000-0000-0000-0005-000000000302', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', 'metoprolol', '50mg', 'BID', 'active', '2024-01-15', NULL, 'cardiology', 'AFib rate control', NULL),
  ('00000000-0000-0000-0005-000000000303', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', 'atorvastatin', '40mg', 'daily', 'active', '2023-06-01', NULL, 'pcp', 'Hyperlipidemia, vascular disease', NULL),
  ('00000000-0000-0000-0005-000000000304', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', 'pantoprazole', '40mg', 'BID', 'active', '2025-12-01', NULL, 'gi', 'Gastric ulcer treatment', 'Started after EGD');

-- Diagnoses
INSERT INTO public.diagnoses (id, patient_id, encounter_id, icd_code, diagnosis_name, diagnosis_type, onset_date, documenting_specialty, notes) VALUES
  ('00000000-0000-0000-0006-000000000301', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0001-000000000301', 'I48.91', 'Atrial fibrillation', 'confirmed', '2023-08-01', 'cardiology', 'CHADS2-VASc 4'),
  ('00000000-0000-0000-0006-000000000302', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0001-000000000302', 'K25.4', 'Gastric ulcer with hemorrhage', 'confirmed', '2025-12-01', 'gi', 'Treated endoscopically'),
  ('00000000-0000-0000-0006-000000000303', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0001-000000000304', 'I10', 'Essential hypertension', 'confirmed', '2020-01-01', 'pcp', NULL),
  ('00000000-0000-0000-0006-000000000304', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0001-000000000304', 'E11.9', 'Type 2 diabetes mellitus', 'confirmed', '2021-03-01', 'pcp', NULL),
  ('00000000-0000-0000-0006-000000000305', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', '00000000-0000-0000-0001-000000000304', 'I25.10', 'Coronary artery disease', 'confirmed', '2022-05-01', 'cardiology', 'Prior stent 2022');

-- Symptoms
INSERT INTO public.symptoms (id, patient_id, description, onset_date, severity, created_at) VALUES
  ('00000000-0000-0000-0007-000000000301', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', 'Palpitations', '2025-11-20', 3, '2025-12-08'),
  ('00000000-0000-0000-0007-000000000302', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72', 'Melena (resolved)', '2025-11-30', 6, '2025-12-01');

-- Doc chunks
INSERT INTO public.doc_chunks (id, document_id, patient_id, chunk_text, page_num, created_at) VALUES
  ('00000000-0000-0000-0008-000000000301', '00000000-0000-0000-0000-000000000301', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72',
   'ECG 2025-11-28: Atrial fibrillation with controlled ventricular response, rate 88. No acute ST changes. QTc 440ms.', 1, '2025-11-28'),
  ('00000000-0000-0000-0008-000000000302', '00000000-0000-0000-0000-000000000302', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72',
   'GI Bleed Admission 2025-12-01: Melena x 2 episodes, hemodynamically significant. On warfarin for AFib. EGD showed gastric ulcer, treated with epinephrine injection and clips. Warfarin held.', 1, '2025-12-01'),
  ('00000000-0000-0000-0008-000000000303', '00000000-0000-0000-0000-000000000303', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72',
   'Labs 2025-12-02: Hgb 8.7 post-bleed (down from baseline 13). INR 1.1 after vitamin K. BUN/Cr ratio elevated consistent with upper GI bleed.', 1, '2025-12-02'),
  ('00000000-0000-0000-0008-000000000304', '00000000-0000-0000-0000-000000000304', 'b49a037f-deb5-4a9d-a147-bfcf54cb3a72',
   'Cardiology 2025-12-08: AFib, CHADS2-VASc 4. Anticoagulation INTENTIONALLY HELD due to recent GI bleed. Plan to reassess in 4 weeks after repeat EGD confirms ulcer healing. High stroke risk discussed with patient.', 1, '2025-12-08');

COMMIT;
