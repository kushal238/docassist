/**
 * Server Action: Analyze Patient
 * 
 * Exposes the clinical pipeline as a callable action for the frontend.
 * In Next.js App Router, this would use 'use server' directive.
 * For Vite/SPA, this can be called directly or via an API route.
 */

// In Next.js, uncomment this:
// 'use server';

import { z } from 'zod';
import { 
  runClinicalPipeline, 
  PipelineResult,
  ClinicalPipelineResult,
  ClinicalPipelineError 
} from '@/services/clinical-pipeline';

// =============================================================================
// Input Validation Schema
// =============================================================================

const AnalyzePatientInputSchema = z.object({
  rawNotes: z.string().min(10, 'Notes must be at least 10 characters'),
  chiefComplaint: z.string().min(3, 'Complaint must be at least 3 characters'),
});

export type AnalyzePatientInput = z.infer<typeof AnalyzePatientInputSchema>;

// =============================================================================
// Action Result Types
// =============================================================================

export interface AnalyzePatientSuccess {
  success: true;
  report: string;
  reasoning_trace: string;
  trace_id: string | null;
  execution_time_ms: number;
}

export interface AnalyzePatientFailure {
  success: false;
  error: string;
  stage?: string;
  trace_id: string | null;
}

export type AnalyzePatientResult = AnalyzePatientSuccess | AnalyzePatientFailure;

// =============================================================================
// Server Action
// =============================================================================

/**
 * Analyze patient data using the clinical pipeline.
 * 
 * This is the main entry point for the frontend to invoke the AI analysis.
 * It validates inputs, runs the pipeline, and returns a structured result.
 * 
 * @param input - The patient notes and chief complaint
 * @returns Analysis result with report, reasoning trace, or error details
 * 
 * @example
 * ```tsx
 * // In a React component
 * const result = await analyzePatient({
 *   rawNotes: patientNotes,
 *   chiefComplaint: "Chest pain"
 * });
 * 
 * if (result.success) {
 *   setReport(result.report);
 *   setReasoning(result.reasoning_trace);
 * } else {
 *   setError(result.error);
 * }
 * ```
 */
export async function analyzePatient(
  input: AnalyzePatientInput
): Promise<AnalyzePatientResult> {
  // Validate input
  const parseResult = AnalyzePatientInputSchema.safeParse(input);
  
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation error: ${parseResult.error.errors.map(e => e.message).join(', ')}`,
      trace_id: null,
    };
  }

  const { rawNotes, chiefComplaint } = parseResult.data;

  try {
    const result = await runClinicalPipeline(rawNotes, chiefComplaint);

    if (result.success) {
      return {
        success: true,
        report: result.report,
        reasoning_trace: result.reasoning_trace,
        trace_id: result.metadata.traceIds.synthesis,
        execution_time_ms: result.metadata.executionTimeMs,
      };
    } else {
      // TypeScript narrowing for error case
      const errorResult = result as ClinicalPipelineError;
      return {
        success: false,
        error: errorResult.error,
        stage: errorResult.stage,
        trace_id: errorResult.trace_id,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      trace_id: null,
    };
  }
}

// =============================================================================
// Additional Actions
// =============================================================================

/**
 * Get the full pipeline result including all trace data.
 * Use this when you need the complete "Show Work" dropdown data.
 */
export async function analyzePatientWithFullTrace(
  input: AnalyzePatientInput
): Promise<PipelineResult> {
  const parseResult = AnalyzePatientInputSchema.safeParse(input);
  
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation error: ${parseResult.error.errors.map(e => e.message).join(', ')}`,
      stage: 'validation',
      trace_id: null,
    };
  }

  const { rawNotes, chiefComplaint } = parseResult.data;
  return runClinicalPipeline(rawNotes, chiefComplaint);
}

/**
 * Validate input without running the pipeline.
 * Useful for form validation before submission.
 */
export function validateAnalyzeInput(
  input: unknown
): { valid: true; data: AnalyzePatientInput } | { valid: false; errors: string[] } {
  const result = AnalyzePatientInputSchema.safeParse(input);
  
  if (result.success) {
    return { valid: true, data: result.data };
  }
  
  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}
