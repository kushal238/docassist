import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Heart, Users } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PatientExplanationToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  loading?: boolean;
}

export default function PatientExplanationToggle({
  enabled,
  onChange,
  loading,
}: PatientExplanationToggleProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg">
            <Users className="h-4 w-4 text-muted-foreground" />
            <Label 
              htmlFor="patient-mode" 
              className="text-sm cursor-pointer flex items-center gap-2"
            >
              Explain for Patient
              {enabled && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Heart className="h-2.5 w-2.5" />
                  Plain Language
                </Badge>
              )}
            </Label>
            <Switch
              id="patient-mode"
              checked={enabled}
              onCheckedChange={onChange}
              disabled={loading}
              className="scale-90"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">
            {enabled 
              ? 'AI output is simplified for patient understanding. Avoids medical jargon.'
              : 'Enable to rewrite AI responses in plain, non-technical language suitable for sharing with patients.'}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Utility function to simplify medical text for patients
export function simplifyForPatient(text: string): string {
  // Common medical term replacements
  const replacements: Record<string, string> = {
    'hypertension': 'high blood pressure',
    'hypotension': 'low blood pressure',
    'tachycardia': 'fast heart rate',
    'bradycardia': 'slow heart rate',
    'dyspnea': 'shortness of breath',
    'edema': 'swelling',
    'myocardial infarction': 'heart attack',
    'cerebrovascular accident': 'stroke',
    'CVA': 'stroke',
    'MI': 'heart attack',
    'HTN': 'high blood pressure',
    'DM': 'diabetes',
    'diabetes mellitus': 'diabetes',
    'hyperlipidemia': 'high cholesterol',
    'hypercholesterolemia': 'high cholesterol',
    'renal': 'kidney',
    'hepatic': 'liver',
    'pulmonary': 'lung',
    'cardiac': 'heart',
    'gastrointestinal': 'digestive',
    'prognosis': 'expected outcome',
    'etiology': 'cause',
    'pathology': 'disease process',
    'prophylaxis': 'prevention',
    'contraindicated': 'not recommended',
    'adverse': 'negative',
    'acute': 'sudden or severe',
    'chronic': 'long-term',
    'benign': 'not harmful',
    'malignant': 'cancerous',
    'asymptomatic': 'without symptoms',
    'symptomatic': 'causing symptoms',
  };

  let simplified = text;
  
  // Apply replacements (case-insensitive)
  for (const [medical, plain] of Object.entries(replacements)) {
    const regex = new RegExp(`\\b${medical}\\b`, 'gi');
    simplified = simplified.replace(regex, plain);
  }

  return simplified;
}
