// API functions for AI-powered medical record analysis
import { supabase } from '@/integrations/supabase/client';

export interface Citation {
  docName: string;
  page: number;
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

// Mock: Ingest document and create embeddings
export async function ingestDocument(documentId: string): Promise<{ success: boolean }> {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log(`[Mock API] Ingesting document: ${documentId}`);
  
  return { success: true };
}

// Generate smart clinical brief with complaint-focused analysis
export async function generateBrief(
  patientId: string, 
  chiefComplaint?: string,
  clinicalNotes?: string
): Promise<BriefContent> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-brief', {
      body: { patientId, chiefComplaint, clinicalNotes },
    });

    if (error) {
      console.error('[API] Generate brief error:', error);
      
      if (error.message?.includes('Rate limit')) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      }
      
      if (error.message?.includes('credits')) {
        throw new Error('AI service credits exhausted. Please contact your administrator.');
      }
      
      throw new Error(error.message || 'Failed to generate brief');
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
    console.error('[API] Generate brief error:', error);
    throw error;
  }
}

// RAG chat - ask questions about patient records (uses real AI backend)
export async function ragChat(
  patientId: string,
  sessionId: string,
  message: string
): Promise<ChatMessage> {
  try {
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
      
      throw new Error(error.message || 'Failed to get AI response');
    }

    return {
      role: 'assistant',
      content: data.content,
      citations: data.citations || [],
    };
  } catch (error) {
    console.error('[API] RAG chat error:', error);
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
