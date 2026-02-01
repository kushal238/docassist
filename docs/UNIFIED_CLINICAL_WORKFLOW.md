# Unified Clinical Workflow with Voice Input

## Overview

Merge `ClinicalBriefTab` and `DeepAnalysisTab` into a single, voice-first workflow that doctors can interact with naturally without switching tabs or modes.

---

## 🎯 Design Goals

1. **Single Workflow** - One component, one flow, no mode switching
2. **Voice-First** - Doctor speaks clinical notes, AI transcribes
3. **Smart Analysis** - Automatically runs appropriate depth based on input complexity
4. **Seamless** - Minimal cognitive load, no tab juggling

---

## 🗣️ Voice Input Flow

### Current Patient Voice System (Reference)
```
Patient opens "Voice Symptom Check"
    ↓
6-step guided questions:
  1. Primary symptom?
  2. When did it start?
  3. Severity (1-10)?
  4. Getting better/worse?
  5. Other symptoms?
  6. Any red flags?
    ↓
Review & edit
    ↓
Submit structured data
```

### New Doctor Voice System (Proposed)

```
Doctor opens patient chart
    ↓
Single voice session - speaks freely:
  "58-year-old male, HTN on lisinopril,
   presenting with chest pain radiating to
   left arm, 2 hours duration, 6/10 severity,
   associated diaphoresis..."
    ↓
AI transcribes in real-time
    ↓
Doctor can edit transcript or continue speaking
    ↓
Click "Analyze" → Runs unified analysis
    ↓
Shows Brief + Deep Reasoning in single view
```

**Key Differences:**
- **Patient**: Structured Q&A (guided)
- **Doctor**: Free-form dictation (professional)

---

## 📋 Merged Component Structure

### File: `src/components/doctor/UnifiedClinicalAnalysis.tsx`

**Sections:**

1. **Voice Input Area**
   - Record button (large, prominent)
   - Live transcript display (editable)
   - Chief complaint extraction (AI-powered)

2. **Analysis Controls**
   - "Analyze" button (triggers unified analysis)
   - Analysis mode indicator (auto-selected based on complexity)
   - Progress indicator

3. **Results Display**
   - **Quick Summary** (top section)
     - Differential diagnoses
     - Safety alerts
     - Key findings

   - **Detailed Reasoning** (expandable)
     - Chain-of-thought logic
     - Evidence citations
     - Confidence scores

   - **SOAP Note Generator** (side panel)
     - One-click SOAP generation
     - Export options

---

## 🔧 Implementation Plan

### Step 1: Create Voice Recording Component for Doctors

```tsx
// File: src/components/doctor/VoiceClinicalInput.tsx

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { transcribeAudio } from '@/lib/keywords-ai-speech';
import { toast } from 'sonner';

interface VoiceClinicalInputProps {
  value: string;
  onChange: (transcript: string) => void;
  onChiefComplaintExtracted?: (complaint: string) => void;
}

export default function VoiceClinicalInput({
  value,
  onChange,
  onChiefComplaintExtracted
}: VoiceClinicalInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    requestMicrophonePermission();
    return () => cleanup();
  }, []);

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionGranted(true);
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      toast.error('Microphone permission denied');
      setMicPermissionGranted(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeRecording(audioBlob);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err) {
      toast.error('Failed to start recording');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsTranscribing(true);
    }
  };

  const transcribeRecording = async (audioBlob: Blob) => {
    try {
      const response = await transcribeAudio(audioBlob, 'audio/webm');

      if (!response.transcript || response.transcript.trim() === '') {
        toast.error('No speech detected');
        setIsTranscribing(false);
        return;
      }

      const newTranscript = response.transcript.trim();

      // Append to existing transcript (continuous dictation)
      const updatedTranscript = value
        ? `${value}\n\n${newTranscript}`
        : newTranscript;

      onChange(updatedTranscript);

      // Auto-extract chief complaint from first sentence if not already set
      if (!value && onChiefComplaintExtracted) {
        extractChiefComplaint(newTranscript);
      }

      setIsTranscribing(false);
      toast.success('Transcribed successfully');
    } catch (err) {
      toast.error('Transcription failed');
      setIsTranscribing(false);
    }
  };

  const extractChiefComplaint = async (transcript: string) => {
    // Simple extraction: look for common patterns
    // "presenting with X", "complaint of X", "reports X"
    const patterns = [
      /presenting with (.+?)(?:[.,]|$)/i,
      /complaint of (.+?)(?:[.,]|$)/i,
      /reports (.+?)(?:[.,]|$)/i,
      /complaining of (.+?)(?:[.,]|$)/i,
    ];

    for (const pattern of patterns) {
      const match = transcript.match(pattern);
      if (match && match[1]) {
        onChiefComplaintExtracted?.(match[1].trim());
        return;
      }
    }

    // Fallback: use first sentence
    const firstSentence = transcript.split(/[.!?]/)[0];
    if (firstSentence && firstSentence.length > 10) {
      onChiefComplaintExtracted?.(firstSentence.trim());
    }
  };

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Clinical Notes</h3>

        <div className="flex items-center gap-2">
          {isRecording && (
            <div className="flex items-center gap-2 text-destructive">
              <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-xs font-medium">Recording...</span>
            </div>
          )}

          {isTranscribing && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-xs">Transcribing...</span>
            </div>
          )}

          <Button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isTranscribing || !micPermissionGranted}
            variant={isRecording ? 'destructive' : 'default'}
            size="sm"
          >
            {isRecording ? (
              <>
                <MicOff className="h-4 w-4 mr-2" />
                Stop
              </>
            ) : (
              <>
                <Mic className="h-4 w-4 mr-2" />
                Record
              </>
            )}
          </Button>
        </div>
      </div>

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Click Record to dictate clinical notes, or type here...

Example:
58-year-old male with HTN on lisinopril, presenting with chest pain radiating to left arm, 2 hours duration, 6/10 severity, associated diaphoresis and shortness of breath. Vitals: BP 158/92, HR 88..."
        rows={8}
        className="font-mono text-sm"
      />

      <p className="text-xs text-muted-foreground">
        💡 Speak naturally - record multiple times to build your note, or type directly.
      </p>
    </Card>
  );
}
```

---

### Step 2: Create Unified Analysis Component

```tsx
// File: src/components/doctor/UnifiedClinicalAnalysis.tsx

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
  ChevronUp
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
  patientName
}: UnifiedClinicalAnalysisProps) {
  const { profile } = useAuth();

  // Input state
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisDepth, setAnalysisDepth] = useState<AnalysisDepth>('quick');
  const [currentStage, setCurrentStage] = useState<string | null>(null);

  // Results state
  const [brief, setBrief] = useState<BriefContent | null>(null);
  const [deepAnalysis, setDeepAnalysis] = useState<ClinicalPipelineResult | null>(null);
  const [evaluations, setEvaluations] = useState<EvaluationSummary | null>(null);

  // UI state
  const [showReasoningDetails, setShowReasoningDetails] = useState(false);

  const determineAnalysisDepth = (notes: string): AnalysisDepth => {
    // Auto-determine depth based on note complexity
    const wordCount = notes.trim().split(/\s+/).length;
    const hasComplexTerms = /differential|diagnosis|workup|assessment/i.test(notes);
    const hasMultipleSystems = (notes.match(/pain|fever|cough|nausea/gi) || []).length > 2;

    // Use deep analysis for complex cases
    if (wordCount > 100 || hasComplexTerms || hasMultipleSystems) {
      return 'deep';
    }

    return 'quick';
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
        // Quick Brief with Evaluations
        setCurrentStage('Generating clinical brief...');

        const { brief: newBrief, summary } = await generateGeminiBriefWithEval(
          clinicalNotes,
          chiefComplaint || undefined,
          undefined,
          { patientId, doctorId: profile?.id }
        );

        setBrief(newBrief);
        setEvaluations(summary);

        // Save to database
        await supabase.from('briefs').insert({
          patient_id: patientId,
          created_by_profile_id: profile?.id,
          content_json: JSON.parse(JSON.stringify({
            type: 'quick_brief_with_eval',
            brief: newBrief,
            evaluations: summary,
            chiefComplaint,
          })),
        });

        toast.success(`Smart brief generated (${(summary.overallScore * 100).toFixed(0)}% quality)`);
      } else {
        // Deep Analysis Pipeline
        setCurrentStage('Running deep analysis pipeline...');

        const result = await runClinicalPipeline(
          clinicalNotes,
          chiefComplaint || 'General clinical assessment'
        );

        if (result.success) {
          setDeepAnalysis(result);

          // Also generate quick brief for SOAP notes
          setCurrentStage('Generating summary brief...');
          const quickBrief = await generateBrief(
            patientId,
            chiefComplaint || undefined,
            clinicalNotes
          );
          setBrief(quickBrief);

          // Save to database
          await supabase.from('briefs').insert({
            patient_id: patientId,
            created_by_profile_id: profile?.id,
            content_json: JSON.parse(JSON.stringify({
              type: 'deep_analysis',
              deep: result,
              brief: quickBrief,
              chiefComplaint,
            })),
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

  // Show results if we have them
  if (brief || deepAnalysis) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Clinical Analysis</h2>
            {chiefComplaint && (
              <p className="text-sm text-muted-foreground mt-1">
                Chief Complaint: <span className="font-medium">{chiefComplaint}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Analysis Mode Badge */}
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

            {/* Evaluation Score */}
            {evaluations && (
              <Badge
                variant={evaluations.needsReview ? 'destructive' : 'success'}
                className="text-xs"
              >
                Quality: {(evaluations.overallScore * 100).toFixed(0)}%
                {evaluations.needsReview && ' ⚠️'}
              </Badge>
            )}

            {/* SOAP Generator */}
            {brief && (
              <SOAPNoteGenerator
                patientId={patientId}
                brief={brief}
                patientName={patientName}
              />
            )}

            {/* New Analysis */}
            <Button variant="outline" onClick={handleReset}>
              <Sparkles className="h-4 w-4 mr-2" />
              New Analysis
            </Button>
          </div>
        </div>

        {/* Results Tabs */}
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="reasoning">
              Reasoning {deepAnalysis && '(Deep)'}
            </TabsTrigger>
            <TabsTrigger value="evaluations">Quality</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-4">
            {brief && (
              <>
                {/* Quick Brief Content */}
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

                {/* Differential Diagnoses */}
                {brief.differentialConsiderations && brief.differentialConsiderations.length > 0 && (
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

                {/* Safety Alerts */}
                {brief.safetyAlerts && brief.safetyAlerts.length > 0 && (
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

                {/* Recommendations */}
                {brief.actionableRecommendations && brief.actionableRecommendations.length > 0 && (
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

            {/* Deep Analysis Report */}
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
                    <div className="whitespace-pre-wrap text-sm">
                      {deepAnalysis.report}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Reasoning Tab */}
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

                      {/* Extracted History */}
                      <details className="bg-muted p-3 rounded">
                        <summary className="cursor-pointer font-medium text-sm">
                          Stage 1: Extracted History
                        </summary>
                        <pre className="mt-2 text-xs overflow-auto">
                          {JSON.stringify(deepAnalysis.trace_data.extractedHistory, null, 2)}
                        </pre>
                      </details>

                      {/* Filtered Findings */}
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

          {/* Evaluations Tab */}
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
                      <Badge variant={evaluations.needsReview ? 'destructive' : 'success'}>
                        {(evaluations.overallScore * 100).toFixed(0)}%
                      </Badge>
                    </div>

                    {evaluations.safetyScore !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Safety Check</span>
                        <Badge variant={evaluations.safetyScore >= 0.8 ? 'success' : 'warning'}>
                          {(evaluations.safetyScore * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    )}

                    {evaluations.hallucinationScore !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Accuracy Check</span>
                        <Badge variant={evaluations.hallucinationScore >= 0.8 ? 'success' : 'warning'}>
                          {(evaluations.hallucinationScore * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {evaluations.flaggedIssues.length > 0 && (
                  <Card className="border-l-4 border-l-warning">
                    <CardHeader>
                      <CardTitle className="text-base text-warning">Flagged for Review</CardTitle>
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

  // Show loading state
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

  // Show input form
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold">Clinical Analysis</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Use voice or text to document patient presentation. AI will analyze complexity
          and run appropriate analysis depth automatically.
        </p>
      </div>

      {/* Chief Complaint */}
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

      {/* Voice Clinical Input */}
      <VoiceClinicalInput
        value={clinicalNotes}
        onChange={setClinicalNotes}
        onChiefComplaintExtracted={setChiefComplaint}
      />

      {/* Analyze Button */}
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
```

---

### Step 3: Replace Tabs in DoctorDashboard

```tsx
// File: src/pages/DoctorDashboard.tsx

// BEFORE: Multiple tabs
<Tabs defaultValue="brief">
  <TabsList>
    <TabsTrigger value="brief">Clinical Brief</TabsTrigger>
    <TabsTrigger value="deep">Deep Analysis</TabsTrigger>
    <TabsTrigger value="chat">Chat</TabsTrigger>
    <TabsTrigger value="documents">Documents</TabsTrigger>
  </TabsList>

  <TabsContent value="brief">
    <ClinicalBriefTab ... />
  </TabsContent>

  <TabsContent value="deep">
    <DeepAnalysisTab ... />
  </TabsContent>

  // ...
</Tabs>

// AFTER: Unified workflow
<Tabs defaultValue="analysis">
  <TabsList>
    <TabsTrigger value="analysis">Analysis</TabsTrigger>
    <TabsTrigger value="chat">Chat</TabsTrigger>
    <TabsTrigger value="history">History</TabsTrigger>
  </TabsList>

  <TabsContent value="analysis">
    <UnifiedClinicalAnalysis
      patientId={selectedPatientId}
      patientName={selectedPatient?.full_name}
    />
  </TabsContent>

  // ...
</Tabs>
```

---

## 🎯 Key Features

### 1. **Voice-First Experience**
- Large record button (visual prominence)
- Continuous dictation (multiple recordings append)
- Real-time transcript editing
- Auto-extraction of chief complaint

### 2. **Smart Depth Selection**
- Analyzes note complexity automatically
- Simple cases → Quick brief (5-10s)
- Complex cases → Deep analysis (15-30s)
- Shows depth badge in results

### 3. **Unified Results View**
- **Summary Tab**: Quick brief + differential
- **Reasoning Tab**: Chain-of-thought (deep analysis only)
- **Quality Tab**: Evaluation scores
- All in one place, no tab switching

### 4. **Model Configuration**
```typescript
// Update all LLM calls to use gpt-5.2
const DEFAULT_MODEL = "gpt-5.2";
```

---

## 📊 User Flow Comparison

### Before (Fragmented):
```
Doctor opens patient
    ↓
Types complaint
    ↓
Types clinical notes
    ↓
Chooses: Brief OR Deep Analysis?
    ↓
[If Brief]               [If Deep]
Generate brief           Enter notes again
  ↓                        ↓
Generate SOAP            Wait 30-60s
  ↓                        ↓
Done                     Review trace
                           ↓
                         No SOAP option!
```

### After (Unified):
```
Doctor opens patient
    ↓
Clicks Record button
    ↓
Speaks clinical presentation
    ↓
Edits transcript if needed
    ↓
Clicks "Analyze"
    ↓
[AI auto-determines depth]
    ↓
Shows unified results:
  - Summary
  - Reasoning (if deep)
  - Quality scores
  - SOAP generator
    ↓
Done!
```

---

## 🔧 Implementation Checklist

### Phase 1: Voice Infrastructure (Day 1)
- [ ] Create `VoiceClinicalInput.tsx` component
- [ ] Test voice recording and transcription
- [ ] Implement auto-chief complaint extraction
- [ ] Test continuous dictation (multiple recordings)

### Phase 2: Unified Component (Day 1-2)
- [ ] Create `UnifiedClinicalAnalysis.tsx`
- [ ] Implement auto-depth determination
- [ ] Integrate quick brief + evaluations
- [ ] Integrate deep analysis pipeline
- [ ] Create tabbed results view

### Phase 3: Integration (Day 2)
- [ ] Update `DoctorDashboard.tsx` to use unified component
- [ ] Remove old `ClinicalBriefTab.tsx` and `DeepAnalysisTab.tsx`
- [ ] Test complete workflow end-to-end
- [ ] Update model to `gpt-5.2`

### Phase 4: Polish (Day 2)
- [ ] Add helpful tooltips and guidance
- [ ] Improve loading states
- [ ] Add keyboard shortcuts (Space = record toggle)
- [ ] Test on different browsers

---

## 🎬 Demo Script (3 minutes)

**Setup** (Pre-demo):
- Patient "John Anderson" (STEMI case) pre-loaded
- Microphone tested and working

**Live Demo**:

1. **Open patient** (5s)
   - "Let me show you our unified clinical workflow"

2. **Voice dictation** (30s)
   - Click Record
   - Speak: "58-year-old male with history of hypertension on lisinopril, presenting with substernal chest pain radiating to left arm, started 2 hours ago during snow shoveling, 6 out of 10 severity, associated with diaphoresis and shortness of breath"
   - Stop recording
   - Show transcript appears

3. **Analyze** (10s)
   - Click "Analyze"
   - Point out: "AI automatically determines this is complex - running deep analysis"
   - Show progress indicator

4. **Results** (60s)
   - Summary tab: Differential diagnoses, safety alerts
   - Reasoning tab: "See the chain-of-thought - exactly how it reasoned through this case"
   - Quality tab: "92% safety score, 88% accuracy - passed automated checks"
   - Click "Generate SOAP Note" → instant documentation

5. **Wrap-up** (30s)
   - "One workflow, voice-first, automatic complexity detection"
   - "Keywords AI powers every step: speech-to-text, analysis, evaluations"
   - "This is production-ready clinical AI"

---

## 🚀 Next Steps

After implementing unified workflow:
1. Add background processing (Priority 3 from original plan)
2. Implement mock data seeding (no document uploads)
3. Performance optimization (caching, parallelization)

**Ready to start implementation?**
