import { BriefContent, SOAPNote } from "./api";

// Keywords AI Gateway - OpenAI-compatible chat completions endpoint
const KEYWORDS_AI_URL = "https://api.keywordsai.co/api/chat/completions";

// Default model - can be swapped to other supported models
const DEFAULT_MODEL = "gpt-4o-mini";

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
  if (!import.meta.env.VITE_KEYWORDS_AI_API_KEY) {
    throw new Error("VITE_KEYWORDS_AI_API_KEY is not set in .env");
  }

  try {
    const response = await fetch(KEYWORDS_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_KEYWORDS_AI_API_KEY}`,
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
  const systemPrompt = `You are an expert medical AI assistant helping a doctor prepare for a patient visit.

Generate a clinical brief in strictly valid JSON format. Do not include markdown formatting like \`\`\`json. Just return raw JSON.

Structure:
{
  "summary": "Concise summary of patient history relevant to the complaint",
  "relevantHistory": ["list of relevant past conditions"],
  "currentSymptoms": ["list of symptoms"],
  "medications": ["list of active meds"],
  "allergies": ["list of allergies"],
  "abnormalLabs": ["list of recent abnormal labs with dates if available"],
  "clinicalInsights": ["AI-generated insights connecting history to current complaint"],
  "differentialConsiderations": ["Top 3-5 potential diagnoses"],
  "actionableRecommendations": ["Specific next steps, tests, or questions"],
  "safetyAlerts": ["Critical warnings, interactions, or red flags"],
  "missingInfo": ["Information that would be helpful but is missing"],
  "chiefComplaint": "The primary complaint",
  "citations": { "relevantHistory": [], "abnormalLabs": [] }
}

If specific information is missing, use empty arrays or "None reported" but maintain the JSON structure.`;

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
// RAG Chat
// ============================================

export async function generateGeminiChat(
  patientContext: string,
  message: string,
  metadata?: RequestMetadata
): Promise<{ content: string; citations: [] }> {
  const systemPrompt = `You are an expert medical AI assistant helping a doctor by answering questions about a patient's medical records.

Answer accurately based strictly on the provided patient context.
If the answer is not in the context, say so politely.
Provide a professional, clinical response.`;

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
