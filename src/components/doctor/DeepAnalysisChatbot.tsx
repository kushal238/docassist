/**
 * Deep Analysis Chatbot with Voice Recording
 * 
 * Features:
 * - Context-aware: Knows about the patient's deep analysis
 * - Voice input: Record questions using microphone
 * - Citation support: Links to analysis sections
 * - Medical knowledge: Trained on medical terminology
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
  Mic,
  MicOff,
  Square,
} from 'lucide-react';
import { toast } from 'sonner';
import { transcribeAudio as keywordsTranscribe } from '@/lib/keywords-ai-speech';
import type { ClinicalPipelineResult } from '@/services/clinical-pipeline';

// =============================================================================
// Types
// =============================================================================

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  citations?: { section: string; relevance: string }[];
}

interface DeepAnalysisChatbotProps {
  patientId: string;
  patientName?: string;
  deepAnalysis: ClinicalPipelineResult;
  chiefComplaint?: string;
  onAnalysisUpdate?: (updatedAnalysis: ClinicalPipelineResult) => void;
}

const SUGGESTED_QUESTIONS = [
  { label: "Explain diagnosis", query: "Can you explain the most likely diagnosis in simpler terms?" },
  { label: "Red flags", query: "What are the red flags I should watch for?" },
  { label: "Treatment options", query: "What are the treatment options for this condition?" },
  { label: "Differential", query: "Why were other diagnoses ruled out?" },
  { label: "Next steps", query: "What tests or follow-up actions are recommended?" },
  { label: "Evidence basis", query: "What evidence supports this diagnosis?" },
];

// =============================================================================
// Component
// =============================================================================

export default function DeepAnalysisChatbot({
  patientId,
  patientName,
  deepAnalysis,
  chiefComplaint,
}: DeepAnalysisChatbotProps) {
  const { profile } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // =============================================================================
  // Voice Recording
  // =============================================================================

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await transcribeAudio(audioBlob);
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      setAudioChunks(chunks);
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setLoading(true);
    try {
      // Use Keywords AI for speech-to-text (same as VoiceClinicalInput)
      const response = await keywordsTranscribe(audioBlob, 'audio/webm');
      
      if (!response.transcript || response.transcript.trim() === '') {
        toast.error('No speech detected. Please try again.');
        return;
      }
      
      setInput(response.transcript.trim());
      toast.success('Voice transcribed successfully');
    } catch (error) {
      console.error('Transcription error:', error);
      toast.error('Failed to transcribe voice. Please try again or type your question.');
    } finally {
      setLoading(false);
    }
  };

  // =============================================================================
  // Build Context
  // =============================================================================

  const buildAnalysisContext = (): string => {
    // Use the 2-stage ClinicalPipelineResult structure
    const cl = deepAnalysis.clinicalLens;
    const de = deepAnalysis.diagnosticEngine;
    
    let context = `=== DEEP ANALYSIS CONTEXT ===\n`;
    context += `Patient: ${patientName || 'Unknown'}\n`;
    context += `Chief Complaint: ${chiefComplaint || 'Not specified'}\n\n`;
    
    // Clinical Lens data
    if (cl) {
      context += `=== CLINICAL LENS ===\n`;
      if (cl.relevant_history?.length) context += `History: ${cl.relevant_history.join(', ')}\n`;
      if (cl.current_medications?.length) context += `Medications: ${cl.current_medications.join(', ')}\n`;
      if (cl.red_flags?.length) context += `Red Flags: ${cl.red_flags.join(', ')}\n`;
      if (cl.risk_factors?.length) context += `Risk Factors: ${cl.risk_factors.join(', ')}\n`;
      if (cl.symptom_timeline) context += `Timeline: ${cl.symptom_timeline}\n`;
    }
    
    // Diagnostic Engine data
    if (de) {
      context += `\n=== DIAGNOSTIC ENGINE ===\n`;
      if (de.assessment_summary) context += `Assessment: ${de.assessment_summary}\n`;
      
      if (de.differential?.most_likely?.length) {
        context += `\nMost Likely Diagnoses:\n`;
        de.differential.most_likely.forEach((dx, i) => {
          context += `${i + 1}. ${dx.diagnosis} (${((dx.confidence || 0) * 100).toFixed(0)}%)\n`;
        });
      }
      
      if (de.differential?.cant_miss?.length) {
        context += `\nCan't Miss (Critical):\n`;
        de.differential.cant_miss.forEach((dx) => {
          context += `- ${dx.diagnosis} (${dx.urgency})\n`;
        });
      }
      
      if (de.suggested_plan) {
        context += `\nSuggested Plan:\n`;
        if (de.suggested_plan.immediate?.length) context += `Immediate: ${de.suggested_plan.immediate.join(', ')}\n`;
        if (de.suggested_plan.short_term?.length) context += `Short-term: ${de.suggested_plan.short_term.join(', ')}\n`;
      }
    }
    
    return context;
  };

  // =============================================================================
  // Send Message
  // =============================================================================

  const handleSend = async (customMessage?: string) => {
    const messageToSend = customMessage || input.trim();
    if (!messageToSend) return;

    if (!customMessage) setInput('');
    setLoading(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageToSend,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const analysisContext = buildAnalysisContext();
      const conversationHistory = messages
        .slice(-6)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      let assistantContent: string;
      
      try {
        const { generateGeminiChat } = await import('@/lib/gemini');
        const fullContext = `${analysisContext}\n\nConversation:\n${conversationHistory}`;
        const response = await generateGeminiChat(fullContext, messageToSend);
        assistantContent = response.content;
      } catch (aiError) {
        assistantContent = `Based on the analysis for "${chiefComplaint || 'this case'}", I can help answer questions about the diagnosis and recommendations. Please consult with your healthcare provider for specific medical advice.`;
      }

      const citations: ChatMessage['citations'] = [];
      if (assistantContent.toLowerCase().includes('diagnosis')) {
        citations.push({ section: 'Diagnostic Engine', relevance: 'Diagnosis discussed' });
      }
      if (assistantContent.toLowerCase().includes('red flag')) {
        citations.push({ section: 'Critical Findings', relevance: 'Safety information' });
      }

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        citations: citations.length > 0 ? citations : undefined,
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Save to Supabase (non-blocking)
      (async () => {
        try {
          await supabase.from('chat_messages').insert([
            { session_id: patientId, role: 'user', content: messageToSend },
            { session_id: patientId, role: 'assistant', content: assistantContent, citations_json: citations },
          ]);
        } catch (err) {
          console.warn('Failed to save messages:', err);
        }
      })();

    } catch (error) {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'I encountered an error. Please try again.',
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
            <Badge variant="outline" className="text-[10px] ml-2">AI-Powered</Badge>
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">Ask follow-up questions about the analysis</p>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <ScrollArea className="h-[300px] pr-4 mb-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-6">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <Stethoscope className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-sm font-medium mb-2">Ask About the Analysis</h3>
                <p className="text-xs text-muted-foreground max-w-xs mb-4">
                  I have full context of the deep analysis. Ask me anything about diagnoses, treatment options, or clinical reasoning.
                </p>
                
                <div className="w-full">
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Suggested Questions</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {SUGGESTED_QUESTIONS.slice(0, 4).map((q, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        onClick={() => handleSend(q.query)}
                        className="text-xs gap-1"
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
                  <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.role === 'assistant' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <Bot className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-lg p-3 ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      
                      {message.citations && message.citations.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/50">
                          {message.citations.map((c, ci) => (
                            <Badge key={ci} variant="secondary" className="text-[10px] gap-1">
                              <FileText className="h-3 w-3" />
                              {c.section}
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      <p className={`text-[10px] mt-1 ${message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {message.role === 'user' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                        <User className="h-4 w-4 text-secondary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                
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

          {/* Input area with voice */}
          <div className="flex gap-2">
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="icon"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={loading}
              title={isRecording ? "Stop recording" : "Start voice input"}
            >
              {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isRecording ? "Recording..." : "Ask about the analysis..."}
              disabled={loading || isRecording}
              className="flex-1"
            />
            <Button onClick={() => handleSend()} disabled={loading || !input.trim()} size="icon">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          <div className="flex items-start gap-2 mt-3 p-2 rounded bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground">
              This AI assistant provides information based on the analysis. Always consult with healthcare providers for medical decisions.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
