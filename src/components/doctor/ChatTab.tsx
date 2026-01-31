import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Send, 
  Loader2, 
  MessageSquare,
  User,
  Bot,
  Sparkles
} from 'lucide-react';
import { ragChat, ChatMessage } from '@/lib/api';
import CitationChip from '@/components/CitationChip';
import PatientExplanationToggle, { simplifyForPatient } from '@/components/doctor/PatientExplanationToggle';

interface ChatTabProps {
  patientId: string;
}

// Clinical copilot suggested questions
const SUGGESTED_QUESTIONS = [
  { label: "Symptom progression", query: "Summarize symptom progression over time" },
  { label: "Red flags", query: "What red flags are present in this patient's records?" },
  { label: "Changes since last visit", query: "What has changed since the last visit?" },
  { label: "Urgent findings", query: "What findings require urgent attention?" },
  { label: "Drug interactions", query: "Are there any potential drug interactions to be aware of?" },
  { label: "Missing workup", query: "What workup or tests might be missing?" },
];

export default function ChatTab({ patientId }: ChatTabProps) {
  const { profile } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [patientMode, setPatientMode] = useState(false);

  useEffect(() => {
    initSession();
  }, [patientId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const initSession = async () => {
    try {
      const { data: existingSessions } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('patient_id', patientId)
        .eq('profile_id', profile?.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingSessions && existingSessions.length > 0) {
        setSessionId(existingSessions[0].id);
        
        const { data: existingMessages } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('session_id', existingSessions[0].id)
          .order('created_at', { ascending: true });

        if (existingMessages) {
          setMessages(existingMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            citations: m.citations_json as unknown as ChatMessage['citations'],
          })));
        }
      } else {
        const { data: newSession, error } = await supabase
          .from('chat_sessions')
          .insert({
            patient_id: patientId,
            profile_id: profile?.id,
          })
          .select()
          .single();

        if (error) throw error;
        setSessionId(newSession.id);
      }
    } catch (error) {
      console.error('Error initializing session:', error);
    }
  };

  const handleSend = async (customMessage?: string) => {
    const messageToSend = customMessage || input.trim();
    if (!messageToSend || !sessionId) return;

    if (!customMessage) setInput('');
    setLoading(true);

    const newUserMessage: ChatMessage = { role: 'user', content: messageToSend };
    setMessages(prev => [...prev, newUserMessage]);

    try {
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role: 'user',
        content: messageToSend,
      });

      const response = await ragChat(patientId, sessionId, messageToSend);
      
      // Apply patient mode simplification if enabled
      const finalContent = patientMode 
        ? simplifyForPatient(response.content) 
        : response.content;
      
      const finalResponse = { ...response, content: finalContent };
      setMessages(prev => [...prev, finalResponse]);

      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: response.content,
        citations_json: JSON.parse(JSON.stringify(response.citations || [])),
      });
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestedClick = (query: string) => {
    handleSend(query);
  };

  return (
    <div className="flex flex-col h-[600px]">
      <Card className="card-healthcare flex-1 flex flex-col overflow-hidden">
        {/* Header with patient mode toggle */}
        <div className="border-b p-3 flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Ask the Chart</span>
            <Badge variant="outline" className="text-[10px]">AI-Powered</Badge>
          </div>
          <PatientExplanationToggle
            enabled={patientMode}
            onChange={setPatientMode}
            loading={loading}
          />
        </div>

        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="rounded-full bg-primary/10 p-4 mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">Clinical Copilot</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                Ask questions about this patient's records. Get instant answers with 
                citations to source documents.
              </p>
              
              {/* Suggested clinical questions */}
              <div className="w-full max-w-lg">
                <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">
                  Suggested Questions
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      onClick={() => handleSuggestedClick(q.query)}
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
            <div className="space-y-4">
              {messages.map((message, i) => (
                <div
                  key={i}
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
                    {message.citations && message.citations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/50">
                        {message.citations.map((citation, ci) => (
                          <CitationChip
                            key={ci}
                            docName={citation.docName}
                            page={citation.page}
                            patientId={patientId}
                          />
                        ))}
                      </div>
                    )}
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
                  <div className="bg-muted rounded-lg p-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Quick suggestions when there are messages */}
        {messages.length > 0 && (
          <div className="px-4 py-2 border-t bg-muted/30">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {SUGGESTED_QUESTIONS.slice(0, 4).map((q, i) => (
                <Button
                  key={i}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSuggestedClick(q.query)}
                  className="text-xs whitespace-nowrap flex-shrink-0"
                  disabled={loading}
                >
                  {q.label}
                </Button>
              ))}
            </div>
          </div>
        )}
        
        <CardContent className="border-t p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={patientMode 
                ? "Ask a question (responses will be in plain language)..." 
                : "Ask a question about this patient's records..."}
              disabled={loading}
            />
            <Button type="submit" disabled={loading || !input.trim()}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
