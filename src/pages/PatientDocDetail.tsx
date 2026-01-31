import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import PatientLayout from '@/components/layout/PatientLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, 
  FileText, 
  Lightbulb,
  BookOpen,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { explainDocument, DocExplanation } from '@/lib/api';

interface Document {
  id: string;
  filename: string;
  doc_type: string;
  created_at: string;
}

export default function PatientDocDetail() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [explaining, setExplaining] = useState(false);
  const [document, setDocument] = useState<Document | null>(null);
  const [explanation, setExplanation] = useState<DocExplanation | null>(null);
  const [mode, setMode] = useState<'simple' | 'detailed'>('simple');

  useEffect(() => {
    if (id) {
      fetchDocument();
    }
  }, [id]);

  const fetchDocument = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setDocument(data);
    } catch (error) {
      console.error('Error fetching document:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExplain = async (selectedMode: 'simple' | 'detailed') => {
    if (!id) return;
    
    setExplaining(true);
    setMode(selectedMode);
    
    try {
      const result = await explainDocument(id, selectedMode);
      setExplanation(result);
    } catch (error) {
      console.error('Error explaining document:', error);
    } finally {
      setExplaining(false);
    }
  };

  if (loading) {
    return (
      <PatientLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PatientLayout>
    );
  }

  if (!document) {
    return (
      <PatientLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Document not found</h2>
        </div>
      </PatientLayout>
    );
  }

  return (
    <PatientLayout
      breadcrumbs={[
        { label: 'My Documents', href: '/patient' },
        { label: document.filename },
      ]}
    >
      <div className="max-w-3xl mx-auto">
        {/* Document Header */}
        <Card className="card-healthcare mb-6">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">{document.filename}</h1>
              <p className="text-sm text-muted-foreground">
                {new Date(document.created_at).toLocaleDateString()}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Explanation Mode Selection */}
        {!explanation && (
          <div className="text-center py-12">
            <div className="rounded-full bg-primary/10 p-6 mb-6 inline-block">
              <Lightbulb className="h-12 w-12 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Understand This Document</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-8">
              Get an AI-powered explanation of this document in plain language, 
              along with key terms and questions to ask your doctor.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                onClick={() => handleExplain('simple')}
                disabled={explaining}
                className="min-w-[160px]"
              >
                {explaining && mode === 'simple' ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-5 w-5 mr-2" />
                )}
                Explain Simply
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => handleExplain('detailed')}
                disabled={explaining}
                className="min-w-[160px]"
              >
                {explaining && mode === 'detailed' ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <BookOpen className="h-5 w-5 mr-2" />
                )}
                Explain in Detail
              </Button>
            </div>
          </div>
        )}

        {/* Explanation Content */}
        {explanation && (
          <div className="space-y-6 animate-fade-in">
            {/* Toggle buttons */}
            <div className="flex gap-2 justify-center">
              <Button
                variant={mode === 'simple' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleExplain('simple')}
                disabled={explaining}
              >
                {explaining && mode === 'simple' && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Simple
              </Button>
              <Button
                variant={mode === 'detailed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleExplain('detailed')}
                disabled={explaining}
              >
                {explaining && mode === 'detailed' && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Detailed
              </Button>
            </div>

            {/* Summary */}
            <Card className="card-healthcare">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="h-5 w-5" />
                  What Does This Mean?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground leading-relaxed">
                  {explanation.summary}
                </p>
              </CardContent>
            </Card>

            {/* Key Terms */}
            <Card className="card-healthcare">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Key Terms
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {explanation.keyTerms.map((item, i) => (
                    <div key={i} className="border-b border-border/50 last:border-0 pb-3 last:pb-0">
                      <Badge variant="secondary" className="mb-1">
                        {item.term}
                      </Badge>
                      <p className="text-sm text-muted-foreground">
                        {item.definition}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Questions for Doctor */}
            <Card className="card-healthcare border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" />
                  Questions to Ask Your Doctor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {explanation.questionsForDoctor.map((question, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs flex-shrink-0">
                        {i + 1}
                      </span>
                      <span>{question}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PatientLayout>
  );
}
