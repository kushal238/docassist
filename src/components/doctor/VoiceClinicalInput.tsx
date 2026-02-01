import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
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
  onChiefComplaintExtracted,
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
      const updatedTranscript = value ? `${value}\n\n${newTranscript}` : newTranscript;

      onChange(updatedTranscript);

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

  const extractChiefComplaint = (transcript: string) => {
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
    mediaRecorderRef.current = null;
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
        placeholder={`Click Record to dictate clinical notes, or type here...

Example:
58-year-old male with HTN on lisinopril, presenting with chest pain radiating to left arm, 2 hours duration, 6/10 severity, associated diaphoresis and shortness of breath. Vitals: BP 158/92, HR 88...`}
        rows={8}
        className="font-mono text-sm"
      />

      <p className="text-xs text-muted-foreground">
        💡 Speak naturally - record multiple times to build your note, or type directly.
      </p>
    </Card>
  );
}
