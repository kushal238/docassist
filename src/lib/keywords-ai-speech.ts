/**
 * Keywords AI Speech-to-Text API Integration
 * Reference: https://docs.keywordsai.co/api-endpoints/develop/multimodal/speech-to-text
 * 
 * Uses the OpenAI SDK with Keywords AI as the base URL, as recommended in the docs.
 */

import OpenAI from 'openai';

const KEYWORDS_AI_API_KEY = import.meta.env.VITE_KEYWORDS_AI_API_KEY;

// Create OpenAI client pointing to Keywords AI
const openai = new OpenAI({
  baseURL: 'https://api.keywordsai.co/api/',
  apiKey: KEYWORDS_AI_API_KEY,
  dangerouslyAllowBrowser: true, // Required for client-side usage
});

export interface SpeechToTextResponse {
  transcript: string;
  confidence?: number;
  language?: string;
}

export interface SpeechToTextError {
  error: string;
  message: string;
}

/**
 * Format clinical transcripts into readable paragraph blocks.
 * Adds section breaks for common headers and normalizes vitals spacing.
 */
export function formatClinicalTranscript(rawText: string): string {
  if (!rawText) return '';
  let text = rawText.trim();

  text = text.replace(
    /\b(?:bp|blood pressure)\s*:?(\d{2,3})\s*(?:\/|x)\s*(\d{2,3})\b/gi,
    'BP $1/$2'
  );
  text = text.replace(
    /\b(?:hr|heart rate)\s*:?(\d{2,3})\b/gi,
    'HR $1'
  );

  text = text.replace(
    /(^|[.!?]\s+)(Exam|Examination|Impression|Assessment|Plan)\b\s*:?[\s]*/gi,
    (_match, prefix: string, section: string) => {
      const normalized = section.charAt(0).toUpperCase() + section.slice(1).toLowerCase();
      const trimmedPrefix = prefix.trimEnd();
      const separator = trimmedPrefix ? `${trimmedPrefix}\n\n` : '';
      return `${separator}${normalized}: `;
    }
  );

  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\s*\n\s*/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Transcribe audio blob using Keywords AI Speech-to-Text API via OpenAI SDK
 * Reference: https://docs.keywordsai.co/api-endpoints/develop/multimodal/speech-to-text
 * 
 * @param audioBlob - Audio blob from MediaRecorder
 * @param mimeType - MIME type of the audio (e.g., 'audio/webm', 'audio/mp4')
 * @returns Transcript text and confidence score
 */
export async function transcribeAudio(
  audioBlob: Blob,
  mimeType: string = 'audio/webm'
): Promise<SpeechToTextResponse> {
  if (!KEYWORDS_AI_API_KEY) {
    throw new Error('VITE_KEYWORDS_AI_API_KEY is not set in environment variables');
  }

  try {
    // Determine file extension from mimeType
    const extension = mimeType.includes('webm') ? 'webm' : 
                     mimeType.includes('mp4') ? 'mp4' :
                     mimeType.includes('mp3') ? 'mp3' :
                     mimeType.includes('wav') ? 'wav' :
                     mimeType.includes('ogg') ? 'ogg' : 'webm';
    
    // Convert Blob to File object (required by OpenAI SDK)
    const audioFile = new File([audioBlob], `recording.${extension}`, { type: mimeType });

    // Call the OpenAI-compatible transcription endpoint via Keywords AI
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioFile,
      language: 'en',
      response_format: 'json',
      // Keywords AI-specific parameters can be passed via extra_body if needed
      // extra_body: { customer_identifier: 'patient_voice_intake' }
    });

    // The response is a Transcription object with a 'text' property
    // Cast to the expected type since TypeScript may not infer correctly
    const result = transcription as { text: string };

    // Handle the response
    if (!result.text || result.text.trim() === '') {
      throw new Error('No speech detected. Please try speaking again.');
    }

    return {
      transcript: result.text,
      confidence: undefined, // Whisper doesn't provide confidence scores
      language: 'en',
    };
  } catch (error) {
    // Log full error details for debugging
    console.error('Keywords AI Speech-to-Text Error:', error);
    
    if (error instanceof OpenAI.APIError) {
      // Handle specific API errors
      if (error.status === 404) {
        throw new Error(
          `Keywords AI Speech-to-Text endpoint not found (404). ` +
          `Please verify:\n` +
          `1. Your OpenAI API key is configured in Keywords AI dashboard: https://platform.keywordsai.co/platform/api/providers\n` +
          `2. The speech-to-text feature is enabled in your account\n` +
          `3. You're using the correct Keywords AI API key`
        );
      }
      if (error.status === 401) {
        throw new Error('Invalid API key. Please check your VITE_KEYWORDS_AI_API_KEY.');
      }
      if (error.status === 400) {
        throw new Error(`Bad request: ${error.message}. The audio format may not be supported.`);
      }
      throw new Error(`Keywords AI API error: ${error.message}`);
    }
    
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to transcribe audio: Unknown error');
  }
}

/**
 * Check if audio transcription confidence is acceptable
 * @param confidence - Confidence score (0-1)
 * @param threshold - Minimum acceptable confidence (default: 0.7)
 * @returns true if confidence is acceptable
 */
export function isTranscriptionConfident(confidence?: number, threshold: number = 0.7): boolean {
  if (confidence === undefined) {
    // If no confidence provided, assume it's acceptable
    return true;
  }
  return confidence >= threshold;
}
