import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Loader2,
  Sparkles,
  Brain,
  Activity,
  FileText,
  ChevronRight,
  Mic,
} from 'lucide-react';
import VoiceInputButton from '@/components/doctor/VoiceInputButton';
import { toast } from 'sonner';
import { useClinicalPipeline } from '@/hooks/useClinicalPipeline';
import PipelineResultView, { PipelineErrorView } from '@/components/doctor/PipelineResultView';

interface DeepAnalysisTabProps {
  patientId: string;
  patientName?: string;
}

const SUGGESTED_COMPLAINTS = [
  'Chest pain',
  'Shortness of breath',
  'Headache',
  'Abdominal pain',
  'Fatigue',
  'Dizziness',
  'Back pain',
  'Joint pain',
];

const PIPELINE_STAGES = [
  { name: 'History Extraction', description: 'Converting unstructured notes to structured data' },
  { name: 'Relevance Filtering', description: 'Filtering data based on chief complaint' },
  { name: 'Clinical Reasoning', description: 'Generating chain-of-thought analysis' },
  { name: 'Synthesis', description: 'Creating physician-facing report' },
];

/**
 * Deep Analysis Tab - Uses the 4-stage clinical pipeline for comprehensive analysis.
 * 
 * This provides a more thorough analysis than the quick brief, showing the AI's
 * reasoning process transparently.
 */
export default function DeepAnalysisTab({ patientId, patientName }: DeepAnalysisTabProps) {
  const { profile } = useAuth();
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  
  const {
    result,
    isLoading,
    error,
    currentStage,
    runAnalysis,
    reset,
  } = useClinicalPipeline();

  const handleRunPipeline = async () => {
    if (!chiefComplaint.trim()) {
      toast.error('Please enter a chief complaint');
      return;
    }

    // Fetch patient documents/notes to use as raw notes
    let rawNotes = clinicalNotes || '';
    
    try {
      // Try to fetch existing patient data
      const { data: patient } = await supabase
        .from('patients')
        .select('full_name, dob')
        .eq('id', patientId)
        .single();
      
      // Fetch any existing briefs for context
      const { data: briefs } = await supabase
        .from('briefs')
        .select('content_json')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1);

      // Build comprehensive notes
      const patientInfo = patient 
        ? `Patient: ${patient.full_name}, DOB: ${patient.dob}` 
        : '';
      
      const existingBriefData = briefs?.[0]?.content_json
        ? `\n\nPrevious Clinical Data:\n${JSON.stringify(briefs[0].content_json, null, 2)}`
        : '';

      rawNotes = `${patientInfo}\n\nClinical Notes:\n${clinicalNotes || 'No additional notes provided.'}\n${existingBriefData}`;

    } catch (err) {
      console.warn('Could not fetch patient context:', err);
      rawNotes = clinicalNotes || 'No patient notes available.';
    }

    const pipelineResult = await runAnalysis(rawNotes, chiefComplaint);

    if (pipelineResult) {
      toast.success('Deep analysis complete');
      
      // Save the analysis to the database
      try {
        await supabase.from('briefs').insert({
          patient_id: patientId,
          created_by_profile_id: profile?.id,
          content_json: JSON.parse(JSON.stringify({
            type: 'deep_analysis',
            finalReport: pipelineResult.report,
            traceData: pipelineResult.trace_data,
            metadata: pipelineResult.metadata,
            chiefComplaint,
          })),
        });
      } catch (saveError) {
        console.error('Failed to save analysis:', saveError);
      }
    }
  };

  const handleReset = () => {
    reset();
    setChiefComplaint('');
    setClinicalNotes('');
  };

  // Calculate progress based on current stage
  const getProgress = () => {
    if (!isLoading) return 0;
    const stageIndex = PIPELINE_STAGES.findIndex(s => 
      currentStage?.includes(s.name.split(' ')[0])
    );
    return stageIndex >= 0 ? ((stageIndex + 1) / PIPELINE_STAGES.length) * 100 : 25;
  };

  // Show results if we have them
  if (result) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Deep Clinical Analysis
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Chief Complaint: <span className="font-medium">{chiefComplaint}</span>
            </p>
          </div>
          <Button variant="outline" onClick={handleReset}>
            <Sparkles className="h-4 w-4 mr-2" />
            New Analysis
          </Button>
        </div>

        <PipelineResultView result={result} />
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="space-y-6">
        <PipelineErrorView error={error} onRetry={handleRunPipeline} />
        <Button variant="outline" onClick={handleReset}>
          Start Over
        </Button>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <div className="rounded-full bg-primary/10 p-6 animate-pulse">
          <Brain className="h-12 w-12 text-primary" />
        </div>
        
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-2">Running Deep Analysis</h3>
          <p className="text-muted-foreground">{currentStage || 'Initializing...'}</p>
        </div>

        <div className="w-full max-w-md space-y-4">
          <Progress value={getProgress()} className="h-2" />
          
          <div className="grid gap-2">
            {PIPELINE_STAGES.map((stage, index) => {
              const isActive = currentStage?.includes(stage.name.split(' ')[0]);
              const isComplete = result?.metadata.stagesCompleted.includes(
                stage.name.toLowerCase().replace(' ', '_')
              );
              
              return (
                <div
                  key={stage.name}
                  className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    isActive 
                      ? 'bg-primary/10 border border-primary/20' 
                      : isComplete 
                        ? 'bg-green-500/10' 
                        : 'bg-muted/30'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    isActive 
                      ? 'bg-primary text-primary-foreground' 
                      : isComplete 
                        ? 'bg-green-500 text-white' 
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {isActive ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${isActive ? 'text-primary' : ''}`}>
                      {stage.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{stage.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          This may take 30-60 seconds for thorough analysis
        </p>
      </div>
    );
  }

  // Show input form
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="rounded-full bg-primary/10 p-6 mb-6">
        <Brain className="h-12 w-12 text-primary" />
      </div>
      
      <h3 className="text-xl font-semibold mb-2">Deep Clinical Analysis</h3>
      <p className="text-muted-foreground text-center max-w-lg mb-6">
        Run a comprehensive 4-stage AI analysis pipeline that extracts structured history,
        filters for relevance, generates clinical reasoning, and synthesizes a detailed report.
      </p>

      {/* Pipeline Stages Preview */}
      <Card className="w-full max-w-md mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Analysis Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={stage.name} className="flex items-center gap-1">
                <span className="font-medium">{i + 1}. {stage.name.split(' ')[0]}</span>
                {i < PIPELINE_STAGES.length - 1 && (
                  <ChevronRight className="h-3 w-3" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="w-full max-w-md space-y-4 mb-6">
        <div>
          <label className="text-sm font-medium mb-2 block">
            Chief Complaint <span className="text-destructive">*</span>
          </label>
          <div className="flex gap-2">
            <Input
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder="e.g., Chest pain radiating to left arm..."
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
            Click the mic to dictate the chief complaint
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {SUGGESTED_COMPLAINTS.map((complaint) => (
              <Badge
                key={complaint}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => setChiefComplaint(complaint)}
              >
                {complaint}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">
            Clinical Notes / Patient History
          </label>
          <Textarea
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value)}
            placeholder={`Enter patient's medical history, current symptoms, medications, vitals, etc.

Example:
- 58yo male, HTN x 10 years
- Type 2 DM, on metformin
- Former smoker, quit 3 years ago
- Father had MI at age 62
- Current: Substernal pressure 6/10, radiates to left arm
- Vitals: BP 158/92, HR 88, O2 97% RA`}
            rows={8}
          />
          <p className="text-xs text-muted-foreground mt-1">
            More detailed notes = better analysis
          </p>
        </div>
      </div>

      <Button 
        size="lg" 
        onClick={handleRunPipeline} 
        disabled={!chiefComplaint.trim()}
      >
        <Brain className="h-5 w-5 mr-2" />
        Run Deep Analysis
      </Button>

      <p className="text-xs text-muted-foreground mt-4 text-center max-w-sm">
        This analysis shows the AI's reasoning process transparently, 
        including intermediate steps and chain-of-thought logic.
      </p>
    </div>
  );
}
