/**
 * Optimized Clinical Insights using Structured SQL Data + Keywords AI
 *
 * Flow:
 * 1. SQL: get_patient_clinical_summary() - instant structured data
 * 2. SQL: detect_all_patterns() - instant alert detection
 * 3. Keywords AI: Only does reasoning/formatting (not extraction)
 *
 * This is 5-10x faster than having the LLM extract from raw text.
 */

import { supabase } from '@/integrations/supabase/client';
import { BriefContent } from './api';
import {
  evaluateClinicalBrief,
  summarizeEvaluations,
  flagForHumanReview,
  EvalResult,
  EvaluationSummary,
} from './evaluations';

const KEYWORDS_AI_URL = "https://api.keywordsai.co/api/chat/completions";

// Use faster model for structured data (we're not asking it to extract)
const FAST_MODEL = "gpt-4o-mini";  // Fast + cheap for formatting
const REASONING_MODEL = "gpt-4o";   // Better reasoning when needed

interface RequestMetadata {
  patientId?: string;
  doctorId?: string;
  sessionId?: string;
  feature?: string;
}

interface ClinicalSummary {
  diagnoses: Array<{
    name: string;
    type: string;
    icd: string | null;
    specialty: string;
  }>;
  medications: Array<{
    drug: string;
    dose: string;
    frequency: string;
    status: string;
    indication: string;
    notes: string | null;
  }>;
  recent_labs: Array<{
    name: string;
    value: number;
    unit: string;
    abnormal: boolean;
    date: string;
  }>;
  recent_vitals: {
    bp: string;
    hr: number;
    o2: number;
    weight_kg: number;
    date: string;
  } | null;
  active_symptoms: Array<{
    description: string;
    severity: number;
    onset: string;
  }>;
  alerts: Array<{
    type: string;
    priority: string;
    title: string;
    description: string;
  }>;
}

interface PatientInfo {
  full_name: string;
  dob: string | null;
}

// ============================================
// Step 1: Get structured data from SQL (FAST)
// ============================================
export async function getPatientClinicalSummary(patientId: string): Promise<ClinicalSummary | null> {
  const { data, error } = await supabase.rpc('get_patient_clinical_summary', {
    p_patient_id: patientId
  });

  if (error) {
    console.error('Error fetching clinical summary:', error);
    return null;
  }

  return data as ClinicalSummary;
}

// ============================================
// Step 2: Get detected patterns from SQL (FAST)
// ============================================
export async function getDetectedAlerts(patientId: string): Promise<Array<{
  alert_type: string;
  priority: string;
  title: string;
  description: string;
  evidence: Record<string, any>;
}>> {
  const { data, error } = await supabase.rpc('detect_all_patterns', {
    p_patient_id: patientId
  });

  if (error) {
    console.error('Error detecting patterns:', error);
    return [];
  }

  return data || [];
}

// ============================================
// Step 3: Call Keywords AI with structured data
// ============================================
async function callKeywordsAI(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  model: string,
  metadata: RequestMetadata = {}
): Promise<string> {
  const apiKey = typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_KEYWORDS_AI_API_KEY
    : process.env.VITE_KEYWORDS_AI_API_KEY;

  if (!apiKey) {
    throw new Error("VITE_KEYWORDS_AI_API_KEY is not set");
  }

  const startTime = Date.now();

  const response = await fetch(KEYWORDS_AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,  // Low for consistency
      extra_body: {
        customer_identifier: metadata.patientId || metadata.doctorId || "anonymous",
        thread_identifier: metadata.sessionId || `session_${Date.now()}`,
        metadata: {
          feature: metadata.feature,
          patient_id: metadata.patientId,
          doctor_id: metadata.doctorId,
          app: "docadvisor",
          workflow: "optimized_clinical_insights",
          latency_ms: Date.now() - startTime,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Keywords AI error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

// ============================================
// OPTIMIZED Brief Generation
// ============================================
export async function generateOptimizedBrief(
  patientId: string,
  chiefComplaint?: string,
  clinicalNotes?: string,
  metadata?: RequestMetadata
): Promise<BriefContent> {
  const startTime = Date.now();

  // Step 1: Get patient info (fast)
  const { data: patient } = await supabase
    .from('patients')
    .select('full_name, dob')
    .eq('id', patientId)
    .single();

  // Step 2: Get structured clinical summary (SQL - instant)
  const clinicalSummary = await getPatientClinicalSummary(patientId);

  // Step 3: Get pre-detected alerts (SQL - instant)
  const detectedAlerts = await getDetectedAlerts(patientId);

  const sqlTime = Date.now() - startTime;
  console.log(`[Optimized] SQL queries completed in ${sqlTime}ms`);

  // Step 4: Build rich context for LLM (it just needs to reason, not extract)
  const structuredContext = buildStructuredContext(
    patient as PatientInfo,
    clinicalSummary,
    detectedAlerts,
    chiefComplaint,
    clinicalNotes
  );

  // Step 5: Call Keywords AI with structured data
  const systemPrompt = `You are an expert clinical AI assistant. You have been provided with STRUCTURED patient data that has already been extracted and validated.

Your job is to REASON about this data and generate clinical insights. Do NOT hallucinate - all data is provided.

Generate a clinical brief in strictly valid JSON format. No markdown. Raw JSON only.

Schema:
{
  "summary": "2-3 sentence synthesis of the clinical picture",
  "relevantHistory": ["list from diagnoses provided"],
  "currentSymptoms": ["list from symptoms provided"],
  "medications": ["list from medications provided"],
  "allergies": ["from data or 'None reported'"],
  "abnormalLabs": ["list from labs marked abnormal"],
  "clinicalInsights": ["YOUR analysis connecting the data points"],
  "differentialConsiderations": ["based on symptoms + history"],
  "actionableRecommendations": ["specific next steps"],
  "safetyAlerts": ["IMPORTANT: Include all pre-detected alerts provided + any you identify"],
  "missingInfo": ["gaps in the data"],
  "chiefComplaint": "the chief complaint",
  "citations": {}
}

CRITICAL: The "safetyAlerts" section MUST include the pre-detected clinical alerts provided in the context. These were identified by validated clinical rules.`;

  const userPrompt = structuredContext;

  const llmStartTime = Date.now();
  const text = await callKeywordsAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    detectedAlerts.length > 0 ? REASONING_MODEL : FAST_MODEL,  // Use better model if alerts detected
    { ...metadata, feature: "optimized_clinical_brief", patientId }
  );
  const llmTime = Date.now() - llmStartTime;

  console.log(`[Optimized] LLM call completed in ${llmTime}ms`);
  console.log(`[Optimized] Total time: ${Date.now() - startTime}ms (SQL: ${sqlTime}ms, LLM: ${llmTime}ms)`);

  const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleanJson) as BriefContent;
}

// ============================================
// Build structured context string
// ============================================
function buildStructuredContext(
  patient: PatientInfo | null,
  summary: ClinicalSummary | null,
  alerts: Array<{ alert_type: string; priority: string; title: string; description: string }>,
  chiefComplaint?: string,
  clinicalNotes?: string
): string {
  const sections: string[] = [];

  // Patient Info
  sections.push(`## PATIENT
Name: ${patient?.full_name || 'Unknown'}
DOB: ${patient?.dob || 'Unknown'}
Chief Complaint: ${chiefComplaint || 'General checkup'}`);

  if (clinicalNotes) {
    sections.push(`\n## CLINICAL NOTES FROM VISIT
${clinicalNotes}`);
  }

  if (summary) {
    // Diagnoses
    if (summary.diagnoses?.length > 0) {
      sections.push(`\n## DIAGNOSES (Problem List)
${summary.diagnoses.map(d => `- ${d.name} (${d.type}) [${d.specialty}]`).join('\n')}`);
    }

    // Medications
    if (summary.medications?.length > 0) {
      sections.push(`\n## MEDICATIONS
${summary.medications.map(m =>
  `- ${m.drug} ${m.dose} ${m.frequency} [${m.status}]${m.indication ? ` - ${m.indication}` : ''}${m.notes ? ` (Note: ${m.notes})` : ''}`
).join('\n')}`);
    }

    // Labs
    if (summary.recent_labs?.length > 0) {
      sections.push(`\n## RECENT LABS
${summary.recent_labs.map(l =>
  `- ${l.name}: ${l.value} ${l.unit || ''} ${l.abnormal ? '⚠️ ABNORMAL' : ''} (${l.date})`
).join('\n')}`);
    }

    // Vitals
    if (summary.recent_vitals) {
      const v = summary.recent_vitals;
      sections.push(`\n## RECENT VITALS (${v.date})
- BP: ${v.bp}
- HR: ${v.hr} bpm
- O2 Sat: ${v.o2}%
- Weight: ${v.weight_kg} kg`);
    }

    // Symptoms
    if (summary.active_symptoms?.length > 0) {
      sections.push(`\n## ACTIVE SYMPTOMS
${summary.active_symptoms.map(s =>
  `- ${s.description} (severity: ${s.severity}/10, onset: ${s.onset})`
).join('\n')}`);
    }
  }

  // PRE-DETECTED ALERTS (from SQL pattern detection)
  if (alerts.length > 0) {
    sections.push(`\n## ⚠️ PRE-DETECTED CLINICAL ALERTS (VALIDATED)
These alerts were detected by clinical rules and MUST be included in your safety alerts:
${alerts.map(a => `
### [${a.priority}] ${a.title}
${a.description}
Type: ${a.alert_type}
`).join('\n')}`);
  }

  return sections.join('\n');
}

// ============================================
// With Evaluations (Keywords AI Showcase)
// ============================================
export interface OptimizedBriefWithQuality {
  brief: BriefContent;
  evaluations: EvalResult[];
  summary: EvaluationSummary;
  timing: {
    sql_ms: number;
    llm_ms: number;
    eval_ms: number;
    total_ms: number;
  };
  alerts_detected: number;
}

export async function generateOptimizedBriefWithEval(
  patientId: string,
  chiefComplaint?: string,
  clinicalNotes?: string,
  metadata?: RequestMetadata
): Promise<OptimizedBriefWithQuality> {
  const startTime = Date.now();

  // Get structured data first
  const sqlStart = Date.now();
  const [patient, clinicalSummary, detectedAlerts] = await Promise.all([
    supabase.from('patients').select('full_name, dob').eq('id', patientId).single(),
    getPatientClinicalSummary(patientId),
    getDetectedAlerts(patientId)
  ]);
  const sqlTime = Date.now() - sqlStart;

  // Generate brief
  const llmStart = Date.now();
  const structuredContext = buildStructuredContext(
    patient.data as PatientInfo,
    clinicalSummary,
    detectedAlerts,
    chiefComplaint,
    clinicalNotes
  );

  const systemPrompt = `You are an expert clinical AI assistant with STRUCTURED patient data.

Generate a clinical brief in valid JSON. Schema:
{
  "summary": "synthesis of clinical picture",
  "relevantHistory": [],
  "currentSymptoms": [],
  "medications": [],
  "allergies": [],
  "abnormalLabs": [],
  "clinicalInsights": ["YOUR analysis"],
  "differentialConsiderations": [],
  "actionableRecommendations": [],
  "safetyAlerts": ["MUST include pre-detected alerts"],
  "missingInfo": [],
  "chiefComplaint": "",
  "citations": {}
}`;

  const text = await callKeywordsAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: structuredContext },
    ],
    detectedAlerts.length > 0 ? REASONING_MODEL : FAST_MODEL,
    { ...metadata, feature: "optimized_brief_with_eval", patientId }
  );
  const llmTime = Date.now() - llmStart;

  const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const brief = JSON.parse(cleanJson) as BriefContent;

  // Run evaluations
  const evalStart = Date.now();
  const evaluations = await evaluateClinicalBrief(brief, structuredContext, metadata);
  const evalTime = Date.now() - evalStart;

  const summary = summarizeEvaluations(evaluations);

  if (summary.needsReview) {
    await flagForHumanReview(brief, evaluations, metadata);
  }

  return {
    brief,
    evaluations,
    summary,
    timing: {
      sql_ms: sqlTime,
      llm_ms: llmTime,
      eval_ms: evalTime,
      total_ms: Date.now() - startTime,
    },
    alerts_detected: detectedAlerts.length,
  };
}
