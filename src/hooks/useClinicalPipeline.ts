import { useState, useCallback } from 'react';
import { 
  analyzePatientWithFullTrace,
  type AnalyzePatientInput 
} from '@/actions/analyze-patient';
import type { 
  PipelineResult,
  ClinicalPipelineResult,
  ClinicalPipelineError,
  PipelineTraceData,
  PipelineMetadata 
} from '@/services/clinical-pipeline';

// Re-export types for components
export type { PipelineResult, ClinicalPipelineResult, PipelineTraceData, PipelineMetadata };

export interface UseClinicalPipelineState {
  result: ClinicalPipelineResult | null;
  isLoading: boolean;
  error: { message: string; stage?: string; traceId: string | null } | null;
  currentStage: string | null;
}

export interface UseClinicalPipelineReturn extends UseClinicalPipelineState {
  runAnalysis: (rawNotes: string, chiefComplaint: string) => Promise<ClinicalPipelineResult | null>;
  reset: () => void;
}

/**
 * React hook for running the clinical analysis pipeline.
 * 
 * @example
 * ```tsx
 * const { result, isLoading, error, runAnalysis } = useClinicalPipeline();
 * 
 * const handleAnalyze = async () => {
 *   await runAnalysis(patientNotes, "Chest pain");
 * };
 * ```
 */
export function useClinicalPipeline(): UseClinicalPipelineReturn {
  const [state, setState] = useState<UseClinicalPipelineState>({
    result: null,
    isLoading: false,
    error: null,
    currentStage: null,
  });

  const runAnalysis = useCallback(async (
    rawNotes: string,
    chiefComplaint: string
  ): Promise<ClinicalPipelineResult | null> => {
    setState({
      result: null,
      isLoading: true,
      error: null,
      currentStage: 'Initializing...',
    });

    try {
      // Update stage indicators (simulated since we can't track real-time)
      const stages = [
        'Extracting History...',
        'Filtering Relevant Data...',
        'Clinical Reasoning...',
        'Synthesizing Report...',
      ];

      let stageIndex = 0;
      const stageInterval = setInterval(() => {
        if (stageIndex < stages.length) {
          setState(prev => ({ ...prev, currentStage: stages[stageIndex] }));
          stageIndex++;
        }
      }, 2000);

      const result = await analyzePatientWithFullTrace({
        rawNotes,
        chiefComplaint,
      });

      clearInterval(stageInterval);

      if (result.success) {
        setState({
          result,
          isLoading: false,
          error: null,
          currentStage: null,
        });
        return result;
      } else {
        // TypeScript narrowing for error case
        const errorResult = result as ClinicalPipelineError;
        setState({
          result: null,
          isLoading: false,
          error: {
            message: errorResult.error,
            stage: errorResult.stage,
            traceId: errorResult.trace_id,
          },
          currentStage: null,
        });
        return null;
      }
    } catch (error) {
      setState({
        result: null,
        isLoading: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          traceId: null,
        },
        currentStage: null,
      });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      result: null,
      isLoading: false,
      error: null,
      currentStage: null,
    });
  }, []);

  return {
    ...state,
    runAnalysis,
    reset,
  };
}
