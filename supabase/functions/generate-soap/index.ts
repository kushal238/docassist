import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Citation {
  docName: string;
  page: number;
}

interface SOAPSection {
  content: string;
  citations: Citation[];
}

interface SOAPNote {
  subjective: SOAPSection;
  objective: SOAPSection;
  assessment: SOAPSection;
  plan: SOAPSection;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract and validate JWT from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's JWT to verify authentication and get user info
    const supabaseAuth = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { patientId, brief, patientName, regenerateSection } = await req.json();

    if (!patientId || !brief) {
      return new Response(
        JSON.stringify({ error: "patientId and brief are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for data access
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Verify user has access to this patient (doctor or patient owner)
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userProfile) {
      return new Response(
        JSON.stringify({ error: "User profile not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check authorization: doctors can access all patients, patients can only access their own records
    if (userProfile.role !== "doctor") {
      const { data: patientRecord } = await supabase
        .from("patients")
        .select("owner_patient_profile_id")
        .eq("id", patientId)
        .single();

      if (!patientRecord || patientRecord.owner_patient_profile_id !== user.id) {
        return new Response(
          JSON.stringify({ error: "Access denied to this patient's records" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Authorized user ${user.id} (${userProfile.role}) generating SOAP note for patient ${patientId}`);

    // Build context from brief
    const briefContext = `
## Patient: ${patientName || 'Unknown'}
## Chief Complaint: ${brief.chiefComplaint || 'Not specified'}

### Executive Summary:
${brief.summary}

### Current Symptoms:
${(brief.currentSymptoms || []).map((s: string) => `- ${s}`).join('\n')}

### Relevant History:
${(brief.relevantHistory || []).map((h: string) => `- ${h}`).join('\n')}

### Medications:
${(brief.medications || []).map((m: string) => `- ${m}`).join('\n')}

### Allergies:
${(brief.allergies || []).map((a: string) => `- ${a}`).join('\n')}

### Abnormal Labs:
${(brief.abnormalLabs || []).map((l: string) => `- ${l}`).join('\n')}

### Clinical Insights:
${(brief.clinicalInsights || []).map((c: string) => `- ${c}`).join('\n')}

### Differential Considerations:
${(brief.differentialConsiderations || []).map((d: string) => `- ${d}`).join('\n')}

### Recommendations:
${(brief.actionableRecommendations || []).map((r: string) => `- ${r}`).join('\n')}

### Safety Alerts:
${(brief.safetyAlerts || []).map((s: string) => `- ${s}`).join('\n')}

### Missing Information:
${(brief.missingInfo || []).map((m: string) => `- ${m}`).join('\n')}
`;

    const systemPrompt = `You are a medical documentation specialist helping physicians create SOAP notes.

Your task is to generate a professional SOAP note from the provided clinical brief data.

CRITICAL RULES:
1. Every statement must include a citation in format [DocName p.X]
2. Use professional medical terminology
3. Be concise but thorough
4. If information is not available, state "Not documented"
5. Preserve any existing citations from the brief

SOAP FORMAT:
- Subjective: Patient-reported symptoms, history of present illness, relevant PMH
- Objective: Physical exam findings, vital signs, lab results, imaging
- Assessment: Clinical impression, differential diagnoses, working diagnosis
- Plan: Treatment plan, medications, follow-up, patient education

${briefContext}`;

    let userPrompt = regenerateSection 
      ? `Regenerate ONLY the ${regenerateSection.toUpperCase()} section of the SOAP note with fresh wording while maintaining clinical accuracy and citations.`
      : "Generate a complete SOAP note from this clinical brief. Each section should include citations to source documents.";

    // Call Lovable AI with tool calling for structured output
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_soap_note",
              description: "Generate a structured SOAP note with citations",
              parameters: {
                type: "object",
                properties: {
                  subjective: {
                    type: "string",
                    description: "Subjective section: Chief complaint, HPI, relevant history. Include [DocName p.X] citations."
                  },
                  objective: {
                    type: "string",
                    description: "Objective section: Physical exam, vitals, labs, imaging findings. Include [DocName p.X] citations."
                  },
                  assessment: {
                    type: "string",
                    description: "Assessment section: Clinical impression, differential diagnoses. Include [DocName p.X] citations."
                  },
                  plan: {
                    type: "string",
                    description: "Plan section: Treatment plan, medications, follow-up. Include [DocName p.X] citations."
                  }
                },
                required: ["subjective", "objective", "assessment", "plan"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_soap_note" } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== "generate_soap_note") {
      console.error("No valid tool call in response:", aiData);
      return new Response(
        JSON.stringify({ error: "Failed to generate SOAP note" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let soapData;
    try {
      soapData = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool call arguments:", e);
      return new Response(
        JSON.stringify({ error: "Failed to parse SOAP note" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract citations from each section
    const citationRegex = /\[([^\]]+)\s+p\.(\d+)\]/g;
    
    const extractCitations = (text: string): Citation[] => {
      const citations: Citation[] = [];
      let match;
      while ((match = citationRegex.exec(text)) !== null) {
        const citation = { docName: match[1], page: parseInt(match[2], 10) };
        if (!citations.some(c => c.docName === citation.docName && c.page === citation.page)) {
          citations.push(citation);
        }
      }
      return citations;
    };

    const result: SOAPNote = {
      subjective: {
        content: soapData.subjective,
        citations: extractCitations(soapData.subjective),
      },
      objective: {
        content: soapData.objective,
        citations: extractCitations(soapData.objective),
      },
      assessment: {
        content: soapData.assessment,
        citations: extractCitations(soapData.assessment),
      },
      plan: {
        content: soapData.plan,
        citations: extractCitations(soapData.plan),
      },
    };

    console.log(`Generated SOAP note for patient: ${patientId}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate SOAP error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
