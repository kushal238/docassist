/**
 * Deep Analysis Chatbot Component
 * 
 * A medical chatbot that is integrated with the deep analysis report.
 * Features:
 * - Context-aware: Knows about the patient's deep analysis
 * - Medically knowledgeable: Trained on medical terminology and reasoning
 * - Follow-up questions: Can answer questions about the analysis
 * - Citation support: Links back to source analysis sections
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Loader2,
  Brain,
  User,
  Bot,
  Sparkles,
  FileText,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Stethoscope,
} from 'lucide-react';
import { executePrompt } from '@/lib/ai-client';
import type { ClinicalPipelineResult, DiagnosticEngineResult } from '@/services/clinical-pipeline';

// =============================================================================
// Types
// =============================================================================

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  citations?: {
    section: string;
    relevance: string;
  }[];
}

interface DeepAnalysisChatbotProps {
  patientId: string;
  patientName?: string;
  deepAnalysis: ClinicalPipelineResult;
  chiefComplaint?: string;
  onAnalysisUpdate?: (updatedAnalysis: ClinicalPipelineResult) => void;
}

// =============================================================================
// Suggested Questions
// =============================================================================

const SUGGESTED_QUESTIONS = [
  { 
    label: "Explain diagnosis", 
    query: "Can you explain the most likely diagnosis in simpler terms?" 
  },
  { 
    label: "Red flags", 
    query: "What are the red flags I should watch for?" 
  },
  { 
    label: "Treatment options", 
    query: "What are the treatment options for this condition?" 
  },
  { 
    label: "Differential", 
    query: "Why were other diagnoses ruled out?" 
  },
  { 
    label: "Next steps", 
    query: "What tests or follow-up actions are recommended?" 
  },
  { 
    label: "Evidence basis", 
    query: "What evidence supports this diagnosis?" 
  },
];

// =============================================================================
// Component
// =============================================================================

export default function DeepAnalysisChatbot({
  patientId,
  patientName,
  deepAnalysis,
  chiefComplaint,
  onAnalysisUpdate,
}: DeepAnalysisChatbotProps) {
  const { profile } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // =============================================================================
  // Build context from deep analysis
  // =============================================================================

  const buildAnalysisContext = (): string => {
    const de = deepAnalysis.diagnosticEngine;
    const cl = deepAnalysis.clinicalLens;
    
    let context = `=== DEEP ANALYSIS CONTEXT ===\n`;
    context += `Patient: ${patientName || 'Unknown'}\n`;
    context += `Chief Complaint: ${chiefComplaint || 'Not specified'}\n\n`;
    
    // Clinical Lens data
    if (cl) {
      context += `=== CLINICAL LENS (Extracted Data) ===\n`;
      if (cl.relevant_history?.length) {
        context += `Relevant History:\n${cl.relevant_history.map(h => `- ${h}`).join('\n')}\n\n`;
      }
      if (cl.current_medications?.length) {
        context += `Current Medications:\n${cl.current_medications.map(m => `- ${m}`).join('\n')}\n\n`;
      }
      if (cl.red_flags?.length) {
        context += `Red Flags:\n${cl.red_flags.map(rf => `- ${rf}`).join('\n')}\n\n`;
      }
      if (cl.risk_factors?.length) {
        context += `Risk Factors:\n${cl.risk_factors.map(rf => `- ${rf}`).join('\n')}\n\n`;
      }
      if (cl.symptom_timeline) {
        context += `Symptom Timeline: ${cl.symptom_timeline}\n\n`;
      }
    }
    
    // Diagnostic Engine data
    if (de) {
      context += `=== DIAGNOSTIC ENGINE (Analysis) ===\n`;
      
      if (de.assessment_summary) {
        context += `Assessment Summary:\n${de.assessment_summary}\n\n`;
      }
      
      if (de.differential?.most_likely?.length) {
        context += `Most Likely Diagnoses:\n`;
        de.differential.most_likely.forEach((dx, i) => {
          context += `${i + 1}. ${dx.diagnosis} (Confidence: ${((dx.confidence || 0) * 100).toFixed(0)}%)\n`;
          if (dx.supporting_evidence?.length) {
            context += `   Supporting Evidence: ${dx.supporting_evidence.join(', ')}\n`;
          }
          if (dx.next_steps?.length) {
            context += `   Next Steps: ${dx.next_steps.join(', ')}\n`;
          }
        });
        context += '\n';
      }
      
      if (de.differential?.cant_miss?.length) {
        context += `Can't Miss Diagnoses (Critical):\n`;
        de.differential.cant_miss.forEach((dx, i) => {
          context += `${i + 1}. ${dx.diagnosis} - Urgency: ${dx.urgency}\n`;
          context += `   Rule-out Strategy: ${dx.rule_out_strategy}\n`;
          if (dx.red_flags?.length) {
            context += `   Red Flags: ${dx.red_flags.join(', ')}\n`;
          }
        });
        context += '\n';
      }
      
      if (de.reasoning_trace) {
        context += `Clinical Reasoning:\n${de.reasoning_trace}\n\n`;
      }
      
      if (de.suggested_plan) {
        context += `Suggested Plan:\n`;
        if (de.suggested_plan.immediate?.length) {
          context += `- Immediate: ${de.suggested_plan.immediate.join(', ')}\n`;
        }
        if (de.suggested_plan.short_term?.length) {
          context += `- Short-term: ${de.suggested_plan.short_term.join(', ')}\n`;
        }
        if (de.suggested_plan.monitoring?.length) {
          context += `- Monitoring: ${de.suggested_plan.monitoring.join(', ')}\n`;
        }
      }
    }
    
    return context;
  };

  // =============================================================================
  // Send message handler
  // =============================================================================

  const handleSend = async (customMessage?: string) => {
    const messageToSend = customMessage || input.trim();
    if (!messageToSend) return;

    if (!customMessage) setInput('');
    setLoading(true);

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageToSend,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      // Build the full context with conversation history
      const analysisContext = buildAnalysisContext();
      const conversationHistory = messages
        .slice(-6) // Last 6 messages for context
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      // Create the prompt for the AI
      const systemPrompt = `You are a medical assistant helping a ${profile?.role === 'doctor' ? 'doctor' : 'patient'} understand a clinical analysis report.

IMPORTANT GUIDELINES:
1. Be medically accurate but explain concepts clearly
2. Reference specific parts of the analysis when relevant
3. If speaking to a patient, use simpler language and avoid excessive jargon
4. If speaking to a doctor, you can use medical terminology freely
5. Always emphasize that this is AI-assisted analysis and recommend consulting with healthcare providers
6. Highlight any "Can't Miss" diagnoses or red flags if they're relevant to the question
7. Be empathetic and supportive in your responses

${analysisContext}

Previous conversation:
${conversationHistory}

User's question: ${messageToSend}

Provide a helpful, accurate response based on the analysis context. If the question is outside the scope of the analysis, say so clearly.`;

      // Try to use Keywords AI, fall back to Gemini if not available
      let assistantContent: string;
      
      try {
        // Check if we have Keywords AI configured
        if (import.meta.env.VITE_KEYWORDS_AI_API_KEY) {
          const { content } = await executePrompt(
            'deep_analysis_chat', // You'll need to create this prompt in Keywords AI
            {
              context: analysisContext,
              conversation: conversationHistory,
              question: messageToSend,
              role: profile?.role || 'patient',
            },
            { model: 'gpt-4o' }
          );
          assistantContent = content;
        } else {
          // Fall back to Gemini
          const { generateGeminiChat } = await import('@/lib/gemini');
          // Build conversation context for Gemini (which doesn't take history array)
          const conversationContext = messages.slice(-6).map(m => 
            `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
          ).join('\n\n');
          const fullContext = `${analysisContext}\n\nConversation History:\n${conversationContext}`;
          const response = await generateGeminiChat(
            fullContext,
            messageToSend
          );
          assistantContent = response.content;
        }
      } catch (aiError) {
        console.warn('[DeepAnalysisChatbot] AI error, using fallback:', aiError);
        // Provide a fallback response
        assistantContent = `I understand you're asking about: "${messageToSend}"\n\nBased on the analysis, I can see that the assessment focuses on ${deepAnalysis.diagnosticEngine?.assessment_summary?.substring(0, 200) || 'the clinical findings'}...\n\nFor detailed medical advice, please consult with your healthcare provider who can review your complete medical history.`;
      }

      // Identify any sections referenced in the response
      const citations: ChatMessage['citations'] = [];
      if (assistantContent.toLowerCase().includes('diagnosis') || assistantContent.toLowerCase().includes('differential')) {
        citations.push({ section: 'Diagnostic Engine', relevance: 'Differential diagnosis discussed' });
      }
      if (assistantContent.toLowerCase().includes('red flag') || assistantContent.toLowerCase().includes("can't miss")) {
        citations.push({ section: 'Critical Findings', relevance: 'Safety-critical information' });
      }
      if (assistantContent.toLowerCase().includes('medication') || assistantContent.toLowerCase().includes('drug')) {
        citations.push({ section: 'Clinical Lens', relevance: 'Medication information' });
      }

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        citations: citations.length > 0 ? citations : undefined,
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Save to Supabase for persistence (non-blocking)
      (async () => {
        try {
          await supabase.from('chat_messages').insert([
            {
              session_id: patientId, // Using patient ID as session for now
              role: 'user',
              content: messageToSend,
            },
            {
              session_id: patientId,
              role: 'assistant',
              content: assistantContent,
              citations_json: citations,
            },
          ]);
        } catch (err) {
          console.warn('[DeepAnalysisChatbot] Failed to save messages:', err);
        }
      })();

    } catch (error) {
      console.error('[DeepAnalysisChatbot] Error:', error);
      
      // Add error message
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your question. Please try again or rephrase your question.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <Card className="border-primary/20">
      <CardHeader 
        className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5 text-primary" />
            Analysis Assistant
            <Badge variant="outline" className="text-[10px] ml-2">
              AI-Powered
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Ask follow-up questions about the deep analysis
        </p>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {/* Chat messages area */}
          <ScrollArea className="h-[300px] pr-4 mb-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-6">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <Stethoscope className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-sm font-medium mb-2">Ask About the Analysis</h3>
                <p className="text-xs text-muted-foreground max-w-xs mb-4">
                  I have full context of the deep analysis. Ask me anything about 
                  the diagnoses, treatment options, or clinical reasoning.
                </p>
                
                {/* Suggested questions */}
                <div className="w-full">
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
                    Suggested Questions
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {SUGGESTED_QUESTIONS.slice(0, 4).map((q, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        onClick={() => handleSend(q.query)}
                        className="text-xs gap-1 hover:bg-primary/10 hover:border-primary/50"
                        disabled={loading}
                      >
                        <Sparkles className="h-3 w-3" />
                        {q.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <Bot className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      
                      {/* Citations */}
                      {message.citations && message.citations.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/50">
                          {message.citations.map((citation, ci) => (
                            <Badge 
                              key={ci}
                              variant="secondary"
                              className="text-[10px] gap-1"
                            >
                              <FileText className="h-3 w-3" />
                              {citation.section}
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      {/* Timestamp */}
                      <p className={`text-[10px] mt-1 ${
                        message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      }`}>
                        {message.timestamp.toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </p>
                    </div>
                    {message.role === 'user' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                        <User className="h-4 w-4 text-secondary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                
                {/* Loading indicator */}
                {loading && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Input area */}
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about the analysis..."
              disabled={loading}
              className="flex-1"
            />
            <Button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              size="icon"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Disclaimer */}
          <div className="flex items-start gap-2 mt-3 p-2 rounded bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground">
              This AI assistant provides information based on the analysis. 
              Always consult with qualified healthcare providers for medical decisions.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
