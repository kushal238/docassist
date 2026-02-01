/**
 * Clinical Pipeline Service
 * 
 * Production-grade 4-stage reasoning engine using Keywords AI managed prompts.
 * All prompts are fetched by ID - NO hardcoded prompt text in this file.
 * 
 * Pipeline Stages:
 * 1. History Extraction - Raw notes → Structured JSON
 * 2. Relevance Filtering - Filter by chief complaint
 * 3. Clinical Reasoning - Chain-of-thought analysis
 * 4. Synthesis - Final physician report
 */

import { z } from 'zod';
import { executePromptWithHeaders, PipelineError } from '@/lib/ai-client';

// =============================================================================
// Prompt IDs (Managed in Keywords AI Dashboard)
// =============================================================================

/**
 * Prompt IDs - These correspond to prompts configured in the Keywords AI UI.
 * Version control and rollbacks are handled in the dashboard, not code.
 * 
 * These are the actual prompt IDs from your Keywords AI dashboard.
 */
const PROMPT_IDS = {
  EXTRACTION: '880547ac767343f88b93cbb1855a3eba',
  FILTERING: '9a28291ec37f42c9a6affd2e73a0f185',
  REASONING: 'ff0d70eae958476fa4b3a9d864e522a7',
  SYNTHESIS: '6376e45997634eac9baf6ebdd47b375c',
} as const;

// =============================================================================
// Type-Safe Variable Interfaces (Prevents Magic String Typos)
// =============================================================================

/** Variables for Stage 1: History Extraction */
interface ExtractionVariables {
  raw_notes: string;
  [key: string]: string;
}

/** Variables for Stage 2: Relevance Filtering */
interface FilteringVariables {
  history_json: string;
  complaint: string;
  [key: string]: string;
}

/** Variables for Stage 3: Clinical Reasoning */
interface ReasoningVariables {
  filtered_data: string;
  complaint: string;
  [key: string]: string;
}

/** Variables for Stage 4: Synthesis */
interface SynthesisVariables {
  reasoning_chain: string;
  [key: string]: string;
}

// =============================================================================
// Zod Schemas for Output Validation
// =============================================================================

/** Schema for extracted medical history (Stage 1 output) */
const ExtractedHistorySchema = z.object({
  demographics: z.object({
    age: z.string().optional(),
    sex: z.string().optional(),
    name: z.string().optional(),
  }).optional(),
  chief_complaint: z.string().optional(),
  history_of_present_illness: z.string().optional(),
  past_medical_history: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  family_history: z.array(z.string()).optional(),
  social_history: z.object({
    smoking: z.string().optional(),
    alcohol: z.string().optional(),
    occupation: z.string().optional(),
  }).optional(),
  vitals: z.object({
    blood_pressure: z.string().optional(),
    heart_rate: z.string().optional(),
    respiratory_rate: z.string().optional(),
    temperature: z.string().optional(),
    oxygen_saturation: z.string().optional(),
  }).optional(),
  labs: z.array(z.object({
    name: z.string(),
    value: z.string(),
    unit: z.string().optional(),
    flag: z.enum(['normal', 'high', 'low', 'critical']).optional(),
  })).optional(),
  physical_exam: z.record(z.string()).optional(),
}).passthrough(); // Allow additional fields

/** Schema for filtered findings (Stage 2 output) */
const FilteredFindingsSchema = z.object({
  relevant_conditions: z.array(z.string()).optional(),
  relevant_medications: z.array(z.string()).optional(),
  relevant_labs: z.array(z.any()).optional(),
  relevant_history: z.array(z.string()).optional(),
  risk_factors: z.array(z.string()).optional(),
  red_flags: z.array(z.string()).optional(),
}).passthrough();

// =============================================================================
// Pipeline Result Types
// =============================================================================

export interface PipelineTraceData {
  extractedHistory: Record<string, unknown>;
  filteredFindings: Record<string, unknown> | string;
  clinicalReasoning: string;
}

export interface PipelineMetadata {
  traceIds: {
    extraction: string | null;
    filtering: string | null;
    reasoning: string | null;
    synthesis: string | null;
  };
  stagesCompleted: string[];
  executionTimeMs: number;
}

export interface ClinicalPipelineResult {
  success: true;
  report: string;
  reasoning_trace: string;
  trace_data: PipelineTraceData;
  metadata: PipelineMetadata;
}

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
    lines.shift(); // Remove opening ```json or ```
    if (lines[lines.length - 1]?.trim() === '```') {
      lines.pop(); // Remove closing ```
    }
    cleaned = lines.join('\n').trim();
    console.log(`[${debugLabel}] After markdown removal, first 200 chars:`, cleaned.substring(0, 200));
  }

  // Try to extract JSON from text that has explanations before/after
  // Look for the first { and last } to extract just the JSON part
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
      console.error(`[${debugLabel}] ❌ JSON parse failed on extracted candidate:`, err);
      console.error(`[${debugLabel}] JSON candidate was:`, jsonCandidate.substring(0, 500));
    }
  }

  // If extraction didn't work, try parsing the cleaned content as-is
  console.log(`[${debugLabel}] Attempting direct parse of cleaned content`);
  try {
    const parsed = JSON.parse(cleaned);
    
    if (schema) {
      return schema.parse(parsed);
    }
    
    return parsed;
  } catch (err) {
    console.error(`[${debugLabel}] ❌ Direct parse failed:`, err);
    console.error(`[${debugLabel}] Full original content:`, originalContent);
    throw new Error(
      `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}\n` +
      `Content preview: ${originalContent.substring(0, 200)}...`
    );
  }
}

/**
 * Serialize variables for prompt injection.
 * Objects/arrays are JSON stringified, primitives converted to strings.
 */
function serializeVariables(
  vars: Record<string, unknown>
): Record<string, string> {
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
// Main Pipeline Function
// =============================================================================

/**
 * Run the complete clinical analysis pipeline.
 * 
 * Executes 4 stages sequentially using managed prompts from Keywords AI.
 * Each stage's prompt text is configured in the Keywords AI dashboard,
 * enabling version control and safe rollbacks without code changes.
 * 
 * @param rawNotes - Unstructured patient medical notes
 * @param complaint - The chief complaint to focus analysis on
 * @returns Pipeline result with report, reasoning trace, and metadata
 * 
 * @example
 * ```ts
 * const result = await runClinicalPipeline(
 *   "58yo male with HTN, DM2, presenting with chest pain...",
 *   "Chest pain radiating to left arm"
 * );
 * 
 * if (result.success) {
 *   console.log(result.report);
 *   console.log(result.reasoning_trace); // For "Show Work" dropdown
 * }
 * ```
 */
export async function runClinicalPipeline(
  rawNotes: string,
  complaint: string
): Promise<PipelineResult> {
  const startTime = Date.now();
  
  const metadata: PipelineMetadata = {
    traceIds: {
      extraction: null,
      filtering: null,
      reasoning: null,
      synthesis: null,
    },
    stagesCompleted: [],
    executionTimeMs: 0,
  };

  const traceData: PipelineTraceData = {
    extractedHistory: {},
    filteredFindings: {},
    clinicalReasoning: '',
  };

  // =========================================================================
  // Stage 1: History Extraction
  // =========================================================================
  let extractedHistory: Record<string, unknown>;
  
  try {
    const variables: ExtractionVariables = {
      raw_notes: rawNotes,
    };

    console.log('[Pipeline] Starting Stage 1: History Extraction');
    console.log('[Pipeline] Input raw_notes length:', rawNotes.length);

    const { content, traceId } = await executePromptWithHeaders(
      PROMPT_IDS.EXTRACTION,
      serializeVariables(variables)
    );

    console.log('[Pipeline] Stage 1 response received. Trace ID:', traceId);
    console.log('[Pipeline] Response content type:', typeof content);
    console.log('[Pipeline] Response content length:', content.length);

    metadata.traceIds.extraction = traceId;
    
    extractedHistory = safeParseJSON(content, ExtractedHistorySchema, 'Stage 1: Extraction');
    traceData.extractedHistory = extractedHistory;
    metadata.stagesCompleted.push('extraction');
    
    console.log('[Pipeline] ✅ Stage 1 complete. Extracted keys:', Object.keys(extractedHistory));
    
  } catch (error) {
    console.error('[Pipeline] ❌ Stage 1 failed:', error);
    const traceId = error instanceof PipelineError ? error.traceId : null;
    return {
      success: false,
      error: `History Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      stage: 'extraction',
      trace_id: traceId,
    };
  }

  // =========================================================================
  // Stage 2: Relevance Filtering
  // =========================================================================
  let filteredFindings: Record<string, unknown> | string;
  
  try {
    const variables: FilteringVariables = {
      history_json: JSON.stringify(extractedHistory, null, 2),
      complaint: complaint,
    };

    const { content, traceId } = await executePromptWithHeaders(
      PROMPT_IDS.FILTERING,
      serializeVariables(variables)
    );

    metadata.traceIds.filtering = traceId;
    
    // Try to parse as JSON, fall back to raw string if not valid JSON
    try {
      filteredFindings = safeParseJSON(content, FilteredFindingsSchema);
    } catch {
      filteredFindings = content;
    }
    
    traceData.filteredFindings = filteredFindings;
    metadata.stagesCompleted.push('filtering');
    
  } catch (error) {
    const traceId = error instanceof PipelineError ? error.traceId : null;
    return {
      success: false,
      error: `Relevance Filtering failed: ${error instanceof Error ? error.message : String(error)}`,
      stage: 'filtering',
      trace_id: traceId,
    };
  }

  // =========================================================================
  // Stage 3: Clinical Reasoning (Chain-of-Thought)
  // =========================================================================
  let clinicalReasoning: string;
  
  try {
    const variables: ReasoningVariables = {
      filtered_data: typeof filteredFindings === 'string' 
        ? filteredFindings 
        : JSON.stringify(filteredFindings, null, 2),
      complaint: complaint,
    };

    const { content, traceId } = await executePromptWithHeaders(
      PROMPT_IDS.REASONING,
      serializeVariables(variables)
    );

    metadata.traceIds.reasoning = traceId;
    clinicalReasoning = content;
    traceData.clinicalReasoning = clinicalReasoning;
    metadata.stagesCompleted.push('reasoning');
    
  } catch (error) {
    const traceId = error instanceof PipelineError ? error.traceId : null;
    return {
      success: false,
      error: `Clinical Reasoning failed: ${error instanceof Error ? error.message : String(error)}`,
      stage: 'reasoning',
      trace_id: traceId,
    };
  }

  // =========================================================================
  // Stage 4: Synthesis
  // =========================================================================
  let finalReport: string;
  
  try {
    const variables: SynthesisVariables = {
      reasoning_chain: clinicalReasoning,
    };

    const { content, traceId } = await executePromptWithHeaders(
      PROMPT_IDS.SYNTHESIS,
      serializeVariables(variables)
    );

    metadata.traceIds.synthesis = traceId;
    finalReport = content;
    metadata.stagesCompleted.push('synthesis');
    
  } catch (error) {
    const traceId = error instanceof PipelineError ? error.traceId : null;
    return {
      success: false,
      error: `Synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
      stage: 'synthesis',
      trace_id: traceId,
    };
  }

  // =========================================================================
  // Return Success Result
  // =========================================================================
  metadata.executionTimeMs = Date.now() - startTime;

  return {
    success: true,
    report: finalReport,
    reasoning_trace: clinicalReasoning,
    trace_data: traceData,
    metadata,
  };
}

// =============================================================================
// Individual Stage Functions (for testing/debugging)
// =============================================================================

/**
 * Run only the extraction stage (useful for testing).
 */
export async function runExtractionStage(
  rawNotes: string
): Promise<{ data: Record<string, unknown>; traceId: string | null }> {
  const variables: ExtractionVariables = { raw_notes: rawNotes };
  
  const { content, traceId } = await executePromptWithHeaders(
    PROMPT_IDS.EXTRACTION,
    serializeVariables(variables)
  );
  
  return {
    data: safeParseJSON(content),
    traceId,
  };
}

/**
 * Run only the filtering stage (useful for testing).
 */
export async function runFilteringStage(
  historyJson: Record<string, unknown>,
  complaint: string
): Promise<{ data: unknown; traceId: string | null }> {
  const variables: FilteringVariables = {
    history_json: JSON.stringify(historyJson, null, 2),
    complaint,
  };
  
  const { content, traceId } = await executePromptWithHeaders(
    PROMPT_IDS.FILTERING,
    serializeVariables(variables)
  );
  
  try {
    return { data: safeParseJSON(content), traceId };
  } catch {
    return { data: content, traceId };
  }
}
