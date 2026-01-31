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

interface DocChunk {
  chunk_text: string;
  page_num: number | null;
  document_id: string;
  documents: {
    filename: string;
  }[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { patientId, message, sessionId } = await req.json();
    
    if (!patientId || !message) {
      return new Response(
        JSON.stringify({ error: "patientId and message are required" }),
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

    // Create Supabase client with service role to bypass RLS
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch document chunks for this patient
    const { data: chunks, error: chunksError } = await supabase
      .from("doc_chunks")
      .select(`
        chunk_text,
        page_num,
        document_id,
        documents!inner(filename)
      `)
      .eq("patient_id", patientId)
      .limit(20);

    if (chunksError) {
      console.error("Error fetching doc chunks:", chunksError);
    }

    // Also fetch symptoms for context
    const { data: symptoms } = await supabase
      .from("symptoms")
      .select("description, onset_date, severity")
      .eq("patient_id", patientId);

    // Build context from chunks
    let context = "";
    const availableDocs: Map<string, string> = new Map();
    
    if (chunks && chunks.length > 0) {
      context = "## Available Patient Documents:\n\n";
      chunks.forEach((chunk: any, index: number) => {
        const docName = chunk.documents?.filename || "Unknown Document";
        const pageNum = chunk.page_num || 1;
        availableDocs.set(chunk.document_id, docName);
        context += `[Document: "${docName}", Page ${pageNum}]\n${chunk.chunk_text}\n\n`;
      });
    }

    if (symptoms && symptoms.length > 0) {
      context += "\n## Reported Symptoms:\n";
      symptoms.forEach((symptom) => {
        context += `- ${symptom.description}`;
        if (symptom.onset_date) context += ` (onset: ${symptom.onset_date})`;
        if (symptom.severity) context += ` (severity: ${symptom.severity}/10)`;
        context += "\n";
      });
    }

    const systemPrompt = `You are a medical AI assistant helping doctors review patient records. You have access to the patient's documents and reported symptoms.

IMPORTANT RULES:
1. Only answer based on the provided patient documents and symptoms.
2. If information is not found in the documents, clearly state "Not found in provided records."
3. For every claim you make, include a citation in the format [DocName p.X] where X is the page number.
4. Be concise but thorough.
5. If asked about medications, labs, allergies, or history, cite the specific document.

${context || "No documents have been uploaded for this patient yet."}`;

    console.log(`RAG Chat - Patient: ${patientId}, Message: ${message}, Docs found: ${chunks?.length || 0}`);

    // Call Lovable AI
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
          { role: "user", content: message },
        ],
        stream: false,
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
    const responseContent = aiData.choices?.[0]?.message?.content || "No response generated.";

    // Extract citations from the response (pattern: [DocName p.X])
    const citationRegex = /\[([^\]]+)\s+p\.(\d+)\]/g;
    const citations: Citation[] = [];
    let match;
    while ((match = citationRegex.exec(responseContent)) !== null) {
      citations.push({
        docName: match[1],
        page: parseInt(match[2], 10),
      });
    }

    // Remove duplicate citations
    const uniqueCitations = citations.filter(
      (citation, index, self) =>
        index === self.findIndex(c => c.docName === citation.docName && c.page === citation.page)
    );

    return new Response(
      JSON.stringify({
        role: "assistant",
        content: responseContent,
        citations: uniqueCitations,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("RAG chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
