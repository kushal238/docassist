import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { transcribeAudio } from '@/lib/keywords-ai-speech';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  /** If true, appends to existing value instead of replacing */
  appendMode?: boolean;
  /** Current value (used when appendMode is true) */
  currentValue?: string;
  /** Button size variant */
  size?: 'sm' | 'default' | 'lg' | 'icon';
  /** Additional classes for the button */
  className?: string;
  /** Show status text next to button */
  showStatus?: boolean;
}

/**
 * Reusable voice input button that can be placed next to any text input.
 * Records audio and transcribes it using Keywords AI Speech-to-Text.
 */
export default function VoiceInputButton({
  onTranscript,
  appendMode = false,
  currentValue = '',
  size = 'icon',
  className,
  showStatus = true,
}: VoiceInputButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState<boolean | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    checkMicrophonePermission();
    return () => cleanup();
  }, []);

  const checkMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionGranted(true);
      stream.getTracks().forEach(track => track.stop());
    } catch {
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
    } catch {
      toast.error('Failed to start recording. Please check microphone permissions.');
      setMicPermissionGranted(false);
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
        toast.error('No speech detected. Please try again.');
        setIsTranscribing(false);
        return;
      }

      const newTranscript = response.transcript.trim();
      
      if (appendMode && currentValue) {
        onTranscript(`${currentValue} ${newTranscript}`);
      } else {
        onTranscript(newTranscript);
      }

      setIsTranscribing(false);
      toast.success('Voice transcribed');
    } catch (err) {
      console.error('Transcription error:', err);
      toast.error('Transcription failed. Please try again.');
      setIsTranscribing(false);
    }
  };

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const isDisabled = isTranscribing || micPermissionGranted === false;

  return (
    <div className="flex items-center gap-2">
      {showStatus && isRecording && (
        <div className="flex items-center gap-1.5 text-destructive">
          <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-xs font-medium">Recording...</span>
        </div>
      )}

      {showStatus && isTranscribing && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="text-xs">Transcribing...</span>
        </div>
      )}

      <Button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        variant={isRecording ? 'destructive' : 'outline'}
        size={size}
        className={cn(
          size === 'icon' && 'h-9 w-9',
          className
        )}
        title={
          micPermissionGranted === false
            ? 'Microphone permission denied'
            : isRecording
              ? 'Click to stop recording'
              : 'Click to start voice input'
        }
      >
        {isTranscribing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRecording ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
