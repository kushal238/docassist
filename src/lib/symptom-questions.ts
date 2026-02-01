/**
 * Dynamic Symptom Question Generator
 * Uses Keywords AI to generate contextual follow-up questions based on patient responses
 */

const KEYWORDS_AI_URL = "https://api.keywordsai.co/api/chat/completions";
const KEYWORDS_AI_API_KEY = import.meta.env.VITE_KEYWORDS_AI_API_KEY;

// Question topics we need to cover
export type QuestionTopic = 
  | 'primary_symptom'
  | 'onset'
  | 'severity'
  | 'progression'
  | 'associated_symptoms'
  | 'red_flags';

// Fallback questions if API fails
export const FALLBACK_QUESTIONS: Record<QuestionTopic, string> = {
  primary_symptom: "What symptom is bothering you the most right now?",
  onset: "When did this start?",
  severity: "On a scale from 1 to 10, how severe is it right now?",
  progression: "Is it getting better, worse, or staying the same?",
  associated_symptoms: "Do you have any other symptoms you think are related?",
  red_flags: "Have you had any of the following: high fever, chest pain, trouble breathing, confusion, or fainting?",
};

// Map step numbers to topics
export const STEP_TO_TOPIC: Record<number, QuestionTopic> = {
  1: 'primary_symptom',
  2: 'onset',
  3: 'severity',
  4: 'progression',
  5: 'associated_symptoms',
  6: 'red_flags',
};

interface ConversationContext {
  primarySymptom?: string;
  onset?: string;
  severity?: number | null;
  progression?: string;
  associatedSymptoms?: string[];
  previousResponses: { question: string; answer: string }[];
}

/**
 * Generate a contextual follow-up question based on the conversation so far
 */
export async function generateFollowUpQuestion(
  topic: QuestionTopic,
  context: ConversationContext
): Promise<string> {
  // If no API key, return fallback
  if (!KEYWORDS_AI_API_KEY) {
    console.warn('No Keywords AI API key, using fallback question');
    return FALLBACK_QUESTIONS[topic];
  }

  try {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(topic, context);

    const response = await fetch(KEYWORDS_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KEYWORDS_AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error('Failed to generate question, using fallback');
      return FALLBACK_QUESTIONS[topic];
    }

    const data = await response.json();
    const generatedQuestion = data?.choices?.[0]?.message?.content?.trim();

    // Validate the response is a reasonable question
    if (!generatedQuestion || generatedQuestion.length < 10 || generatedQuestion.length > 300) {
      return FALLBACK_QUESTIONS[topic];
    }

    return generatedQuestion;
  } catch (error) {
    console.error('Error generating follow-up question:', error);
    return FALLBACK_QUESTIONS[topic];
  }
}

function buildSystemPrompt(): string {
  return `You are a medical intake assistant helping collect symptom information from patients.

CRITICAL RULES:
- Generate ONE short, conversational follow-up question
- Be warm, empathetic, and easy to understand
- Use simple language (no medical jargon)
- NEVER diagnose or suggest what the condition might be
- NEVER recommend treatments or medications
- NEVER say "this sounds like..." or name any diseases
- Keep questions under 25 words
- Reference what the patient already told you when relevant

Your job is ONLY to collect information, not to provide medical advice.`;
}

function buildUserPrompt(topic: QuestionTopic, context: ConversationContext): string {
  const conversationSummary = context.previousResponses
    .map(r => `Q: ${r.question}\nA: ${r.answer}`)
    .join('\n\n');

  const topicInstructions: Record<QuestionTopic, string> = {
    primary_symptom: "Ask what symptom or health concern is bothering them most right now.",
    onset: `The patient mentioned "${context.primarySymptom || 'their symptom'}". Ask when this started in a natural, conversational way.`,
    severity: `Regarding their ${context.primarySymptom || 'symptom'} that started ${context.onset || 'recently'}, ask them to rate the severity from 1-10.`,
    progression: `Ask if their ${context.primarySymptom || 'symptom'} is getting better, worse, or staying about the same.`,
    associated_symptoms: `Ask if they've noticed any other symptoms that might be connected to their ${context.primarySymptom || 'main concern'}.`,
    red_flags: `Gently ask if they've experienced any concerning symptoms like high fever, chest pain, difficulty breathing, confusion, or fainting. Be reassuring but thorough.`,
  };

  let prompt = `Generate a follow-up question for this patient intake conversation.

TOPIC TO ASK ABOUT: ${topicInstructions[topic]}

`;

  if (conversationSummary) {
    prompt += `CONVERSATION SO FAR:
${conversationSummary}

`;
  }

  prompt += `Generate ONLY the question, nothing else. Keep it warm and conversational.`;

  return prompt;
}

/**
 * Generate all questions upfront based on initial symptom (optional optimization)
 */
export async function generateQuestionSet(primarySymptom: string): Promise<Record<QuestionTopic, string>> {
  const questions: Record<QuestionTopic, string> = { ...FALLBACK_QUESTIONS };
  
  // Only customize questions 2-6 based on the primary symptom
  if (!primarySymptom || !KEYWORDS_AI_API_KEY) {
    return questions;
  }

  try {
    const response = await fetch(KEYWORDS_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KEYWORDS_AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a medical intake assistant. Generate personalized follow-up questions for a patient who reported: "${primarySymptom}".

RULES:
- Generate warm, conversational questions
- Use simple language
- NEVER diagnose or suggest conditions
- NEVER recommend treatments
- Keep each question under 25 words
- Reference their symptom naturally

Return a JSON object with these exact keys:
{
  "onset": "question about when it started",
  "severity": "question about severity 1-10",
  "progression": "question about if it's getting better/worse/same",
  "associated_symptoms": "question about other related symptoms",
  "red_flags": "question about fever, chest pain, breathing difficulty, confusion, fainting"
}

Return ONLY valid JSON, no other text.`
          },
          {
            role: "user",
            content: `Generate personalized intake questions for a patient reporting: "${primarySymptom}"`
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      return questions;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim();

    // Parse JSON response
    const parsed = JSON.parse(content);
    
    if (parsed.onset) questions.onset = parsed.onset;
    if (parsed.severity) questions.severity = parsed.severity;
    if (parsed.progression) questions.progression = parsed.progression;
    if (parsed.associated_symptoms) questions.associated_symptoms = parsed.associated_symptoms;
    if (parsed.red_flags) questions.red_flags = parsed.red_flags;

    return questions;
  } catch (error) {
    console.error('Error generating question set:', error);
    return questions;
  }
}
