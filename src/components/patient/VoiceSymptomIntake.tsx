import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Mic, MicOff, Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { transcribeAudio, isTranscriptionConfident } from '@/lib/keywords-ai-speech';
import { toast } from 'sonner';

export interface SymptomSummary {
  primarySymptom: string;
  onset: string;
  severity: number | null;
  progression: 'better' | 'worse' | 'same' | 'unknown';
  associatedSymptoms: string[];
  redFlags: {
    fever: boolean;
    chestPain: boolean;
    breathingDifficulty: boolean;
    confusion: boolean;
    fainting: boolean;
  };
  transcript: string;
  source: 'patient_voice_report';
  timestamp: string;
}

interface VoiceSymptomIntakeProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (summary: SymptomSummary) => void;
}

type RecordingState = 'idle' | 'recording' | 'transcribing' | 'review';
type QuestionStep = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 7 is review step

const QUESTIONS = {
  1: "What symptom is bothering you the most right now?",
  2: "When did this start?",
  3: "On a scale from 1 to 10, how severe is it right now?",
  4: "Is it getting better, worse, or staying the same?",
  5: "Do you have any other symptoms you think are related?",
  6: "Have you had any of the following: high fever, chest pain, trouble breathing, confusion, or fainting?",
};

export default function VoiceSymptomIntake({ open, onClose, onSubmit }: VoiceSymptomIntakeProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [currentStep, setCurrentStep] = useState<QuestionStep>(1);
  const [transcript, setTranscript] = useState<string>('');
  const [fullTranscript, setFullTranscript] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [micPermissionGranted, setMicPermissionGranted] = useState<boolean>(false);

  // Symptom data state
  const [symptomData, setSymptomData] = useState<Partial<SymptomSummary>>({
    primarySymptom: '',
    onset: '',
    severity: null,
    progression: 'unknown',
    associatedSymptoms: [],
    redFlags: {
      fever: false,
      chestPain: false,
      breathingDifficulty: false,
      confusion: false,
      fainting: false,
    },
    transcript: '',
    source: 'patient_voice_report',
  });

  // Audio recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Request microphone permission on mount
  useEffect(() => {
    if (open) {
      requestMicrophonePermission();
    } else {
      // Reset state when dialog closes
      resetState();
    }
  }, [open]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      cleanup();
    };
  }, []);

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionGranted(true);
      streamRef.current = stream;
      // Stop the stream immediately, we'll start it again when recording
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      setError('Microphone permission denied. Please allow microphone access to use voice input.');
      setMicPermissionGranted(false);
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
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
        await processRecording(audioBlob);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecordingState('recording');
    } catch (err) {
      setError('Failed to start recording. Please check your microphone permissions.');
      setRecordingState('idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setRecordingState('transcribing');
    }
  };

  const processRecording = async (audioBlob: Blob) => {
    try {
      const response = await transcribeAudio(audioBlob, 'audio/webm');
      
      if (!response.transcript || response.transcript.trim() === '') {
        setError('No speech detected. Please try speaking again.');
        setRecordingState('idle');
        return;
      }

      // Check confidence if provided
      if (response.confidence !== undefined && !isTranscriptionConfident(response.confidence)) {
        setError('The transcription confidence is low. Please repeat your answer clearly.');
        setRecordingState('idle');
        return;
      }

      const newTranscript = response.transcript.trim();
      setTranscript(newTranscript);
      setFullTranscript(prev => prev ? `${prev}\n\nQ${currentStep}: ${newTranscript}` : `Q${currentStep}: ${newTranscript}`);
      
      // Extract structured data based on current step
      extractStructuredData(newTranscript, currentStep);
      
      setRecordingState('idle');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to transcribe audio. Please try again.';
      setError(errorMessage);
      setRecordingState('idle');
      toast.error(errorMessage);
    }
  };

  const extractStructuredData = (transcript: string, step: QuestionStep) => {
    const lowerTranscript = transcript.toLowerCase();

    switch (step) {
      case 1:
        // Primary symptom
        setSymptomData(prev => ({ ...prev, primarySymptom: transcript }));
        break;

      case 2:
        // Onset - extract date or relative time
        setSymptomData(prev => ({ ...prev, onset: transcript }));
        break;

      case 3:
        // Severity - extract number 1-10
        const severityMatch = transcript.match(/\b([1-9]|10)\b/);
        if (severityMatch) {
          const severity = parseInt(severityMatch[1], 10);
          setSymptomData(prev => ({ ...prev, severity }));
        }
        break;

      case 4:
        // Progression
        if (lowerTranscript.includes('better') || lowerTranscript.includes('improving')) {
          setSymptomData(prev => ({ ...prev, progression: 'better' }));
        } else if (lowerTranscript.includes('worse') || lowerTranscript.includes('worsening')) {
          setSymptomData(prev => ({ ...prev, progression: 'worse' }));
        } else if (lowerTranscript.includes('same') || lowerTranscript.includes('unchanged') || lowerTranscript.includes('stable')) {
          setSymptomData(prev => ({ ...prev, progression: 'same' }));
        }
        break;

      case 5:
        // Associated symptoms - split by common delimiters
        const symptoms = transcript
          .split(/[,;]|and|also/)
          .map(s => s.trim())
          .filter(s => s.length > 0);
        setSymptomData(prev => ({
          ...prev,
          associatedSymptoms: symptoms.length > 0 ? symptoms : [transcript],
        }));
        break;

      case 6:
        // Red flags - extract boolean flags
        const redFlags = {
          fever: lowerTranscript.includes('fever') || lowerTranscript.includes('high temperature'),
          chestPain: lowerTranscript.includes('chest pain') || lowerTranscript.includes('chest discomfort'),
          breathingDifficulty: lowerTranscript.includes('trouble breathing') || 
                              lowerTranscript.includes('difficulty breathing') ||
                              lowerTranscript.includes('shortness of breath') ||
                              lowerTranscript.includes('breathless'),
          confusion: lowerTranscript.includes('confusion') || lowerTranscript.includes('confused'),
          fainting: lowerTranscript.includes('fainting') || lowerTranscript.includes('fainted') || lowerTranscript.includes('passed out'),
        };
        setSymptomData(prev => ({
          ...prev,
          redFlags: { ...prev.redFlags, ...redFlags },
        }));
        break;
    }
  };

  const handleNext = () => {
    // Ensure current step's transcript is used if structured data wasn't extracted
    if (transcript.trim()) {
      switch (currentStep) {
        case 1:
          if (!symptomData.primarySymptom) {
            setSymptomData(prev => ({ ...prev, primarySymptom: transcript.trim() }));
          }
          break;
        case 2:
          if (!symptomData.onset) {
            setSymptomData(prev => ({ ...prev, onset: transcript.trim() }));
          }
          break;
        case 5:
          if (!symptomData.associatedSymptoms?.length) {
            setSymptomData(prev => ({ ...prev, associatedSymptoms: [transcript.trim()] }));
          }
          break;
      }
    }
    
    if (currentStep < 6) {
      setCurrentStep((prev) => (prev + 1) as QuestionStep);
      setTranscript('');
      setError(null);
    } else {
      // Move to review step
      setCurrentStep(7);
      setSymptomData(prev => ({
        ...prev,
        transcript: fullTranscript,
        timestamp: new Date().toISOString(),
      }));
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as QuestionStep);
      setTranscript('');
      setError(null);
    }
  };

  const handleEditField = (field: keyof SymptomSummary, value: any) => {
    if (field === 'redFlags') {
      setSymptomData(prev => ({
        ...prev,
        redFlags: { ...prev.redFlags, ...value },
      }));
    } else {
      setSymptomData(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = () => {
    const summary: SymptomSummary = {
      primarySymptom: symptomData.primarySymptom || '',
      onset: symptomData.onset || '',
      severity: symptomData.severity,
      progression: symptomData.progression || 'unknown',
      associatedSymptoms: symptomData.associatedSymptoms || [],
      redFlags: symptomData.redFlags || {
        fever: false,
        chestPain: false,
        breathingDifficulty: false,
        confusion: false,
        fainting: false,
      },
      transcript: fullTranscript,
      source: 'patient_voice_report',
      timestamp: new Date().toISOString(),
    };

    onSubmit(summary);
    resetState();
    onClose();
  };

  const resetState = () => {
    setRecordingState('idle');
    setCurrentStep(1);
    setTranscript('');
    setFullTranscript('');
    setError(null);
    setSymptomData({
      primarySymptom: '',
      onset: '',
      severity: null,
      progression: 'unknown',
      associatedSymptoms: [],
      redFlags: {
        fever: false,
        chestPain: false,
        breathingDifficulty: false,
        confusion: false,
        fainting: false,
      },
      transcript: '',
      source: 'patient_voice_report',
    });
    audioChunksRef.current = [];
  };

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current = null;
    }
  };

  const hasRedFlags = () => {
    const flags = symptomData.redFlags;
    return flags?.fever || flags?.chestPain || flags?.breathingDifficulty || flags?.confusion || flags?.fainting;
  };

  const isStepComplete = (step: QuestionStep): boolean => {
    // A step is complete if there's a transcript response (typed or recorded)
    const hasTranscript = transcript.trim().length > 0;
    
    switch (step) {
      case 1:
        return !!symptomData.primarySymptom || hasTranscript;
      case 2:
        return !!symptomData.onset || hasTranscript;
      case 3:
        // For severity, we need a number, but allow proceeding with transcript
        return symptomData.severity !== null || hasTranscript;
      case 4:
        return symptomData.progression !== 'unknown' || hasTranscript;
      case 5:
        return (symptomData.associatedSymptoms?.length ?? 0) > 0 || hasTranscript;
      case 6:
        return true; // Red flags can all be false, and "no" is a valid answer
      default:
        return false;
    }
  };

  const renderQuestionStep = () => {
    if (currentStep === 7) {
      return renderReviewStep();
    }

    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">Question {currentStep} of 6</p>
          <h3 className="text-lg font-medium">{QUESTIONS[currentStep]}</h3>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="flex flex-col items-center space-y-4">
            {recordingState === 'recording' && (
              <div className="flex items-center gap-2 text-destructive">
                <div className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
                <span className="text-sm font-medium">Recording...</span>
              </div>
            )}

            {recordingState === 'transcribing' && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Transcribing...</span>
              </div>
            )}

            <Button
              type="button"
              onClick={recordingState === 'recording' ? stopRecording : startRecording}
              disabled={recordingState === 'transcribing' || !micPermissionGranted}
              variant={recordingState === 'recording' ? 'destructive' : 'default'}
              size="lg"
              className="w-full max-w-xs"
            >
              {recordingState === 'recording' ? (
                <>
                  <MicOff className="h-5 w-5 mr-2" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic className="h-5 w-5 mr-2" />
                  Start Recording
                </>
              )}
            </Button>
            
          </div>
          
          {/* Editable response field - for both typed and transcribed responses */}
          {recordingState === 'idle' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Your Response</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={transcript}
                  onChange={(e) => {
                    const newTranscript = e.target.value;
                    setTranscript(newTranscript);
                    // Re-extract structured data when transcript is edited
                    extractStructuredData(newTranscript, currentStep);
                    // Update the full transcript for the current step
                    setFullTranscript(prev => {
                      const lines = prev.split('\n\n');
                      const updatedLines = lines.filter(line => !line.startsWith(`Q${currentStep}:`));
                      if (newTranscript.trim()) {
                        updatedLines.push(`Q${currentStep}: ${newTranscript}`);
                      }
                      return updatedLines.join('\n\n');
                    });
                  }}
                  placeholder="Record using the button above, or type your response here..."
                  rows={3}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  You can record your response or type it directly. Edit as needed.
                </p>
              </CardContent>
            </Card>
          )}

          {currentStep === 3 && transcript && !symptomData.severity && (
            <Alert>
              <AlertDescription>
                Please provide a number between 1 and 10 for severity. You can edit this in the review step.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            Back
          </Button>
          <Button
            type="button"
            onClick={handleNext}
            disabled={!isStepComplete(currentStep) || recordingState !== 'idle'}
          >
            {currentStep === 6 ? 'Review' : 'Next'}
          </Button>
        </div>
      </div>
    );
  };

  const renderReviewStep = () => {
    const summary = symptomData as Partial<SymptomSummary>;

    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-medium">Review Your Symptom Summary</h3>
          <p className="text-sm text-muted-foreground">
            Please review and edit your information before submitting.
          </p>
        </div>

        {hasRedFlags() && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Important Notice</AlertTitle>
            <AlertDescription>
              Some symptoms you mentioned can be serious. Please seek urgent medical care.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Primary Symptom</label>
            <Input
              value={summary.primarySymptom || ''}
              onChange={(e) => handleEditField('primarySymptom', e.target.value)}
              placeholder="Primary symptom"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">When Did This Start?</label>
            <Input
              value={summary.onset || ''}
              onChange={(e) => handleEditField('onset', e.target.value)}
              placeholder="e.g., 3 days ago, last week"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Severity (1-10)</label>
            <Input
              type="number"
              min="1"
              max="10"
              value={summary.severity || ''}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value, 10) : null;
                if (val === null || (val >= 1 && val <= 10)) {
                  handleEditField('severity', val);
                }
              }}
              placeholder="1-10"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Progression</label>
            <Select
              value={summary.progression || 'unknown'}
              onValueChange={(value: 'better' | 'worse' | 'same' | 'unknown') =>
                handleEditField('progression', value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="better">Getting Better</SelectItem>
                <SelectItem value="worse">Getting Worse</SelectItem>
                <SelectItem value="same">Staying the Same</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Associated Symptoms</label>
            <Textarea
              value={(summary.associatedSymptoms || []).join(', ')}
              onChange={(e) => {
                const symptoms = e.target.value
                  .split(',')
                  .map(s => s.trim())
                  .filter(s => s.length > 0);
                handleEditField('associatedSymptoms', symptoms);
              }}
              placeholder="List other symptoms, separated by commas"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Red Flag Symptoms</label>
            <div className="space-y-3">
              {(['fever', 'chestPain', 'breathingDifficulty', 'confusion', 'fainting'] as const).map((flag) => (
                <div key={flag} className="flex items-center space-x-2">
                  <Checkbox
                    id={`redflag-${flag}`}
                    checked={summary.redFlags?.[flag] || false}
                    onCheckedChange={(checked) =>
                      handleEditField('redFlags', { [flag]: checked === true })
                    }
                  />
                  <label
                    htmlFor={`redflag-${flag}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {flag === 'fever' && 'High Fever'}
                    {flag === 'chestPain' && 'Chest Pain'}
                    {flag === 'breathingDifficulty' && 'Trouble Breathing'}
                    {flag === 'confusion' && 'Confusion'}
                    {flag === 'fainting' && 'Fainting'}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Full Transcript</label>
            <Textarea
              value={fullTranscript}
              readOnly
              className="font-mono text-xs"
              rows={6}
            />
          </div>
        </div>

        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => setCurrentStep(6)}>
            Back
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!summary.primarySymptom}
            className="bg-primary text-primary-foreground"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Submit Symptom Summary
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Voice Symptom Check</DialogTitle>
          <DialogDescription>
            Answer questions about your symptoms using your voice. All information will be reviewed before submission.
          </DialogDescription>
        </DialogHeader>

        {!micPermissionGranted && !error && (
          <div className="text-center py-4">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Requesting microphone permission...</p>
          </div>
        )}

        {micPermissionGranted && renderQuestionStep()}
      </DialogContent>
    </Dialog>
  );
}
