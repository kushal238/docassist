/**
 * Clinical Pipeline Service
 * 
 * High-performance 2-stage "Fast & Deep" reasoning engine using Keywords AI managed prompts.
 * All prompts are fetched by ID - NO hardcoded prompt text in this file.
 * 
 * Pipeline Stages:
 * 1. Clinical Lens (Fast Model) - Extract complaint-specific data
 * 2. Diagnostic Engine (Smart Model) - Generate Glass Health assessment
 * 
 * Performance: 30-60s → 8-15s (70% faster than old 4-stage)
 */

import { z } from 'zod';
import { executePromptWithHeaders, PipelineError } from '@/lib/ai-client';

// =============================================================================
// Prompt IDs (Managed in Keywords AI Dashboard)
// =============================================================================

/**
 * Prompt IDs for 2-Stage Pipeline - These correspond to prompts configured in Keywords AI UI.
 * Model routing and version control handled in the dashboard, not code.
 */
const PROMPT_IDS = {
  // 2-Stage Pipeline (ACTIVE)
  CLINICAL_LENS: '880547ac767343f88b93cbb1855a3eba',      // Stage 1: Fast extraction
  DIAGNOSTIC_ENGINE: '9a28291ec37f42c9a6affd2e73a0f185', // Stage 2: Deep reasoning
} as const;

// =============================================================================
// Type-Safe Variable Interfaces (Prevents Magic String Typos)
// =============================================================================

/** Variables for Stage 1: Clinical Lens */
interface ClinicalLensVariables {
  raw_notes: string;
  chief_complaint: string;
  [key: string]: string;
}

/** Variables for Stage 2: Diagnostic Engine */
interface DiagnosticEngineVariables {
  clinical_lens_output: string;
  chief_complaint: string;
  [key: string]: string;
}

// =============================================================================
// Zod Schemas for Output Validation (2-Stage Pipeline)
// =============================================================================

/** Schema for Stage 1: Clinical Lens Output */
const ClinicalLensSchema = z.object({
  relevant_history: z.array(z.string()).optional().default([]),
  current_medications: z.array(z.string()).optional().default([]),
  symptom_timeline: z.string().optional().default(''),
  red_flags: z.array(z.string()).optional().default([]),
  vitals_extracted: z.object({
    blood_pressure: z.string().nullable().optional(),
    heart_rate: z.string().nullable().optional(),
    temperature: z.string().nullable().optional(),
    oxygen_saturation: z.string().nullable().optional(),
  }).optional(),
  risk_factors: z.array(z.string()).optional().default([]),
  missing_critical_info: z.array(z.string()).optional().default([]),
}).passthrough();

/** Schema for differential diagnosis entry */
const DifferentialDiagnosisSchema = z.object({
  diagnosis: z.string(),
  confidence: z.number().min(0).max(1),
  supporting_evidence: z.array(z.string()).optional().default([]),
  contradicting_evidence: z.array(z.string()).optional().default([]),
  next_steps: z.array(z.string()).optional(),
  consideration: z.string().optional(),
});

/** Schema for "Can't Miss" diagnosis */
const CantMissDiagnosisSchema = z.object({
  diagnosis: z.string(),
  urgency: z.string(),
  rule_out_strategy: z.string(),
  red_flags: z.array(z.string()).optional().default([]),
  time_sensitive: z.boolean().optional().default(false),
  reason_to_consider: z.string().optional(),
});

/** Schema for Stage 2: Diagnostic Engine Output */
const DiagnosticEngineSchema = z.object({
  assessment_summary: z.string(),
  differential: z.object({
    most_likely: z.array(DifferentialDiagnosisSchema).optional().default([]),
    expanded: z.array(DifferentialDiagnosisSchema).optional().default([]),
    cant_miss: z.array(CantMissDiagnosisSchema).optional().default([]),
  }),
  reasoning_trace: z.string(),
  suggested_plan: z.object({
    immediate: z.array(z.string()).optional().default([]),
    short_term: z.array(z.string()).optional().default([]),
    monitoring: z.array(z.string()).optional().default([]),
    disposition: z.string().optional(),
  }).optional(),
  clinical_confidence: z.number().min(0).max(1).optional(),
  urgency_level: z.string().optional(),
  estimated_risk: z.string().optional(),
}).passthrough();

// =============================================================================
// Pipeline Result Types (2-Stage Architecture)
// =============================================================================

/** Metadata for 2-stage pipeline execution */
export interface PipelineMetadata {
  traceIds: {
    clinicalLens: string | null;
    diagnosticEngine: string | null;
  };
  stagesCompleted: string[];
  executionTimeMs: number;
  stageDurations: {
    clinicalLens: number;
    diagnosticEngine: number;
  };
}

/** Result from Stage 1: Clinical Lens */
export interface ClinicalLensResult {
  relevant_history?: string[];
  current_medications?: string[];
  symptom_timeline?: string;
  red_flags?: string[];
  vitals_extracted?: {
    blood_pressure?: string | null;
    heart_rate?: string | null;
    temperature?: string | null;
    oxygen_saturation?: string | null;
  };
  risk_factors?: string[];
  missing_critical_info?: string[];
}

/** Individual differential diagnosis entry */
export interface DifferentialDiagnosis {
  diagnosis: string;
  confidence: number;
  supporting_evidence?: string[];
  contradicting_evidence?: string[];
  next_steps?: string[];
  consideration?: string;
}

/** Can't Miss diagnosis entry */
export interface CantMissDiagnosis {
  diagnosis: string;
  urgency: string;
  rule_out_strategy: string;
  red_flags?: string[];
  time_sensitive?: boolean;
  reason_to_consider?: string;
}

/** Result from Stage 2: Diagnostic Engine */
export interface DiagnosticEngineResult {
  assessment_summary: string;
  differential: {
    most_likely: DifferentialDiagnosis[];
    expanded?: DifferentialDiagnosis[];
    cant_miss: CantMissDiagnosis[];
  };
  reasoning_trace: string;
  suggested_plan?: {
    immediate?: string[];
    short_term?: string[];
    monitoring?: string[];
    disposition?: string;
  };
  clinical_confidence?: number;
  urgency_level?: string;
  estimated_risk?: string;
}

/** Trace data structure */
export interface PipelineTraceData {
  clinicalLens: ClinicalLensResult;
  diagnosticEngine: DiagnosticEngineResult;
}

/** Successful 2-stage pipeline result */
export interface ClinicalPipelineResult {
  success: true;
  // Primary outputs (2-stage)
  clinicalLens: ClinicalLensResult;
  diagnosticEngine: DiagnosticEngineResult;
  
  // Legacy compatibility fields
  report: string;
  reasoning_trace: string;
  trace_data: PipelineTraceData;
  metadata: PipelineMetadata;
}

/** Pipeline execution error */
export interface ClinicalPipelineError {
  success: false;
  error: string;
  stage: string;
  trace_id: string | null;
}

export type PipelineResult = ClinicalPipelineResult | ClinicalPipelineError;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Safely parse JSON from LLM output, handling markdown code blocks and extra text.
 */
function safeParseJSON<T>(
  content: string,
  schema?: z.ZodSchema<T>,
  debugLabel?: string
): T {
  const originalContent = content;
  let cleaned = content.trim();

  console.log(`[${debugLabel || 'JSON Parse'}] Original content length:`, originalContent.length);
  console.log(`[${debugLabel || 'JSON Parse'}] First 200 chars:`, originalContent.substring(0, 200));

  // Remove markdown code blocks
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    lines.shift();
    if (lines[lines.length - 1]?.trim() === '```') {
      lines.pop();
    }
    cleaned = lines.join('\n').trim();
    console.log(`[${debugLabel}] After markdown removal, first 200 chars:`, cleaned.substring(0, 200));
  }

  // Extract JSON from text
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    const jsonCandidate = cleaned.substring(firstBrace, lastBrace + 1);
    console.log(`[${debugLabel}] Extracted JSON candidate, first 200 chars:`, jsonCandidate.substring(0, 200));
    
    try {
      const parsed = JSON.parse(jsonCandidate);
      console.log(`[${debugLabel}] ✅ Successfully parsed JSON`);
      
      if (schema) {
        const validated = schema.parse(parsed);
        console.log(`[${debugLabel}] ✅ Schema validation passed`);
        return validated;
      }
      
      return parsed;
    } catch (err) {
      console.error(`[${debugLabel}] ❌ JSON parse failed:`, err);
    }
  }

  // Direct parse fallback
  console.log(`[${debugLabel}] Attempting direct parse`);
  try {
    const parsed = JSON.parse(cleaned);
    if (schema) {
      return schema.parse(parsed);
    }
    return parsed;
  } catch (err) {
    console.error(`[${debugLabel}] ❌ Direct parse failed:`, err);
    throw new Error(
      `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}\n` +
      `Content preview: ${originalContent.substring(0, 200)}...`
    );
  }
}

/**
 * Serialize variables for prompt injection.
 */
function serializeVariables(vars: Record<string, unknown>): Record<string, string> {
  const serialized: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value === 'object' && value !== null) {
      serialized[key] = JSON.stringify(value, null, 2);
    } else {
      serialized[key] = String(value);
    }
  }
  
  return serialized;
}

// =============================================================================
// Main Pipeline Function (2-Stage Architecture)
// =============================================================================

/**
 * Run the 2-Stage "Fast & Deep" Clinical Analysis Pipeline.
 * 
 * STAGE 1: Clinical Lens (Fast Model)
 * - Extracts structured data: symptoms, timeline, vitals, red flags
 * 
 * STAGE 2: Diagnostic Engine (Smart Model)
 * - Glass Health methodology: Most Likely, Expanded, Can't Miss
 * - Deep reasoning with confidence scoring
 * 
 * Performance: 8-15s total (70% faster than 4-stage pipeline)
 * 
 * @param rawNotes - Unstructured patient medical notes
 * @param complaint - The chief complaint to focus analysis on
 * @returns Pipeline result with Glass Health structured diagnosis
 */
export async function runClinicalPipeline(
  rawNotes: string,
  complaint: string
): Promise<PipelineResult> {
  const pipelineStartTime = Date.now();
  
  const metadata: PipelineMetadata = {
    traceIds: {
      clinicalLens: null,
      diagnosticEngine: null,
    },
    stagesCompleted: [],
    executionTimeMs: 0,
    stageDurations: {
      clinicalLens: 0,
      diagnosticEngine: 0,
    },
  };

  // ===========================================================================
  // STAGE 1: Clinical Lens (Fast Extraction)
  // ===========================================================================
  let clinicalLensResult: ClinicalLensResult;
  
  try {
    const stage1Start = Date.now();
    
    const variables: ClinicalLensVariables = {
      raw_notes: rawNotes,
      chief_complaint: complaint,
    };

    console.log('[Pipeline] 🚀 Stage 1: Clinical Lens');
    console.log('[Pipeline] Input length:', rawNotes.length, 'chars');
    console.log('[Pipeline] Chief complaint:', complaint);

    const { content, traceId } = await executePromptWithHeaders(
      PROMPT_IDS.CLINICAL_LENS,
      serializeVariables(variables)
    );

    metadata.traceIds.clinicalLens = traceId;
    const stage1Duration = Date.now() - stage1Start;
    metadata.stageDurations.clinicalLens = stage1Duration;
    
    console.log('[Pipeline] Stage 1 response received. Trace ID:', traceId);
    console.log('[Pipeline] Stage 1 duration:', stage1Duration, 'ms');

    clinicalLensResult = safeParseJSON(
      content,
      ClinicalLensSchema,
      'Stage 1: Clinical Lens'
    ) as ClinicalLensResult;
    
    metadata.stagesCompleted.push('clinical_lens');
    
    console.log('[Pipeline] ✅ Stage 1 complete');
    console.log('[Pipeline] Extracted red flags:', clinicalLensResult.red_flags);
    console.log('[Pipeline] Risk factors:', clinicalLensResult.risk_factors);
    
  } catch (error) {
    console.error('[Pipeline] ❌ Stage 1 failed:', error);
    const traceId = error instanceof PipelineError ? error.traceId : null;
    return {
      success: false,
      error: `Clinical Lens failed: ${error instanceof Error ? error.message : String(error)}`,
      stage: 'clinical_lens',
      trace_id: traceId,
    };
  }

  // ===========================================================================
  // STAGE 2: Diagnostic Engine (Glass Health Reasoning)
  // ===========================================================================
  let diagnosticEngineResult: DiagnosticEngineResult;
  
  try {
    const stage2Start = Date.now();
    
    const variables: DiagnosticEngineVariables = {
      clinical_lens_output: JSON.stringify(clinicalLensResult, null, 2),
      chief_complaint: complaint,
    };

    console.log('[Pipeline] 🧠 Stage 2: Diagnostic Engine');
    console.log('[Pipeline] Building on Clinical Lens output');

    const { content, traceId } = await executePromptWithHeaders(
      PROMPT_IDS.DIAGNOSTIC_ENGINE,
      serializeVariables(variables)
    );

    metadata.traceIds.diagnosticEngine = traceId;
    const stage2Duration = Date.now() - stage2Start;
    metadata.stageDurations.diagnosticEngine = stage2Duration;
    
    console.log('[Pipeline] Stage 2 response received. Trace ID:', traceId);
    console.log('[Pipeline] Stage 2 duration:', stage2Duration, 'ms');

    diagnosticEngineResult = safeParseJSON(
      content,
      DiagnosticEngineSchema,
      'Stage 2: Diagnostic Engine'
    ) as DiagnosticEngineResult;
    
    metadata.stagesCompleted.push('diagnostic_engine');
    
    console.log('[Pipeline] ✅ Stage 2 complete');
    console.log('[Pipeline] Most likely diagnoses:', diagnosticEngineResult.differential.most_likely?.length || 0);
    console.log('[Pipeline] Can\'t miss diagnoses:', diagnosticEngineResult.differential.cant_miss?.length || 0);
    
  } catch (error) {
    console.error('[Pipeline] ❌ Stage 2 failed:', error);
    const traceId = error instanceof PipelineError ? error.traceId : null;
    return {
      success: false,
      error: `Diagnostic Engine failed: ${error instanceof Error ? error.message : String(error)}`,
      stage: 'diagnostic_engine',
      trace_id: traceId,
    };
  }

  // ===========================================================================
  // Final Assembly
  // ===========================================================================
  const totalDuration = Date.now() - pipelineStartTime;
  metadata.executionTimeMs = totalDuration;

  console.log('[Pipeline] 🎉 Pipeline complete!');
  console.log('[Pipeline] Total duration:', totalDuration, 'ms');
  console.log('[Pipeline] Stage breakdown:', metadata.stageDurations);

  return {
    success: true,
    clinicalLens: clinicalLensResult,
    diagnosticEngine: diagnosticEngineResult,
    
    // Legacy compatibility fields
    report: diagnosticEngineResult.assessment_summary,
    reasoning_trace: diagnosticEngineResult.reasoning_trace,
    trace_data: {
      clinicalLens: clinicalLensResult,
      diagnosticEngine: diagnosticEngineResult,
    },
    metadata,
  };
}

// =============================================================================
// Individual Stage Functions (for testing/debugging)
// =============================================================================

/**
 * Run only Stage 1: Clinical Lens (useful for testing extraction logic).
 */
export async function runClinicalLensStage(
  rawNotes: string,
  complaint: string
): Promise<{ data: ClinicalLensResult; traceId: string | null }> {
  const variables: ClinicalLensVariables = {
    raw_notes: rawNotes,
    chief_complaint: complaint,
  };
  
  const { content, traceId } = await executePromptWithHeaders(
    PROMPT_IDS.CLINICAL_LENS,
    serializeVariables(variables)
  );
  
  return {
    data: safeParseJSON(content, ClinicalLensSchema, 'Clinical Lens Test') as ClinicalLensResult,
    traceId,
  };
}

/**
 * Run only Stage 2: Diagnostic Engine (useful for testing reasoning logic).
 */
export async function runDiagnosticEngineStage(
  clinicalLensOutput: ClinicalLensResult,
  complaint: string
): Promise<{ data: DiagnosticEngineResult; traceId: string | null }> {
  const variables: DiagnosticEngineVariables = {
    clinical_lens_output: JSON.stringify(clinicalLensOutput, null, 2),
    chief_complaint: complaint,
  };
  
  const { content, traceId } = await executePromptWithHeaders(
    PROMPT_IDS.DIAGNOSTIC_ENGINE,
    serializeVariables(variables)
  );
  
  return {
    data: safeParseJSON(content, DiagnosticEngineSchema, 'Diagnostic Engine Test') as DiagnosticEngineResult,
    traceId,
  };
}
