/**
 * Clinical Data Extraction Prompt
 * Optimized for Keywords AI + OpenAI Chat Completions API
 *
 * Usage:
 *   import { buildExtractionMessages } from '@/lib/prompts/clinical-extraction';
 *   const messages = buildExtractionMessages(rawNotes, chiefComplaint);
 *   // Pass to Keywords AI gateway
 */

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

export const EXTRACTION_SYSTEM_PROMPT = `SYSTEM: Clinical Data Extraction Agent

ROLE: Medical scribe performing EXTRACTION ONLY from clinical notes.

## CONSTRAINTS
- EXTRACT only facts explicitly stated in input
- NEVER fabricate or infer unstated information
- Use null for missing fields, not guesses
- Mark confidence based on documentation quality

## OUTPUT SCHEMA
Return raw JSON (no markdown, no explanation) matching this schema:

{
  "complaint": {
    "stated": "string - exact chief complaint as documented",
    "onset": "string|null - when it started",
    "severity": "string|null - patient-reported (1-10 or descriptive)",
    "character": "string|null - quality (sharp, dull, pressure, etc.)",
    "location": "string|null - anatomical location",
    "radiation": "string|null - where it spreads",
    "associated": ["string - other symptoms mentioned with this complaint"]
  },
  "history": {
    "relevant_conditions": ["string - conditions relevant to CC"],
    "relevant_surgeries": ["string - relevant procedures"],
    "family": ["string - relevant family history"]
  },
  "meds": {
    "current": [{"drug": "string", "dose": "string", "freq": "string"}],
    "allergies": [{"agent": "string", "reaction": "string|null"}]
  },
  "vitals": {
    "bp": "string|null",
    "hr": "number|null",
    "rr": "number|null",
    "temp": "string|null",
    "spo2": "string|null"
  },
  "red_flags": [{"flag": "string", "severity": "critical|high|moderate"}],
  "pertinent_negatives": ["string - important symptoms explicitly DENIED"],
  "risk_factors": ["string - factors increasing risk for this CC"],
  "gaps": ["string - critical missing information"],
  "confidence": "high|medium|low"
}

## RED FLAG CRITERIA BY SYSTEM
- Cardiac: chest pain + diaphoresis, syncope, new arrhythmia
- Neuro: sudden severe headache, focal deficits, altered mental status
- Pulmonary: acute dyspnea, hypoxia <92%, hemoptysis
- Abdominal: rigid abdomen, rebound tenderness, peritoneal signs
- Infectious: fever + immunocompromised, sepsis criteria (HR>90, RR>20, WBC abnormal)
- Vascular: acute limb pain/pallor, AAA risk + back pain`;

// =============================================================================
// FEW-SHOT EXAMPLES
// =============================================================================

export const FEW_SHOT_EXAMPLES: Array<{ input: string; output: object }> = [
  // Example 1: Complete cardiac presentation (high confidence)
  {
    input: `Notes: "58M HTN, DM2, former smoker. 2hr substernal pressure 6/10 radiating to L arm, diaphoretic, denies SOB. BP 158/92, HR 88, O2 97%. Meds: metformin 500 BID, lisinopril 10mg daily. NKDA. FHx: father MI age 62"
Chief Complaint: chest pain`,
    output: {
      complaint: {
        stated: "substernal pressure",
        onset: "2 hours ago",
        severity: "6/10",
        character: "pressure",
        location: "substernal",
        radiation: "left arm",
        associated: ["diaphoresis"]
      },
      history: {
        relevant_conditions: ["hypertension", "type 2 diabetes", "former smoker"],
        relevant_surgeries: [],
        family: ["father MI at age 62"]
      },
      meds: {
        current: [
          { drug: "metformin", dose: "500mg", freq: "BID" },
          { drug: "lisinopril", dose: "10mg", freq: "daily" }
        ],
        allergies: []
      },
      vitals: { bp: "158/92", hr: 88, rr: null, temp: null, spo2: "97%" },
      red_flags: [
        { flag: "chest pressure with diaphoresis and radiation", severity: "critical" },
        { flag: "multiple cardiac risk factors (HTN, DM, smoking, family hx)", severity: "high" }
      ],
      pertinent_negatives: ["denies shortness of breath"],
      risk_factors: ["male 58yo", "hypertension", "diabetes", "former smoker", "family history MI"],
      gaps: ["EKG", "troponin", "pain onset activity", "prior cardiac history"],
      confidence: "high"
    }
  },

  // Example 2: Sparse documentation (low confidence)
  {
    input: `Notes: "pt c/o HA x3d, took tylenol no relief"
Chief Complaint: headache`,
    output: {
      complaint: {
        stated: "headache",
        onset: "3 days ago",
        severity: null,
        character: null,
        location: null,
        radiation: null,
        associated: []
      },
      history: {
        relevant_conditions: [],
        relevant_surgeries: [],
        family: []
      },
      meds: {
        current: [],
        allergies: []
      },
      vitals: { bp: null, hr: null, rr: null, temp: null, spo2: null },
      red_flags: [],
      pertinent_negatives: [],
      risk_factors: [],
      gaps: [
        "headache character and severity",
        "neurological symptoms",
        "vitals",
        "past medical history",
        "vision changes",
        "fever",
        "neck stiffness",
        "recent trauma"
      ],
      confidence: "low"
    }
  },

  // Example 3: Complex multi-problem with filtering
  {
    input: `Notes: "72F CHF EF 35%, a-fib on warfarin, CKD3, GERD. Presents 1wk progressive DOE, now at rest. 3-pillow orthopnea, +LE edema. Gained 8lbs. Missed lasix x3d (ran out). Also chronic knee pain - unchanged. BP 142/88, HR 112 irreg, RR 22, O2 91% RA. Meds: warfarin 5mg, lasix 40mg daily (not taking), metoprolol 25 BID, omeprazole 20mg"
Chief Complaint: shortness of breath`,
    output: {
      complaint: {
        stated: "progressive dyspnea on exertion, now at rest",
        onset: "1 week ago",
        severity: "at rest",
        character: "progressive",
        location: null,
        radiation: null,
        associated: ["orthopnea (3-pillow)", "lower extremity edema", "8lb weight gain"]
      },
      history: {
        relevant_conditions: ["CHF with EF 35%", "atrial fibrillation", "CKD stage 3"],
        relevant_surgeries: [],
        family: []
      },
      meds: {
        current: [
          { drug: "warfarin", dose: "5mg", freq: "daily" },
          { drug: "furosemide", dose: "40mg", freq: "daily (NOT TAKING x3 days)" },
          { drug: "metoprolol", dose: "25mg", freq: "BID" }
        ],
        allergies: []
      },
      vitals: { bp: "142/88", hr: 112, rr: 22, temp: null, spo2: "91%" },
      red_flags: [
        { flag: "acute CHF exacerbation with hypoxia (91%)", severity: "critical" },
        { flag: "diuretic non-compliance with volume overload", severity: "high" },
        { flag: "tachycardia (112) with known a-fib", severity: "high" }
      ],
      pertinent_negatives: [],
      risk_factors: ["reduced EF 35%", "CKD stage 3", "atrial fibrillation", "medication non-adherence"],
      gaps: ["BNP/proBNP", "chest xray", "INR level", "baseline creatinine", "recent echo"],
      confidence: "high"
    }
  }
];

// =============================================================================
// OUTPUT TYPE DEFINITION
// =============================================================================

export interface ExtractionResult {
  complaint: {
    stated: string;
    onset: string | null;
    severity: string | null;
    character: string | null;
    location: string | null;
    radiation: string | null;
    associated: string[];
  };
  history: {
    relevant_conditions: string[];
    relevant_surgeries: string[];
    family: string[];
  };
  meds: {
    current: Array<{ drug: string; dose: string; freq: string }>;
    allergies: Array<{ agent: string; reaction: string | null }>;
  };
  vitals: {
    bp: string | null;
    hr: number | null;
    rr: number | null;
    temp: string | null;
    spo2: string | null;
  };
  red_flags: Array<{ flag: string; severity: 'critical' | 'high' | 'moderate' }>;
  pertinent_negatives: string[];
  risk_factors: string[];
  gaps: string[];
  confidence: 'high' | 'medium' | 'low';
}

// =============================================================================
// MESSAGE BUILDER
// =============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Build the complete message array for Keywords AI / OpenAI Chat Completions
 *
 * @param rawNotes - The raw clinical notes to extract from
 * @param chiefComplaint - The chief complaint to focus extraction on
 * @param includeFewShot - Whether to include few-shot examples (default: true)
 * @returns Array of chat messages ready for API call
 */
export function buildExtractionMessages(
  rawNotes: string,
  chiefComplaint: string,
  includeFewShot: boolean = true
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT }
  ];

  // Add few-shot examples
  if (includeFewShot) {
    for (const example of FEW_SHOT_EXAMPLES) {
      messages.push({ role: 'user', content: example.input });
      messages.push({ role: 'assistant', content: JSON.stringify(example.output, null, 2) });
    }
  }

  // Add the actual extraction request
  messages.push({
    role: 'user',
    content: `Notes: "${rawNotes}"
Chief Complaint: ${chiefComplaint}`
  });

  return messages;
}

/**
 * Build messages with only the most relevant few-shot example
 * Saves tokens while maintaining quality
 *
 * @param rawNotes - The raw clinical notes
 * @param chiefComplaint - The chief complaint
 * @param category - Optional category hint for example selection
 */
export function buildExtractionMessagesCompact(
  rawNotes: string,
  chiefComplaint: string,
  category?: 'cardiac' | 'neuro' | 'respiratory' | 'general'
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT }
  ];

  // Select best example based on category or notes content
  let selectedExample = FEW_SHOT_EXAMPLES[0]; // Default to cardiac (most complete)

  const notesLower = rawNotes.toLowerCase();
  const ccLower = chiefComplaint.toLowerCase();

  if (category === 'respiratory' || ccLower.includes('breath') || ccLower.includes('dyspnea') || notesLower.includes('sob')) {
    selectedExample = FEW_SHOT_EXAMPLES[2]; // CHF/respiratory example
  } else if (category === 'neuro' || ccLower.includes('headache') || ccLower.includes('dizz') || notesLower.includes('neuro')) {
    selectedExample = FEW_SHOT_EXAMPLES[1]; // Sparse example (teaches handling gaps)
  } else if (notesLower.length < 100) {
    selectedExample = FEW_SHOT_EXAMPLES[1]; // Sparse notes → sparse example
  }

  messages.push({ role: 'user', content: selectedExample.input });
  messages.push({ role: 'assistant', content: JSON.stringify(selectedExample.output, null, 2) });

  messages.push({
    role: 'user',
    content: `Notes: "${rawNotes}"
Chief Complaint: ${chiefComplaint}`
  });

  return messages;
}

// =============================================================================
// KEYWORDS AI INTEGRATION HELPER
// =============================================================================

const KEYWORDS_AI_URL = "https://api.keywordsai.co/api/chat/completions";

interface ExtractionOptions {
  model?: string;
  temperature?: number;
  patientId?: string;
  compact?: boolean;
}

/**
 * Run clinical extraction via Keywords AI
 *
 * @param rawNotes - Clinical notes to extract from
 * @param chiefComplaint - Chief complaint focus
 * @param options - Optional configuration
 * @returns Parsed extraction result
 */
export async function runClinicalExtraction(
  rawNotes: string,
  chiefComplaint: string,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const apiKey = typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_KEYWORDS_AI_API_KEY
    : process.env.VITE_KEYWORDS_AI_API_KEY;

  if (!apiKey) {
    throw new Error("VITE_KEYWORDS_AI_API_KEY is not set");
  }

  const messages = options.compact
    ? buildExtractionMessagesCompact(rawNotes, chiefComplaint)
    : buildExtractionMessages(rawNotes, chiefComplaint);

  const response = await fetch(KEYWORDS_AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || "gpt-4o",
      messages,
      temperature: options.temperature ?? 0.2,
      extra_body: {
        customer_identifier: options.patientId || "anonymous",
        metadata: {
          feature: "clinical_extraction",
          prompt_version: "v2_fewshot",
          patient_id: options.patientId,
          app: "docadvisor",
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Keywords AI extraction failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content in Keywords AI response");
  }

  // Parse JSON (handle potential markdown wrapping)
  const cleanJson = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleanJson) as ExtractionResult;
}
