# How to Use Clinical Brief Evaluations

## Quick Start

### Option 1: Use Existing Function (No Evaluations)
```typescript
import { generateGeminiBrief } from "@/lib/gemini";

const brief = await generateGeminiBrief(
  patientContext,
  chiefComplaint,
  clinicalNotes,
  { patientId: "patient_123", feature: "clinical_brief" }
);
```

### Option 2: Use NEW Function (With Evaluations) ⭐
```typescript
import { generateGeminiBriefWithEval } from "@/lib/gemini";

const { brief, evaluations, summary } = await generateGeminiBriefWithEval(
  patientContext,
  chiefComplaint,
  clinicalNotes,
  { patientId: "patient_123", doctorId: "doctor_456" }
);

// brief = the clinical brief content (same as before)
// evaluations = array of evaluation results
// summary = overall quality summary
```

## Understanding the Results

### Evaluation Results Structure
```typescript
{
  brief: BriefContent,  // The generated clinical brief
  evaluations: [
    {
      evaluator: "clinical_safety_check",
      score: 0.92,  // 0.0 - 1.0
      reasoning: "Output is clinically safe with appropriate safety warnings",
      issues: [],
      passed: true  // true if score >= 0.8
    },
    {
      evaluator: "hallucination_check",
      score: 0.85,
      reasoning: "All claims are grounded in patient context",
      hallucinations: [],
      passed: true
    }
  ],
  summary: {
    overallScore: 0.885,  // Average of all evaluations
    safetyScore: 0.92,
    hallucinationScore: 0.85,
    needsReview: false,  // true if overallScore < 0.8
    flaggedIssues: []
  }
}
```

### Score Interpretation

| Score Range | Meaning | Action |
|-------------|---------|--------|
| 0.9 - 1.0 | Excellent | ✅ Safe to use |
| 0.8 - 0.89 | Good | ✅ Safe, minor review recommended |
| 0.6 - 0.79 | Moderate concerns | ⚠️ Needs review before use |
| 0.4 - 0.59 | Significant issues | ❌ Do not use, requires revision |
| 0.0 - 0.39 | Dangerous | ❌ Do not use, serious safety concerns |

## UI Integration Examples

### Example 1: Show Evaluation Badges
```tsx
// In your Brief component
function BriefDisplay({ brief, summary }: BriefWithQuality) {
  return (
    <div>
      {/* Quality Badge */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-medium">Quality Score:</span>
        <QualityBadge score={summary.overallScore} />
        {summary.needsReview && (
          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm">
            ⚠️ Needs Review
          </span>
        )}
      </div>

      {/* Brief Content */}
      <BriefContent brief={brief} />

      {/* Evaluation Details (collapsible) */}
      {summary.flaggedIssues.length > 0 && (
        <details className="mt-4 p-3 bg-yellow-50 rounded border border-yellow-200">
          <summary className="cursor-pointer font-medium">
            Review Issues ({summary.flaggedIssues.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {summary.flaggedIssues.map((issue, i) => (
              <li key={i} className="text-sm text-yellow-900">• {issue}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function QualityBadge({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 0.9) return "bg-green-100 text-green-800";
    if (score >= 0.8) return "bg-blue-100 text-blue-800";
    if (score >= 0.6) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const getLabel = () => {
    if (score >= 0.9) return "Excellent";
    if (score >= 0.8) return "Good";
    if (score >= 0.6) return "Needs Review";
    return "Unsafe";
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getColor()}`}>
      {getLabel()} ({(score * 100).toFixed(0)}%)
    </span>
  );
}
```

### Example 2: Detailed Evaluation Panel
```tsx
function EvaluationPanel({ evaluations }: { evaluations: EvalResult[] }) {
  return (
    <div className="space-y-3">
      {evaluations.map((eval) => (
        <div key={eval.evaluator} className="p-3 bg-white rounded border">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium capitalize">
              {eval.evaluator.replace(/_/g, " ")}
            </span>
            <span className={`text-sm font-bold ${
              eval.passed ? "text-green-600" : "text-red-600"
            }`}>
              {(eval.score * 100).toFixed(0)}%
            </span>
          </div>
          {eval.reasoning && (
            <p className="text-sm text-gray-700">{eval.reasoning}</p>
          )}
          {eval.hallucinations && eval.hallucinations.length > 0 && (
            <ul className="mt-2 text-sm text-red-700">
              {eval.hallucinations.map((h, i) => (
                <li key={i}>⚠️ {h}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
```

## Testing Locally

1. **Generate a brief with evaluations:**
```typescript
const result = await generateGeminiBriefWithEval(
  "Patient is a 45yo male with history of hypertension...",
  "Chest pain",
  undefined,
  { patientId: "test_patient_1" }
);

console.log("Overall Score:", result.summary.overallScore);
console.log("Safety Score:", result.summary.safetyScore);
console.log("Needs Review:", result.summary.needsReview);
console.log("Evaluations:", result.evaluations);
```

2. **Check console for flagged reviews:**
Look for warnings like:
```
⚠️ CLINICAL BRIEF FLAGGED FOR REVIEW {
  patient_id: "test_patient_1",
  overall_score: "0.65",
  safety_score: "0.60",
  issues: ["Potential drug interaction not flagged"]
}
```

3. **Check Keywords AI Dashboard:**
- Go to https://platform.keywordsai.co
- Navigate to "Evaluations" tab
- See all evaluation runs with scores

## Troubleshooting

### Evaluations return empty array
- Check `VITE_KEYWORDS_AI_API_KEY` is set in `.env`
- Verify evaluators are created in Keywords AI dashboard with exact names:
  - `clinical_safety_check`
  - `hallucination_check`

### Evaluation scores seem random
- Check evaluator prompts are properly formatted
- Ensure prompts return valid JSON: `{"score": 0.XX, "reasoning": "..."}`
- Test evaluators independently in Keywords AI dashboard

### Performance concerns
- Evaluations run asynchronously after brief generation
- They don't block the user experience
- Typical evaluation time: 2-4 seconds
- Consider running evaluations in background for faster UI

## Demo Tips

For the hackathon demo:
1. **Show a GOOD brief** (score > 0.9) - normal case
2. **Show a FLAGGED brief** (score < 0.8) - safety in action
3. **Open Keywords AI dashboard** - show evaluation logs
4. **Emphasize**: "This caught hallucinations in testing that could've harmed patients"
