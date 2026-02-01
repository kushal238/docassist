/**
 * Keywords AI Client Singleton
 * 
 * Configures the OpenAI SDK to use Keywords AI Gateway for:
 * - Managed prompts (called by ID, not hardcoded)
 * - Version control & safe rollbacks
 * - Full observability via trace IDs
 */

import OpenAI from 'openai';

// =============================================================================
// Types for Keywords AI Extensions
// =============================================================================

/**
 * Keywords AI prompt configuration passed via the API body.
 * This extends the standard OpenAI API with prompt management.
 */
export interface KeywordsPromptConfig {
  prompt_id: string;
  variables: Record<string, string>;
  override?: boolean; // When true, overrides the messages with the managed prompt
}

/**
 * Extended create params that include Keywords AI specific fields.
 * Used to properly type our API calls while working around OpenAI SDK types.
 */
export interface KeywordsCreateParams extends Omit<OpenAI.Chat.ChatCompletionCreateParams, 'messages'> {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  prompt?: KeywordsPromptConfig;
}

// =============================================================================
// Client Configuration
// =============================================================================

const KEYWORDS_AI_BASE_URL = 'https://api.keywordsai.co/api/';

/**
 * Get the API key from environment.
 * Supports both server-side (KEYWORDSAI_API_KEY) and client-side (VITE_KEYWORDS_AI_API_KEY)
 */
function getApiKey(): string {
  // Server-side (Next.js / Node)
  if (typeof process !== 'undefined' && process.env?.KEYWORDSAI_API_KEY) {
    return process.env.KEYWORDSAI_API_KEY;
  }
  
  // Client-side (Vite)
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_KEYWORDS_AI_API_KEY) {
    return import.meta.env.VITE_KEYWORDS_AI_API_KEY;
  }
  
  throw new Error(
    'Keywords AI API key not found. Set KEYWORDSAI_API_KEY (server) or VITE_KEYWORDS_AI_API_KEY (client)'
  );
}

// =============================================================================
// Singleton Client Instance
// =============================================================================

let clientInstance: OpenAI | null = null;

/**
 * Get the singleton OpenAI client configured for Keywords AI Gateway.
 * 
 * @example
 * ```ts
 * const client = getAIClient();
 * const response = await client.chat.completions.create({...});
 * ```
 */
export function getAIClient(): OpenAI {
  if (!clientInstance) {
    clientInstance = new OpenAI({
      apiKey: getApiKey(),
      baseURL: KEYWORDS_AI_BASE_URL,
      // Allow browser usage for client-side calls
      dangerouslyAllowBrowser: true,
    });
  }
  return clientInstance;
}

// =============================================================================
// Unified Prompt Execution
// =============================================================================

/**
 * Execute a managed prompt via Keywords AI Gateway.
 * 
 * Unified implementation using fetch for maximum control and compatibility.
 * Supports all OpenAI parameters while providing access to Keywords AI headers.
 * 
 * @param promptId - The managed prompt ID from Keywords AI dashboard
 * @param variables - Variables to inject into the prompt template
 * @param options - Additional options for model, temperature, tokens, etc.
 * @returns Content, trace ID, and metadata
 * 
 * @example
 * ```ts
 * const { content, traceId } = await executePrompt(
 *   '880547ac767343f88b93cbb1855a3eba',
 *   { raw_notes: patientNotes },
 *   { model: 'claude-3-haiku-20240307', temperature: 0.7 }
 * );
 * ```
 */
export async function executePrompt(
  promptId: string,
  variables: Record<string, string>,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    debug?: boolean;
  } = {}
): Promise<{ content: string; traceId: string | null }> {
  const apiKey = getApiKey();
  const {
<<<<<<< Updated upstream
    model = 'gpt-5.2',
=======
    model = 'claude-3-haiku-20240307', // Fast, cost-effective default
>>>>>>> Stashed changes
    temperature,
    maxTokens,
    debug = false,
  } = options;

  // Build request body
  const requestBody: Record<string, any> = {
    model,
    messages: [{ role: 'user', content: 'placeholder' }],
    stream: false,
    prompt: {
      prompt_id: promptId,
      variables,
      override: true, // CRITICAL: Override placeholder with managed prompt
    },
  };

  // Add optional parameters
  if (temperature !== undefined) {
    requestBody.temperature = temperature;
  }
  if (maxTokens !== undefined) {
    requestBody.max_tokens = maxTokens;
  }

  if (debug) {
    console.log('[AI Client] Request:', {
      promptId,
      model,
      variableKeys: Object.keys(variables),
      temperature,
      maxTokens,
    });
  }

<<<<<<< Updated upstream
  return {
    content: content.trim(),
    traceId,
    raw: response,
  };
}

// =============================================================================
// Raw Fetch Helper (for accessing response headers)
// =============================================================================

/**
 * Execute a managed prompt using raw fetch to access response headers.
 * Use this when you need the X-Keywords-Trace-Id header.
 * 
 * @param promptId - The managed prompt ID
 * @param variables - Variables for the prompt
 * @returns Content, trace ID from headers, and raw response
 */
export async function executePromptWithHeaders(
  promptId: string,
  variables: Record<string, string>,
  options: {
    model?: string;
  } = {}
): Promise<{ content: string; traceId: string | null }> {
  const apiKey = getApiKey();
  const { model = 'gpt-5.2' } = options;

=======
  // Execute request
>>>>>>> Stashed changes
  const response = await fetch(`${KEYWORDS_AI_BASE_URL}chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  // Extract trace ID from headers
  const traceId = response.headers.get('x-keywords-trace-id') || 
                  response.headers.get('X-Keywords-Trace-Id');

  // Handle errors
  if (!response.ok) {
    const errorText = await response.text();
    throw new PipelineError(
      `Keywords AI error (${response.status}): ${errorText}`,
      promptId,
      traceId
    );
  }

  // Parse response
  const data = await response.json();
  
  if (debug) {
    console.log('[AI Client] Response keys:', Object.keys(data));
    console.log('[AI Client] Choices:', data.choices?.length);
  }
  
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    if (debug) {
      console.error('[AI Client] Empty response:', JSON.stringify(data, null, 2));
    }
    throw new PipelineError(
      `Empty response from prompt: ${promptId}`,
      promptId,
      traceId || data.id
    );
  }

  if (debug) {
    console.log('[AI Client] Content length:', content.length);
    console.log('[AI Client] Preview:', content.substring(0, 200));
  }

  return {
    content: content.trim(),
    traceId: traceId || data.id,
  };
}

/**
 * @deprecated Use executePrompt() instead. This alias is kept for backward compatibility.
 */
export const executePromptWithHeaders = executePrompt;

// =============================================================================
// Custom Error Class
// =============================================================================

/**
 * Custom error for pipeline failures with trace ID for debugging.
 */
export class PipelineError extends Error {
  public readonly promptId: string;
  public readonly traceId: string | null;
  public readonly stage?: string;

  constructor(
    message: string,
    promptId: string,
    traceId: string | null,
    stage?: string
  ) {
    super(message);
    this.name = 'PipelineError';
    this.promptId = promptId;
    this.traceId = traceId;
    this.stage = stage;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      promptId: this.promptId,
      traceId: this.traceId,
      stage: this.stage,
    };
  }
}
