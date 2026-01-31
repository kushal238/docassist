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
    const { patientId } = await req.json();
    
    if (!patientId) {
      return new Response(
        JSON.stringify({ error: "patientId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

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
        documents!inner(filename)
      `)
      .eq("patient_id", patientId)
      .limit(30);

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

    // Build context
    let context = "";
    
    if (patient) {
      context += `## Patient Info:\nName: ${patient.full_name}\n`;
      if (patient.dob) context += `DOB: ${patient.dob}\n`;
      context += "\n";
    }

    if (chunks && chunks.length > 0) {
      context += "## Document Contents:\n\n";
      chunks.forEach((chunk: any) => {
        const docName = chunk.documents?.filename || "Unknown Document";
        const pageNum = chunk.page_num || 1;
        context += `[Document: "${docName}", Page ${pageNum}]\n${chunk.chunk_text}\n\n`;
      });
    }

    if (symptoms && symptoms.length > 0) {
      context += "\n## Reported Symptoms:\n";
      symptoms.forEach((symptom: any) => {
        context += `- ${symptom.description}`;
        if (symptom.onset_date) context += ` (onset: ${symptom.onset_date})`;
        if (symptom.severity) context += ` (severity: ${symptom.severity}/10)`;
        context += "\n";
      });
    }

    if (documents && documents.length > 0) {
      context += "\n## Available Documents:\n";
      documents.forEach((doc: any) => {
        context += `- ${doc.filename} (type: ${doc.doc_type})\n`;
      });
    }

    console.log(`Generating brief for patient: ${patientId}, Chunks: ${chunks?.length || 0}, Symptoms: ${symptoms?.length || 0}`);

    const systemPrompt = `You are a medical AI assistant helping doctors prepare for patient visits. Generate a comprehensive clinical brief based on the available patient records.

IMPORTANT RULES:
1. Only include information found in the provided documents and symptoms.
2. For each piece of information, include a citation in format [DocName p.X].
3. If a section has no relevant information, list it as "Not found in records".
4. Be concise but thorough - doctors are busy.
5. Focus on clinically relevant information.

You must call the generate_clinical_brief function with the structured brief data.`;

    const userPrompt = `Generate a clinical brief for this patient based on the following records:

${context || "No documents or symptoms have been recorded for this patient yet."}

Create a comprehensive brief with summary, relevant history, current symptoms, medications, allergies, abnormal labs, and missing information.`;

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
              name: "generate_clinical_brief",
              description: "Generate a structured clinical brief for the patient",
              parameters: {
                type: "object",
                properties: {
                  summary: {
                    type: "string",
                    description: "Brief 1-2 sentence summary of the patient's current situation with citations"
                  },
                  relevantHistory: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of relevant medical history items with citations"
                  },
                  currentSymptoms: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of current symptoms with onset dates and severity with citations"
                  },
                  medications: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of current medications with dosages and citations"
                  },
                  allergies: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of known allergies with reactions and citations"
                  },
                  abnormalLabs: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of abnormal lab values with citations"
                  },
                  missingInfo: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of important information that appears to be missing from records"
                  }
                },
                required: ["summary", "relevantHistory", "currentSymptoms", "medications", "allergies", "abnormalLabs", "missingInfo"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_clinical_brief" } },
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
    if (!toolCall || toolCall.function.name !== "generate_clinical_brief") {
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
        // Avoid duplicates
        if (!allCitations[field].some(c => c.docName === citation.docName && c.page === citation.page)) {
          allCitations[field].push(citation);
        }
      }
    };

    extractCitations(briefData.summary || "", "summary");
    (briefData.relevantHistory || []).forEach((item: string) => extractCitations(item, "relevantHistory"));
    (briefData.abnormalLabs || []).forEach((item: string) => extractCitations(item, "abnormalLabs"));
    (briefData.medications || []).forEach((item: string) => extractCitations(item, "medications"));

    const result = {
      ...briefData,
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
