import { BriefContent, SOAPNote } from "./api";
import {
  generateOptimizedBriefWithEval,
  OptimizedBriefWithQuality,
  getPatientClinicalSummary
} from "./clinical-insights";
import {
  evaluateClinicalBrief,
  summarizeEvaluations,
  flagForHumanReview,
  EvalResult,
  EvaluationSummary,
} from "./evaluations";

// Keywords AI Gateway - OpenAI-compatible chat completions endpoint
const KEYWORDS_AI_URL = "https://api.keywordsai.co/api/chat/completions";

// Default model - using GPT-4o for high-quality clinical reasoning
const DEFAULT_MODEL = "gpt-4o";

interface RequestMetadata {
  patientId?: string;
  doctorId?: string;
  sessionId?: string;
  feature?: string;
}

// Core LLM call through Keywords AI gateway
async function callKeywordsAI(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  model: string = DEFAULT_MODEL,
  metadata: RequestMetadata = {}
): Promise<string> {
  // Support both Vite (import.meta.env) and Node.js (process.env)
  const apiKey = typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_KEYWORDS_AI_API_KEY
    : process.env.VITE_KEYWORDS_AI_API_KEY;

  if (!apiKey) {
    throw new Error("VITE_KEYWORDS_AI_API_KEY is not set in .env");
  }

  try {
    const response = await fetch(KEYWORDS_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        extra_body: {
          customer_identifier: metadata.patientId || metadata.doctorId || "anonymous",
          thread_identifier: metadata.sessionId || `session_${Date.now()}`,
          metadata: {
            feature: metadata.feature,
            patient_id: metadata.patientId,
            doctor_id: metadata.doctorId,
            app: "docadvisor",
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
  } catch (error) {
    console.error("Keywords AI error:", error);
    throw error;
  }
}

// ============================================
// Clinical Brief Generation
// ============================================

export async function generateGeminiBrief(
  patientContext: string,
  chiefComplaint?: string,
  clinicalNotes?: string,
  metadata?: RequestMetadata
): Promise<BriefContent> {
  const systemPrompt = `You are a clinical decision support system helping physicians prepare for patient encounters.

## YOUR ROLE
- Synthesize patient data into actionable clinical intelligence
- Highlight safety-critical information prominently
- Support (not replace) physician decision-making

## CRITICAL CONSTRAINTS
- ONLY state facts present in the patient context
- NEVER fabricate medications, lab values, or diagnoses
- NEVER diagnose - provide differential considerations only
- Flag uncertainties explicitly

## OUTPUT FORMAT
Return strictly valid JSON (no markdown, no \`\`\`):

{
  "summary": "2-3 sentence synthesis: demographics, relevant history, reason for visit",
  "relevantHistory": ["Conditions relevant to chief complaint, with dates if available"],
  "currentSymptoms": ["Symptoms reported, with duration/severity if noted"],
  "medications": ["Active medications with doses - ONLY those explicitly listed"],
  "allergies": ["Known allergies with reaction type if documented"],
  "abnormalLabs": ["Abnormal values with reference to normal range, date"],
  "clinicalInsights": ["Provide 3-6 insight bullets. Each bullet must connect at least two data points and explain clinical significance WITH DATED SOURCES. e.g., 'The declining kidney function (Cr 1.4, Jan 15) combined with chronic NSAID use is concerning and warrants medication review. The AFib history (dx Nov 2025) puts them at increased stroke risk.'"],
  "differentialConsiderations": ["Top 3-5 diagnoses to consider given presentation, ordered by likelihood"],
  "actionableRecommendations": ["Specific: tests to order, questions to ask, consults to consider"],
  "safetyAlerts": ["CRITICAL: Drug interactions, allergy conflicts, 'can't miss' diagnoses, red flags"],
  "missingInfo": ["Clinically relevant gaps: recent labs, imaging, specialist notes"],
  "chiefComplaint": "Primary reason for visit",
  "citations": {}
}

## CLINICAL INSIGHTS DEPTH
Return 3-6 clinicalInsights. Make them information-dense: connect findings, risks, and next-step implications. Avoid single-fact bullets.

## SAFETY ALERTS PRIORITY
Always flag: anticoagulation issues, renal dosing needs, drug-allergy conflicts, red flag symptoms (chest pain + risk factors, fever + immunocompromised, etc.)`;

  const userPrompt = `PATIENT CONTEXT:
${patientContext}

CHIEF COMPLAINT: ${chiefComplaint || "General Checkup"}
ADDITIONAL NOTES: ${clinicalNotes || "None"}`;

  try {
    const text = await callKeywordsAI(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      DEFAULT_MODEL,
      { ...metadata, feature: "clinical_brief" }
    );

    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson) as BriefContent;
  } catch (error) {
    console.error("Brief generation error:", error);
    throw new Error("Failed to generate clinical brief");
  }
}

// ============================================
// Clinical Brief Generation WITH Evaluations
// ============================================

export interface BriefWithQuality {
  brief: BriefContent;
  evaluations: EvalResult[];
  summary: EvaluationSummary;
}

export async function generateGeminiBriefWithEval(
  patientContext: string,
  chiefComplaint?: string,
  clinicalNotes?: string,
  metadata?: RequestMetadata
): Promise<BriefWithQuality> {
  // OPTIMIZED PATH: If we have a patientId, try to use structured SQL data
  if (metadata?.patientId) {
    try {
      const clinicalSummary = await getPatientClinicalSummary(metadata.patientId);

      if (clinicalSummary && (clinicalSummary.diagnoses?.length > 0 || clinicalSummary.medications?.length > 0)) {
        console.log('[Gemini] Using OPTIMIZED path with structured SQL data');
        const result = await generateOptimizedBriefWithEval(
          metadata.patientId,
          chiefComplaint,
          clinicalNotes,
          metadata
        );

        console.log(`[Gemini] Optimized timing: SQL=${result.timing.sql_ms}ms, LLM=${result.timing.llm_ms}ms, Eval=${result.timing.eval_ms}ms, Total=${result.timing.total_ms}ms`);
        console.log(`[Gemini] Detected ${result.alerts_detected} clinical alerts via SQL`);

        return {
          brief: result.brief,
          evaluations: result.evaluations,
          summary: result.summary,
        };
      }
    } catch (err) {
      console.warn('[Gemini] Optimized path failed, falling back to standard:', err);
    }
  }

  // STANDARD PATH: Use raw patient context
  console.log('[Gemini] Using standard path (no structured data)');

  // Step 1: Generate the clinical brief (existing function)
  const brief = await generateGeminiBrief(
    patientContext,
    chiefComplaint,
    clinicalNotes,
    metadata
  );

  // Step 2: Run evaluations asynchronously (non-blocking for user)
  const evaluations = await evaluateClinicalBrief(
    brief,
    patientContext,
    metadata
  );

  // Step 3: Summarize evaluation results
  const summary = summarizeEvaluations(evaluations);

  // Step 4: Flag for human review if needed
  if (summary.needsReview) {
    await flagForHumanReview(brief, evaluations, metadata);
  }

  return {
    brief,
    evaluations,
    summary,
  };
}

// ============================================
// RAG Chat
// ============================================

export async function generateGeminiChat(
  patientContext: string,
  message: string,
  metadata?: RequestMetadata
): Promise<{ content: string; citations: [] }> {
  const systemPrompt = `You are an expert medical AI assistant helping a doctor by answering questions about a patient's medical records and analysis.

Answer accurately based strictly on the provided patient context.
Prefer details from sections like VITALS, LABS, MEDICATIONS, CLINICAL BRIEF, DIAGNOSTIC ENGINE, PRIOR VISITS, and PRIOR SOAP NOTES when relevant.
If the answer is not in the context, say so politely and suggest what data is missing.
Provide a professional, clinical response in 3-6 concise bullets when possible. Be precise and on point; avoid fluff or generic AI phrasing.`;

  const userPrompt = `PATIENT CONTEXT:
${patientContext}

QUESTION: ${message}`;

  try {
    const text = await callKeywordsAI(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      DEFAULT_MODEL,
      { ...metadata, feature: "rag_chat" }
    );

    return { content: text, citations: [] };
  } catch (error) {
    console.error("Chat generation error:", error);
    throw new Error("Failed to generate chat response");
  }
}

export interface ParsedMedicationOrder {
  name: string;
  dosage?: string | null;
  frequency?: string | null;
}

export interface ParsedLabOrder {
  test: string;
  priority?: string | null;
}

export async function parseMedicationOrders(
  input: string
): Promise<{ medications: ParsedMedicationOrder[] }> {
  const systemPrompt = `You extract medication orders from clinician text.
Return STRICT JSON with this schema only:
{
  "medications": [
    { "name": "string", "dosage": "string|null", "frequency": "string|null" }
  ]
}
Rules:
- Be concise and accurate.
- If dosage/frequency not stated, return null.
- Do NOT invent medications.`;

  const userPrompt = `TEXT:\n${input}`;
  const text = await callKeywordsAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    DEFAULT_MODEL,
    { feature: "parse_med_orders" }
  );
  const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleanJson) as { medications: ParsedMedicationOrder[] };
}

export async function parseLabOrders(
  input: string
): Promise<{ labs: ParsedLabOrder[] }> {
  const systemPrompt = `You extract lab orders from clinician text.
Return STRICT JSON with this schema only:
{
  "labs": [
    { "test": "string", "priority": "Routine|Urgent|STAT|null" }
  ]
}
Rules:
- Be concise and accurate.
- If priority not stated, return null.
- Do NOT invent labs.`;

  const userPrompt = `TEXT:\n${input}`;
  const text = await callKeywordsAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    DEFAULT_MODEL,
    { feature: "parse_lab_orders" }
  );
  const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleanJson) as { labs: ParsedLabOrder[] };
}

// ============================================
// SOAP Note Generation
// ============================================

export async function generateGeminiSOAP(
  brief: BriefContent,
  patientName?: string,
  regenerateSection?: string,
  metadata?: RequestMetadata
): Promise<SOAPNote> {
  const systemPrompt = `You are an expert medical AI assistant helping a doctor generate a SOAP note.

Generate a professional SOAP note in strictly valid JSON format. Do not include markdown formatting. Just return raw JSON.

Structure:
{
  "subjective": { "content": "Patient's chief complaint, HPI, and relevant history...", "citations": [] },
  "objective": { "content": "Vital signs, physical exam findings, lab results...", "citations": [] },
  "assessment": { "content": "Clinical impression, differential diagnoses, and reasoning...", "citations": [] },
  "plan": { "content": "Diagnostic workup, treatment plan, patient education, follow-up...", "citations": [] }
}

Guidelines:
- Use professional medical terminology
- Base the note STRICTLY on the provided Clinical Brief
- If the Clinical Brief includes an "orders" section, incorporate those prescriptions and lab orders into the Plan
- If specific details are missing, note as "Not reported"
- Leave citations as empty arrays`;

  const userPrompt = `PATIENT CONTEXT (Clinical Brief):
${JSON.stringify(brief, null, 2)}

PATIENT NAME: ${patientName || "Unknown"}

${regenerateSection ? `IMPORTANT: Regenerate ONLY the "${regenerateSection}" section. Make it detailed.` : "Generate a complete and detailed SOAP note."}`;

  try {
    const text = await callKeywordsAI(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      DEFAULT_MODEL,
      { ...metadata, feature: "soap_note" }
    );

    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson) as SOAPNote;
  } catch (error) {
    console.error("SOAP generation error:", error);
    throw new Error("Failed to generate SOAP note");
  }
}
