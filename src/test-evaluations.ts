// Test evaluations end-to-end
import { config } from "dotenv";
import { generateGeminiBriefWithEval } from "./lib/gemini";

// Load .env file
config();

async function testEvaluations() {
  console.log("🧪 Testing Clinical Brief Evaluations...\n");

  // Check API key
  if (!process.env.VITE_KEYWORDS_AI_API_KEY) {
    console.error("❌ VITE_KEYWORDS_AI_API_KEY not found in .env");
    console.log("💡 Add it to your .env file:");
    console.log("   VITE_KEYWORDS_AI_API_KEY=your_key_here");
    process.exit(1);
  }

  // Test 1: Good context (should score ~80%)
  const goodContext = `
Patient: John Smith, 45yo male
Past Medical History: Hypertension (diagnosed 2020)
Current Medications: Lisinopril 10mg daily
Allergies: None known
Chief Complaint: Headache x 3 days
  `.trim();

  // Test 2: Minimal context (should score lower - AI will have to guess)
  const minimalContext = `
Patient: Unknown
Chief Complaint: Chest pain
  `.trim();

  const patientContext = minimalContext; // Try minimal context

  try {
    console.log("📝 Generating brief with evaluations...");
    const startTime = Date.now();

    const result = await generateGeminiBriefWithEval(
      patientContext,
      "Chest pain",
      undefined,
      { patientId: "test_patient_123", doctorId: "test_doctor_456" }
    );

    const duration = Date.now() - startTime;

    console.log(`✅ Complete in ${duration}ms\n`);

    // Show results
    console.log("=== EVALUATION SUMMARY ===");
    console.log(`Overall Score: ${(result.summary.overallScore * 100).toFixed(0)}%`);
    console.log(`Safety Score: ${result.summary.safetyScore ? (result.summary.safetyScore * 100).toFixed(0) + '%' : 'N/A'}`);
    console.log(`Hallucination Score: ${result.summary.hallucinationScore ? (result.summary.hallucinationScore * 100).toFixed(0) + '%' : 'N/A'}`);
    console.log(`Needs Review: ${result.summary.needsReview ? '⚠️ YES' : '✅ NO'}`);
    console.log();

    // Show individual evaluations
    console.log("=== INDIVIDUAL EVALUATIONS ===");
    result.evaluations.forEach(evaluation => {
      console.log(`${evaluation.evaluator}:`);
      console.log(`  Score: ${(evaluation.score * 100).toFixed(0)}% (${evaluation.passed ? '✅ PASS' : '❌ FAIL'})`);
      if (evaluation.reasoning) {
        console.log(`  Reason: ${evaluation.reasoning.substring(0, 100)}...`);
      }
      console.log();
    });

    // Show flagged issues
    if (result.summary.flaggedIssues.length > 0) {
      console.log("=== FLAGGED ISSUES ===");
      result.summary.flaggedIssues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue}`);
      });
      console.log();
    }

    // Show brief preview
    console.log("=== BRIEF PREVIEW ===");
    console.log("Summary:", result.brief.summary?.substring(0, 150) + "...");
    console.log("Differential:", result.brief.differentialConsiderations?.slice(0, 3).join(", "));
    console.log("Safety Alerts:", result.brief.safetyAlerts?.length || 0);

  } catch (error) {
    console.error("❌ Test failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// Run test
testEvaluations();
