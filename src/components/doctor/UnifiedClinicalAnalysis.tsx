import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  Eye,
  Mic,
} from 'lucide-react';
import { toast } from 'sonner';
import VoiceClinicalInput from './VoiceClinicalInput';
import VoiceInputButton from './VoiceInputButton';
import { generateBrief, BriefContent } from '@/lib/api';
import { runClinicalPipeline, ClinicalPipelineResult } from '@/services/clinical-pipeline';
import SOAPNoteGenerator from './SOAPNoteGenerator';
import { generateGeminiBriefWithEval, parseLabOrders, parseMedicationOrders } from '@/lib/gemini';
import { getPatientClinicalSummary, getDetectedAlerts } from '@/lib/clinical-insights';
import type { EvaluationSummary } from '@/lib/evaluations';
import type { Json } from '@/integrations/supabase/types';
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

interface Encounter {
  id: string;
  patient_id: string;
  encounter_date: string;
  encounter_type: string;
  specialty: string;
  chief_complaint: string | null;
  provider_name: string | null;
  source_document_id: string | null;
  created_at: string | null;
}

interface SoapNote {
  id: string;
  encounter_id: string;
  patient_id: string;
  subjective: string | null;
  objective: Json | null;
  assessment: string | null;
  plan: string | null;
  created_by_profile_id: string | null;
  created_at: string | null;
}

type DocumentItem =
  | { kind: 'document'; id: string; title: string; date: string; subtitle: string; document: PatientDocument }
  | { kind: 'encounter'; id: string; title: string; date: string; subtitle: string; encounter: Encounter }
  | { kind: 'soap'; id: string; title: string; date: string; subtitle: string; soapNote: SoapNote };

interface UnifiedClinicalAnalysisProps {
  patientId: string;
  patientName?: string;
  patientDOB?: string | null;
}

type AnalysisDepth = 'quick' | 'deep';

interface PrescriptionItem {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
}

interface LabOrderItem {
  id: string;
  test: string;
  priority: string;
}

const COMMON_MEDICATIONS = [
  'Advil',
  'Tylenol',
  'Amoxicillin',
  'Metformin',
  'Lisinopril',
  'Atorvastatin',
  'Omeprazole',
  'Amlodipine',
];

const LAB_TEST_OPTIONS = [
  'Complete Blood Count (CBC)',
  'Basic Metabolic Panel (BMP)',
  'Lipid Panel',
  'Hemoglobin A1C',
  'TSH',
  'Liver Function Tests (LFT)',
];

const DOSAGE_OPTIONS = [
  '200 mg',
  '400 mg',
  '500 mg',
  '5 mg',
  '10 mg',
  '20 mg',
  '1 tablet',
  '2 tablets',
];

const FREQUENCY_OPTIONS = [
  'Once daily',
  'BID',
  'TID',
  'QID',
  'Every 6 hours',
  'Every 8 hours',
  'PRN',
];

const LAB_PRIORITY_OPTIONS = ['Routine', 'Urgent', 'STAT'];

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
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [soapNotes, setSoapNotes] = useState<SoapNote[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<{ filename: string; content: string } | null>(null);
  const [viewingEncounter, setViewingEncounter] = useState<Encounter | null>(null);
  const [viewingSoapNote, setViewingSoapNote] = useState<SoapNote | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [medicationName, setMedicationName] = useState('');
  const [medicationDosage, setMedicationDosage] = useState('');
  const [medicationFrequency, setMedicationFrequency] = useState('');
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const [medicationAiInput, setMedicationAiInput] = useState('');
  const [isParsingMedication, setIsParsingMedication] = useState(false);
  const [isMedicationAiOpen, setIsMedicationAiOpen] = useState(true);
  const [isMedicationManualOpen, setIsMedicationManualOpen] = useState(false);
  const [labTest, setLabTest] = useState('');
  const [labPriority, setLabPriority] = useState('');
  const [labOrders, setLabOrders] = useState<LabOrderItem[]>([]);
  const [labAiInput, setLabAiInput] = useState('');
  const [isParsingLab, setIsParsingLab] = useState(false);
  const [isLabAiOpen, setIsLabAiOpen] = useState(true);
  const [isLabManualOpen, setIsLabManualOpen] = useState(false);
  const [isVitalsDialogOpen, setIsVitalsDialogOpen] = useState(false);
  const [isSavingVitals, setIsSavingVitals] = useState(false);
  const [manualVitals, setManualVitals] = useState<ClinicalDataSources['recent_vitals'] | null>(null);
  const [vitalsForm, setVitalsForm] = useState({
    systolic: '',
    diastolic: '',
    hr: '',
    o2: '',
    weight: '',
    recordedAt: '',
  });
  
  // Symptoms (legacy table, kept for backwards compatibility)
  const [symptoms, setSymptoms] = useState<Array<{ id: string; description: string; onset_date: string | null; severity: number | null }>>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDoctor = profile?.role === 'doctor';
  const recentDays = 60;
  const analysisStorageKey = `docassist:analysis:${patientId}`;

  const formatDisplayDate = (dateValue?: string | null) => {
    if (!dateValue) return 'Unknown date';
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return dateValue;
    return parsed.toLocaleDateString();
  };

  const normalizeMatch = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, '');

  const matchOption = (value: string, options: string[]) => {
    const normalized = normalizeMatch(value);
    return (
      options.find((option) => {
        const optionNormalized = normalizeMatch(option);
        return optionNormalized.includes(normalized) || normalized.includes(optionNormalized);
      }) || ''
    );
  };

  const renderInsightWithSources = (text: string) => {
    const parts = text.split(/(\([^)]*\))/g).filter(Boolean);
    return parts.map((part, index) => {
      const isSource = part.startsWith('(') && part.endsWith(')');
      if (!isSource) {
        return <span key={`text-${index}`}>{part}</span>;
      }
      return (
        <span
          key={`src-${index}`}
          className="inline-block text-[10px] leading-4 bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100 px-1.5 py-0.5 rounded-sm border border-amber-200/60 dark:border-amber-800/60 align-baseline"
        >
          {part}
        </span>
      );
    });
  };

  const buildDataSources = (
    clinicalSummary: Awaited<ReturnType<typeof getPatientClinicalSummary>> | null,
    detectedAlerts: Awaited<ReturnType<typeof getDetectedAlerts>> | null
  ): ClinicalDataSources | null => {
    if (!clinicalSummary) return null;
    return {
      diagnoses: clinicalSummary.diagnoses || [],
      medications: clinicalSummary.medications || [],
      recent_labs: clinicalSummary.recent_labs || [],
      recent_vitals: clinicalSummary.recent_vitals || null,
      active_symptoms: clinicalSummary.active_symptoms || [],
      detected_alerts: detectedAlerts || [],
    };
  };

  const documentItems = useMemo<DocumentItem[]>(() => {
    const encounterById = new Map(encounters.map((encounter) => [encounter.id, encounter]));
    const docs: DocumentItem[] = documents.map((doc) => ({
      kind: 'document',
      id: doc.id,
      title: doc.filename,
      subtitle: doc.doc_type,
      date: doc.created_at,
      document: doc,
    }));
    const encounterItems: DocumentItem[] = encounters.map((encounter) => ({
      kind: 'encounter',
      id: encounter.id,
      title: encounter.chief_complaint || 'Encounter',
      subtitle: [encounter.provider_name, encounter.specialty].filter(Boolean).join(' • ') || 'Encounter',
      date: encounter.encounter_date,
      encounter,
    }));
    const soapItems: DocumentItem[] = soapNotes.map((soap) => {
      const encounter = encounterById.get(soap.encounter_id);
      const soapDate = encounter?.encounter_date || soap.created_at || '';
      const subtitle = [encounter?.provider_name, encounter?.specialty]
        .filter(Boolean)
        .join(' • ') || 'SOAP Note';
      return {
        kind: 'soap',
        id: soap.id,
        title: 'SOAP Note',
        subtitle,
        date: soapDate,
        soapNote: soap,
      };
    });

    return [...docs, ...encounterItems, ...soapItems].sort((a, b) => {
      const aTimeRaw = new Date(a.date).getTime();
      const bTimeRaw = new Date(b.date).getTime();
      const aTime = Number.isNaN(aTimeRaw) ? 0 : aTimeRaw;
      const bTime = Number.isNaN(bTimeRaw) ? 0 : bTimeRaw;
      return bTime - aTime;
    });
  }, [documents, encounters, soapNotes]);

  const saveSessionAnalysis = (payload: {
    brief?: BriefContent | null;
    deepAnalysis?: ClinicalPipelineResult | null;
    evaluations?: EvaluationSummary | null;
    chiefComplaint?: string;
    dataSources?: ClinicalDataSources | null;
    prescriptions?: PrescriptionItem[];
    labOrders?: LabOrderItem[];
  }) => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(
      analysisStorageKey,
      JSON.stringify({
        brief: payload.brief ?? null,
        deepAnalysis: payload.deepAnalysis ?? null,
        evaluations: payload.evaluations ?? null,
        chiefComplaint: payload.chiefComplaint ?? '',
        dataSources: payload.dataSources ?? null,
        prescriptions: payload.prescriptions ?? [],
        labOrders: payload.labOrders ?? [],
      })
    );
  };

  const clearSessionAnalysis = () => {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(analysisStorageKey);
  };

  // View document content
  const handleViewDocument = async (docId: string, filename: string) => {
    setIsLoadingDocument(true);
    try {
      const { data: chunks } = await supabase
        .from('doc_chunks')
        .select('chunk_text')
        .eq('document_id', docId)
        .order('page_num', { ascending: true });
      
      if (chunks && chunks.length > 0) {
        const fullContent = chunks.map(c => c.chunk_text).join('\n\n');
        setViewingDocument({ filename, content: fullContent });
      } else {
        toast.error('Document content not found');
      }
    } catch (error) {
      console.error('Error loading document:', error);
      toast.error('Failed to load document');
    } finally {
      setIsLoadingDocument(false);
    }
  };

  const handleViewItem = (item: DocumentItem) => {
    if (item.kind === 'document') {
      handleViewDocument(item.document.id, item.document.filename);
      return;
    }
    if (item.kind === 'encounter') {
      setViewingEncounter(item.encounter);
      return;
    }
    setViewingSoapNote(item.soapNote);
  };

  // Load documents
  const loadDocuments = async () => {
    const { data } = await supabase
      .from('documents')
      .select('id, filename, doc_type, created_at')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });
    setDocuments(data || []);
  };

  const loadEncounters = async () => {
    const since = new Date();
    since.setDate(since.getDate() - recentDays);
    const sinceDate = since.toISOString().split('T')[0];

    const { data } = await supabase
      .from('encounters')
      .select('id, patient_id, encounter_date, encounter_type, specialty, chief_complaint, provider_name, source_document_id, created_at')
      .eq('patient_id', patientId)
      .gte('encounter_date', sinceDate)
      .order('encounter_date', { ascending: false });
    setEncounters(data || []);
  };

  const loadSoapNotes = async () => {
    const since = new Date();
    since.setDate(since.getDate() - recentDays);
    const sinceIso = since.toISOString();

    const { data } = await supabase
      .from('soap_notes')
      .select('id, encounter_id, patient_id, subjective, objective, assessment, plan, created_by_profile_id, created_at')
      .eq('patient_id', patientId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false });
    setSoapNotes(data || []);
  };

  // Load symptoms from symptoms table (for backwards compatibility)
  const loadSymptoms = async () => {
    const { data } = await supabase
      .from('symptoms')
      .select('id, description, onset_date, severity')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });
    setSymptoms(data || []);
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
      const result = await ingestDocument(file, patientId, profile?.id);
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

  // Load documents, encounters, and symptoms on mount
  useEffect(() => {
    loadDocuments();
    loadEncounters();
    loadSoapNotes();
    loadSymptoms();
  }, [patientId]);

  // Restore analysis for this login session
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = sessionStorage.getItem(analysisStorageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        brief?: BriefContent | null;
        deepAnalysis?: ClinicalPipelineResult | null;
        evaluations?: EvaluationSummary | null;
        chiefComplaint?: string;
        dataSources?: ClinicalDataSources | null;
        prescriptions?: PrescriptionItem[];
        labOrders?: LabOrderItem[];
      };
      if (parsed.brief) setBrief(parsed.brief);
      if (parsed.deepAnalysis) setDeepAnalysis(parsed.deepAnalysis);
      if (parsed.evaluations) setEvaluations(parsed.evaluations);
      if (parsed.chiefComplaint) setChiefComplaint(parsed.chiefComplaint);
      if (parsed.dataSources) setDataSources(parsed.dataSources);
      if (parsed.prescriptions) setPrescriptions(parsed.prescriptions);
      if (parsed.labOrders) setLabOrders(parsed.labOrders);
    } catch (error) {
      console.error('Error restoring session analysis:', error);
    }
  }, [analysisStorageKey]);

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

    return `${patientInfo}${symptomsText}${documentsSection}`;
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
      const nextDataSources = buildDataSources(clinicalSummary, detectedAlerts);
      if (nextDataSources) {
        setDataSources(nextDataSources);
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
        saveSessionAnalysis({
          brief: newBrief,
          evaluations: summary,
          chiefComplaint,
          dataSources: nextDataSources || dataSources,
          prescriptions,
          labOrders,
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
          saveSessionAnalysis({
            deepAnalysis: result,
            brief: quickBrief,
            chiefComplaint,
            dataSources: nextDataSources || dataSources,
            prescriptions,
            labOrders,
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
    setPrescriptions([]);
    setLabOrders([]);
    clearSessionAnalysis();
  };

  const getDefaultVitalsTimestamp = (value?: string | null) => {
    if (!value) return new Date().toISOString().slice(0, 16);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 16);
    return parsed.toISOString().slice(0, 16);
  };

  const parseBp = (bp?: string | null) => {
    if (!bp) return { systolic: '', diastolic: '' };
    const match = bp.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
    if (!match) return { systolic: '', diastolic: '' };
    return { systolic: match[1], diastolic: match[2] };
  };

  const openVitalsDialog = () => {
    const parsedBp = parseBp(manualVitals?.bp);
    setVitalsForm({
      systolic: parsedBp.systolic,
      diastolic: parsedBp.diastolic,
      hr: manualVitals?.hr?.toString() || '',
      o2: manualVitals?.o2?.toString() || '',
      weight: manualVitals?.weight_kg?.toString() || '',
      recordedAt: getDefaultVitalsTimestamp(manualVitals?.date),
    });
    setIsVitalsDialogOpen(true);
  };

  const refreshClinicalSummary = async () => {
    const [clinicalSummary, detectedAlerts] = await Promise.all([
      getPatientClinicalSummary(patientId),
      getDetectedAlerts(patientId),
    ]);
    const nextDataSources = buildDataSources(clinicalSummary, detectedAlerts);
    if (nextDataSources) {
      setDataSources(nextDataSources);
    }
  };

  const toNumberOrNull = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleSaveVitals = async () => {
    if (!isDoctor) return;
    setIsSavingVitals(true);
    try {
      const recordedAt = vitalsForm.recordedAt
        ? new Date(vitalsForm.recordedAt).toISOString()
        : new Date().toISOString();
      const { error } = await supabase.from('vitals' as any).insert({
        patient_id: patientId,
        recorded_at: recordedAt,
        systolic_bp: toNumberOrNull(vitalsForm.systolic),
        diastolic_bp: toNumberOrNull(vitalsForm.diastolic),
        heart_rate: toNumberOrNull(vitalsForm.hr),
        o2_saturation: toNumberOrNull(vitalsForm.o2),
        weight: toNumberOrNull(vitalsForm.weight),
      });

      if (error) throw error;

      setManualVitals({
        bp: vitalsForm.systolic && vitalsForm.diastolic ? `${vitalsForm.systolic}/${vitalsForm.diastolic}` : '',
        hr: toNumberOrNull(vitalsForm.hr) ?? 0,
        o2: toNumberOrNull(vitalsForm.o2) ?? 0,
        weight_kg: toNumberOrNull(vitalsForm.weight) ?? 0,
        date: recordedAt,
      });
      toast.success('Vitals updated');
      setIsVitalsDialogOpen(false);
    } catch (error) {
      console.error('Error saving vitals:', error);
      toast.error('Failed to save vitals');
    } finally {
      setIsSavingVitals(false);
    }
  };

  useEffect(() => {
    if (!isDoctor) return;
    refreshClinicalSummary();
  }, [patientId, isDoctor]);

  const addPrescription = () => {
    if (!medicationName.trim() || !medicationDosage || !medicationFrequency) {
      toast.error('Select medication, dosage, and frequency');
      return;
    }
    setPrescriptions((prev) => {
      const next = [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: medicationName.trim(),
          dosage: medicationDosage,
          frequency: medicationFrequency,
        },
      ];
      saveSessionAnalysis({
        brief,
        deepAnalysis,
        evaluations,
        chiefComplaint,
        dataSources,
        prescriptions: next,
        labOrders,
      });
      return next;
    });
    setMedicationName('');
    setMedicationDosage('');
    setMedicationFrequency('');
  };

  const removePrescription = (id: string) => {
    setPrescriptions((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveSessionAnalysis({
        brief,
        deepAnalysis,
        evaluations,
        chiefComplaint,
        dataSources,
        prescriptions: next,
        labOrders,
      });
      return next;
    });
  };

  const submitPrescriptions = () => {
    if (prescriptions.length === 0) {
      toast.error('Add at least one prescription');
      return;
    }
    saveSessionAnalysis({
      brief,
      deepAnalysis,
      evaluations,
      chiefComplaint,
      dataSources,
      prescriptions,
      labOrders,
    });
    toast.success('Prescriptions saved');
  };

  const addLabOrder = () => {
    if (!labTest || !labPriority) {
      toast.error('Select lab test and priority');
      return;
    }
    setLabOrders((prev) => {
      const next = [
        ...prev,
        {
          id: crypto.randomUUID(),
          test: labTest,
          priority: labPriority,
        },
      ];
      saveSessionAnalysis({
        brief,
        deepAnalysis,
        evaluations,
        chiefComplaint,
        dataSources,
        prescriptions,
        labOrders: next,
      });
      return next;
    });
    setLabTest('');
    setLabPriority('');
  };

  const removeLabOrder = (id: string) => {
    setLabOrders((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveSessionAnalysis({
        brief,
        deepAnalysis,
        evaluations,
        chiefComplaint,
        dataSources,
        prescriptions,
        labOrders: next,
      });
      return next;
    });
  };

  const submitLabOrders = () => {
    if (labOrders.length === 0) {
      toast.error('Add at least one lab order');
      return;
    }
    saveSessionAnalysis({
      brief,
      deepAnalysis,
      evaluations,
      chiefComplaint,
      dataSources,
      prescriptions,
      labOrders,
    });
    toast.success('Lab orders saved');
  };

  const parseMedicationInput = async () => {
    if (!medicationAiInput.trim()) {
      toast.error('Enter a medication request');
      return;
    }
    setIsParsingMedication(true);
    try {
      const result = await parseMedicationOrders(medicationAiInput.trim());
      const parsed = result.medications || [];
      if (parsed.length === 0) {
        toast.error('No medications found');
        return;
      }
      setPrescriptions((prev) => {
        const next = [
          ...prev,
          ...parsed.map((med) => ({
            id: crypto.randomUUID(),
            name: med.name,
            dosage: med.dosage || 'Unspecified',
            frequency: med.frequency || 'Unspecified',
          })),
        ];
        saveSessionAnalysis({
          brief,
          deepAnalysis,
          evaluations,
          chiefComplaint,
          dataSources,
          prescriptions: next,
          labOrders,
        });
        return next;
      });
      setMedicationAiInput('');
      setIsMedicationAiOpen(false);
      toast.success('Medication parsed');
    } catch (error) {
      console.error('Medication parse error:', error);
      toast.error('Failed to parse medication');
    } finally {
      setIsParsingMedication(false);
    }
  };

  const parseLabInput = async () => {
    if (!labAiInput.trim()) {
      toast.error('Enter a lab request');
      return;
    }
    setIsParsingLab(true);
    try {
      const result = await parseLabOrders(labAiInput.trim());
      const parsed = result.labs || [];
      if (parsed.length === 0) {
        toast.error('No labs found');
        return;
      }
      setLabOrders((prev) => {
        const next = [
          ...prev,
          ...parsed.map((lab) => ({
            id: crypto.randomUUID(),
            test: matchOption(lab.test, LAB_TEST_OPTIONS) || lab.test,
            priority: matchOption(lab.priority || '', LAB_PRIORITY_OPTIONS) || 'Routine',
          })),
        ];
        saveSessionAnalysis({
          brief,
          deepAnalysis,
          evaluations,
          chiefComplaint,
          dataSources,
          prescriptions,
          labOrders: next,
        });
        return next;
      });
      setLabAiInput('');
      setIsLabAiOpen(false);
      toast.success('Labs parsed');
    } catch (error) {
      console.error('Lab parse error:', error);
      toast.error('Failed to parse labs');
    } finally {
      setIsParsingLab(false);
    }
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
                prescriptions={prescriptions}
                labOrders={labOrders}
                vitals={manualVitals}
                onSubmitted={async () => {
                  await Promise.all([loadSoapNotes(), loadEncounters()]);
                }}
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

            {/* Clinical Reasoning - Expandable with Citation Validation */}
            {brief?.clinicalInsights && brief.clinicalInsights.length > 0 && (
              <details className="group" open>
                <summary className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Clinical Reasoning
                  </span>
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2 p-4 bg-muted/30 rounded-lg space-y-2">
                  {brief.clinicalInsights.map((insight, i) => (
                    <p key={i} className="text-sm leading-relaxed">
                      • {renderInsightWithSources(insight)}
                    </p>
                  ))}
                </div>
              </details>
            )}

            {evaluations && (
              <div className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg">
                <span className="text-xs text-muted-foreground">AI Confidence</span>
                <Badge variant={evaluations.overallScore >= 0.8 ? 'secondary' : 'destructive'} className="text-xs">
                  {(evaluations.overallScore * 100).toFixed(0)}%
                </Badge>
              </div>
            )}

            {/* Deep Analysis - Expandable */}
            {deepAnalysis && (
              <details className="group">
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

            {/* AI Analysis Assistant - Collapsible */}
            <details className="group">
              <summary className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                <span className="text-sm font-medium flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  AI Analysis Assistant
                </span>
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2">
                <AnalysisChatbot
                  patientId={patientId}
                  patientName={patientName}
                  deepAnalysis={deepAnalysis}
                  brief={brief}
                  dataSources={dataSources}
                  encounters={encounters}
                  soapNotes={soapNotes}
                  vitalsOverride={manualVitals}
                  chiefComplaint={chiefComplaint}
                  clinicalNotes={clinicalNotes}
                  onAnalysisUpdate={setDeepAnalysis}
                />
              </div>
            </details>

            {/* Actions: Medications & Lab Orders */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Clinical Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="flex-1">
                        <Pill className="h-4 w-4 mr-2" />
                        Prescribe Medication
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Prescribe Medication</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="border-b pb-2 text-xs font-medium uppercase text-muted-foreground">
                          Prescription Details
                        </div>
                        <details
                          open={isMedicationAiOpen}
                          onToggle={(event) => setIsMedicationAiOpen(event.currentTarget.open)}
                          className="rounded-lg border border-muted-foreground/20 p-3"
                        >
                          <summary className="text-sm font-medium cursor-pointer">AI parse</summary>
                          <div className="space-y-2 mt-3">
                            <div className="flex items-start gap-2">
                              <Textarea
                                value={medicationAiInput}
                                onChange={(e) => setMedicationAiInput(e.target.value)}
                                placeholder="e.g., Start Advil 400 mg BID for 3 days"
                                rows={2}
                              />
                              <VoiceInputButton
                                onTranscript={setMedicationAiInput}
                                currentValue={medicationAiInput}
                                appendMode={false}
                                size="icon"
                                showStatus={false}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              onClick={parseMedicationInput}
                              disabled={isParsingMedication}
                            >
                              {isParsingMedication ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Parsing...
                                </>
                              ) : (
                                'Parse with AI'
                              )}
                            </Button>
                          </div>
                        </details>
                        <details
                          open={isMedicationManualOpen}
                          onToggle={(event) => setIsMedicationManualOpen(event.currentTarget.open)}
                          className="rounded-lg border border-muted-foreground/20 p-3"
                        >
                          <summary className="text-sm font-medium cursor-pointer">Manual entry</summary>
                          <div className="space-y-4 mt-3">
                            <div>
                              <label className="text-sm font-medium">Medication</label>
                              <div className="flex items-center gap-2">
                                <Input
                                  value={medicationName}
                                  onChange={(e) => setMedicationName(e.target.value)}
                                  placeholder="Type medication name..."
                                />
                                <VoiceInputButton
                                  onTranscript={setMedicationName}
                                  currentValue={medicationName}
                                  appendMode={false}
                                  size="icon"
                                  showStatus={false}
                                />
                              </div>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {COMMON_MEDICATIONS.map((med) => (
                                  <Button
                                    key={med}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => setMedicationName(med)}
                                  >
                                    {med}
                                  </Button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium">Dosage</label>
                              <Select value={medicationDosage} onValueChange={setMedicationDosage}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select dosage" />
                                </SelectTrigger>
                                <SelectContent>
                                  {DOSAGE_OPTIONS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-sm font-medium">Frequency</label>
                              <Select value={medicationFrequency} onValueChange={setMedicationFrequency}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select frequency" />
                                </SelectTrigger>
                                <SelectContent>
                                  {FREQUENCY_OPTIONS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button className="w-full" onClick={addPrescription}>
                              Add Prescription
                            </Button>
                          </div>
                        </details>

                        {prescriptions.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-xs font-medium uppercase text-muted-foreground">Prescriptions</div>
                            <div className="space-y-2">
                              {prescriptions.map((item) => (
                                <div key={item.id} className="flex items-center justify-between rounded border p-2 text-sm">
                                  <div>
                                    <div className="font-medium">{item.name}</div>
                                    <div className="text-xs text-muted-foreground">{item.dosage} • {item.frequency}</div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => removePrescription(item.id)}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <Button variant="outline" className="w-full" onClick={submitPrescriptions}>
                          Submit Prescriptions
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="flex-1">
                        <TestTube className="h-4 w-4 mr-2" />
                        Order Labs
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Order Lab Tests</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="border-b pb-2 text-xs font-medium uppercase text-muted-foreground">
                          Lab Order Details
                        </div>
                        <details
                          open={isLabAiOpen}
                          onToggle={(event) => setIsLabAiOpen(event.currentTarget.open)}
                          className="rounded-lg border border-muted-foreground/20 p-3"
                        >
                          <summary className="text-sm font-medium cursor-pointer">AI parse</summary>
                          <div className="space-y-2 mt-3">
                            <div className="flex items-start gap-2">
                              <Textarea
                                value={labAiInput}
                                onChange={(e) => setLabAiInput(e.target.value)}
                                placeholder="e.g., Order CBC and BMP STAT"
                                rows={2}
                              />
                              <VoiceInputButton
                                onTranscript={setLabAiInput}
                                currentValue={labAiInput}
                                appendMode={false}
                                size="icon"
                                showStatus={false}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              onClick={parseLabInput}
                              disabled={isParsingLab}
                            >
                              {isParsingLab ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Parsing...
                                </>
                              ) : (
                                'Parse with AI'
                              )}
                            </Button>
                          </div>
                        </details>
                        <details
                          open={isLabManualOpen}
                          onToggle={(event) => setIsLabManualOpen(event.currentTarget.open)}
                          className="rounded-lg border border-muted-foreground/20 p-3"
                        >
                          <summary className="text-sm font-medium cursor-pointer">Manual entry</summary>
                          <div className="space-y-4 mt-3">
                            <div>
                              <label className="text-sm font-medium">Lab Test</label>
                              <div className="flex items-center gap-2">
                                <Select value={labTest} onValueChange={setLabTest}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select lab test" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {LAB_TEST_OPTIONS.map((option) => (
                                      <SelectItem key={option} value={option}>
                                        {option}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <VoiceInputButton
                                  onTranscript={(text) => {
                                    const match = matchOption(text, LAB_TEST_OPTIONS);
                                    if (match) {
                                      setLabTest(match);
                                    } else {
                                      toast.error('No matching lab test found');
                                    }
                                  }}
                                  appendMode={false}
                                  size="icon"
                                  showStatus={false}
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium">Priority</label>
                              <Select value={labPriority} onValueChange={setLabPriority}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select priority" />
                                </SelectTrigger>
                                <SelectContent>
                                  {LAB_PRIORITY_OPTIONS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button className="w-full" onClick={addLabOrder}>
                              Add Lab Order
                            </Button>
                          </div>
                        </details>

                        {labOrders.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-xs font-medium uppercase text-muted-foreground">Lab Orders</div>
                            <div className="space-y-2">
                              {labOrders.map((item) => (
                                <div key={item.id} className="flex items-center justify-between rounded border p-2 text-sm">
                                  <div>
                                    <div className="font-medium">{item.test}</div>
                                    <div className="text-xs text-muted-foreground">{item.priority}</div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => removeLabOrder(item.id)}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <Button variant="outline" className="w-full" onClick={submitLabOrders}>
                          Submit Lab Orders
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>

            {(prescriptions.length > 0 || labOrders.length > 0) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Ordered Items</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {prescriptions.length > 0 && (
                    <div>
                      <div className="text-xs font-medium uppercase text-muted-foreground mb-2">Medications</div>
                      <div className="space-y-2">
                        {prescriptions.map((item) => (
                          <div key={item.id} className="flex items-center justify-between rounded border p-2">
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {item.dosage} • {item.frequency}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {labOrders.length > 0 && (
                    <div>
                      <div className="text-xs font-medium uppercase text-muted-foreground mb-2">Lab Orders</div>
                      <div className="space-y-2">
                        {labOrders.map((item) => (
                          <div key={item.id} className="flex items-center justify-between rounded border p-2">
                            <div>
                              <div className="font-medium">{item.test}</div>
                              <div className="text-xs text-muted-foreground">{item.priority}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Patient Details */}
          <div className="space-y-3">
            {/* Vitals - Compact Grid */}
            {(manualVitals || isDoctor) && (
              <Card>
                <CardHeader className="py-2 px-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      Vitals
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {manualVitals?.date && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(manualVitals.date).toLocaleDateString()}
                        </span>
                      )}
                      {isDoctor && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={openVitalsDialog}
                        >
                          Update
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  {manualVitals ? (
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-muted/50 rounded p-2">
                        <div className="text-lg font-bold">{manualVitals.bp || '----'}</div>
                        <div className="text-[10px] text-muted-foreground">BP</div>
                      </div>
                      <div className="bg-muted/50 rounded p-2">
                        <div className="text-lg font-bold">{manualVitals.hr || '----'}</div>
                        <div className="text-[10px] text-muted-foreground">HR</div>
                      </div>
                      <div className="bg-muted/50 rounded p-2">
                        <div className="text-lg font-bold">{manualVitals.o2 ? `${manualVitals.o2}%` : '----'}</div>
                        <div className="text-[10px] text-muted-foreground">SpO2</div>
                      </div>
                      <div className="bg-muted/50 rounded p-2">
                        <div className="text-lg font-bold">{manualVitals.weight_kg || '----'}</div>
                        <div className="text-[10px] text-muted-foreground">kg</div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-muted/50 rounded p-2">
                        <div className="text-lg font-bold">----</div>
                        <div className="text-[10px] text-muted-foreground">BP</div>
                      </div>
                      <div className="bg-muted/50 rounded p-2">
                        <div className="text-lg font-bold">----</div>
                        <div className="text-[10px] text-muted-foreground">HR</div>
                      </div>
                      <div className="bg-muted/50 rounded p-2">
                        <div className="text-lg font-bold">----</div>
                        <div className="text-[10px] text-muted-foreground">SpO2</div>
                      </div>
                      <div className="bg-muted/50 rounded p-2">
                        <div className="text-lg font-bold">----</div>
                        <div className="text-[10px] text-muted-foreground">kg</div>
                      </div>
                    </div>
                  )}
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
                          lab.abnormal ? 'bg-amber-100 dark:bg-amber-900/30' : ''
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className={lab.abnormal ? 'font-medium' : ''}>{lab.name}</span>
                          {lab.date && (
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(lab.date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <span className={`font-mono ${lab.abnormal ? 'text-amber-700 dark:text-amber-400 font-bold' : ''}`}>
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
            {/* Patient Documents - full right column */}
            <Card className="flex flex-col min-h-0">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Documents
                    {documentItems.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] ml-1">{documentItems.length}</Badge>
                    )}
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
              <CardContent className="px-3 pb-3 flex-1 min-h-0 flex flex-col">
                {documentItems.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    <File className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No recent documents or encounters</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[280px] flex-1">
                      <div className="space-y-1">
                        {documentItems.map((item) => (
                          <div
                            key={`${item.kind}-${item.id}`}
                            className="flex items-center justify-between text-sm p-2 rounded hover:bg-muted/50 group"
                          >
                            <div
                              className="flex flex-col gap-0.5 truncate flex-1 cursor-pointer"
                              onClick={() => handleViewItem(item)}
                            >
                              <div className="flex items-center gap-2 truncate">
                                {item.kind === 'document' && <File className="h-3 w-3 flex-shrink-0" />}
                                {item.kind === 'encounter' && <Stethoscope className="h-3 w-3 flex-shrink-0" />}
                                {item.kind === 'soap' && <FileText className="h-3 w-3 flex-shrink-0" />}
                                <span className="truncate text-xs hover:underline">{item.title}</span>
                                <Badge variant="outline" className="text-[9px] h-4">
                                  {item.kind === 'document' ? 'Document' : item.kind === 'encounter' ? 'Encounter' : 'SOAP'}
                                </Badge>
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {item.subtitle}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatDisplayDate(item.date)}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleViewItem(item)}
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                              {isDoctor && item.kind === 'document' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600"
                                  onClick={() => handleDeleteDocument(item.document.id, item.document.filename)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Document Viewer Modal */}
        <Dialog open={!!viewingDocument} onOpenChange={() => setViewingDocument(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {viewingDocument?.filename}
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[60vh] mt-4">
              <pre className="text-sm whitespace-pre-wrap font-mono bg-muted/50 p-4 rounded-lg">
                {viewingDocument?.content}
              </pre>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <Dialog open={isVitalsDialogOpen} onOpenChange={setIsVitalsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Update Vitals</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Systolic BP</label>
                <Input
                  type="number"
                  value={vitalsForm.systolic}
                  onChange={(e) => setVitalsForm((prev) => ({ ...prev, systolic: e.target.value }))}
                  placeholder="e.g., 120"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Diastolic BP</label>
                <Input
                  type="number"
                  value={vitalsForm.diastolic}
                  onChange={(e) => setVitalsForm((prev) => ({ ...prev, diastolic: e.target.value }))}
                  placeholder="e.g., 80"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Heart Rate</label>
                <Input
                  type="number"
                  value={vitalsForm.hr}
                  onChange={(e) => setVitalsForm((prev) => ({ ...prev, hr: e.target.value }))}
                  placeholder="e.g., 72"
                />
              </div>
              <div>
                <label className="text-sm font-medium">SpO2 %</label>
                <Input
                  type="number"
                  value={vitalsForm.o2}
                  onChange={(e) => setVitalsForm((prev) => ({ ...prev, o2: e.target.value }))}
                  placeholder="e.g., 98"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Weight (kg)</label>
                <Input
                  type="number"
                  value={vitalsForm.weight}
                  onChange={(e) => setVitalsForm((prev) => ({ ...prev, weight: e.target.value }))}
                  placeholder="e.g., 70"
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Recorded At</label>
                <Input
                  type="datetime-local"
                  value={vitalsForm.recordedAt}
                  onChange={(e) => setVitalsForm((prev) => ({ ...prev, recordedAt: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsVitalsDialogOpen(false)} disabled={isSavingVitals}>
                Cancel
              </Button>
              <Button onClick={handleSaveVitals} disabled={isSavingVitals}>
                {isSavingVitals ? 'Saving...' : 'Save Vitals'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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

      {/* Patient Documents - full width */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documents
              {documentItems.length > 0 && (
                <Badge variant="secondary" className="text-xs">{documentItems.length}</Badge>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {documentItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <File className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No recent documents or encounters</p>
            </div>
          ) : (
            <ScrollArea className="h-[280px]">
                <div className="space-y-2">
                  {documentItems.map((item) => (
                    <div
                      key={`${item.kind}-${item.id}`}
                      className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 group"
                    >
                      <div
                        className="flex flex-col gap-0.5 truncate flex-1 cursor-pointer"
                        onClick={() => handleViewItem(item)}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {item.kind === 'document' && <File className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                          {item.kind === 'encounter' && <Stethoscope className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                          {item.kind === 'soap' && <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                          <span className="truncate text-sm hover:underline">{item.title}</span>
                          <Badge variant="outline" className="text-[10px] h-4">
                            {item.kind === 'document' ? 'Document' : item.kind === 'encounter' ? 'Encounter' : 'SOAP'}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {item.subtitle}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatDisplayDate(item.date)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleViewItem(item)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {isDoctor && item.kind === 'document' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-600"
                            onClick={() => handleDeleteDocument(item.document.id, item.document.filename)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <label className="text-sm font-medium mb-2 block">
            Chief Complaint (Optional - auto-extracted from notes)
          </label>
          <div className="flex gap-2">
            <Input
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder="e.g., Chest pain, Headache, Abdominal pain..."
              className="flex-1"
            />
            <VoiceInputButton
              onTranscript={setChiefComplaint}
              currentValue={chiefComplaint}
              appendMode={false}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            <Mic className="h-3 w-3 inline mr-1" />
            Click the mic to dictate
          </p>
        </CardContent>
      </Card>

      {isDoctor && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Vitals
              </span>
              <Button variant="outline" size="sm" onClick={openVitalsDialog}>
                Update Vitals
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {manualVitals ? (
              <div className="flex flex-wrap gap-4 text-muted-foreground">
                <span>BP {manualVitals.bp || '----'}</span>
                <span>HR {manualVitals.hr || '----'}</span>
                <span>SpO2 {manualVitals.o2 ? `${manualVitals.o2}%` : '----'}</span>
                <span>Wt {manualVitals.weight_kg || '----'} kg</span>
                {manualVitals.date && (
                  <span>{new Date(manualVitals.date).toLocaleDateString()}</span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-4 text-muted-foreground">
                <span>BP ----</span>
                <span>HR ----</span>
                <span>SpO2 ----</span>
                <span>Wt ---- kg</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

      {/* Document Viewer Modal for pre-analysis view */}
      <Dialog open={!!viewingDocument} onOpenChange={() => setViewingDocument(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {viewingDocument?.filename}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] mt-4">
            <pre className="text-sm whitespace-pre-wrap font-mono bg-muted/50 p-4 rounded-lg">
              {viewingDocument?.content}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={isVitalsDialogOpen} onOpenChange={setIsVitalsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update Vitals</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Systolic BP</label>
              <Input
                type="number"
                value={vitalsForm.systolic}
                onChange={(e) => setVitalsForm((prev) => ({ ...prev, systolic: e.target.value }))}
                placeholder="e.g., 120"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Diastolic BP</label>
              <Input
                type="number"
                value={vitalsForm.diastolic}
                onChange={(e) => setVitalsForm((prev) => ({ ...prev, diastolic: e.target.value }))}
                placeholder="e.g., 80"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Heart Rate</label>
              <Input
                type="number"
                value={vitalsForm.hr}
                onChange={(e) => setVitalsForm((prev) => ({ ...prev, hr: e.target.value }))}
                placeholder="e.g., 72"
              />
            </div>
            <div>
              <label className="text-sm font-medium">SpO2 %</label>
              <Input
                type="number"
                value={vitalsForm.o2}
                onChange={(e) => setVitalsForm((prev) => ({ ...prev, o2: e.target.value }))}
                placeholder="e.g., 98"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Weight (kg)</label>
              <Input
                type="number"
                value={vitalsForm.weight}
                onChange={(e) => setVitalsForm((prev) => ({ ...prev, weight: e.target.value }))}
                placeholder="e.g., 70"
              />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Recorded At</label>
              <Input
                type="datetime-local"
                value={vitalsForm.recordedAt}
                onChange={(e) => setVitalsForm((prev) => ({ ...prev, recordedAt: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsVitalsDialogOpen(false)} disabled={isSavingVitals}>
              Cancel
            </Button>
            <Button onClick={handleSaveVitals} disabled={isSavingVitals}>
              {isSavingVitals ? 'Saving...' : 'Save Vitals'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingEncounter} onOpenChange={() => setViewingEncounter(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Encounter Details
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] mt-4">
            {viewingEncounter && (
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Encounter date</span>
                  <span className="font-medium">{formatDisplayDate(viewingEncounter.encounter_date)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium">{viewingEncounter.encounter_type}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Specialty</span>
                  <span className="font-medium">{viewingEncounter.specialty}</span>
                </div>
                {viewingEncounter.provider_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Provider</span>
                    <span className="font-medium">{viewingEncounter.provider_name}</span>
                  </div>
                )}
                {viewingEncounter.chief_complaint && (
                  <div>
                    <span className="text-muted-foreground block mb-1">Chief complaint</span>
                    <div className="bg-muted/50 p-3 rounded-lg">{viewingEncounter.chief_complaint}</div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingSoapNote} onOpenChange={() => setViewingSoapNote(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              SOAP Note
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] mt-4">
            {viewingSoapNote && (
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-medium">{formatDisplayDate(viewingSoapNote.created_at)}</span>
                </div>
                {viewingSoapNote.subjective && (
                  <div>
                    <span className="text-muted-foreground block mb-1">Subjective</span>
                    <div className="bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">
                      {viewingSoapNote.subjective}
                    </div>
                  </div>
                )}
                {viewingSoapNote.objective && (
                  <div>
                    <span className="text-muted-foreground block mb-1">Objective</span>
                    <pre className="bg-muted/50 p-3 rounded-lg text-xs whitespace-pre-wrap font-mono">
                      {JSON.stringify(viewingSoapNote.objective, null, 2)}
                    </pre>
                  </div>
                )}
                {viewingSoapNote.assessment && (
                  <div>
                    <span className="text-muted-foreground block mb-1">Assessment</span>
                    <div className="bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">
                      {viewingSoapNote.assessment}
                    </div>
                  </div>
                )}
                {viewingSoapNote.plan && (
                  <div>
                    <span className="text-muted-foreground block mb-1">Plan</span>
                    <div className="bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">
                      {viewingSoapNote.plan}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
