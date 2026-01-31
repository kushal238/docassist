
import { GoogleGenerativeAI } from "@google/generative-ai";
import { BriefContent, SOAPNote } from "./api";

// Initialize Gemini
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

// Helper to run Gemini generation
async function runGemini(prompt: string, modelName: string = "gemini-3-pro-preview"): Promise<string> {
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not set in .env");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

export async function generateGeminiBrief(
  patientContext: string,
  chiefComplaint?: string,
  clinicalNotes?: string
): Promise<BriefContent> {
  const prompt = `
    You are an expert medical AI assistant helping a doctor prepare for a patient visit.
    
    PATIENT CONTEXT:
    ${patientContext}
    
    CHIEF COMPLAINT: ${chiefComplaint || "General Checkup"}
    ADDITIONAL NOTES: ${clinicalNotes || "None"}
    
    TASK:
    Generate a clinical brief in strictly valid JSON format matching the following structure.
    Do not include markdown formatting like \`\`\`json. Just return the raw JSON.
    
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
      "citations": {
        "relevantHistory": [{"docName": "Source Doc", "page": 1}],
        "abnormalLabs": [{"docName": "Lab Report", "page": 1}]
      }
    }
    
    If specific information is missing in the context, use empty arrays or "None reported" but maintain the JSON structure.
    Infer insights based on the provided medical history and the chief complaint.
  `;

  try {
    const text = await runGemini(prompt);
    
    // Clean up any markdown code blocks if Gemini adds them
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleanJson) as BriefContent;
  } catch (error) {
    console.error("Gemini generation error:", error);
    throw new Error("Failed to generate brief with Gemini");
  }
}

export async function generateGeminiChat(
  patientContext: string,
  message: string
): Promise<{ content: string; citations: [] }> {
  const prompt = `
    You are an expert medical AI assistant helping a doctor by answering questions about a patient's medical records.
    
    PATIENT CONTEXT:
    ${patientContext}
    
    USER QUESTION: ${message}
    
    TASK:
    Answer the user's question accurately based strictly on the provided patient context.
    If the answer is not in the context, say so politely.
    Provide a professional, clinical response.
    
    (Note: Citation generation is disabled for this client-side fallback mode)
  `;

  try {
    const text = await runGemini(prompt);
    
    return {
      content: text,
      citations: []
    };
  } catch (error) {
    console.error("Gemini chat error:", error);
    throw new Error("Failed to generate chat response with Gemini");
  }
}

export async function generateGeminiSOAP(
  brief: BriefContent,
  patientName?: string,
  regenerateSection?: string
): Promise<SOAPNote> {
  const prompt = `
    You are an expert medical AI assistant helping a doctor generate a SOAP note.

    PATIENT CONTEXT (Clinical Brief):
    ${JSON.stringify(brief, null, 2)}
    
    PATIENT NAME: ${patientName || "Unknown"}
    
    TASK:
    Generate a professional SOAP note in strictly valid JSON format matching the structure below.
    Do not include markdown formatting like \`\`\`json. Just return the raw JSON.
    
    ${regenerateSection ? `IMPORTANT: You are regenerating ONLY the "${regenerateSection}" section. Make it detailed.` : "Generate a complete and detailed SOAP note."}
    
    Structure:
    {
      "subjective": { "content": "Patient's chief complaint, HPI, and relevant history...", "citations": [] },
      "objective": { "content": "Vital signs (if avail), physical exam findings, lab results...", "citations": [] },
      "assessment": { "content": "Clinical impression, differential diagnoses, and reasoning...", "citations": [] },
      "plan": { "content": "Diagnostic workup, treatment plan, patient education, follow-up...", "citations": [] }
    }
    
    Guidelines:
    - Use professional medical terminology.
    - Base the note STRICTLY on the provided Clinical Brief.
    - If specific details (like Vitals) are missing, note them as "Not reported" or omit specific values, do not hallucinate numbers.
    - For "citations", leave as empty array [] for this version.
  `;

  try {
    const text = await runGemini(prompt, "gemini-1.5-pro");
    
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson) as SOAPNote;
  } catch (error) {
    console.error("Gemini SOAP generation error:", error);
    throw new Error("Failed to generate SOAP note with Gemini");
  }
}
