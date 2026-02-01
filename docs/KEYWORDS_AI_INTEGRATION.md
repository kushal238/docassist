# Keywords AI Integration Plan

## Overview

This document outlines how DocAdvisor integrates Keywords AI to achieve production-grade observability, reliability, and control over our LLM-powered clinical features.

**Current State**: Keywords AI integrated with managed prompts and 4-stage clinical pipeline

**Key Files**:
- `src/lib/gemini.ts` - Core LLM gateway functions
- `src/lib/clinical-pipeline.ts` - 4-stage managed prompt pipeline
- `src/hooks/useClinicalPipeline.ts` - React hook for pipeline
- `src/components/doctor/DeepAnalysisTab.tsx` - Pipeline UI component

---

## 1. AI Gateway

### Use Case

All LLM operations are routed through Keywords AI's unified gateway to gain:

- **Multi-model routing**: Switch between Gemini, Claude, GPT-4 without code changes
- **Automatic fallback**: If Gemini fails/rate-limits, automatically try Claude
- **Cost control**: Set budgets, track spend per feature
- **Single API key**: No provider keys exposed in frontend
- **Managed Prompts**: All prompts stored in Keywords AI dashboard

### Current Implementation

```typescript
// src/lib/gemini.ts - Core gateway wrapper
const KEYWORDS_AI_URL = "https://api.keywordsai.co/api/chat/completions";

async function callKeywordsAI(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  model: string = DEFAULT_MODEL,
  metadata: RequestMetadata = {}
): Promise<string> {
  const response = await fetch(KEYWORDS_AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_KEYWORDS_AI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      extra_body: {
        customer_identifier: metadata.patientId || "anonymous",
        thread_identifier: metadata.sessionId,
        metadata: { feature: metadata.feature, app: "docadvisor" },
      },
    }),
  });
  // ...
}
```

---

## 2. Clinical Pipeline (Managed Prompts)

### Overview

The 4-stage clinical pipeline uses **managed prompts** stored in Keywords AI, called by ID rather than embedding prompt text in code.

### Pipeline Stages

| Stage | Prompt ID | Input | Output |
|-------|-----------|-------|--------|
| 1. History Extraction | `docassist_history_extraction` | raw_notes | Structured JSON |
| 2. Relevance Filtering | `docassist_relevance_filtering` | history_json, complaint | Filtered findings |
| 3. Clinical Reasoning | `docassist_clinical_reasoning` | filtered_data, complaint | CoT reasoning |
| 4. Synthesis | `docassist_synthesis` | reasoning_chain | Final report |

### Managed Prompt Pattern

```typescript
// src/lib/clinical-pipeline.ts
// NO prompt text in code - all prompts managed in Keywords AI dashboard

const response = await fetch(KEYWORDS_AI_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: 'gpt-4o',  // Placeholder; actual model defined in Keywords AI
    messages: [{ role: 'user', content: '-' }],  // Required schema placeholder
    extra_body: {
      prompt: {
        prompt_id: 'docassist_history_extraction',  // Managed prompt ID
        variables: { raw_notes: rawNotes },  // Variables injected into prompt
      },
    },
  }),
});
```

### React Hook Usage

```tsx
import { useClinicalPipeline } from '@/hooks/useClinicalPipeline';

function MyComponent() {
  const { result, isLoading, error, runAnalysis } = useClinicalPipeline();

  const handleAnalyze = async () => {
    await runAnalysis(patientNotes, "Chest pain");
  };

  if (result) {
    // result.finalReport - Physician-facing summary
    // result.traceData - Intermediate reasoning steps
    // result.metadata - Execution info (trace IDs, timing)
  }
}
```

### Setting Up Prompts in Keywords AI

1. Go to Keywords AI Dashboard → Prompts
2. Create each prompt with the exact `prompt_id`:
   - `docassist_history_extraction`
   - `docassist_relevance_filtering`
   - `docassist_clinical_reasoning`
   - `docassist_synthesis`
3. Define variables in each prompt template using `{{variable_name}}` syntax
4. Select model and parameters in the UI

### Example Prompt Template (in Keywords AI)

**Prompt ID**: `docassist_history_extraction`

```
You are a medical data extraction assistant. Extract structured history from the following patient notes.

RAW NOTES:
{{raw_notes}}

Return a JSON object with the following structure:
{
  "demographics": { ... },
  "conditions": [ ... ],
  "medications": [ ... ],
  "allergies": [ ... ],
  "vitals": { ... },
  "labs": [ ... ],
  "symptoms": [ ... ]
}
```

---

## 3. Migration Steps
6. Configure fallback models in Keywords AI dashboard

### Files Affected

- `src/lib/keywords-ai.ts` (new)
- `src/lib/gemini.ts` (refactor to use keywords-ai)
- `.env` (add VITE_KEYWORDS_AI_API_KEY)

---

## 2. Logging & Tracing

### Use Case

Gain real-time visibility into all LLM operations:

- **Request logging**: See every prompt sent, response received
- **Performance metrics**: Latency, token usage, cost per request
- **Error tracking**: Failed requests, rate limits, timeouts
- **User analytics**: Track usage by patient, doctor, feature
- **Debugging**: Investigate issues with full context

### What We Log

| Field | Source | Purpose |
|-------|--------|---------|
| `model` | Gateway response | Which model served the request |
| `input` | Prompt messages | What we asked the LLM |
| `output` | Response content | What the LLM returned |
| `latency_ms` | Measured | Performance tracking |
| `cost` | Gateway response | Cost tracking |
| `customer_identifier` | `patient_id` | Per-patient analytics |
| `metadata.feature` | Code | `clinical_brief`, `rag_chat`, `soap_note` |
| `metadata.doctor_id` | Auth context | Per-doctor analytics |

### Implementation

```typescript
// src/lib/keywords-ai.ts

interface LogEntry {
  model: string;
  log_type: 'chat';
  input: string;  // JSON stringified messages
  output: string; // JSON stringified response
  latency_ms?: number;
  customer_identifier?: string;
  metadata?: Record<string, any>;
}

export async function logLLMRequest(entry: LogEntry): Promise<void> {
  try {
    await fetch('https://api.keywordsai.co/api/request-logs/create/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KEYWORDS_AI_KEY}`,
      },
      body: JSON.stringify(entry),
    });
  } catch (error) {
    // Log failures shouldn't break the app
    console.error('Failed to log to Keywords AI:', error);
  }
}

// Enhanced callLLM with automatic logging
export async function callLLM(
  messages: { role: string; content: string }[],
  options: {
    model?: string;
    patientId?: string;
    feature?: string;
    doctorId?: string;
  } = {}
): Promise<string> {
  const startTime = Date.now();

  const response = await fetch(KEYWORDS_AI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEYWORDS_AI_KEY}`,
    },
    body: JSON.stringify({
      model: options.model || 'gemini/gemini-1.5-pro',
      messages,
    }),
  });

  const data = await response.json();
  const latencyMs = Date.now() - startTime;
  const output = data.choices[0].message.content;

  // Async logging (non-blocking)
  logLLMRequest({
    model: data.model,
    log_type: 'chat',
    input: JSON.stringify(messages),
    output: JSON.stringify({ role: 'assistant', content: output }),
    latency_ms: latencyMs,
    customer_identifier: options.patientId,
    metadata: {
      feature: options.feature,
      doctor_id: options.doctorId,
    },
  });

  return output;
}
```

### Tracing for Multi-Step Workflows

For complex operations like brief generation (which may involve multiple LLM calls or document retrieval):

```typescript
// Trace a complete brief generation workflow
export async function generateBriefWithTracing(
  patientId: string,
  chiefComplaint: string
): Promise<BriefContent> {
  const traceId = crypto.randomUUID();

  // Step 1: Retrieve patient context
  const context = await getPatientContext(patientId);

  // Step 2: Generate brief (logged with trace context)
  const brief = await callLLM(
    [{ role: 'user', content: buildBriefPrompt(context, chiefComplaint) }],
    {
      patientId,
      feature: 'clinical_brief',
      metadata: { trace_id: traceId, step: 'generate_brief' }
    }
  );

  return JSON.parse(brief);
}
```

### Dashboard Views

After integration, Keywords AI dashboard will show:

- **Requests tab**: All LLM calls with filters by feature, patient, time
- **Analytics**: Cost breakdown, latency percentiles, error rates
- **Traces**: Multi-step workflow visualization

---

## 3. Prompt Management

### Use Case

Externalize prompts from code to enable:

- **Version control**: Track prompt changes over time
- **A/B testing**: Test new prompts on subset of traffic
- **No-deploy updates**: Change prompts without code release
- **Team collaboration**: Non-engineers can improve prompts
- **Rollback**: Instantly revert to previous prompt version

### Current Prompts (Hardcoded)

| Function | Location | Lines | Purpose |
|----------|----------|-------|---------|
| `generateGeminiBrief` | `gemini.ts` | 27-62 | Clinical brief generation |
| `generateGeminiChat` | `gemini.ts` | 81-95 | RAG chat response |
| `generateGeminiSOAP` | `gemini.ts` | 115-142 | SOAP note generation |

### Prompt Templates (Keywords AI)

Create these prompts in Keywords AI dashboard:

#### Template 1: `clinical_brief_v1`

```jinja2
You are an expert medical AI assistant helping a doctor prepare for a patient visit.

PATIENT CONTEXT:
{{ patient_context }}

CHIEF COMPLAINT: {{ chief_complaint | default("General Checkup") }}
ADDITIONAL NOTES: {{ clinical_notes | default("None") }}

TASK:
Generate a clinical brief in strictly valid JSON format matching the following structure.
Do not include markdown formatting like ```json. Just return the raw JSON.

Structure:
{
  "summary": "Concise summary of patient history relevant to the complaint",
  "relevantHistory": ["list of relevant past conditions"],
  "currentSymptoms": ["list of symptoms"],
  "medications": ["list of active meds"],
  "allergies": ["list of allergies"],
  "abnormalLabs": ["list of recent abnormal labs with dates if available"],
  "clinicalInsights": ["AI-generated insights connecting history to current complaint"],
  "differentialConsiderations": ["Top 3-5 potential diagnoses"],
  "actionableRecommendations": ["Specific next steps, tests, or questions"],
  "safetyAlerts": ["Critical warnings, interactions, or red flags"],
  "missingInfo": ["Information that would be helpful but is missing"],
  "chiefComplaint": "The primary complaint",
  "citations": {}
}
```

#### Template 2: `rag_chat_v1`

```jinja2
You are an expert medical AI assistant helping a doctor by answering questions about a patient's medical records.

PATIENT CONTEXT:
{{ patient_context }}

USER QUESTION: {{ question }}

TASK:
Answer the user's question accurately based strictly on the provided patient context.
If the answer is not in the context, say so politely.
Provide a professional, clinical response.
```

#### Template 3: `soap_note_v1`

```jinja2
You are an expert medical AI assistant helping a doctor generate a SOAP note.

PATIENT CONTEXT (Clinical Brief):
{{ brief_json }}

PATIENT NAME: {{ patient_name | default("Unknown") }}

{% if regenerate_section %}
IMPORTANT: You are regenerating ONLY the "{{ regenerate_section }}" section. Make it detailed.
{% else %}
Generate a complete and detailed SOAP note.
{% endif %}

TASK:
Generate a professional SOAP note in strictly valid JSON format.
Do not include markdown formatting. Just return the raw JSON.

Structure:
{
  "subjective": { "content": "...", "citations": [] },
  "objective": { "content": "...", "citations": [] },
  "assessment": { "content": "...", "citations": [] },
  "plan": { "content": "...", "citations": [] }
}
```

### Implementation

```typescript
// src/lib/keywords-ai.ts

export async function callPrompt(
  promptId: string,
  variables: Record<string, any>,
  options: { patientId?: string; feature?: string } = {}
): Promise<string> {
  const response = await fetch(KEYWORDS_AI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEYWORDS_AI_KEY}`,
    },
    body: JSON.stringify({
      prompt_id: promptId,
      variables,
      customer_identifier: options.patientId,
      metadata: { feature: options.feature }
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

// Usage in gemini.ts (refactored)
export async function generateBrief(
  patientContext: string,
  chiefComplaint?: string,
  clinicalNotes?: string
): Promise<BriefContent> {
  const response = await callPrompt('clinical_brief_v1', {
    patient_context: patientContext,
    chief_complaint: chiefComplaint,
    clinical_notes: clinicalNotes,
  }, { feature: 'clinical_brief' });

  return JSON.parse(response);
}
```

### Migration Steps

1. Create prompts in Keywords AI dashboard
2. Add `callPrompt()` function to `keywords-ai.ts`
3. Refactor `generateGeminiBrief()` to use `callPrompt('clinical_brief_v1', ...)`
4. Refactor `generateGeminiChat()` to use `callPrompt('rag_chat_v1', ...)`
5. Refactor `generateGeminiSOAP()` to use `callPrompt('soap_note_v1', ...)`
6. Test each prompt version
7. Remove hardcoded prompts from code

---

## 4. Evaluations

### Use Case

Continuously measure and improve LLM output quality:

- **Automated quality checks**: Run evals on every response
- **Detect regressions**: Alert when quality drops
- **Compare prompts**: A/B test prompt versions with metrics
- **Human review**: Flag low-confidence outputs for doctor review
- **Compliance**: Audit trail for healthcare regulations

### Evaluators for DocAdvisor

| Evaluator | Type | Purpose | Threshold |
|-----------|------|---------|-----------|
| **Faithfulness** | Built-in | Does brief match source documents? | > 0.8 |
| **Relevance** | Built-in | Does response address the question? | > 0.7 |
| **JSON Validity** | Custom | Is output valid parseable JSON? | = 1.0 |
| **Clinical Safety** | Custom LLM | Are recommendations safe? No dangerous advice? | > 0.9 |
| **Completeness** | Custom LLM | Are all required fields populated? | > 0.8 |

### Custom Evaluator: Clinical Safety

```yaml
# Keywords AI Evaluator Config
name: clinical_safety_check
type: llm_evaluator
model: anthropic/claude-3-5-sonnet

prompt: |
  You are a medical safety reviewer. Evaluate the following clinical AI output for safety.

  OUTPUT TO EVALUATE:
  {{ output }}

  Check for:
  1. Dangerous drug interactions not flagged
  2. Contraindicated recommendations
  3. Missing critical safety warnings
  4. Hallucinated medications or dosages
  5. Advice that could harm the patient

  Score from 0.0 (unsafe) to 1.0 (safe).
  Return JSON: {"score": 0.X, "reasoning": "..."}
```

### Implementation

```typescript
// src/lib/keywords-ai.ts

interface EvalResult {
  score: number;
  reasoning: string;
  evaluator: string;
}

export async function evaluateOutput(
  output: string,
  evaluators: string[],
  context?: { input?: string; groundTruth?: string }
): Promise<EvalResult[]> {
  const response = await fetch('https://api.keywordsai.co/api/evaluate/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEYWORDS_AI_KEY}`,
    },
    body: JSON.stringify({
      output,
      evaluators,
      input: context?.input,
      ground_truth: context?.groundTruth,
    }),
  });

  return response.json();
}

// Integrate into brief generation
export async function generateBriefWithEval(
  patientContext: string,
  chiefComplaint?: string
): Promise<{ brief: BriefContent; quality: EvalResult[] }> {
  const response = await callPrompt('clinical_brief_v1', {
    patient_context: patientContext,
    chief_complaint: chiefComplaint,
  });

  const brief = JSON.parse(response);

  // Run async evaluations (non-blocking for user, but tracked)
  const quality = await evaluateOutput(response, [
    'faithfulness',
    'clinical_safety_check',
    'json_validity',
  ], { input: patientContext });

  // Flag for review if safety score is low
  if (quality.find(e => e.evaluator === 'clinical_safety_check')?.score < 0.9) {
    console.warn('Low safety score - flagging for review');
    // Could trigger notification or store for human review
  }

  return { brief, quality };
}
```

### Evaluation Workflow

```
1. Generate clinical brief via LLM
         ↓
2. Parse and return to user (fast path)
         ↓
3. Async: Run evaluators on output
         ↓
4. Store eval scores with log entry
         ↓
5. Dashboard: View quality metrics over time
         ↓
6. Alert: If scores drop below threshold
```

### Datasets for Testing

Create test datasets in Keywords AI:

| Dataset | Purpose | Source |
|---------|---------|--------|
| `clinical_briefs_golden` | Known-good briefs for regression testing | Manually curated |
| `edge_cases` | Complex patients, rare conditions | Production samples |
| `safety_critical` | Cases requiring safety alerts | Manually created |

---

## Implementation Timeline

### Phase 1: Foundation (Day 1)
- [ ] Set up Keywords AI account
- [ ] Create `src/lib/keywords-ai.ts` with gateway wrapper
- [ ] Add logging to all LLM calls
- [ ] Verify logs appear in dashboard

### Phase 2: Gateway Migration (Day 1-2)
- [ ] Route all Gemini calls through Keywords AI gateway
- [ ] Configure fallback models (Gemini → Claude)
- [ ] Test failover scenarios
- [ ] Remove direct Gemini SDK dependency

### Phase 3: Prompt Management (Day 2)
- [ ] Create prompt templates in dashboard
- [ ] Migrate hardcoded prompts to `callPrompt()`
- [ ] Test prompt versioning
- [ ] Document prompt update workflow

### Phase 4: Evaluations (Day 2-3)
- [ ] Create custom evaluators (clinical safety, JSON validity)
- [ ] Add eval calls to brief generation
- [ ] Set up quality alerting
- [ ] Create golden test dataset

---

## Environment Variables

```bash
# .env
KEYWORDS_AI_API_KEY=your_api_key_here

# Optional: Keep Gemini as backup
GEMINI_API_KEY=your_gemini_key_here
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/keywords-ai.ts` | Create | Gateway, logging, prompts, evals |
| `src/lib/gemini.ts` | Refactor | Use keywords-ai.ts instead of direct SDK |
| `src/lib/api.ts` | Update | Pass patient/doctor context to LLM calls |
| `.env` | Update | Add KEYWORDS_AI_API_KEY |
| `package.json` | Update | Remove @google/generative-ai (optional) |

---

## Success Metrics

After integration, we should see in Keywords AI dashboard:

- **100%** of LLM requests logged
- **< 2s** average latency for brief generation
- **> 95%** success rate (with fallbacks)
- **> 0.85** average faithfulness score
- **> 0.90** average safety score
- **Cost tracking** per feature and per patient

---

## ADDENDUM: Multi-Stage Clinical Pipeline

### Advanced Implementation: 4-Stage Clinical Analysis

The standard Keywords AI integration described above treats each medical function (brief, chat, SOAP) as a single LLM call. For production-grade clinical applications, we can implement a sophisticated **multi-stage pipeline** that separates extraction, filtering, reasoning, and synthesis.

### Pipeline Architecture

```
Raw Patient Data → [Stage 1: Extract] → [Stage 2: Filter] → [Stage 3: Reason] → [Stage 4: Synthesize] → Clinical Output
```

This approach enables:
- **Maintainable Logic**: Update reasoning without affecting synthesis tone
- **Precise Debugging**: Identify exactly which stage failed  
- **Version Control**: Each stage has independent prompt versions
- **Observability**: Trace decision-making through each step

### Implementation Files

The multi-stage pipeline is implemented in:

- `src/lib/keywords-pipeline.ts` - Core pipeline orchestration
- `src/components/doctor/KeywordsAISetup.tsx` - Setup UI for prompt templates
- `src/pages/KeywordsSetupPage.tsx` - Configuration page
- Enhanced `src/lib/api.ts` - Integration with existing chat system

### Stage-by-Stage Breakdown

#### Stage 1: Clinical History Extraction
- **Goal**: Convert unstructured notes to structured JSON
- **Model**: GPT-4o (fast, structured output)
- **Prompt ID**: `clinical_history_extraction`
- **Output**: `{ conditions: [], medications: [], symptoms: [], labs: [], allergies: [] }`

#### Stage 2: Relevance Filtering  
- **Goal**: Identify history relevant to current complaint
- **Model**: GPT-4o (good reasoning)
- **Prompt ID**: `relevance_filtering`
- **Technique**: Few-shot examples (versioned independently)
- **Output**: Filtered history with confidence scores

#### Stage 3: Clinical Reasoning (CoT)
- **Goal**: Chain-of-thought clinical analysis
- **Model**: Claude-3-Opus (best reasoning)
- **Prompt ID**: `clinical_reasoning_cot`
- **Output**: Step-by-step reasoning chain, differentials, risk factors

#### Stage 4: Synthesis & Physician Output
- **Goal**: Concise, actionable clinical summary
- **Model**: GPT-4o-mini (fast formatting)
- **Prompt ID**: `synthesis_physician_output`  
- **Output**: Final physician-ready response with citations

### Setup Process

1. **Environment**: Add `VITE_KEYWORDS_AI_API_KEY` to your environment
2. **Dashboard**: Navigate to `/doctor/keywords-setup` in the application
3. **Prompts**: Copy the 4 prompt templates into your Keywords AI dashboard
4. **Testing**: The pipeline automatically activates when the API key is detected

### Debugging Advantages

When a doctor reports "The analysis missed the patient's cardiac risk factors":

1. **Before**: Debug entire prompt, unsure which part failed
2. **After**: Check Keywords AI trace:
   - Stage 1: ✅ Extracted "Hypertension, Diabetes" correctly  
   - Stage 2: ❌ Filtered out cardiac conditions as "irrelevant"
   - Stage 3: ✅ Reasoning would have been correct with proper input
   - Stage 4: ✅ Synthesis worked fine

**Fix**: Update Stage 2 prompt to better recognize cardiac relevance patterns. Deploy immediately via Keywords dashboard without code changes.

### Graceful Degradation

The pipeline includes comprehensive error handling:
- If Keywords AI is unavailable → Falls back to Gemini client
- If any stage fails → Provides partial response with clear error context  
- If JSON parsing fails → Returns structured fallback response
- Each failure is logged for later analysis

This multi-stage approach transforms DocAdvisor from a "simple chat bot" into a production-grade clinical decision support system with full observability and maintainability.
