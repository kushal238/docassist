import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sparkles,
  Brain,
  Loader2,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import VoiceClinicalInput from './VoiceClinicalInput';
import { generateBrief, BriefContent } from '@/lib/api';
import { runClinicalPipeline, ClinicalPipelineResult } from '@/services/clinical-pipeline';
import SOAPNoteGenerator from './SOAPNoteGenerator';
import { generateGeminiBriefWithEval } from '@/lib/gemini';
import type { EvaluationSummary } from '@/lib/evaluations';

interface UnifiedClinicalAnalysisProps {
  patientId: string;
  patientName?: string;
}

type AnalysisDepth = 'quick' | 'deep';

export default function UnifiedClinicalAnalysis({
  patientId,
  patientName,
}: UnifiedClinicalAnalysisProps) {
  const { profile } = useAuth();

  const [clinicalNotes, setClinicalNotes] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisDepth, setAnalysisDepth] = useState<AnalysisDepth>('quick');
  const [currentStage, setCurrentStage] = useState<string | null>(null);

  const [brief, setBrief] = useState<BriefContent | null>(null);
  const [deepAnalysis, setDeepAnalysis] = useState<ClinicalPipelineResult | null>(null);
  const [evaluations, setEvaluations] = useState<EvaluationSummary | null>(null);

  const [showReasoningDetails, setShowReasoningDetails] = useState(false);

  const determineAnalysisDepth = (notes: string): AnalysisDepth => {
    const wordCount = notes.trim().split(/\s+/).length;
    const hasComplexTerms = /differential|diagnosis|workup|assessment/i.test(notes);
    const hasMultipleSystems = (notes.match(/pain|fever|cough|nausea/gi) || []).length > 2;

    if (wordCount > 100 || hasComplexTerms || hasMultipleSystems) {
      return 'deep';
    }

    return 'quick';
  };

  const buildPatientContext = async () => {
    const { data: patient } = await supabase
      .from('patients')
      .select('full_name, dob')
      .eq('id', patientId)
      .single();

    const { data: briefs } = await supabase
      .from('briefs')
      .select('content_json')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(1);

    const { data: documents } = await supabase
      .from('documents')
      .select('id, filename, doc_type, created_at')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    const { data: chunks } = await supabase
      .from('doc_chunks')
      .select('document_id, chunk_text, page_num')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: true });

    const { data: symptoms } = await supabase
      .from('symptoms')
      .select('description, onset_date, severity, created_at')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    const patientInfo = `Patient Name: ${patient?.full_name || patientName || 'Unknown'}. DOB: ${patient?.dob || 'Unknown'}.`;
    const existingBriefData = briefs?.[0]?.content_json
      ? `\n\nPrevious Clinical Data:\n${JSON.stringify(briefs[0].content_json, null, 2)}`
      : '';

    const documentMap = new Map<string, { meta: string; chunks: string[] }>();
    (documents || []).forEach((doc) => {
      const meta = `Document: ${doc.filename} (type: ${doc.doc_type}, date: ${doc.created_at})`;
      documentMap.set(doc.id, { meta, chunks: [] });
    });

    (chunks || []).forEach((chunk) => {
      const entry = documentMap.get(chunk.document_id) || {
        meta: `Document: ${chunk.document_id}`,
        chunks: [],
      };
      const pageLabel = chunk.page_num ? ` [page ${chunk.page_num}]` : '';
      entry.chunks.push(`${pageLabel} ${chunk.chunk_text}`);
      documentMap.set(chunk.document_id, entry);
    });

    const allDocumentsText = Array.from(documentMap.values())
      .map((entry) => `${entry.meta}\n${entry.chunks.join('\n')}`)
      .join('\n\n');

    const symptomsText = (symptoms || []).length
      ? `\n\nRecent Symptoms:\n${(symptoms || [])
          .map((symptom) => {
            const onset = symptom.onset_date ? `, onset: ${symptom.onset_date}` : '';
            const severity = symptom.severity ? `, severity: ${symptom.severity}/10` : '';
            return `- ${symptom.description}${onset}${severity}`;
          })
          .join('\n')}`
      : '';

    const documentsSection = allDocumentsText
      ? `\n\nAll Patient Documents (raw text):\n${allDocumentsText}`
      : '';

    return `${patientInfo}${symptomsText}${documentsSection}${existingBriefData}`;
  };

  const handleAnalyze = async () => {
    if (!clinicalNotes.trim()) {
      toast.error('Please add clinical notes');
      return;
    }

    setIsAnalyzing(true);
    const depth = determineAnalysisDepth(clinicalNotes);
    setAnalysisDepth(depth);

    try {
      if (depth === 'quick') {
        setCurrentStage('Generating clinical brief...');

        const patientContext = await buildPatientContext();
        const { brief: newBrief, summary } = await generateGeminiBriefWithEval(
          patientContext,
          chiefComplaint || undefined,
          clinicalNotes,
          { patientId, doctorId: profile?.id }
        );

        setBrief(newBrief);
        setEvaluations(summary);

        await supabase.from('briefs').insert({
          patient_id: patientId,
          created_by_profile_id: profile?.id,
          content_json: JSON.parse(
            JSON.stringify({
              type: 'quick_brief_with_eval',
              brief: newBrief,
              evaluations: summary,
              chiefComplaint,
            })
          ),
        });

        toast.success(
          `Smart brief generated (${(summary.overallScore * 100).toFixed(0)}% quality)`
        );
      } else {
        setCurrentStage('Running deep analysis pipeline...');

        const patientContext = await buildPatientContext();
        const rawNotes = `${patientContext}\n\nClinical Notes:\n${clinicalNotes}`;

        const result = await runClinicalPipeline(
          rawNotes,
          chiefComplaint || 'General clinical assessment'
        );

        if (result.success) {
          setDeepAnalysis(result);

          setCurrentStage('Generating summary brief...');
          const quickBrief = await generateBrief(
            patientId,
            chiefComplaint || undefined,
            clinicalNotes
          );
          setBrief(quickBrief);

          await supabase.from('briefs').insert({
            patient_id: patientId,
            created_by_profile_id: profile?.id,
            content_json: JSON.parse(
              JSON.stringify({
                type: 'deep_analysis',
                deep: result,
                brief: quickBrief,
                chiefComplaint,
              })
            ),
          });

          toast.success('Deep analysis complete');
        } else {
          toast.error(`Analysis failed: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Failed to analyze');
    } finally {
      setIsAnalyzing(false);
      setCurrentStage(null);
    }
  };

  const handleReset = () => {
    setBrief(null);
    setDeepAnalysis(null);
    setEvaluations(null);
    setClinicalNotes('');
    setChiefComplaint('');
  };

  if (brief || deepAnalysis) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Clinical Analysis</h2>
            {chiefComplaint && (
              <p className="text-sm text-muted-foreground mt-1">
                Chief Complaint: <span className="font-medium">{chiefComplaint}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Badge variant={analysisDepth === 'deep' ? 'default' : 'secondary'}>
              {analysisDepth === 'deep' ? (
                <>
                  <Brain className="h-3 w-3 mr-1" />
                  Deep Analysis
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 mr-1" />
                  Quick Brief
                </>
              )}
            </Badge>

            {evaluations && (
              <Badge variant={evaluations.needsReview ? 'destructive' : 'secondary'}>
                Quality: {(evaluations.overallScore * 100).toFixed(0)}%
                {evaluations.needsReview && ' ⚠️'}
              </Badge>
            )}

            {brief && (
              <SOAPNoteGenerator
                patientId={patientId}
                brief={brief}
                patientName={patientName}
              />
            )}

            <Button variant="outline" onClick={handleReset}>
              <Sparkles className="h-4 w-4 mr-2" />
              New Analysis
            </Button>
          </div>
        </div>

        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="reasoning">
              Reasoning {deepAnalysis && '(Deep)'}
            </TabsTrigger>
            <TabsTrigger value="evaluations">Quality</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4">
            {brief && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Clinical Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed">{brief.summary}</p>
                  </CardContent>
                </Card>

                {brief.differentialConsiderations?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Differential Diagnoses</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ol className="space-y-2">
                        {brief.differentialConsiderations.map((dx, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="font-medium text-primary">{i + 1}.</span>
                            <span>{dx}</span>
                          </li>
                        ))}
                      </ol>
                    </CardContent>
                  </Card>
                )}

                {brief.safetyAlerts?.length > 0 && (
                  <Card className="border-l-4 border-l-destructive bg-destructive/5">
                    <CardHeader>
                      <CardTitle className="text-base text-destructive">Safety Alerts</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {brief.safetyAlerts.map((alert, i) => (
                          <li key={i} className="text-sm font-medium text-destructive">
                            ⚠️ {alert}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {brief.actionableRecommendations?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Recommendations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {brief.actionableRecommendations.map((rec, i) => (
                          <li key={i} className="text-sm">• {rec}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {deepAnalysis && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-primary" />
                    Deep Analysis Report
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <div className="whitespace-pre-wrap text-sm">{deepAnalysis.report}</div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="reasoning" className="space-y-4">
            {deepAnalysis ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Brain className="h-5 w-5" />
                      Chain-of-Thought Reasoning
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowReasoningDetails(!showReasoningDetails)}
                    >
                      {showReasoningDetails ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-1" />
                          Hide Details
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Show Details
                        </>
                      )}
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <div className="whitespace-pre-wrap text-sm font-mono bg-muted p-4 rounded">
                      {deepAnalysis.reasoning_trace}
                    </div>
                  </div>

                  {showReasoningDetails && (
                    <div className="mt-6 space-y-4">
                      <h4 className="text-sm font-medium">Pipeline Trace Data</h4>

                      <details className="bg-muted p-3 rounded">
                        <summary className="cursor-pointer font-medium text-sm">
                          Stage 1: Extracted History
                        </summary>
                        <pre className="mt-2 text-xs overflow-auto">
                          {JSON.stringify(deepAnalysis.trace_data.extractedHistory, null, 2)}
                        </pre>
                      </details>

                      <details className="bg-muted p-3 rounded">
                        <summary className="cursor-pointer font-medium text-sm">
                          Stage 2: Filtered Findings
                        </summary>
                        <pre className="mt-2 text-xs overflow-auto">
                          {JSON.stringify(deepAnalysis.trace_data.filteredFindings, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-8 text-muted-foreground">
                  <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">
                    Detailed reasoning is available for complex cases analyzed with deep analysis.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="evaluations" className="space-y-4">
            {evaluations ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Quality Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Overall Score</span>
                      <Badge variant={evaluations.needsReview ? 'destructive' : 'secondary'}>
                        {(evaluations.overallScore * 100).toFixed(0)}%
                      </Badge>
                    </div>

                    {evaluations.safetyScore !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Safety Check</span>
                        <Badge variant="secondary">
                          {(evaluations.safetyScore * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    )}

                    {evaluations.hallucinationScore !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Accuracy Check</span>
                        <Badge variant="secondary">
                          {(evaluations.hallucinationScore * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {evaluations.flaggedIssues.length > 0 && (
                  <Card className="border-l-4 border-l-destructive">
                    <CardHeader>
                      <CardTitle className="text-base text-destructive">Flagged for Review</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {evaluations.flaggedIssues.map((issue, i) => (
                          <li key={i} className="text-sm">⚠️ {issue}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">
                    Quality evaluations are available for analyses run with safety checks enabled.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  if (isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <div className="rounded-full bg-primary/10 p-6 animate-pulse">
          {analysisDepth === 'deep' ? (
            <Brain className="h-12 w-12 text-primary" />
          ) : (
            <Sparkles className="h-12 w-12 text-primary" />
          )}
        </div>

        <div className="text-center">
          <h3 className="text-xl font-semibold mb-2">
            {analysisDepth === 'deep' ? 'Running Deep Analysis' : 'Generating Smart Brief'}
          </h3>
          <p className="text-muted-foreground">{currentStage || 'Processing...'}</p>
        </div>

        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold">Clinical Analysis</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Use voice or text to document patient presentation. AI will analyze complexity
          and run appropriate analysis depth automatically.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <label className="text-sm font-medium mb-2 block">
            Chief Complaint (Optional - auto-extracted from notes)
          </label>
          <Input
            value={chiefComplaint}
            onChange={(e) => setChiefComplaint(e.target.value)}
            placeholder="e.g., Chest pain, Headache, Abdominal pain..."
          />
        </CardContent>
      </Card>

      <VoiceClinicalInput
        value={clinicalNotes}
        onChange={setClinicalNotes}
        onChiefComplaintExtracted={setChiefComplaint}
      />

      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={handleAnalyze}
          disabled={!clinicalNotes.trim()}
          className="min-w-[200px]"
        >
          <Sparkles className="h-5 w-5 mr-2" />
          Analyze
        </Button>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        💡 Complex cases automatically trigger deep analysis with chain-of-thought reasoning
      </p>
    </div>
  );
}
