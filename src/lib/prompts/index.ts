/**
 * Prompt Library for DocAssist
 * Optimized prompts for Keywords AI integration
 */

export {
  // Core extraction prompt
  EXTRACTION_SYSTEM_PROMPT,
  FEW_SHOT_EXAMPLES,

  // Message builders
  buildExtractionMessages,
  buildExtractionMessagesCompact,

  // Direct API caller
  runClinicalExtraction,

  // Types
  type ExtractionResult,
  type ChatMessage,
} from './clinical-extraction';
