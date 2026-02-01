# Supabase RLS Policies - Manual Setup Guide

Add these policies manually in the Supabase Dashboard under **Database → Policies**.

## Permission Summary

| Table | Patient | Doctor |
|-------|---------|--------|
| `documents` | SELECT, INSERT | SELECT, INSERT, DELETE |
| `doc_chunks` | SELECT | SELECT, DELETE |
| `symptoms` | SELECT, INSERT | SELECT, INSERT, DELETE |
| `briefs` | SELECT | SELECT, INSERT, UPDATE, DELETE |

---

## 1. Documents Table

### Patient: View own documents
```sql
-- Policy Name: Patients can view own documents
-- Operation: SELECT
-- Target Roles: authenticated

CREATE POLICY "Patients can view own documents"
ON public.documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = documents.patient_id
    AND p.owner_patient_profile_id = auth.uid()
  )
);
```

### Patient: Upload documents
```sql
-- Policy Name: Patients can upload documents
-- Operation: INSERT

CREATE POLICY "Patients can upload documents"
ON public.documents
FOR INSERT
WITH CHECK (
  uploader_profile_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id
    AND p.owner_patient_profile_id = auth.uid()
  )
);
```

### Doctor: View assigned patient documents
```sql
-- Policy Name: Doctors can view assigned patient documents
-- Operation: SELECT

CREATE POLICY "Doctors can view assigned patient documents"
ON public.documents
FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);
```

### Doctor: Delete documents
```sql
-- Policy Name: Doctors can delete documents
-- Operation: DELETE

CREATE POLICY "Doctors can delete documents"
ON public.documents
FOR DELETE
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);
```

---

## 2. Doc Chunks Table

### Patient: View own doc chunks
```sql
-- Policy Name: Patients can view own doc chunks
-- Operation: SELECT

CREATE POLICY "Patients can view own doc chunks"
ON public.doc_chunks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = doc_chunks.patient_id
    AND p.owner_patient_profile_id = auth.uid()
  )
);
```

### Doctor: View doc chunks
```sql
-- Policy Name: Doctors can view doc chunks
-- Operation: SELECT

CREATE POLICY "Doctors can view doc chunks"
ON public.doc_chunks
FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);
```

### Doctor: Delete doc chunks
```sql
-- Policy Name: Doctors can delete doc chunks
-- Operation: DELETE

CREATE POLICY "Doctors can delete doc chunks"
ON public.doc_chunks
FOR DELETE
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);
```

---

## 3. Symptoms Table

### Patient: View and add own symptoms
```sql
-- Policy Name: Patients can view own symptoms
-- Operation: SELECT

CREATE POLICY "Patients can view own symptoms"
ON public.symptoms
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = symptoms.patient_id
    AND p.owner_patient_profile_id = auth.uid()
  )
);

-- Policy Name: Patients can add symptoms
-- Operation: INSERT

CREATE POLICY "Patients can add symptoms"
ON public.symptoms
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id
    AND p.owner_patient_profile_id = auth.uid()
  )
);
```

### Doctor: Full access to symptoms
```sql
-- Policy Name: Doctors can view symptoms
-- Operation: SELECT

CREATE POLICY "Doctors can view symptoms"
ON public.symptoms
FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);

-- Policy Name: Doctors can delete symptoms
-- Operation: DELETE

CREATE POLICY "Doctors can delete symptoms"
ON public.symptoms
FOR DELETE
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);
```

---

## 4. Briefs Table

### Doctor: Full access to briefs
```sql
-- Policy Name: Doctors can view briefs
-- Operation: SELECT

CREATE POLICY "Doctors can view briefs"
ON public.briefs
FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);

-- Policy Name: Doctors can create briefs
-- Operation: INSERT

CREATE POLICY "Doctors can create briefs"
ON public.briefs
FOR INSERT
WITH CHECK (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);

-- Policy Name: Doctors can update briefs
-- Operation: UPDATE

CREATE POLICY "Doctors can update briefs"
ON public.briefs
FOR UPDATE
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);

-- Policy Name: Doctors can delete briefs
-- Operation: DELETE

CREATE POLICY "Doctors can delete briefs"
ON public.briefs
FOR DELETE
USING (
  public.get_user_role(auth.uid()) = 'doctor'::public.user_role
  AND public.doctor_can_access_patient(auth.uid(), patient_id)
);
```

---

## Required Helper Functions

Make sure these functions exist (should already be in your database):

```sql
-- Get user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS public.user_role AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Check doctor-patient access
CREATE OR REPLACE FUNCTION public.doctor_can_access_patient(doctor_id UUID, patient_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.doctor_patient dp
    WHERE dp.doctor_profile_id = doctor_id
    AND dp.patient_id = patient_id
  );
$$ LANGUAGE sql SECURITY DEFINER;
```

---

## Notes

1. **Patients can ADD** documents and symptoms (read their own, add new)
2. **Patients CANNOT DELETE** anything (need doctor oversight)
3. **Doctors can ADD and DELETE** all data for assigned patients
4. **Doctors can EDIT** briefs (for the editable deep analysis feature)
5. Cascade deletes handle `doc_chunks` when `documents` are deleted
