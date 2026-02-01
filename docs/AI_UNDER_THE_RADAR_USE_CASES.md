# AI Under-the-Radar Use Cases

## Purpose
Identify high-impact clinical patterns that are easy to miss in longitudinal records and specify the data signals needed to detect them. This is used to prioritize AI flags that materially improve safety and decision-making across primary care, emergency, and specialty workflows.

## Principles
- Focus on longitudinal signals and cross-document inconsistencies.
- Prefer alerts that change care or prompt immediate verification.
- Provide minimal, clinically actionable summaries with provenance.

## Prioritized Use Cases (with signals)

### P0: Safety-Critical or Time-Sensitive

1) **Progressive renal decline hidden across labs**
- **Why it slips:** Creatinine or eGFR drift is slow and spread across labs.
- **Signals needed:** Lab history (creatinine, eGFR, BUN), dates, meds (ACEi/NSAIDs/diuretics), diagnoses (DM/HTN).
- **Example alert:** "eGFR declined from 78 to 52 over 9 months; NSAID use noted. Consider CKD staging and med review."

2) **Silent hypoxia / respiratory decline across visits**
- **Why it slips:** Single O2 sat looks acceptable; trend shows decline.
- **Signals needed:** Vitals history, imaging reports, problem list (COPD/ILD), symptoms (dyspnea), smoking history.
- **Example alert:** "O2 saturation trend: 98% → 93% → 90% over 4 months with new exertional dyspnea."

3) **Missed anticoagulation in atrial fibrillation**
- **Why it slips:** AFib documented, CHADS-VASc not calculated, no anticoagulant noted.
- **Signals needed:** Diagnoses (AFib), age, HTN/DM/CHF/stroke history, med list.
- **Example alert:** "AFib + CHADS-VASc = 3, but no anticoagulant found in med list."

4) **Cancer red flags across notes (weight loss + anemia + rectal bleeding)**
- **Why it slips:** Symptoms documented in separate notes without aggregation.
- **Signals needed:** Symptoms, labs (Hgb/MCV), imaging notes, GI consults, colonoscopy history.
- **Example alert:** "Unintentional weight loss + iron-deficiency anemia + reported hematochezia across 3 visits."

5) **Medication interaction risk over time**
- **Why it slips:** New meds added across providers, no single review.
- **Signals needed:** Medication lists, allergies, labs (QT, INR), diagnoses.
- **Example alert:** "New macrolide + existing QT-prolonging agent + prior prolonged QT on ECG."

### P1: High-Impact Chronic Care Gaps

6) **Uncontrolled diabetes masked by sporadic A1c**
- **Why it slips:** A1c checked infrequently; rising trend not highlighted.
- **Signals needed:** A1c history, fasting glucose, meds, adherence notes.
- **Example alert:** "A1c trend: 7.1 → 7.8 → 9.2 over 12 months; no med escalation documented."

7) **Hypertension uncontrolled despite multiple visits**
- **Why it slips:** Elevated readings in separate contexts, no summary.
- **Signals needed:** Vitals across encounters, meds, home BP logs if present.
- **Example alert:** "BP ≥ 150/90 in 5 of last 6 visits; no therapy change documented."

8) **Overdue screening or surveillance**
- **Why it slips:** Screening schedules buried in PCP or specialist notes.
- **Signals needed:** Procedure history, family history, age/sex, prior abnormal results.
- **Example alert:** "History of tubular adenoma; colonoscopy last 7 years ago, surveillance overdue."

9) **Chronic anemia pattern missed**
- **Why it slips:** Hgb slightly low but persistent; no workup.
- **Signals needed:** CBC trend, iron studies, menstrual history, GI symptoms.
- **Example alert:** "Hgb 11.2 → 10.6 → 10.1 with low MCV; no iron studies found."

10) **Progressive liver injury**
- **Why it slips:** Mild AST/ALT elevations dismissed; trend indicates chronic injury.
- **Signals needed:** LFT trend, meds, alcohol history, metabolic risk.
- **Example alert:** "ALT persistently 2–3x ULN across 6 months; statin + alcohol history."

### P2: Cross-Document Inconsistencies

11) **Conflicting allergy documentation**
- **Why it slips:** Allergies differ between ED and PCP notes.
- **Signals needed:** Allergy lists across notes, med exposures.
- **Example alert:** "Penicillin allergy listed in ED note; later PCP note documents no drug allergies."

12) **Duplicative therapy**
- **Why it slips:** Similar meds added by different providers (e.g., dual ACEi/ARB).
- **Signals needed:** Med list, dosing, specialties.
- **Example alert:** "Lisinopril and losartan both active; dual RAAS blockade risk."

13) **Missed follow-up on abnormal imaging**
- **Why it slips:** Incidental findings not tracked to follow-up.
- **Signals needed:** Radiology impressions, recommended follow-up, appointment history.
- **Example alert:** "Pulmonary nodule (6mm) with 12-month CT follow-up recommended; no repeat imaging found."

## Data Requirements Summary
- **Structured:** meds, allergies, vitals, labs, problem list, procedures, diagnoses.
- **Unstructured:** visit notes, imaging reports, discharge summaries, referral notes.
- **Temporal:** date-stamped history for trend analysis.

## Output Format Recommendations
- One-line summary + evidence bullets + time window.
- Link to source notes/chunks for clinician verification.
- Explicit “data missing” if evidence is partial.

## Immediate Next Steps
- Ensure mock data includes longitudinal lab/vital trends and multi-note symptom histories.
- Seed imaging reports with explicit follow-up recommendations.
- Include conflicting or duplicative entries to test reconciliation logic.

## Cross-Specialty Patterns (Multi-Doctor Blind Spots)

### Feasibility Notes (Be Critical)
- **Feasible** when data is longitudinal, date-stamped, and consistent across specialties.
- **Risky** when labels are missing or conflicting (e.g., inconsistent diagnosis coding).
- **Guardrail**: AI should flag as "possible pattern" and recommend verification, not assert diagnosis.
- **Reality check**: Some patterns require physical exam or imaging not in the record; these should be presented as "needs confirmation."

### Failure Modes (Prevent False-Positive Fatigue)
- **Baseline vs. spike:** Compare against outpatient baseline; suppress isolated inpatient spikes that resolve within 14 days.
- **Medication list drift:** Cross-check narrative notes for “holding,” “bridging,” or external management (e.g., Coumadin clinic).
- **Context suppression:** Suppress P0/P1 alerts for hospice/palliative or immediate post-op contexts.
- **Subject attribution:** Ensure NLP links symptoms to the patient, not family history or problem list carryover.
- **Confidence labeling:** Flag whether the signal is structured (high) or NLP-derived (lower), and show missing data explicitly.

### P0: High-Risk, Multi-System Links

1) **Cardio–Renal–Metabolic spiral (HF + CKD + DM)**
- **Why it slips:** Each specialty focuses on its organ system; combined trend shows worsening.
- **Signals needed:** A1c trend, eGFR/creatinine trend, BNP/echo notes, diuretic/ACEi/ARB usage, volume status notes.
- **Refined trigger:** New diuretic or dose increase followed by >20% creatinine rise within 30 days.
- **Cross-specialty insight:** Rising creatinine after diuretics + worsening dyspnea + elevated A1c suggests combined decompensation.
- **Example alert:** "CHF symptoms increasing + eGFR decline + poor glycemic control suggests cardio-renal-metabolic deterioration; consider coordinated management."

2) **Occult malignancy pattern across GI + heme + primary care**
- **Why it slips:** GI sees bleeding, heme sees anemia, PCP sees weight loss; no one aggregates.
- **Signals needed:** Hgb/MCV trend, GI symptoms, colonoscopy history, imaging impressions, weight trend.
- **Refined exclusions:** GLP-1 agonist use, explicit family-history attribution, or recent intentional weight-loss program.
- **Cross-specialty insight:** Iron-deficiency anemia + positive GI symptoms + weight loss across visits.
- **Example alert:** "Iron-deficiency anemia trend + intermittent hematochezia + unintentional weight loss across 3 specialties."

3) **Autoimmune systemic disease (rheum + pulm + derm)**
- **Why it slips:** Each specialist sees a local manifestation.
- **Signals needed:** Serologies (ANA, ENA), CT chest reports, rashes/photosensitive notes, joint symptoms.
- **Refined trigger:** Require 3+ systems (e.g., joints + skin + lung); do not trigger on ANA alone.
- **Cross-specialty insight:** ILD + rash + arthralgias suggests systemic autoimmune etiology.
- **Example alert:** "ILD note + recurrent rash + joint pain documented in separate visits; consider systemic autoimmune workup."

4) **Medication cascade and adverse effects (cardio + urology + neuro)**
- **Why it slips:** Medication effects managed in isolation.
- **Signals needed:** Medication list, BP trends, falls/dizziness, urinary retention notes.
- **Cross-specialty insight:** Anticholinergic + alpha-blocker + sedative linked to falls and urinary retention.
- **Example alert:** "Recent falls + urinary retention after new anticholinergic in setting of alpha-blocker; consider med cascade."

5) **Thromboembolic risk across specialties**
- **Why it slips:** Risk factors split across oncology, cardiology, and primary care.
- **Signals needed:** Cancer history, AFib, prior DVT/PE, anticoagulant status, immobility notes.
- **Refined exclusions:** Documented recent major bleed, intracranial hemorrhage, or explicit “contraindication to anticoagulation.”
- **Cross-specialty insight:** Multiple risk factors without anticoagulation or prophylaxis plan.
- **Example alert:** "Active malignancy + AFib + reduced mobility but no anticoagulant noted."

### P1: Chronic or Subtle Patterns

6) **Cardio–GI interplay (AFib + GI bleed risk)**
- **Why it slips:** Cardiology focuses on anticoagulation; GI focuses on bleed risk.
- **Signals needed:** Anticoagulant use, GI bleed history, endoscopy findings, Hgb trends.
- **Refined check:** Search notes for “holding anticoagulation,” “bridge therapy,” or external Coumadin clinic.
- **Cross-specialty insight:** Anticoagulation needed but GI risk high; requires coordinated plan.
- **Example alert:** "AFib with CHADS-VASc 4 on anticoagulation + recurrent GI bleed; consider coordinated strategy."

7) **Urology–Nephrology–Infectious pattern (recurrent UTI + CKD)**
- **Why it slips:** UTIs treated episodically; kidney decline seen separately.
- **Signals needed:** UTI frequency, cultures, imaging (hydronephrosis), creatinine trend.
- **Refined check:** Separate inpatient acute kidney injury from outpatient trend decline.
- **Cross-specialty insight:** Recurrent infections + obstruction signs + declining kidney function.
- **Example alert:** "Recurrent UTIs + hydronephrosis on imaging + eGFR decline suggests obstructive uropathy."

8) **Neuro–Cardio (TIA/stroke risk vs arrhythmia)**
- **Why it slips:** Neuro sees transient symptoms; cardio sees intermittent arrhythmia.
- **Signals needed:** Event notes, EKG/monitoring reports, anticoagulation status.
- **Cross-specialty insight:** TIA-like events with paroxysmal AFib not linked.
- **Example alert:** "Transient neuro deficits + documented paroxysmal AFib; no anticoagulation noted."

9) **Endocrine–Bone–GI (malabsorption → osteoporosis)**
- **Why it slips:** GI sees malabsorption; ortho/endocrine sees fractures.
- **Signals needed:** Vitamin D levels, bone density reports, celiac/IBD history, fracture history.
- **Refined exclusions:** Recent high-impact trauma documented as fracture cause.
- **Cross-specialty insight:** Chronic malabsorption with bone loss and fractures.
- **Example alert:** "Low vitamin D + celiac history + vertebral fracture suggests malabsorption-related osteoporosis."

10) **Pulm–Cardio (sleep apnea driving cardiac issues)**
- **Why it slips:** Sleep symptoms minimized; cardiology sees resistant HTN/AFib.
- **Signals needed:** Snoring/daytime sleepiness notes, BMI, HTN control, AFib.
- **Refined trigger:** Require 2+ OSA indicators plus resistant HTN or AFib.
- **Cross-specialty insight:** Untreated OSA contributing to cardiovascular instability.
- **Example alert:** "Resistant HTN + AFib + loud snoring documented; consider sleep study."

### P2: Data Reconciliation Opportunities

11) **Conflicting diagnosis labeling across specialties**
- **Why it slips:** Different specialties document different working diagnoses.
- **Signals needed:** Problem list entries over time, specialty notes.
- **Cross-specialty insight:** Divergent labels (e.g., IBS vs IBD) need reconciliation.
- **Example alert:** "GI note: IBD suspected; PCP problem list: IBS. Consider reconciling diagnosis."

12) **Lab trends vs narrative mismatch**
- **Why it slips:** Narrative notes may overlook lab trend significance.
- **Signals needed:** Lab time series, problem list, note summaries.
- **Refined check:** Ignore single post-op or ED-only lab spikes without outpatient corroboration.
- **Cross-specialty insight:** Rising troponin trend in labs while notes document "non-cardiac" pain.
- **Example alert:** "Troponin trend rising over 3 labs despite non-cardiac assessment; consider cardiology review."

### P3: Care Context Suppression

13) **Hospice or comfort-care context**
- **Why it fails:** Flags are inappropriate when goals are comfort-focused.
- **Signals needed:** DNR/DNI status, palliative care consults, hospice keywords.
- **Action:** Suppress P0/P1 alerts; allow informational summaries only.

14) **Immediate post-op noise**
- **Why it fails:** Anemia/tachycardia can be expected in the first 24–72 hours post-op.
- **Signals needed:** Surgery date, post-op day, inpatient vs outpatient context.
- **Action:** Adjust thresholds or suppress transient abnormalities early post-op.

## Data Requirements for Cross-Specialty Detection
- **Core**: time-stamped labs, vitals, meds, diagnoses, imaging impressions.
- **Specialty overlays**: procedure history, specialist notes, serologies, device reports.
- **Linking**: consistent patient IDs and encounter timestamps are mandatory.

## Presentation Guidance
- Surface as "Cross-specialty pattern detected" with specific evidence.
- Include a short "Why this matters" line for clinician triage.
- Always include "verify with specialist" note for high-risk flags.
