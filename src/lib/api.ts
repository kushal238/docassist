// API functions for AI-powered medical record analysis
import { supabase } from '@/integrations/supabase/client';

export interface Citation {
  docName: string;
  page: number;
}

export interface SOAPNote {
  subjective: { content: string; citations: Citation[] };
  objective: { content: string; citations: Citation[] };
  assessment: { content: string; citations: Citation[] };
  plan: { content: string; citations: Citation[] };
}

export interface BriefContent {
  summary: string;
  relevantHistory: string[];
  currentSymptoms: string[];
  medications: string[];
  allergies: string[];
  abnormalLabs: string[];
  // New smart analysis fields
  clinicalInsights: string[];
  differentialConsiderations: string[];
  actionableRecommendations: string[];
  safetyAlerts: string[];
  missingInfo: string[];
  chiefComplaint?: string | null;
  citations: Record<string, Citation[]>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
}

export interface DocExplanation {
  summary: string;
  keyTerms: { term: string; definition: string }[];
  questionsForDoctor: string[];
}

// Document ingestion is now handled by /src/services/document-ingestion.ts
// See: ingestDocument(documentId, patientId, file)

import { generateGeminiBrief, generateGeminiChat, generateGeminiSOAP } from './gemini';

// Generate smart clinical brief with complaint-focused analysis
export async function generateBrief(
  patientId: string, 
  chiefComplaint?: string,
  clinicalNotes?: string
): Promise<BriefContent> {
  try {
    // Check if Gemini API key is available first to avoid unnecessary Edge Function calls
    // which cause network errors in the console when not deployed
    if (import.meta.env.VITE_GEMINI_API_KEY) {
      // Fetch minimal patient context for Gemini
      const { data: patient } = await supabase
        .from('patients')
        .select('full_name, dob')
        .eq('id', patientId)
        .single();
        
      const context = `Patient Name: ${patient?.full_name || 'Unknown'}. DOB: ${patient?.dob || 'Unknown'}.`;
      
      // Use client-side Gemini directly
      return await generateGeminiBrief(context, chiefComplaint, clinicalNotes);
    }

    const { data, error } = await supabase.functions.invoke('generate-brief', {
      body: { patientId, chiefComplaint, clinicalNotes },
    });

    if (error) {
      console.warn('[API] Edge Function not available, falling back to Gemini Client:', error);
      
      // Fetch minimal patient context for Gemini (simulating RAG context)
      // In a real app, you'd fetch documents and pass them, but here we'll pass basic info
      const { data: patient } = await supabase
        .from('patients')
        .select('full_name, dob')
        .eq('id', patientId)
        .single();
        
      const context = `Patient Name: ${patient?.full_name || 'Unknown'}. DOB: ${patient?.dob || 'Unknown'}.`;
      
      // Fallback to client-side Gemini
      return await generateGeminiBrief(context, chiefComplaint, clinicalNotes);
    }

    return {
      summary: data.summary || "No summary available.",
      relevantHistory: data.relevantHistory || [],
      currentSymptoms: data.currentSymptoms || [],
      medications: data.medications || [],
      allergies: data.allergies || [],
      abnormalLabs: data.abnormalLabs || [],
      clinicalInsights: data.clinicalInsights || [],
      differentialConsiderations: data.differentialConsiderations || [],
      actionableRecommendations: data.actionableRecommendations || [],
      safetyAlerts: data.safetyAlerts || [],
      missingInfo: data.missingInfo || [],
      chiefComplaint: data.chiefComplaint || null,
      citations: data.citations || {},
    };
  } catch (error) {
    console.warn('[API] Generate brief error, falling back to Gemini Client:', error);
    
    // Fetch minimal patient context for Gemini
    const { data: patient } = await supabase
        .from('patients')
        .select('full_name, dob')
        .eq('id', patientId)
        .single();
        
    const context = `Patient Name: ${patient?.full_name || 'Unknown'}. DOB: ${patient?.dob || 'Unknown'}.`;
    
    return await generateGeminiBrief(context, chiefComplaint, clinicalNotes);
  }
}

export async function generateSOAP(
  patientId: string,
  brief: BriefContent,
  patientName?: string,
  regenerateSection?: string
): Promise<SOAPNote> {
  try {
    // Check for Gemini API Key first
    if (import.meta.env.VITE_GEMINI_API_KEY) {
      return await generateGeminiSOAP(brief, patientName, regenerateSection);
    }

    const { data, error } = await supabase.functions.invoke('generate-soap', {
      body: { patientId, brief, patientName, regenerateSection },
    });

    if (error) {
      console.warn('[API] Edge Function not available, falling back to Gemini Client:', error);
      return await generateGeminiSOAP(brief, patientName, regenerateSection);
    }

    return data as SOAPNote;
  } catch (error) {
    console.warn('[API] Generate SOAP error, falling back to Gemini Client:', error);
    return await generateGeminiSOAP(brief, patientName, regenerateSection);
  }
}

// Local mock generator for fallback
function generateMockBrief(patientId: string, chiefComplaint?: string): BriefContent {
  const isChestPain = chiefComplaint?.toLowerCase().includes('chest') || chiefComplaint?.toLowerCase().includes('pain');
  
  return {
    summary: `[SIMULATION MODE] This is a simulated clinical brief for ${chiefComplaint || 'general checkup'}. The backend Edge Function is not currently deployed. Based on the available records, the patient has a history of hypertension and type 2 diabetes. Recent labs show elevated HbA1c.`,
    relevantHistory: [
      "Hypertension (diagnosed 2018)",
      "Type 2 Diabetes Mellitus (diagnosed 2020)",
      "Hyperlipidemia"
    ],
    currentSymptoms: chiefComplaint ? [chiefComplaint] : ["Fatigue", "Mild dyspnea on exertion"],
    medications: [
      "Lisinopril 10mg daily",
      "Metformin 500mg BID",
      "Atorvastatin 20mg daily"
    ],
    allergies: ["Penicillin (Rash)"],
    abnormalLabs: [
      "HbA1c: 7.8% (High) - 2 weeks ago",
      "LDL: 135 mg/dL (High) - 2 weeks ago"
    ],
    clinicalInsights: [
      "Patient's glycemic control remains suboptimal despite Metformin therapy.",
      isChestPain ? "Cardiac risk factors (HTN, DM, HLD) necessitate ruling out ACS." : "Cardiovascular risk profile is elevated."
    ],
    differentialConsiderations: isChestPain ? [
      "Acute Coronary Syndrome",
      "Stable Angina",
      "GERD",
      "Musculoskeletal strain"
    ] : [
      "Metabolic Syndrome",
      "Medication non-adherence",
      "Dietary factors"
    ],
    actionableRecommendations: [
      "Check recent ECG if available",
      "Review medication adherence",
      "Consider adding SGLT2 inhibitor for better glycemic control and cardiac protection"
    ],
    safetyAlerts: [
      "Risk of hypoglycemia if sulfonylurea added",
      "Monitor renal function with ACE inhibitor usage"
    ],
    missingInfo: [
      "Recent echocardiogram",
      "Ophthalmology consult note"
    ],
    chiefComplaint: chiefComplaint || "General Follow-up",
    citations: {
      "medications": [{ docName: "Medication_List_2024.pdf", page: 1 }],
      "abnormalLabs": [{ docName: "Lab_Results_Jan2024.pdf", page: 2 }],
      "relevantHistory": [{ docName: "Initial_Consult_Note.docx", page: 1 }]
    }
  };
}

// RAG chat - ask questions about patient records (uses real AI backend)
export async function ragChat(
  patientId: string,
  sessionId: string,
  message: string
): Promise<ChatMessage> {
  try {
    // Client-side Gemini Fallback Check
    if (import.meta.env.VITE_GEMINI_API_KEY) {
       const { data: patient } = await supabase
         .from('patients')
         .select('full_name, dob')
         .eq('id', patientId)
         .single();
         
       const context = `Patient Name: ${patient?.full_name || 'Unknown'}. DOB: ${patient?.dob || 'Unknown'}.`;
       
       const response = await generateGeminiChat(context, message);
       
       return {
         role: 'assistant',
         content: response.content,
         citations: response.citations
       };
    }

    const { data, error } = await supabase.functions.invoke('rag-chat', {
      body: { patientId, sessionId, message },
    });

    if (error) {
      console.error('[API] RAG chat error:', error);
      
      if (error.message?.includes('Rate limit')) {
        return {
          role: 'assistant',
          content: 'Rate limit exceeded. Please wait a moment and try again.',
          citations: [],
        };
      }
      
      if (error.message?.includes('credits')) {
        return {
          role: 'assistant',
          content: 'AI service credits exhausted. Please contact your administrator.',
          citations: [],
        };
      }
      
      // Fallback if key is missing but call failed anyway
      return {
          role: 'assistant',
          content: 'Error: Backend unavailable and no Gemini Key provided for fallback.',
          citations: [],
      };
    }

    return {
      role: 'assistant',
      content: data.content,
      citations: data.citations || [],
    };
  } catch (error) {
    console.error('[API] RAG chat error:', error);
    
    // Attempt fallback one last time if we caught an exception
    if (import.meta.env.VITE_GEMINI_API_KEY) {
       try {
         const { data: patient } = await supabase
           .from('patients')
           .select('full_name, dob')
           .eq('id', patientId)
           .single();
         const context = `Patient Name: ${patient?.full_name || 'Unknown'}. DOB: ${patient?.dob || 'Unknown'}.`;
         const response = await generateGeminiChat(context, message);
         return { role: 'assistant', content: response.content, citations: response.citations };
       } catch (e) {
         // ignore
       }
    }

    return {
      role: 'assistant',
      content: 'Sorry, I encountered an error processing your request. Please try again.',
      citations: [],
    };
  }
}

// Mock: Explain document for patient
export async function explainDocument(
  documentId: string,
  mode: 'simple' | 'detailed'
): Promise<DocExplanation> {
  // Simulate AI processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log(`[Mock API] Explaining document: ${documentId}, mode: ${mode}`);
  
  if (mode === 'simple') {
    return {
      summary: "This lab report shows your blood sugar levels have been higher than your target over the past few months. Your HbA1c number (9.2%) tells us how your blood sugar has been doing on average. The goal is usually below 7%, so there's room for improvement. Your kidney function shows a small change that we should keep an eye on.",
      keyTerms: [
        { term: "HbA1c", definition: "A blood test that shows your average blood sugar over 2-3 months" },
        { term: "Fasting glucose", definition: "Your blood sugar level after not eating for at least 8 hours" },
        { term: "Creatinine", definition: "A waste product that shows how well your kidneys are working" }
      ],
      questionsForDoctor: [
        "What changes can I make to bring my HbA1c down?",
        "Should I be worried about my kidney numbers?",
        "Do I need to change my medications?",
        "How often should I get my labs rechecked?"
      ]
    };
  }
  
  return {
    summary: "This comprehensive metabolic panel and HbA1c test reveals suboptimal glycemic control with an HbA1c of 9.2%, representing a significant increase from the previous value of 7.8%. This suggests either medication non-compliance, dietary factors, or disease progression. The fasting glucose of 186 mg/dL corroborates this finding. Additionally, the creatinine level of 1.4 mg/dL indicates early stage chronic kidney disease (Stage 2), which is common in patients with longstanding diabetes and may require medication adjustments.",
    keyTerms: [
      { term: "HbA1c (Glycated Hemoglobin)", definition: "Measures the percentage of hemoglobin proteins in blood that are coated with sugar, reflecting average blood glucose over 2-3 months. Target for diabetics is typically <7%." },
      { term: "Fasting Plasma Glucose", definition: "Blood sugar measured after 8+ hours of fasting. Normal is <100 mg/dL; diabetic range is ≥126 mg/dL." },
      { term: "Serum Creatinine", definition: "Byproduct of muscle metabolism filtered by kidneys. Elevated levels indicate reduced kidney function. Normal range: 0.7-1.3 mg/dL." },
      { term: "eGFR (Estimated Glomerular Filtration Rate)", definition: "Calculated measure of kidney function. Values below 60 indicate chronic kidney disease." }
    ],
    questionsForDoctor: [
      "What is causing my HbA1c to increase despite medication?",
      "Should we consider adding or changing my diabetes medications?",
      "What stage of kidney disease do I have, and how can we prevent progression?",
      "Do I need to see a nephrologist (kidney specialist)?",
      "Are there specific dietary restrictions I should follow given these results?",
      "How frequently should I monitor my blood sugar at home?"
    ]
  };
}
