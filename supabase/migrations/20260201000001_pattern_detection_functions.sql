-- Pattern Detection Functions for AI Under-the-Radar Use Cases
-- These enable fast SQL-based detection instead of repeated AI extraction

-- ============================================
-- P0: RENAL DECLINE DETECTION
-- Detects eGFR/creatinine decline over time
-- ============================================
CREATE OR REPLACE FUNCTION public.detect_renal_decline(p_patient_id UUID)
RETURNS TABLE (
  alert_type TEXT,
  priority TEXT,
  title TEXT,
  description TEXT,
  evidence JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_baseline_egfr NUMERIC;
  v_latest_egfr NUMERIC;
  v_baseline_date TIMESTAMP;
  v_latest_date TIMESTAMP;
  v_decline_pct NUMERIC;
  v_has_diuretic BOOLEAN;
  v_has_nsaid BOOLEAN;
BEGIN
  -- Get baseline eGFR (oldest in last 12 months)
  SELECT value, collected_at INTO v_baseline_egfr, v_baseline_date
  FROM labs
  WHERE patient_id = p_patient_id
    AND lab_name = 'eGFR'
    AND collected_at > NOW() - INTERVAL '12 months'
  ORDER BY collected_at ASC
  LIMIT 1;

  -- Get latest eGFR
  SELECT value, collected_at INTO v_latest_egfr, v_latest_date
  FROM labs
  WHERE patient_id = p_patient_id
    AND lab_name = 'eGFR'
  ORDER BY collected_at DESC
  LIMIT 1;

  -- Check for diuretics and NSAIDs
  SELECT EXISTS (
    SELECT 1 FROM medications
    WHERE patient_id = p_patient_id
      AND status = 'active'
      AND (drug_name ILIKE '%furosemide%' OR drug_name ILIKE '%lasix%'
           OR drug_name ILIKE '%hydrochlorothiazide%' OR drug_name ILIKE '%hctz%')
  ) INTO v_has_diuretic;

  SELECT EXISTS (
    SELECT 1 FROM medications
    WHERE patient_id = p_patient_id
      AND status = 'active'
      AND (drug_name ILIKE '%ibuprofen%' OR drug_name ILIKE '%naproxen%'
           OR drug_name ILIKE '%meloxicam%' OR drug_name ILIKE '%nsaid%')
  ) INTO v_has_nsaid;

  -- Calculate decline
  IF v_baseline_egfr IS NOT NULL AND v_latest_egfr IS NOT NULL AND v_baseline_egfr > 0 THEN
    v_decline_pct := ((v_baseline_egfr - v_latest_egfr) / v_baseline_egfr) * 100;

    -- Alert if >20% decline
    IF v_decline_pct >= 20 THEN
      RETURN QUERY SELECT
        'renal_decline'::TEXT,
        'P0'::TEXT,
        'Progressive Renal Decline Detected'::TEXT,
        format('eGFR declined from %s to %s (%s%% drop) over %s months.%s%s',
          ROUND(v_baseline_egfr),
          ROUND(v_latest_egfr),
          ROUND(v_decline_pct),
          ROUND(EXTRACT(EPOCH FROM (v_latest_date - v_baseline_date)) / 2592000),
          CASE WHEN v_has_diuretic THEN ' Diuretic use noted.' ELSE '' END,
          CASE WHEN v_has_nsaid THEN ' NSAID use noted - consider discontinuation.' ELSE '' END
        )::TEXT,
        jsonb_build_object(
          'baseline_egfr', v_baseline_egfr,
          'latest_egfr', v_latest_egfr,
          'baseline_date', v_baseline_date,
          'latest_date', v_latest_date,
          'decline_pct', ROUND(v_decline_pct, 1),
          'has_diuretic', v_has_diuretic,
          'has_nsaid', v_has_nsaid
        );
    END IF;
  END IF;
END;
$$;

-- ============================================
-- P0: CARDIO-RENAL-METABOLIC SPIRAL
-- Detects combined HF + CKD + DM deterioration
-- ============================================
CREATE OR REPLACE FUNCTION public.detect_cardiorenal_metabolic(p_patient_id UUID)
RETURNS TABLE (
  alert_type TEXT,
  priority TEXT,
  title TEXT,
  description TEXT,
  evidence JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_hf BOOLEAN;
  v_has_dm BOOLEAN;
  v_has_ckd BOOLEAN;
  v_egfr_decline BOOLEAN := FALSE;
  v_a1c_worsening BOOLEAN := FALSE;
  v_recent_diuretic_change BOOLEAN := FALSE;
  v_baseline_egfr NUMERIC;
  v_latest_egfr NUMERIC;
  v_baseline_a1c NUMERIC;
  v_latest_a1c NUMERIC;
BEGIN
  -- Check for diagnoses
  SELECT EXISTS (
    SELECT 1 FROM diagnoses WHERE patient_id = p_patient_id
    AND (diagnosis_name ILIKE '%heart failure%' OR icd_code LIKE 'I50%')
  ) INTO v_has_hf;

  SELECT EXISTS (
    SELECT 1 FROM diagnoses WHERE patient_id = p_patient_id
    AND (diagnosis_name ILIKE '%diabetes%' OR icd_code LIKE 'E11%')
  ) INTO v_has_dm;

  SELECT EXISTS (
    SELECT 1 FROM diagnoses WHERE patient_id = p_patient_id
    AND (diagnosis_name ILIKE '%chronic kidney%' OR icd_code LIKE 'N18%')
  ) INTO v_has_ckd;

  -- Check for recent diuretic dose change
  SELECT EXISTS (
    SELECT 1 FROM medications
    WHERE patient_id = p_patient_id
      AND drug_name ILIKE '%furosemide%'
      AND start_date > NOW() - INTERVAL '60 days'
  ) INTO v_recent_diuretic_change;

  -- Check eGFR decline (>20% in 30 days after diuretic)
  SELECT value INTO v_baseline_egfr FROM labs
  WHERE patient_id = p_patient_id AND lab_name = 'eGFR'
    AND collected_at < NOW() - INTERVAL '30 days'
  ORDER BY collected_at DESC LIMIT 1;

  SELECT value INTO v_latest_egfr FROM labs
  WHERE patient_id = p_patient_id AND lab_name = 'eGFR'
  ORDER BY collected_at DESC LIMIT 1;

  IF v_baseline_egfr IS NOT NULL AND v_latest_egfr IS NOT NULL THEN
    v_egfr_decline := ((v_baseline_egfr - v_latest_egfr) / v_baseline_egfr) > 0.20;
  END IF;

  -- Check A1c worsening
  SELECT value INTO v_baseline_a1c FROM labs
  WHERE patient_id = p_patient_id AND lab_name = 'A1c'
    AND collected_at < NOW() - INTERVAL '90 days'
  ORDER BY collected_at DESC LIMIT 1;

  SELECT value INTO v_latest_a1c FROM labs
  WHERE patient_id = p_patient_id AND lab_name = 'A1c'
  ORDER BY collected_at DESC LIMIT 1;

  IF v_baseline_a1c IS NOT NULL AND v_latest_a1c IS NOT NULL THEN
    v_a1c_worsening := (v_latest_a1c - v_baseline_a1c) >= 1.0;
  END IF;

  -- Alert if pattern detected
  IF v_has_hf AND v_has_dm AND (v_egfr_decline OR v_has_ckd) AND (v_recent_diuretic_change OR v_a1c_worsening) THEN
    RETURN QUERY SELECT
      'cardiorenal_metabolic'::TEXT,
      'P0'::TEXT,
      'Cardio-Renal-Metabolic Spiral Detected'::TEXT,
      format('Patient has HF + DM + %s. %s%s Consider coordinated multi-specialty management.',
        CASE WHEN v_has_ckd THEN 'CKD' ELSE 'renal decline' END,
        CASE WHEN v_egfr_decline THEN format('eGFR dropped from %s to %s. ', ROUND(v_baseline_egfr), ROUND(v_latest_egfr)) ELSE '' END,
        CASE WHEN v_a1c_worsening THEN format('A1c worsened from %s%% to %s%%. ', v_baseline_a1c, v_latest_a1c) ELSE '' END
      )::TEXT,
      jsonb_build_object(
        'has_hf', v_has_hf,
        'has_dm', v_has_dm,
        'has_ckd', v_has_ckd,
        'egfr_baseline', v_baseline_egfr,
        'egfr_latest', v_latest_egfr,
        'a1c_baseline', v_baseline_a1c,
        'a1c_latest', v_latest_a1c,
        'recent_diuretic_change', v_recent_diuretic_change
      );
  END IF;
END;
$$;

-- ============================================
-- P0: OCCULT MALIGNANCY PATTERN
-- Weight loss + IDA + GI bleeding triad
-- ============================================
CREATE OR REPLACE FUNCTION public.detect_occult_malignancy(p_patient_id UUID)
RETURNS TABLE (
  alert_type TEXT,
  priority TEXT,
  title TEXT,
  description TEXT,
  evidence JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_weight_loss BOOLEAN := FALSE;
  v_has_ida BOOLEAN := FALSE;
  v_has_gi_bleeding BOOLEAN := FALSE;
  v_has_glp1 BOOLEAN := FALSE;
  v_weight_change NUMERIC;
  v_hgb NUMERIC;
  v_mcv NUMERIC;
  v_ferritin NUMERIC;
BEGIN
  -- Check for GLP-1 (exclusion)
  SELECT EXISTS (
    SELECT 1 FROM medications
    WHERE patient_id = p_patient_id
      AND status = 'active'
      AND (drug_name ILIKE '%semaglutide%' OR drug_name ILIKE '%ozempic%'
           OR drug_name ILIKE '%wegovy%' OR drug_name ILIKE '%mounjaro%'
           OR drug_name ILIKE '%tirzepatide%')
  ) INTO v_has_glp1;

  -- Skip if on GLP-1 (intentional weight loss)
  IF v_has_glp1 THEN
    RETURN;
  END IF;

  -- Check weight loss from vitals
  SELECT
    (SELECT weight FROM vitals WHERE patient_id = p_patient_id ORDER BY recorded_at ASC LIMIT 1) -
    (SELECT weight FROM vitals WHERE patient_id = p_patient_id ORDER BY recorded_at DESC LIMIT 1)
  INTO v_weight_change;

  v_has_weight_loss := COALESCE(v_weight_change, 0) >= 3; -- 3kg loss

  -- Also check symptoms/diagnoses
  IF NOT v_has_weight_loss THEN
    SELECT EXISTS (
      SELECT 1 FROM symptoms s WHERE s.patient_id = p_patient_id
      AND s.description ILIKE '%weight loss%'
    ) OR EXISTS (
      SELECT 1 FROM diagnoses d WHERE d.patient_id = p_patient_id
      AND d.diagnosis_name ILIKE '%weight loss%'
    ) INTO v_has_weight_loss;
  END IF;

  -- Check for IDA pattern
  SELECT value INTO v_hgb FROM labs WHERE patient_id = p_patient_id AND lab_name = 'hemoglobin' ORDER BY collected_at DESC LIMIT 1;
  SELECT value INTO v_mcv FROM labs WHERE patient_id = p_patient_id AND lab_name = 'MCV' ORDER BY collected_at DESC LIMIT 1;
  SELECT value INTO v_ferritin FROM labs WHERE patient_id = p_patient_id AND lab_name = 'ferritin' ORDER BY collected_at DESC LIMIT 1;

  v_has_ida := (v_hgb < 12 AND v_mcv < 80) OR (v_ferritin IS NOT NULL AND v_ferritin < 15);

  -- Check for GI bleeding
  SELECT EXISTS (
    SELECT 1 FROM symptoms s WHERE s.patient_id = p_patient_id
    AND (s.description ILIKE '%bleeding%' OR s.description ILIKE '%hematochezia%' OR s.description ILIKE '%melena%')
  ) OR EXISTS (
    SELECT 1 FROM diagnoses d WHERE d.patient_id = p_patient_id
    AND (d.diagnosis_name ILIKE '%hematochezia%' OR d.diagnosis_name ILIKE '%GI bleed%' OR d.diagnosis_name ILIKE '%rectal bleeding%')
  ) INTO v_has_gi_bleeding;

  -- Alert if 2+ of the triad present
  IF (v_has_weight_loss::INT + v_has_ida::INT + v_has_gi_bleeding::INT) >= 2 THEN
    RETURN QUERY SELECT
      'occult_malignancy'::TEXT,
      'P0'::TEXT,
      'Cancer Red Flag Pattern Detected'::TEXT,
      format('Patient has %s%s%s - concerning pattern for occult malignancy. Recommend expedited GI workup.',
        CASE WHEN v_has_weight_loss THEN 'unintentional weight loss' ELSE '' END,
        CASE WHEN v_has_weight_loss AND (v_has_ida OR v_has_gi_bleeding) THEN ' + ' ELSE '' END,
        CASE WHEN v_has_ida THEN 'iron deficiency anemia' ELSE '' END ||
        CASE WHEN v_has_ida AND v_has_gi_bleeding THEN ' + ' ELSE '' END ||
        CASE WHEN v_has_gi_bleeding THEN 'GI bleeding' ELSE '' END
      )::TEXT,
      jsonb_build_object(
        'has_weight_loss', v_has_weight_loss,
        'weight_change_kg', v_weight_change,
        'has_ida', v_has_ida,
        'hemoglobin', v_hgb,
        'mcv', v_mcv,
        'ferritin', v_ferritin,
        'has_gi_bleeding', v_has_gi_bleeding
      );
  END IF;
END;
$$;

-- ============================================
-- P1: MISSED ANTICOAGULATION (with suppression)
-- AFib + high CHADS-VASc but no anticoag
-- ============================================
CREATE OR REPLACE FUNCTION public.detect_missed_anticoagulation(p_patient_id UUID)
RETURNS TABLE (
  alert_type TEXT,
  priority TEXT,
  title TEXT,
  description TEXT,
  evidence JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_afib BOOLEAN;
  v_on_anticoag BOOLEAN;
  v_anticoag_held BOOLEAN;
  v_hold_reason TEXT;
  v_chads_score INT := 0;
  v_has_chf BOOLEAN;
  v_has_htn BOOLEAN;
  v_has_dm BOOLEAN;
  v_has_stroke BOOLEAN;
  v_has_vascular BOOLEAN;
  v_age INT;
BEGIN
  -- Check for AFib
  SELECT EXISTS (
    SELECT 1 FROM diagnoses WHERE patient_id = p_patient_id
    AND (diagnosis_name ILIKE '%atrial fibrillation%' OR diagnosis_name ILIKE '%afib%' OR icd_code LIKE 'I48%')
  ) INTO v_has_afib;

  IF NOT v_has_afib THEN
    RETURN;
  END IF;

  -- Check anticoagulation status
  SELECT EXISTS (
    SELECT 1 FROM medications
    WHERE patient_id = p_patient_id
      AND status = 'active'
      AND (drug_name ILIKE '%warfarin%' OR drug_name ILIKE '%coumadin%'
           OR drug_name ILIKE '%apixaban%' OR drug_name ILIKE '%eliquis%'
           OR drug_name ILIKE '%rivaroxaban%' OR drug_name ILIKE '%xarelto%'
           OR drug_name ILIKE '%dabigatran%' OR drug_name ILIKE '%pradaxa%')
  ) INTO v_on_anticoag;

  -- Check if anticoag is ON HOLD (not missing - intentionally held)
  SELECT EXISTS (
    SELECT 1 FROM medications
    WHERE patient_id = p_patient_id
      AND status = 'on_hold'
      AND (drug_name ILIKE '%warfarin%' OR drug_name ILIKE '%apixaban%'
           OR drug_name ILIKE '%rivaroxaban%' OR drug_name ILIKE '%dabigatran%')
  ) INTO v_anticoag_held;

  -- Get hold reason if held
  IF v_anticoag_held THEN
    SELECT notes INTO v_hold_reason FROM medications
    WHERE patient_id = p_patient_id
      AND status = 'on_hold'
      AND (drug_name ILIKE '%warfarin%' OR drug_name ILIKE '%apixaban%')
    LIMIT 1;
  END IF;

  -- SUPPRESSION: If anticoag is intentionally held, don't alert
  IF v_on_anticoag OR v_anticoag_held THEN
    RETURN;
  END IF;

  -- Calculate CHADS2-VASc components
  SELECT EXISTS (SELECT 1 FROM diagnoses WHERE patient_id = p_patient_id AND diagnosis_name ILIKE '%heart failure%') INTO v_has_chf;
  SELECT EXISTS (SELECT 1 FROM diagnoses WHERE patient_id = p_patient_id AND diagnosis_name ILIKE '%hypertension%') INTO v_has_htn;
  SELECT EXISTS (SELECT 1 FROM diagnoses WHERE patient_id = p_patient_id AND (diagnosis_name ILIKE '%diabetes%' OR icd_code LIKE 'E11%')) INTO v_has_dm;
  SELECT EXISTS (SELECT 1 FROM diagnoses WHERE patient_id = p_patient_id AND (diagnosis_name ILIKE '%stroke%' OR diagnosis_name ILIKE '%TIA%')) INTO v_has_stroke;
  SELECT EXISTS (SELECT 1 FROM diagnoses WHERE patient_id = p_patient_id AND (diagnosis_name ILIKE '%coronary%' OR diagnosis_name ILIKE '%PAD%' OR diagnosis_name ILIKE '%vascular%')) INTO v_has_vascular;

  v_chads_score := v_has_chf::INT + v_has_htn::INT + v_has_dm::INT + (v_has_stroke::INT * 2) + v_has_vascular::INT;
  -- Note: Age and sex would add more points but we don't have DOB reliably

  -- Alert if CHADS >= 2 and no anticoag
  IF v_chads_score >= 2 THEN
    RETURN QUERY SELECT
      'missed_anticoagulation'::TEXT,
      'P0'::TEXT,
      'AFib Without Anticoagulation'::TEXT,
      format('Patient has AFib with CHADS2-VASc >= %s but no anticoagulant found. Components: %s%s%s%s%s',
        v_chads_score,
        CASE WHEN v_has_chf THEN 'CHF, ' ELSE '' END,
        CASE WHEN v_has_htn THEN 'HTN, ' ELSE '' END,
        CASE WHEN v_has_dm THEN 'DM, ' ELSE '' END,
        CASE WHEN v_has_stroke THEN 'prior stroke/TIA, ' ELSE '' END,
        CASE WHEN v_has_vascular THEN 'vascular disease' ELSE '' END
      )::TEXT,
      jsonb_build_object(
        'has_afib', v_has_afib,
        'chads_score', v_chads_score,
        'on_anticoag', v_on_anticoag,
        'anticoag_held', v_anticoag_held,
        'components', jsonb_build_object(
          'chf', v_has_chf, 'htn', v_has_htn, 'dm', v_has_dm,
          'stroke', v_has_stroke, 'vascular', v_has_vascular
        )
      );
  END IF;
END;
$$;

-- ============================================
-- MASTER FUNCTION: Run all detections
-- ============================================
CREATE OR REPLACE FUNCTION public.detect_all_patterns(p_patient_id UUID)
RETURNS TABLE (
  alert_type TEXT,
  priority TEXT,
  title TEXT,
  description TEXT,
  evidence JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM detect_renal_decline(p_patient_id);
  RETURN QUERY SELECT * FROM detect_cardiorenal_metabolic(p_patient_id);
  RETURN QUERY SELECT * FROM detect_occult_malignancy(p_patient_id);
  RETURN QUERY SELECT * FROM detect_missed_anticoagulation(p_patient_id);
END;
$$;

-- ============================================
-- HELPER: Get patient clinical summary
-- Fast structured data retrieval for AI context
-- ============================================
CREATE OR REPLACE FUNCTION public.get_patient_clinical_summary(p_patient_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'diagnoses', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', diagnosis_name,
        'type', diagnosis_type,
        'icd', icd_code,
        'specialty', documenting_specialty
      )), '[]'::jsonb)
      FROM diagnoses WHERE patient_id = p_patient_id AND diagnosis_type != 'ruled_out'
    ),
    'medications', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'drug', drug_name,
        'dose', dose,
        'frequency', frequency,
        'status', status,
        'indication', indication,
        'notes', notes
      )), '[]'::jsonb)
      FROM medications WHERE patient_id = p_patient_id
    ),
    'recent_labs', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', lab_name,
        'value', value,
        'unit', unit,
        'abnormal', is_abnormal,
        'date', collected_at::date
      ) ORDER BY collected_at DESC), '[]'::jsonb)
      FROM (
        SELECT DISTINCT ON (lab_name) *
        FROM labs WHERE patient_id = p_patient_id
        ORDER BY lab_name, collected_at DESC
      ) latest_labs
    ),
    'recent_vitals', (
      SELECT jsonb_build_object(
        'bp', systolic_bp || '/' || diastolic_bp,
        'hr', heart_rate,
        'o2', o2_saturation,
        'weight_kg', weight,
        'date', recorded_at::date
      )
      FROM vitals WHERE patient_id = p_patient_id
      ORDER BY recorded_at DESC LIMIT 1
    ),
    'active_symptoms', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'description', s.description,
        'severity', s.severity,
        'onset', s.onset_date
      )), '[]'::jsonb)
      FROM symptoms s WHERE s.patient_id = p_patient_id
    ),
    'alerts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'type', alert_type,
        'priority', priority,
        'title', title,
        'description', description
      )), '[]'::jsonb)
      FROM detect_all_patterns(p_patient_id)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
