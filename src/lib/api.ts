// Mock API functions - these will be replaced with actual edge function calls
// Each function simulates the expected behavior for demo purposes

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
  missingInfo: string[];
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

// Mock: Generate clinical brief from patient records
export async function generateBrief(patientId: string): Promise<BriefContent> {
  // Simulate AI processing
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log(`[Mock API] Generating brief for patient: ${patientId}`);
  
  return {
    summary: "62-year-old female with history of Type 2 Diabetes and Hypertension presenting with increased fatigue and polyuria over the past 2 weeks.",
    relevantHistory: [
      "Type 2 Diabetes Mellitus - diagnosed 2018",
      "Essential Hypertension - diagnosed 2015",
      "Hyperlipidemia - diagnosed 2019"
    ],
    currentSymptoms: [
      "Fatigue - onset 2 weeks ago, severity 7/10",
      "Increased urination frequency",
      "Mild blurred vision"
    ],
    medications: [
      "Metformin 1000mg BID",
      "Lisinopril 20mg daily",
      "Atorvastatin 40mg nightly"
    ],
    allergies: [
      "Penicillin - rash"
    ],
    abnormalLabs: [
      "HbA1c: 9.2% (elevated from 7.8%)",
      "Fasting glucose: 186 mg/dL",
      "Creatinine: 1.4 mg/dL (mild elevation)"
    ],
    missingInfo: [
      "Most recent ophthalmology exam",
      "Foot exam documentation",
      "Dietary compliance assessment"
    ],
    citations: {
      summary: [{ docName: "Progress Note 01-15-2026", page: 1 }],
      relevantHistory: [{ docName: "Medical History", page: 2 }],
      abnormalLabs: [{ docName: "Lab Results 01-10-2026", page: 1 }]
    }
  };
}

// Mock: RAG chat - ask questions about patient records
export async function ragChat(
  patientId: string,
  sessionId: string,
  message: string
): Promise<ChatMessage> {
  // Simulate AI processing
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  console.log(`[Mock API] RAG chat for patient: ${patientId}, message: ${message}`);
  
  // Simulate different responses based on query
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('medication') || lowerMessage.includes('drug')) {
    return {
      role: 'assistant',
      content: "Based on the available records, the patient is currently taking Metformin 1000mg twice daily for diabetes management, Lisinopril 20mg daily for blood pressure control, and Atorvastatin 40mg at bedtime for cholesterol.",
      citations: [
        { docName: "Medication List", page: 1 },
        { docName: "Progress Note 01-15-2026", page: 2 }
      ]
    };
  }
  
  if (lowerMessage.includes('lab') || lowerMessage.includes('test')) {
    return {
      role: 'assistant',
      content: "The most recent labs from January 10th show HbA1c at 9.2% (previously 7.8%), indicating worsening glycemic control. Fasting glucose was 186 mg/dL and creatinine showed mild elevation at 1.4 mg/dL.",
      citations: [
        { docName: "Lab Results 01-10-2026", page: 1 }
      ]
    };
  }
  
  if (lowerMessage.includes('allergy') || lowerMessage.includes('allergies')) {
    return {
      role: 'assistant',
      content: "The patient has a documented allergy to Penicillin, which causes a rash reaction.",
      citations: [
        { docName: "Medical History", page: 1 }
      ]
    };
  }
  
  return {
    role: 'assistant',
    content: "Not found in provided records. Please try rephrasing your question or ensure the relevant documents have been uploaded and processed.",
    citations: []
  };
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
