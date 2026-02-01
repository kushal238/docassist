import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles,
  Brain,
  Loader2,
  FileText,
  ChevronDown,
  ChevronUp,
  Database,
  Pill,
  Activity,
  Stethoscope,
  AlertTriangle,
  TestTube,
  Upload,
  Trash2,
  File,
} from 'lucide-react';
import { toast } from 'sonner';
import VoiceClinicalInput from './VoiceClinicalInput';
import { generateBrief, BriefContent } from '@/lib/api';
import { runClinicalPipeline, ClinicalPipelineResult } from '@/services/clinical-pipeline';
import SOAPNoteGenerator from './SOAPNoteGenerator';
import { generateGeminiBriefWithEval } from '@/lib/gemini';
import { getPatientClinicalSummary, getDetectedAlerts } from '@/lib/clinical-insights';
import type { EvaluationSummary } from '@/lib/evaluations';
import { ingestDocument } from '@/services/document-ingestion';
import { deleteDocument } from '@/services/data-management';
import AnalysisChatbot from './DeepAnalysisChatbot';
import EditablePipelineResultView from './EditablePipelineResultView';

// Types for structured clinical data
interface ClinicalDataSources {
  diagnoses: Array<{ name: string; type: string; icd: string | null; specialty: string }>;
  medications: Array<{ drug: string; dose: string; frequency: string; status: string; indication: string; notes: string | null }>;
  recent_labs: Array<{ name: string; value: number; unit: string; abnormal: boolean; date: string }>;
  recent_vitals: { bp: string; hr: number; o2: number; weight_kg: number; date: string } | null;
  active_symptoms: Array<{ description: string; severity: number; onset: string }>;
  detected_alerts: Array<{ alert_type: string; priority: string; title: string; description: string }>;
}

interface PatientDocument {
  id: string;
  filename: string;
  doc_type: string;
  created_at: string;
}

interface UnifiedClinicalAnalysisProps {
  patientId: string;
  patientName?: string;
  patientDOB?: string | null;
}

type AnalysisDepth = 'quick' | 'deep';

export default function UnifiedClinicalAnalysis({
  patientId,
  patientName,
  patientDOB,
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
  const [dataSources, setDataSources] = useState<ClinicalDataSources | null>(null);

  const [showReasoningDetails, setShowReasoningDetails] = useState(false);
  
  // Document management
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDoctor = profile?.role === 'doctor';

  // Load documents
  const loadDocuments = async () => {
    const { data } = await supabase
      .from('documents')
      .select('id, filename, doc_type, created_at')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });
    setDocuments(data || []);
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF files are supported');
      return;
    }

    setIsUploading(true);
    try {
      const result = await ingestDocument(file, patientId);
      if (result.success) {
        toast.success('Document uploaded', {
          description: `Extracted ${result.chunkCount} text segments`,
        });
        await loadDocuments();
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      toast.error('Upload failed', { description: (err as Error).message });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle document deletion (doctors only)
  const handleDeleteDocument = async (docId: string, filename: string) => {
    if (!isDoctor) return;
    
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return;

    const success = await deleteDocument(docId, patientId);
    if (success) {
      await loadDocuments();
    }
  };

  // Load documents on mount
  useEffect(() => {
    loadDocuments();
  }, [patientId]);

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
      // Fetch structured data sources first (for display)
      setCurrentStage('Loading patient data...');
      const [clinicalSummary, detectedAlerts] = await Promise.all([
        getPatientClinicalSummary(patientId),
        getDetectedAlerts(patientId),
      ]);

      // Store for Sources tab
      if (clinicalSummary) {
        setDataSources({
          diagnoses: clinicalSummary.diagnoses || [],
          medications: clinicalSummary.medications || [],
          recent_labs: clinicalSummary.recent_labs || [],
          recent_vitals: clinicalSummary.recent_vitals || null,
          active_symptoms: clinicalSummary.active_symptoms || [],
          detected_alerts: detectedAlerts || [],
        });
      }

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
          // Handle error case
          const errorResult = result as { success: false; error: string };
          toast.error(`Analysis failed: ${errorResult.error}`);
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
    setDataSources(null);
    setClinicalNotes('');
    setChiefComplaint('');
  };

  if (brief || deepAnalysis) {
    return (
      <div className="space-y-4">
        {/* Header Row */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{patientName || 'Patient'}</h2>
            <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
              {patientDOB && (
                <span>DOB: {new Date(patientDOB).toLocaleDateString()}</span>
              )}
              <span>CC: {chiefComplaint || 'General assessment'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {brief && (
              <SOAPNoteGenerator
                patientId={patientId}
                brief={brief}
                patientName={patientName}
              />
            )}
            <Button variant="outline" size="sm" onClick={handleReset}>
              New Analysis
            </Button>
          </div>
        </div>

        {/* SAFETY ALERTS - Always at top, highly visible */}
        {(brief?.safetyAlerts?.length > 0 || dataSources?.detected_alerts?.length > 0) && (
          <Card className="border border-destructive/50 bg-destructive/5 dark:bg-destructive/10">
            <CardContent className="py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  {dataSources?.detected_alerts?.map((alert, i) => (
                    <div key={`detected-${i}`} className="text-sm font-medium text-destructive dark:text-red-400">
                      <Badge variant="destructive" className="mr-2 text-xs">{alert.priority}</Badge>
                      {alert.title}
                    </div>
                  ))}
                  {brief?.safetyAlerts?.map((alert, i) => (
                    <div key={`brief-${i}`} className="text-sm text-destructive/90 dark:text-red-300">
                      {alert}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content - Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column - Clinical Assessment */}
          <div className="lg:col-span-2 space-y-4">
            {/* Assessment Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Differential - Compact numbered list */}
                {brief?.differentialConsiderations?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Differential</h4>
                    <ol className="space-y-1">
                      {brief.differentialConsiderations.slice(0, 5).map((dx, i) => (
                        <li key={i} className="flex items-baseline gap-2 text-sm">
                          <span className="font-bold text-primary w-4">{i + 1}.</span>
                          <span>{dx}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Recommendations - Actionable */}
                {brief?.actionableRecommendations?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Next Steps</h4>
                    <ul className="space-y-1">
                      {brief.actionableRecommendations.slice(0, 4).map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-success mt-0.5">→</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Expandable Summary - Collapsed by default */}
            <details className="group">
              <summary className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                <span className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Full Clinical Summary
                </span>
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 p-4 bg-muted/30 rounded-lg">
                <p className="text-sm leading-relaxed">{brief?.summary}</p>
              </div>
            </details>

            {/* Deep Analysis - Expandable */}
            {deepAnalysis && (
              <details className="group" open>
                <summary className="flex items-center justify-between p-3 bg-primary/10 rounded-lg cursor-pointer hover:bg-primary/20 transition-colors">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    Deep Analysis Report
                    {isDoctor && <Badge variant="outline" className="text-[10px]">Editable</Badge>}
                  </span>
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2 space-y-4">
                  {/* Editable Pipeline Result View */}
                  <EditablePipelineResultView
                    patientId={patientId}
                    analysisResult={deepAnalysis}
                    onUpdate={setDeepAnalysis}
                    readOnly={!isDoctor}
                  />
                  
                  {/* Raw Report (collapsed) */}
                  <details className="group/raw">
                    <summary className="flex items-center justify-between p-2 bg-muted/30 rounded cursor-pointer text-xs text-muted-foreground">
                      <span>View Raw Report</span>
                      <ChevronDown className="h-3 w-3 transition-transform group-open/raw:rotate-180" />
                    </summary>
                    <div className="mt-2 p-4 bg-muted/30 rounded-lg">
                      <pre className="text-xs whitespace-pre-wrap font-mono">{deepAnalysis.report}</pre>
                    </div>
                  </details>
                </div>
              </details>
            )}

            {/* AI Analysis Assistant - Always visible when analysis is complete */}
            <AnalysisChatbot
              patientId={patientId}
              patientName={patientName}
              deepAnalysis={deepAnalysis}
              brief={brief}
              dataSources={dataSources}
              chiefComplaint={chiefComplaint}
              clinicalNotes={clinicalNotes}
              onAnalysisUpdate={setDeepAnalysis}
            />
          </div>

          {/* Right Column - Patient Details */}
          <div className="space-y-3">
            {/* Vitals - Compact Grid */}
            {dataSources?.recent_vitals && (
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    Vitals
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-muted/50 rounded p-2">
                      <div className="text-lg font-bold">{dataSources.recent_vitals.bp}</div>
                      <div className="text-[10px] text-muted-foreground">BP</div>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <div className="text-lg font-bold">{dataSources.recent_vitals.hr}</div>
                      <div className="text-[10px] text-muted-foreground">HR</div>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <div className="text-lg font-bold">{dataSources.recent_vitals.o2}%</div>
                      <div className="text-[10px] text-muted-foreground">SpO2</div>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <div className="text-lg font-bold">{dataSources.recent_vitals.weight_kg}</div>
                      <div className="text-[10px] text-muted-foreground">kg</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Labs - Compact with abnormal highlighted */}
            {dataSources?.recent_labs?.length > 0 && (
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <TestTube className="h-3 w-3" />
                    Labs
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="space-y-1">
                    {dataSources.recent_labs.map((lab, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between text-sm px-2 py-1 rounded ${
                          lab.abnormal ? 'bg-warning/10 text-warning-foreground' : ''
                        }`}
                      >
                        <span className={lab.abnormal ? 'font-medium' : ''}>{lab.name}</span>
                        <span className={`font-mono ${lab.abnormal ? 'text-warning font-bold' : ''}`}>
                          {lab.value} {lab.unit && <span className="text-xs text-muted-foreground">{lab.unit}</span>}
                          {lab.abnormal && <span className="ml-1">⚠</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Medications - Compact */}
            {dataSources?.medications?.length > 0 && (
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Pill className="h-3 w-3" />
                    Medications
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="space-y-1">
                    {dataSources.medications.map((med, i) => (
                      <div key={i} className="text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{med.drug}</span>
                          {med.status !== 'active' && (
                            <Badge variant="outline" className="text-[10px] h-4">{med.status}</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{med.dose} {med.frequency}</div>
                        {med.notes && (
                          <div className="text-xs text-warning">{med.notes}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Diagnoses - Compact */}
            {dataSources?.diagnoses?.length > 0 && (
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Stethoscope className="h-3 w-3" />
                    Problem List
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="space-y-1">
                    {dataSources.diagnoses.map((dx, i) => (
                      <div key={i} className="text-sm flex items-center justify-between">
                        <span>{dx.name}</span>
                        <span className="text-[10px] text-muted-foreground">{dx.specialty}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quality Score - Small indicator */}
            {evaluations && (
              <div className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg">
                <span className="text-xs text-muted-foreground">AI Confidence</span>
                <Badge variant={evaluations.overallScore >= 0.8 ? 'secondary' : 'destructive'} className="text-xs">
                  {(evaluations.overallScore * 100).toFixed(0)}%
                </Badge>
              </div>
            )}

            {/* Patient Documents - Upload/Delete */}
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Documents
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {documents.length === 0 ? (
                  <div className="text-center py-4 text-xs text-muted-foreground">
                    <File className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No documents uploaded</p>
                    <p className="text-[10px]">Click upload to add PDFs</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[120px]">
                    <div className="space-y-1">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between text-sm p-2 rounded hover:bg-muted/50 group"
                        >
                          <div className="flex items-center gap-2 truncate flex-1">
                            <File className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate text-xs">{doc.filename}</span>
                          </div>
                          {isDoctor && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600"
                              onClick={() => handleDeleteDocument(doc.id, doc.filename)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
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
