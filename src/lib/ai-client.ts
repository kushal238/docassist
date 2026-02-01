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
// Helper for Managed Prompt Calls
// =============================================================================

/**
 * Execute a managed prompt via Keywords AI Gateway.
 * 
 * This helper properly types the Keywords AI extension while working around
 * the OpenAI SDK's strict typing.
 * 
 * @param promptId - The managed prompt ID from Keywords AI dashboard
 * @param variables - Variables to inject into the prompt template
 * @param options - Additional options (model override, etc.)
 * @returns The completion response with trace ID
 * 
 * @example
 * ```ts
 * const { content, traceId } = await executePrompt(
 *   'docassist_history_extraction',
 *   { raw_notes: patientNotes }
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
  } = {}
): Promise<{ content: string; traceId: string | null; raw: OpenAI.Chat.ChatCompletion }> {
  const client = getAIClient();
  
  const {
    model = 'gpt-5.2',
    temperature,
    maxTokens,
  } = options;

  // Build the request with Keywords AI prompt extension
  const requestBody: KeywordsCreateParams = {
    model,
    messages: [{ role: 'user', content: '-' }], // Required schema placeholder
    stream: false,
    prompt: {
      prompt_id: promptId,
      variables,
      override: true, // CRITICAL: Override placeholder message with managed prompt
    },
  };

  if (temperature !== undefined) {
    requestBody.temperature = temperature;
  }
  if (maxTokens !== undefined) {
    requestBody.max_tokens = maxTokens;
  }

  // Execute with type assertion to bypass OpenAI SDK's strict types

  const response = await client.chat.completions.create(requestBody) as OpenAI.Chat.ChatCompletion;

  // Extract trace ID from response (Keywords AI includes this)
  const traceId = (response as any)._request_id ||
                  (response as any).id ||
                  null;

  const content = response.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error(`Empty response from prompt: ${promptId}`);
  }

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

  const response = await fetch(`${KEYWORDS_AI_BASE_URL}chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: '-' }],
      stream: false,
      prompt: {
        prompt_id: promptId,
        variables,
        override: true, // CRITICAL: Override placeholder message with managed prompt
      },
    }),
  });

  // Extract trace ID from headers
  const traceId = response.headers.get('x-keywords-trace-id') || 
                  response.headers.get('X-Keywords-Trace-Id');

  if (!response.ok) {
    const errorText = await response.text();
    const error = new PipelineError(
      `Keywords AI error (${response.status}): ${errorText}`,
      promptId,
      traceId
    );
    throw error;
  }

  const data = await response.json();
  
  console.log('[AI Client] Full response object keys:', Object.keys(data));
  console.log('[AI Client] Response choices:', data.choices?.length);
  
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    console.error('[AI Client] No content in response:', JSON.stringify(data, null, 2));
    throw new PipelineError(
      `Empty response from prompt: ${promptId}`,
      promptId,
      traceId || data.id
    );
  }

  console.log('[AI Client] Content length:', content.length);
  console.log('[AI Client] Content preview (first 300 chars):', content.substring(0, 300));

  return {
    content: content.trim(),
    traceId: traceId || data.id,
  };
}

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
