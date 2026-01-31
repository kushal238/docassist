import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { patientId, chiefComplaint, clinicalNotes } = await req.json();
    
    if (!patientId) {
      return new Response(
        JSON.stringify({ error: "patientId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for data access
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

    console.log(`Authorized user ${user.id} (${userProfile.role}) accessing patient ${patientId}`);

    // Fetch patient info
    const { data: patient } = await supabase
      .from("patients")
      .select("full_name, dob")
      .eq("id", patientId)
      .single();

    // Fetch document chunks for context
    const { data: chunks } = await supabase
      .from("doc_chunks")
      .select(`
        chunk_text,
        page_num,
        document_id,
        documents!inner(filename, doc_type)
      `)
      .eq("patient_id", patientId)
      .limit(50);

    // Fetch symptoms
    const { data: symptoms } = await supabase
      .from("symptoms")
      .select("description, onset_date, severity")
      .eq("patient_id", patientId);

    // Fetch documents list
    const { data: documents } = await supabase
      .from("documents")
      .select("id, filename, doc_type")
      .eq("patient_id", patientId);

    // Build comprehensive context
    let context = "";
    
    if (patient) {
      context += `## Patient Demographics:\nName: ${patient.full_name}\n`;
      if (patient.dob) {
        const age = Math.floor((new Date().getTime() - new Date(patient.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        context += `DOB: ${patient.dob} (Age: ${age} years)\n`;
      }
      context += "\n";
    }

    // Organize chunks by document type for better analysis
    const chunksByType: Record<string, any[]> = {};
    if (chunks && chunks.length > 0) {
      chunks.forEach((chunk: any) => {
        const docType = chunk.documents?.doc_type || "other";
        if (!chunksByType[docType]) chunksByType[docType] = [];
        chunksByType[docType].push(chunk);
      });

      // Add organized document contents
      for (const [docType, typeChunks] of Object.entries(chunksByType)) {
        context += `## ${docType.toUpperCase()} Documents:\n\n`;
        typeChunks.forEach((chunk: any) => {
          const docName = chunk.documents?.filename || "Unknown Document";
          const pageNum = chunk.page_num || 1;
          context += `[Document: "${docName}", Page ${pageNum}]\n${chunk.chunk_text}\n\n`;
        });
      }
    }

    if (symptoms && symptoms.length > 0) {
      context += "\n## Current Reported Symptoms:\n";
      symptoms.forEach((symptom: any) => {
        context += `- ${symptom.description}`;
        if (symptom.onset_date) context += ` (onset: ${symptom.onset_date})`;
        if (symptom.severity) context += ` (severity: ${symptom.severity}/10)`;
        context += "\n";
      });
    }

    if (documents && documents.length > 0) {
      context += "\n## Available Documents Inventory:\n";
      documents.forEach((doc: any) => {
        context += `- ${doc.filename} (type: ${doc.doc_type})\n`;
      });
    }

    console.log(`Generating smart brief for patient: ${patientId}, Chief Complaint: ${chiefComplaint || 'None'}, Chunks: ${chunks?.length || 0}`);

    // Build the smart history analysis prompt with chain-of-thought reasoning
    const systemPrompt = `You are an expert clinical decision support AI assisting physicians with pre-visit preparation and real-time clinical reasoning.

## YOUR ROLE
You perform intelligent, complaint-focused analysis of patient medical history. Unlike simple summarization, you actively reason through the clinical implications of historical data in the context of the current presentation.

## CLINICAL REASONING APPROACH (Chain-of-Thought)
Follow this internal reasoning process:

1. **Parse the Chief Complaint**: Understand the clinical significance, typical differentials, and red flags
2. **Scan History for Relevance**: Identify ONLY information that matters for THIS specific complaint
3. **Connect the Dots**: Link historical patterns, medications, and conditions to the current presentation  
4. **Generate Actionable Insights**: Provide specific, clinically useful recommendations

## CRITICAL RULES
1. **Relevance Filter**: Only surface history that is clinically pertinent to the chief complaint. Omit irrelevant data.
2. **Citation Required**: Every clinical claim must include [DocName p.X] citation format
3. **Safety First**: Always flag drug interactions, contraindications, and critical alerts prominently
4. **Be Specific**: Generic advice is useless. Provide patient-specific, actionable recommendations
5. **Acknowledge Uncertainty**: If data is missing or unclear, explicitly state what's unknown

## OUTPUT STYLE
- Write like an experienced attending physician briefing a colleague
- Be concise but thorough - physicians are busy
- Prioritize high-yield information
- Use clinical terminology appropriately

${chiefComplaint ? `## CHIEF COMPLAINT FOR THIS ENCOUNTER
"${chiefComplaint}"
${clinicalNotes ? `Additional clinical notes: ${clinicalNotes}` : ""}` : "## NOTE: No specific chief complaint provided. Generate a general pre-visit summary."}

## PATIENT RECORDS
${context || "No documents or symptoms have been recorded for this patient yet."}`;

    const userPrompt = chiefComplaint 
      ? `Analyze this patient's complete medical history in the context of their chief complaint: "${chiefComplaint}". 
         
         Perform intelligent relevance filtering to identify what matters for this specific presentation.
         Generate a comprehensive clinical decision support brief with actionable insights.`
      : `Generate a comprehensive clinical brief summarizing this patient's medical history for a pre-visit review. 
         Highlight key information a physician should know before seeing this patient.`;

    // Call Lovable AI with enhanced tool schema
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
              name: "generate_smart_clinical_brief",
              description: "Generate an intelligent, complaint-focused clinical brief with actionable insights",
              parameters: {
                type: "object",
                properties: {
                  summary: {
                    type: "string",
                    description: "2-3 sentence executive summary of the patient's current situation and key considerations for this visit. Include citations."
                  },
                  relevantHistory: {
                    type: "array",
                    items: { type: "string" },
                    description: "Key past diagnoses, conditions, surgeries, and clinical events that are RELEVANT to the current complaint. Each item must include [DocName p.X] citation."
                  },
                  currentSymptoms: {
                    type: "array",
                    items: { type: "string" },
                    description: "Current symptoms with onset dates and severity, correlated with historical patterns if applicable."
                  },
                  medications: {
                    type: "array",
                    items: { type: "string" },
                    description: "Current medications with dosages. Flag those relevant to the chief complaint."
                  },
                  allergies: {
                    type: "array",
                    items: { type: "string" },
                    description: "Known allergies with reaction types. Include citations."
                  },
                  abnormalLabs: {
                    type: "array",
                    items: { type: "string" },
                    description: "Recent abnormal lab values relevant to the presentation. Include citations."
                  },
                  clinicalInsights: {
                    type: "array",
                    items: { type: "string" },
                    description: "Red flags, concerning patterns, and clinical observations based on connecting historical data to the current complaint. Be specific and actionable."
                  },
                  differentialConsiderations: {
                    type: "array",
                    items: { type: "string" },
                    description: "Potential diagnoses to consider based on the combination of history and current complaint. Explain reasoning briefly."
                  },
                  actionableRecommendations: {
                    type: "array",
                    items: { type: "string" },
                    description: "Specific follow-up questions to ask, examinations to perform, or tests to order based on this analysis."
                  },
                  safetyAlerts: {
                    type: "array",
                    items: { type: "string" },
                    description: "Critical safety information: drug interactions, contraindications, allergies relevant to likely treatments. HIGH PRIORITY."
                  },
                  missingInfo: {
                    type: "array",
                    items: { type: "string" },
                    description: "Important information that appears to be missing from records and would help clinical decision-making."
                  }
                },
                required: ["summary", "relevantHistory", "currentSymptoms", "medications", "allergies", "abnormalLabs", "clinicalInsights", "differentialConsiderations", "actionableRecommendations", "safetyAlerts", "missingInfo"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_smart_clinical_brief" } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    
    // Extract the tool call arguments
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "generate_smart_clinical_brief") {
      console.error("No valid tool call in response:", aiData);
      return new Response(
        JSON.stringify({ error: "Failed to generate structured brief" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let briefData;
    try {
      briefData = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool call arguments:", e);
      return new Response(
        JSON.stringify({ error: "Failed to parse brief data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract citations from all text fields
    const citationRegex = /\[([^\]]+)\s+p\.(\d+)\]/g;
    const allCitations: Record<string, { docName: string; page: number }[]> = {};
    
    const extractCitations = (text: string, field: string) => {
      let match;
      while ((match = citationRegex.exec(text)) !== null) {
        if (!allCitations[field]) allCitations[field] = [];
        const citation = { docName: match[1], page: parseInt(match[2], 10) };
        if (!allCitations[field].some(c => c.docName === citation.docName && c.page === citation.page)) {
          allCitations[field].push(citation);
        }
      }
    };

    // Extract citations from all relevant fields
    extractCitations(briefData.summary || "", "summary");
    (briefData.relevantHistory || []).forEach((item: string) => extractCitations(item, "relevantHistory"));
    (briefData.abnormalLabs || []).forEach((item: string) => extractCitations(item, "abnormalLabs"));
    (briefData.medications || []).forEach((item: string) => extractCitations(item, "medications"));
    (briefData.clinicalInsights || []).forEach((item: string) => extractCitations(item, "clinicalInsights"));
    (briefData.differentialConsiderations || []).forEach((item: string) => extractCitations(item, "differentialConsiderations"));
    (briefData.safetyAlerts || []).forEach((item: string) => extractCitations(item, "safetyAlerts"));

    const result = {
      ...briefData,
      chiefComplaint: chiefComplaint || null,
      citations: allCitations,
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate brief error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
